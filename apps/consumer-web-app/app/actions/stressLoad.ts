'use server';

/**
 * The Stress & Load Deep-Dive's writes, and the coach's two reads.
 *
 * SUBMIT IS THE ONLY WRITE A RENDER CAN LEAD TO, and it happens because she
 * pressed a button. Nothing renders a row into existence: there is no draft
 * row, no claim and no schedule anywhere in this feature. See
 * lib/stress-load/data.ts's header.
 *
 * THE SERVER DECIDES EVERYTHING THE CLIENT COULD HAVE LIED ABOUT. The
 * client posts eleven answers and nothing else. The assignment, the
 * interpretation, the check-in cross reference and the two Root Map rows
 * are all resolved here, so a hand-built request cannot store a sitting for
 * a member who was never assigned one, cannot choose its own pattern, and
 * cannot supply its own reading.
 *
 * TWO ROOT MAP ROWS, WRITTEN SEPARATELY. lib/stress-load/rootMap.ts builds
 * two drafts whose severities are computed from two different sides, and
 * this publishes both. Neither is derived from the other, and there is no
 * combined row.
 */

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { hasActiveRole } from '@/lib/auth/guards';
import { isMemberVisibleToStaff } from '@/lib/staff/testAccounts';
import { memberTimezone } from '@/lib/time/memberToday';
import { todaysLocalDate } from '@/lib/time/localDate';
import { findActiveRegistryEntry, insertRegistryEntry } from '@/lib/registry/data';
import { forgetMemberAssessmentFacts } from '@/lib/assessment-registry/facts';
import {
  countActiveExperiments,
  startLifestyleExperiment,
  MAX_ACTIVE_EXPERIMENTS,
} from '@/lib/lifestyle-experiments';
import { clearRootPopupDismissal, stressLoadPopupMessageKey } from '@/lib/root-popup-messages/data';
import {
  STRESS_LOAD_DEFINITION_ID,
  STRESS_LOAD_EXPERIENCE_KEY,
} from '@/lib/stress-load/constants';
import {
  claimStressLoadSession,
  countCheckinDaysForCrossReference,
  fetchPendingStressLoadAssignment,
  fetchStressLoadSessionForAssignment,
  listPatternStatesForCrossReference,
  listStressLoadSessions,
  STRESS_LOAD_CROSS_REFERENCE_WINDOW_DAYS,
} from '@/lib/stress-load/data';
import {
  sanitizeStressLoadAnswers,
  STRESS_LOAD_QUESTIONS_VERSION,
  type StressLoadAnswers,
} from '@/lib/stress-load/questions';
import { buildStressLoadReading } from '@/lib/stress-load/patterns';
import { buildCrossReference, type StressLoadInterpretation } from '@/lib/stress-load/crossReference';
import { buildStressLoadRegistryDrafts } from '@/lib/stress-load/rootMap';
import { buildStressLoadExperiment } from '@/lib/stress-load/experiment';
import { STRESS_LOAD_COPY } from '@/lib/stress-load/copy';

export type SubmitStressLoadResult =
  | {
      ok: true;
      sessionId: string;
      answers: StressLoadAnswers;
      interpretation: StressLoadInterpretation;
    }
  | { ok: false; error: string };

/**
 * Saves her finished sitting, publishes the two Root Map rows, and hands
 * back the reading her screen renders.
 *
 * Idempotent by the same insert-if-absent rule the partial unique index
 * enforces: a double submit resolves to the sitting that already exists,
 * never to a second row and never to an overwrite. The Root Map rows are
 * only published on a genuinely new sitting, so a double submit cannot
 * write four registry rows for one sitting either.
 */
export async function submitStressLoadDeepDiveAction(
  answers: unknown
): Promise<SubmitStressLoadResult> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Please sign in again.' };

  const clean = sanitizeStressLoadAnswers(answers);
  if (!clean) return { ok: false, error: 'Please answer all eleven questions.' };

  const supabase = createClient();

  const assignmentRead = await fetchPendingStressLoadAssignment(supabase, user.id);
  if (!assignmentRead.ok) return { ok: false, error: STRESS_LOAD_COPY.submitError };
  if (!assignmentRead.assignment) {
    return { ok: false, error: 'Your coach has not opened this one for you.' };
  }
  const assignmentId = assignmentRead.assignment.id;

  // Already finished, on an earlier submit that landed. Hand back what is
  // actually stored rather than writing a second sitting.
  const existing = await fetchStressLoadSessionForAssignment(supabase, user.id, assignmentId);
  if (existing?.completedAt && existing.answers && existing.interpretation) {
    return {
      ok: true,
      sessionId: existing.id,
      answers: existing.answers,
      interpretation: existing.interpretation,
    };
  }

  const reading = buildStressLoadReading(clean);

  const timezone = await memberTimezone(supabase, user.id);
  const localDate = todaysLocalDate(timezone);
  const [checkinDayCount, patternStates] = await Promise.all([
    countCheckinDaysForCrossReference(supabase, user.id, localDate),
    listPatternStatesForCrossReference(supabase, user.id),
  ]);

  const interpretation: StressLoadInterpretation = {
    ...reading,
    crossReference: buildCrossReference({
      reading,
      answers: clean,
      patternStates,
      checkinDayCount,
      windowDays: STRESS_LOAD_CROSS_REFERENCE_WINDOW_DAYS,
    }),
  };

  // started_at equals the completion instant, because there is no draft
  // row: a render may not write one. The column exists so this sitting can
  // join the cross-assessment attempt ledger, which requires it.
  const startedAt = new Date().toISOString();

  const { record, created } = await claimStressLoadSession(supabase, user.id, {
    assignmentId,
    questionsVersion: STRESS_LOAD_QUESTIONS_VERSION,
    answers: clean,
    interpretation,
    startedAt,
  });

  // "No error" is not "it worked": claimStressLoadSession reads the row back
  // either way, so a write that matched no policy is caught here rather than
  // being reported to her as a success.
  if (!record?.completedAt) return { ok: false, error: STRESS_LOAD_COPY.submitError };

  if (created) {
    await publishStressLoadFindings(supabase, user.id, record.id, interpretation, record.completedAt);
  }

  // The pop-up for this assignment can never be due again (the assignment
  // is closed out by migration 190's trigger, so the chain's branch does not
  // produce a candidate at all), which makes any snooze or ignore row for it
  // dead weight. Same tidy-up every other answered message in the chain does.
  await clearRootPopupDismissal(supabase, user.id, stressLoadPopupMessageKey(assignmentId));

  // Home only. NOT this route: she is standing on it, looking at her
  // reading, and revalidating it would re-render the page underneath her.
  revalidatePath('/dashboard');

  return {
    ok: true,
    sessionId: record.id,
    answers: record.answers ?? clean,
    interpretation: record.interpretation ?? interpretation,
  };
}

/**
 * The two Root Map rows.
 *
 * Written one at a time, each superseding its own prior active row for the
 * same (domain, code) pair, which is the established adapter discipline
 * (lib/registry/adapters/*). A second sitting therefore updates each
 * dimension rather than stacking two findings on the same card.
 *
 * A failure to publish is logged and swallowed. Her sitting is already
 * saved and her coach can already read it, and taking the whole submit down
 * because a downstream map row did not land would be the wrong trade.
 */
async function publishStressLoadFindings(
  supabase: ReturnType<typeof createClient>,
  memberId: string,
  sessionId: string,
  interpretation: StressLoadInterpretation,
  recordedAt: string
): Promise<void> {
  const drafts = buildStressLoadRegistryDrafts({
    reading: interpretation,
    sessionId,
    recordedAt,
  });

  for (const draft of drafts) {
    try {
      const active = await findActiveRegistryEntry(supabase, memberId, draft.domain, draft.code);
      await insertRegistryEntry(supabase, memberId, draft, { supersedesId: active?.id ?? null });
    } catch (error) {
      console.error('publishStressLoadFindings failed', draft.code, error);
    }
  }
}

export type StartStressLoadExperimentResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Starts the five minute daily recovery action she just accepted.
 *
 * Goes through the existing lifestyle_experiments machinery, including the
 * two-slot cap, so this experiment competes for the same two slots as every
 * other one and a member cannot end up running three.
 *
 * `source_session_id` is deliberately left null: that column references
 * unified_assessment_sessions (migration 134) and this experience does not
 * run on that runtime. `source_experience_key` carries the provenance
 * instead, which is what it exists for.
 */
export async function startStressLoadExperimentAction(
  sessionId: string
): Promise<StartStressLoadExperimentResult> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Please sign in again.' };

  const supabase = createClient();

  // The offer is rebuilt on the SERVER from the stored sitting, so a
  // hand-built request cannot start an experiment with a protocol it wrote
  // itself, or one built from answers that are not hers.
  const sessions = await listStressLoadSessions(supabase, user.id);
  const session = sessions.records.find((record) => record.id === sessionId);
  if (!session?.answers) return { ok: false, error: 'We could not find that sitting.' };

  const offer = buildStressLoadExperiment(session.answers);
  if (!offer) return { ok: false, error: 'We could not build that one.' };

  const activeCount = await countActiveExperiments(supabase, user.id);
  if (activeCount >= MAX_ACTIVE_EXPERIMENTS) {
    return { ok: false, error: STRESS_LOAD_COPY.experimentCapped };
  }

  const timezone = await memberTimezone(supabase, user.id);
  const experiment = await startLifestyleExperiment(supabase, user.id, {
    recommendationId: null,
    title: offer.title,
    protocol: offer.protocol,
    startDate: todaysLocalDate(timezone),
    durationDays: offer.durationDays,
    sourceSessionId: null,
    sourceExperienceKey: STRESS_LOAD_EXPERIENCE_KEY,
  });
  if (!experiment) return { ok: false, error: 'Could not start this one.' };

  revalidatePath('/dashboard');
  return { ok: true };
}

// ---------------------------------------------------------------------
// The coach side.
// ---------------------------------------------------------------------

export type CoachStressLoadSession = {
  id: string;
  completedAt: string | null;
  answers: StressLoadAnswers | null;
  interpretation: StressLoadInterpretation | null;
};

export type CoachStressLoadPanelState = {
  /** Set while an assignment is open and unanswered. */
  pendingAssignedAt: string | null;
  sessions: CoachStressLoadSession[];
};

/**
 * Everything the coach's card needs, in one read.
 *
 * Test accounts never reach a staff surface, and that is enforced through
 * lib/staff/testAccounts.ts rather than by this screen remembering to
 * check, exactly as the 2026-08-28 exclusion build set it up.
 */
export async function getClientStressLoadPanelAction(
  clientId: string
): Promise<CoachStressLoadPanelState> {
  const empty: CoachStressLoadPanelState = { pendingAssignedAt: null, sessions: [] };

  const user = await getCachedUser();
  if (!user) return empty;
  const supabase = createClient();

  if (!(await isCoachOrAdmin(supabase, user.id))) return empty;
  if (!(await isMemberVisibleToStaff(supabase, clientId, user.id))) return empty;

  const [assignmentRead, sessionRead] = await Promise.all([
    fetchPendingStressLoadAssignment(supabase, clientId),
    listStressLoadSessions(supabase, clientId),
  ]);

  return {
    pendingAssignedAt: assignmentRead.assignment?.createdAt ?? null,
    sessions: sessionRead.records.map((record) => ({
      id: record.id,
      completedAt: record.completedAt,
      answers: record.answers,
      interpretation: record.interpretation,
    })),
  };
}

export type AssignStressLoadResult = { ok: true } | { ok: false; error: string };

/**
 * Assigns the deep-dive to one client, and does nothing else.
 *
 * Reuses the existing assessment_assignments ledger (migration 77) rather
 * than a second assignment system: RLS on that table is what actually
 * rejects an assignment for a client this coach is not assigned to, and the
 * partial unique index (migration 144) is what makes a duplicate click a
 * quiet no-op rather than an error.
 *
 * Re-assigning after a completion is allowed and starts a fresh sitting.
 * That works with no special case here: a completed assignment has left
 * 'pending', so the index no longer covers it, and the new row is a new
 * invitation with its own pop-up key. Nothing about the prior completion is
 * touched.
 */
export async function assignStressLoadDeepDiveAction(
  clientId: string
): Promise<AssignStressLoadResult> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const supabase = createClient();
  if (!(await isCoachOrAdmin(supabase, user.id))) {
    return { ok: false, error: 'Not allowed.' };
  }

  const existing = await fetchPendingStressLoadAssignment(supabase, clientId);
  if (!existing.ok) return { ok: false, error: 'Could not read the assignments for this client.' };
  // An accidental duplicate click is not a failure, the same posture
  // assignAssessmentAction takes.
  if (existing.assignment) return { ok: true };

  forgetMemberAssessmentFacts(clientId);
  const { error } = await supabase.from('assessment_assignments').insert({
    member_id: clientId,
    assessment_definition_id: STRESS_LOAD_DEFINITION_ID,
    assigned_by: user.id,
    is_required: true,
    reason: null,
    stage: 'standard',
  });

  // A race with another concurrent click hits the partial unique index as a
  // 23505 conflict, which is the same idempotent outcome as the check above
  // finding it first.
  if (error && error.code !== '23505') return { ok: false, error: error.message };

  revalidatePath(`/coach/clients/${clientId}/detail`);
  return { ok: true };
}

async function isCoachOrAdmin(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<boolean> {
  return (
    (await hasActiveRole(supabase, userId, 'coach')) ||
    (await hasActiveRole(supabase, userId, 'platform_administrator'))
  );
}
