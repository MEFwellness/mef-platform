/**
 * The coaching brain, as server actions.
 *
 * Everything a coach can do with a member's program signals: read them,
 * close a pain report, let an avoided exercise back in, open the
 * end-of-phase review, take one of the six outcomes, and then approve or
 * discard what the outcome drafted.
 *
 * NOTHING HERE REACHES A MEMBER EXCEPT approveReviewDraftAction, and that
 * one is an explicit second tap by the coach after she has read the draft.
 * Every other write in this file lands on a coach-only table or on an
 * UNPUBLISHED assignment. The invariant is enforced three ways and not one:
 *
 *   lib/programs/review/drafts.ts hard-wires `publish: false`;
 *   an unpublished assignment is invisible to the member because
 *   coach_assigned_workouts' member_read_own policy gates on published_at;
 *   and tests/program-review-drafts.test.ts asserts that after every
 *   outcome, zero assignments are published.
 *
 * RLS IS THE AUTHORIZATION BOUNDARY, as everywhere else in app/actions. The
 * role check before a write exists for the same narrow reason
 * app/actions/program-blueprints.ts gives: a write a coach is not allowed
 * to do would otherwise fail as "0 rows updated", and "nothing happened,
 * quietly" is the worst answer to give somebody who just pressed a button.
 *
 * NO EM DASHES, per the house rule.
 */

'use server';

import { createClient } from '@/lib/supabase/server';
import { hasActiveRole } from '@/lib/auth/guards';
import type { ActionResult } from './auth';
import type {
  BlueprintBlock,
  BlueprintPeriodization,
  ProgramPhaseReview,
} from '@mef/shared-types-contracts';

import { loadProgramSignals, releaseAvoidance, resolveFeedbackReport } from '@/lib/programs/signals/data';
import type { ProgramSignals } from '@/lib/programs/signals/aggregate';
import type { SignalInsight } from '@/lib/programs/signals/insights';
import {
  readyForMoreNudges,
  suggestProgramLoads,
  type ApprovedLoadMap,
  type ProgramLoadSuggestions,
} from '@/lib/programs/progression/suggest';
import { loadRuleRows, type LoadRuleRow } from '@/lib/programs/progression/loadRules';
import {
  COACH_REVIEW_REQUIRED,
  recommendNextPhase,
  type ProgramRecommendation,
} from '@/lib/programs/review/recommend';
import { REVIEW_OUTCOMES, isReviewOutcome, type ReviewOutcome } from '@/lib/programs/review/outcomes';
import {
  getReview,
  listReviewsForProgram,
  openReview,
  recordReviewOutcome,
  setReviewStatus,
} from '@/lib/programs/review/data';
import {
  loadRecoverySlots,
  loadRotationPool,
  planForCurrentProgram,
  planForProgress,
  planForRecoveryWeek,
  planForRepeat,
  planForRotation,
  writeReviewDraft,
} from '@/lib/programs/review/drafts';
import { gatherReadinessFacts } from '@/lib/programs/readiness/facts';
import { deriveConstraints } from '@/lib/programs/readiness/constraints';
import { evaluateReadinessGate } from '@/lib/programs/readiness/gate';
import { discardBlueprintDraft } from '@/lib/programs/blueprints/assign';
import { publishAssignment } from '@/lib/coach-program-builder/assignments';
import { supersedePreviousPrograms } from '@/lib/program-lifecycle/service';
import { recordMemberEvent } from '@/lib/events/service';
import { todaysLocalDate } from '@/lib/time/localDate';
import { programDisplayName } from '@/lib/program-lifecycle/memberView';

export interface ActionFailure {
  error: string;
}

// ---------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------

async function resolveCoach(): Promise<
  { supabase: ReturnType<typeof createClient>; coachId: string } | ActionFailure
> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sign in required.' };

  const isCoach = await hasActiveRole(supabase, user.id, 'coach');
  const isAdmin = await hasActiveRole(supabase, user.id, 'platform_administrator');
  if (!isCoach && !isAdmin) {
    return { error: 'Only a coach can review a member’s program.' };
  }
  return { supabase, coachId: user.id };
}

async function memberTimezone(
  supabase: ReturnType<typeof createClient>,
  memberId: string
): Promise<string> {
  const { data } = await supabase.from('profiles').select('timezone').eq('id', memberId).single();
  return data?.timezone ?? 'America/New_York';
}

/**
 * The periodization model this program's loads move on, read from the
 * blueprint the program was assigned from. A program with no blueprint
 * lineage records no model, which resolveModel reads as linear.
 */
async function periodizationFor(
  supabase: ReturnType<typeof createClient>,
  blueprintVersionId: string | null
): Promise<BlueprintPeriodization | null> {
  if (!blueprintVersionId) return null;
  const { data } = await supabase
    .from('movement_program_versions')
    .select('periodization')
    .eq('id', blueprintVersionId)
    .maybeSingle();
  return (data?.periodization as BlueprintPeriodization | null) ?? null;
}

// ---------------------------------------------------------------------
// Task 1: the signal surface
// ---------------------------------------------------------------------

export interface ProgramSignalPanel {
  signals: ProgramSignals;
  insights: SignalInsight[];
  loads: ProgramLoadSuggestions;
  /** "Signals suggest she is ready for more on Goblet Squat." The weekly nudge. Empty is the normal state. */
  nudges: string[];
  /** True once the program has run its whole span, which is when the review stops being early. */
  phaseIsOver: boolean;
  /** The review a coach is part way through on this program, when there is one. Open or drafted; both mean unfinished. */
  openReviewId: string | null;
  /**
   * The program templates behind this program. Carried so the review screen
   * can send a coach straight to the EXISTING program editor to replace one
   * exercise, regress it or change its dose, rather than making her rotate a
   * whole phase because one movement hurt.
   */
  templateIds: string[];
}

export async function getProgramSignalPanelAction(input: {
  memberId: string;
  groupKey: string;
  programName: string;
}): Promise<ProgramSignalPanel | null> {
  const context = await resolveCoach();
  if ('error' in context) return null;
  const { supabase } = context;

  const bundle = await loadProgramSignals(supabase, input);
  if (!bundle) return null;

  const blueprintVersionId =
    bundle.assignments.map((a) => a.source_blueprint_version_id).find((id) => id) ?? null;
  const periodization = await periodizationFor(supabase, blueprintVersionId);

  const loads = suggestProgramLoads({
    signals: bundle.signals,
    exercises: bundle.exercises,
    periodization,
  });

  const timezone = await memberTimezone(supabase, input.memberId);
  const today = todaysLocalDate(timezone);
  const endDate = bundle.assignments
    .map((a) => a.end_date)
    .filter((d): d is string => d !== null)
    .sort()
    .at(-1) ?? null;

  const reviews = await listReviewsForProgram(supabase, {
    memberId: input.memberId,
    groupKey: input.groupKey,
  });

  return {
    signals: bundle.signals,
    insights: bundle.insights,
    loads,
    nudges: readyForMoreNudges(loads),
    phaseIsOver: endDate !== null && today > endDate,
    openReviewId: reviews.find((r) => r.status === 'open' || r.status === 'drafted')?.id ?? null,
    templateIds: [
      ...new Set(
        bundle.assignments
          .map((a) => a.template_id)
          .filter((id): id is string => typeof id === 'string')
      ),
    ],
  };
}

/** The rules table itself, for the screen that prints it for the coach's approval. */
export async function getLoadRuleRowsAction(): Promise<LoadRuleRow[]> {
  const context = await resolveCoach();
  if ('error' in context) return [];
  return loadRuleRows();
}

export async function releaseAvoidanceAction(input: {
  avoidanceId: string;
  memberId: string;
}): Promise<ActionResult> {
  const context = await resolveCoach();
  if ('error' in context) return context;
  const { supabase, coachId } = context;

  const released = await releaseAvoidance(supabase, {
    avoidanceId: input.avoidanceId,
    coachId,
  });
  if (!released) {
    return { error: 'Could not release this exercise. Please try again.' };
  }

  await recordMemberEvent(supabase, {
    memberId: input.memberId,
    eventType: 'exercise_avoidance_released',
    timezone: await memberTimezone(supabase, input.memberId),
    source: 'coach',
    sourceRecordId: released.id,
    payload: { source: released.source },
  }).catch(() => null);

  return {};
}

export async function resolveFeedbackReportAction(input: {
  feedbackId: string;
  memberId: string;
  note?: string | null;
}): Promise<ActionResult> {
  const context = await resolveCoach();
  if ('error' in context) return context;
  const { supabase, coachId } = context;

  const resolved = await resolveFeedbackReport(supabase, {
    feedbackId: input.feedbackId,
    coachId,
    note: input.note ?? null,
  });
  if (!resolved) {
    return { error: 'Could not mark this reviewed. Please try again.' };
  }

  await recordMemberEvent(supabase, {
    memberId: input.memberId,
    eventType: 'exercise_feedback_resolved',
    timezone: await memberTimezone(supabase, input.memberId),
    source: 'coach',
    sourceRecordId: resolved.id,
    // A reason key and a branch key. Never her words, never the note.
    payload: { branch: resolved.branch, reason: resolved.reason },
  }).catch(() => null);

  return {};
}

// ---------------------------------------------------------------------
// Task 2: the review
// ---------------------------------------------------------------------

export interface ProgramReviewScreen {
  review: ProgramPhaseReview;
  panel: ProgramSignalPanel;
  recommendation: ProgramRecommendation;
  outcomes: typeof REVIEW_OUTCOMES;
  /** Every review this program has had before this one, newest first. */
  history: ProgramPhaseReview[];
}

/**
 * Opens the review, or returns the one already open, together with
 * everything the screen renders. Reads and one insert; publishes nothing.
 */
export async function openProgramReviewAction(input: {
  memberId: string;
  groupKey: string;
  programName: string;
}): Promise<ProgramReviewScreen | ActionFailure> {
  const context = await resolveCoach();
  if ('error' in context) return context;
  const { supabase, coachId } = context;

  const panel = await getProgramSignalPanelAction(input);
  if (!panel) return { error: 'Could not find this program.' };

  // Readiness, from the harvested ladder. A member with too little on file
  // simply returns null and the recommendation skips that rung.
  let readiness = null as ReturnType<typeof evaluateReadinessGate> | null;
  try {
    const facts = await gatherReadinessFacts(supabase, input.memberId);
    readiness = evaluateReadinessGate(facts, deriveConstraints(facts));
  } catch (err) {
    console.error('openProgramReviewAction (readiness) failed', err);
  }

  const recommendation = recommendNextPhase({
    signals: panel.signals,
    readiness,
    phaseIsOver: panel.phaseIsOver,
  });

  const before = await listReviewsForProgram(supabase, {
    memberId: input.memberId,
    groupKey: input.groupKey,
  });
  const review = await openReview(supabase, {
    memberId: input.memberId,
    coachId,
    groupKey: input.groupKey,
    programName: input.programName,
    openedEarly: !panel.phaseIsOver,
    signalSnapshot: {
      completionPercent: panel.signals.completionPercent,
      completedSessions: panel.signals.completedSessions,
      totalSessions: panel.signals.totalSessions,
      weeks: panel.signals.weeks,
      skippedExercises: panel.signals.skippedExercises,
      painReports: panel.signals.painReports.length,
      tooEasyFlags: panel.signals.tooEasyFlags.length,
      tooDifficultFlags: panel.signals.tooDifficultFlags.length,
      swaps: panel.signals.swaps.length,
      loadTrends: panel.signals.loadTrends.map((t) => ({
        exerciseName: t.exerciseName,
        line: t.line,
      })),
      model: panel.loads.model,
      blueprintModel: panel.loads.blueprintModel,
      pace: panel.loads.pace,
    },
    // Null is the engine deliberately recommending nothing while a pain
    // report is unread. It is stored as its own value rather than as one of
    // the six, so a review read back months later cannot be mistaken for a
    // recommendation nobody acted on.
    recommendedOutcome: recommendation.outcome ?? COACH_REVIEW_REQUIRED,
    recommendationReasoning: recommendation.reasoning,
  });
  if (!review) return { error: 'Could not open a review for this program.' };

  // Only when the review is genuinely NEW. The page writes on render and a
  // server action re-renders it, so an event per render would be an event
  // per button press on a screen nobody reopened.
  const isNew = !before.some((r) => r.id === review.id);
  if (isNew) {
    await recordMemberEvent(supabase, {
      memberId: input.memberId,
      eventType: 'program_review_opened',
      timezone: await memberTimezone(supabase, input.memberId),
      source: 'coach',
      sourceRecordId: review.id,
      payload: {
        recommended: recommendation.outcome ?? COACH_REVIEW_REQUIRED,
        openedEarly: String(review.opened_early),
      },
    }).catch(() => null);
  }

  const history = (
    await listReviewsForProgram(supabase, { memberId: input.memberId, groupKey: input.groupKey })
  ).filter((r) => r.id !== review.id);

  return { review, panel, recommendation, outcomes: REVIEW_OUTCOMES, history };
}

export interface ChooseOutcomeInput {
  reviewId: string;
  outcome: ReviewOutcome;
  /** When the drafted program would start. The coach picks it; defaults to the day after the current phase ends. */
  startDate: string;
  /** What the coach left in each weight field, keyed by external id. A cleared field is an explicit null. */
  approvedLoads?: ApprovedLoadMap;
  coachNotes?: string | null;
}

export interface ChooseOutcomeResult {
  review: ProgramPhaseReview;
  /** Null for the two outcomes that build no program. */
  draft: {
    programGroupTag: string;
    assignmentIds: string[];
    templateIds: string[];
    /** Exercises a rotation could not replace, so the screen says so rather than pretending. */
    unchangedExercises: string[];
  } | null;
  /** Where to send the coach next, for the outcome that hands off to the assign flow. */
  redirectTo: string | null;
}

/**
 * Takes one of the six outcomes. Four of them write an unpublished draft,
 * one hands off to the assign flow, and one closes the program out.
 *
 * NOTHING IN THIS FUNCTION PUBLISHES. The draft writer hard-wires
 * `publish: false` and the complete-and-archive branch touches lifecycle
 * status only.
 */
export async function chooseReviewOutcomeAction(
  input: ChooseOutcomeInput
): Promise<ChooseOutcomeResult | ActionFailure> {
  const context = await resolveCoach();
  if ('error' in context) return context;
  const { supabase, coachId } = context;

  if (!isReviewOutcome(input.outcome)) {
    return { error: 'That is not one of the options.' };
  }

  const review = await getReview(supabase, input.reviewId);
  if (!review) return { error: 'Could not find this review.' };
  if (review.status !== 'open') {
    return { error: `This review is already ${review.status}. Open a new one to decide again.` };
  }

  const timezone = await memberTimezone(supabase, review.member_id);
  const today = todaysLocalDate(timezone);

  const bundle = await loadProgramSignals(supabase, {
    memberId: review.member_id,
    groupKey: review.program_group_key,
    programName: review.program_name,
  });
  if (!bundle) return { error: 'Could not read this program.' };

  // --- The two that build nothing ---

  if (input.outcome === 'different_program') {
    const updated = await recordReviewOutcome(supabase, {
      reviewId: review.id,
      outcome: input.outcome,
      status: 'discarded',
      coachNotes: input.coachNotes ?? null,
    });
    if (!updated) return { error: 'Could not record this decision.' };
    return {
      review: updated,
      draft: null,
      redirectTo: `/coach/clients/${review.member_id}/programs/assign`,
    };
  }

  if (input.outcome === 'complete_and_archive') {
    for (const assignment of bundle.assignments) {
      if (assignment.status === 'completed' || assignment.status === 'cancelled') continue;
      await supabase
        .from('coach_program_assignments')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', assignment.id);
    }
    const updated = await recordReviewOutcome(supabase, {
      reviewId: review.id,
      outcome: input.outcome,
      status: 'discarded',
      coachNotes: input.coachNotes ?? null,
    });
    if (!updated) return { error: 'Could not record this decision.' };
    return { review: updated, draft: null, redirectTo: null };
  }

  // --- The four that build a draft ---

  const templateIds = bundle.assignments
    .map((a) => a.template_id)
    .filter((id): id is string => typeof id === 'string');
  const durationWeeks =
    Math.max(...bundle.assignments.map((a) => a.duration_weeks ?? 0)) || 4;
  const equipment = Array.from(new Set(bundle.workouts.flatMap((w) => w.equipment ?? [])));
  const programTitle = programDisplayName(
    bundle.assignments.map((a) => a.template_name_snapshot)
  );

  let sessions;
  let unchangedExercises: string[] = [];
  const approvedLoads: Record<string, { load: number | null; unit: string | null }> = {};
  let draftDurationWeeks = durationWeeks;
  let draftTitle = programTitle;

  if (input.outcome === 'recovery_week') {
    const slots = await loadRecoverySlots(supabase);
    if (slots.length === 0) {
      return { error: 'The Root recovery session has no exercises available right now.' };
    }
    sessions = planForRecoveryWeek(slots);
    draftDurationWeeks = 1;
    draftTitle = 'Recovery Week';
  } else {
    const basePlan = await planForCurrentProgram(supabase, templateIds);
    if (basePlan.length === 0) {
      return { error: 'Could not read the program this review is about.' };
    }

    if (input.outcome === 'repeat_phase') {
      sessions = planForRepeat(basePlan);
    } else if (input.outcome === 'rotate_exercises') {
      let pool;
      try {
        pool = await loadRotationPool(supabase, {
          memberId: review.member_id,
          blocks: basePlan.flatMap((s) => s.exercises.map((e) => e.block)) as BlueprintBlock[],
        });
      } catch {
        return { error: 'Could not read her avoidance list, so nothing was rotated.' };
      }
      const rotation = planForRotation(basePlan, pool);
      sessions = rotation.sessions;
      unchangedExercises = rotation.unchanged;
    } else {
      // progress_next_phase
      const periodization = await periodizationFor(
        supabase,
        bundle.assignments.map((a) => a.source_blueprint_version_id).find((id) => id) ?? null
      );
      // No week is passed, and none would be read if it were: a load moves
      // because she did the work at the weight she is on, never because the
      // program reached another week.
      const loads = suggestProgramLoads({
        signals: bundle.signals,
        exercises: bundle.exercises,
        periodization,
      });
      sessions = planForProgress(basePlan, loads.suggestions, input.approvedLoads ?? {});
      for (const session of sessions) {
        for (const exercise of session.exercises) {
          if (exercise.prescription.load === null) continue;
          approvedLoads[exercise.externalId] = {
            load: exercise.prescription.load,
            unit: exercise.prescription.loadUnit,
          };
        }
      }
    }
  }

  const draft = await writeReviewDraft(supabase, {
    memberId: review.member_id,
    coachId,
    timezone,
    today,
    startDate: input.startDate,
    durationWeeks: draftDurationWeeks,
    programTitle: draftTitle,
    memberExplanation: null,
    sessions,
    outcome: input.outcome,
    equipment,
  });
  if (!draft) return { error: 'Could not write the draft. Please try again.' };

  const updated = await recordReviewOutcome(supabase, {
    reviewId: review.id,
    outcome: input.outcome,
    status: 'drafted',
    draftAssignmentIds: draft.assignmentIds,
    draftTemplateIds: draft.templateIds,
    draftProgramGroupKey: draft.programGroupTag,
    approvedLoads,
    coachNotes: input.coachNotes ?? null,
  });
  if (!updated) return { error: 'The draft was written but the review could not record it.' };

  await recordMemberEvent(supabase, {
    memberId: review.member_id,
    eventType: 'program_review_drafted',
    timezone,
    source: 'coach',
    sourceRecordId: review.id,
    payload: {
      outcome: input.outcome,
      sessions: String(draft.assignmentIds.length),
      loadsApproved: String(Object.keys(approvedLoads).length),
    },
  }).catch(() => null);

  return {
    review: updated,
    draft: {
      programGroupTag: draft.programGroupTag,
      assignmentIds: draft.assignmentIds,
      templateIds: draft.templateIds,
      unchangedExercises,
    },
    redirectTo: null,
  };
}

/** Throws the draft away. Refuses to touch anything published: discardBlueprintDraft's own rule. */
export async function discardReviewDraftAction(reviewId: string): Promise<ActionResult> {
  const context = await resolveCoach();
  if ('error' in context) return context;
  const { supabase } = context;

  const review = await getReview(supabase, reviewId);
  if (!review) return { error: 'Could not find this review.' };
  if (review.status === 'approved') {
    return { error: 'This draft has already been given to her, so it cannot be discarded here.' };
  }

  const ok = await discardBlueprintDraft(supabase, {
    assignmentIds: review.draft_assignment_ids,
    templateIds: review.draft_template_ids,
  });
  if (!ok) {
    return {
      error:
        'Could not discard this draft. Nothing was removed, and a published program is never quietly removed either way.',
    };
  }

  const marked = await setReviewStatus(supabase, reviewId, 'discarded');
  if (!marked) {
    return { error: 'The draft was removed but the review could not be closed. Please reload.' };
  }
  return {};
}

/**
 * The coach approving the draft. THIS is the tap that reaches the member,
 * and it is the only one. The draft's assignments are published through the
 * ordinary publishAssignment, and the program she was on is superseded the
 * ordinary way, so what she opens is the same frozen workout every other
 * program produces.
 */
export async function approveReviewDraftAction(reviewId: string): Promise<ActionResult> {
  const context = await resolveCoach();
  if ('error' in context) return context;
  const { supabase } = context;

  const review = await getReview(supabase, reviewId);
  if (!review) return { error: 'Could not find this review.' };
  if (review.status !== 'drafted' || review.draft_assignment_ids.length === 0) {
    return { error: 'There is no draft on this review to approve.' };
  }

  for (const assignmentId of review.draft_assignment_ids) {
    const published = await publishAssignment(supabase, assignmentId);
    if (!published) return { error: 'Could not give this to her. Please try again.' };
  }

  const timezone = await memberTimezone(supabase, review.member_id);
  await supersedePreviousPrograms(supabase, {
    memberId: review.member_id,
    newAssignmentIds: review.draft_assignment_ids,
    supersededBy: review.draft_assignment_ids[0]!,
    timezone,
  });

  await setReviewStatus(supabase, reviewId, 'approved');
  return {};
}
