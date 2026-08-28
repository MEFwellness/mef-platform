/**
 * The member's voice, as server actions.
 *
 * Four things she can do, and nothing else: log a weight, report how an
 * exercise felt, take one of the options the rules offered her, or keep
 * what she has. There is no action here that takes an arbitrary exercise
 * id from the client and puts it in her program: a swap may only ever be
 * one of the options this file itself just computed, and it is recomputed
 * server side before it is applied. A member who edits a request gets the
 * same answer she would have got by tapping.
 *
 * RLS IS THE AUTHORIZATION BOUNDARY, as everywhere else in app/actions.
 * Every read and write below runs under her own session:
 * member_read_own_assigned_workout_exercises decides what she can even
 * find, member_update_own decides what she can change, and
 * member_insert_own_exercise_feedback decides what she can say. There is
 * no service-role client in this module.
 *
 * NO EM DASHES in anything a member reads. See lib/programs/feedback/copy.ts,
 * which owns every sentence this file returns.
 */

'use server';

import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from './auth';
import type {
  CoachAssignedWorkoutExercise,
  ExerciseFeedbackDecision,
  ExerciseFeedbackReason,
  ExerciseSwapOption,
} from '@mef/shared-types-contracts';
import { recordMemberEvent } from '@/lib/events/service';
import { todaysLocalDate } from '@/lib/time/localDate';
import {
  acceptsWeightLog,
  parseLoggedLoad,
  type LoggedLoadUnit,
} from '@/lib/programs/weightLogging';
import { avoidanceSourceFor, branchForReason, isFeedbackReason } from '@/lib/programs/feedback/reasons';
import { exerciseSafetyDecision, readsAsPain } from '@/lib/programs/feedback/safety';
import { offersForFeedback, offersNothing } from '@/lib/programs/feedback/offers';
import {
  blockForSectionType,
  loadAvoidedExternalIds,
  loadMemberEquipment,
  loadSwapCandidates,
} from '@/lib/programs/feedback/candidates';
import {
  applySwap,
  attachSwapToFeedback,
  countReportsFor,
  findSwapTargets,
  hasRepeatedSkips,
  lastLoggedLoadFor,
  markExerciseStopped,
  markFeedbackKeptOriginal,
  recordAvoidance,
  recordExerciseFeedback,
} from '@/lib/programs/feedback/data';
import { branchMessage, swapConfirmationMessage } from '@/lib/programs/feedback/copy';
import { readReplacementCriteria } from '@/lib/programs/blueprints/swap';
import { memberExerciseReasoningForMemberSwap } from '@/lib/programs/explain/exerciseReasoning';
import { memberTimezone } from '@/lib/time/memberToday';
import { getCachedUser } from '@/lib/supabase/currentUser';

// ---------------------------------------------------------------------
// Shared context: who she is, and what she is looking at
// ---------------------------------------------------------------------

interface ExerciseContext {
  supabase: ReturnType<typeof createClient>;
  memberId: string;
  timezone: string;
  exercise: CoachAssignedWorkoutExercise;
  sectionType: string;
  workout: {
    id: string;
    assignment_id: string;
    coach_id: string;
    corrective_tags: string[];
    equipment: string[];
    program_week: number | null;
  };
  programGroupKey: string | null;
  /** Every assignment in this program group. A swap never reaches outside it. */
  assignmentIds: string[];
}

/**
 * Everything one action needs about one exercise, read once. Returns null
 * when RLS says she cannot see it, which is the same answer as "it does
 * not exist" and is deliberately not distinguished for her.
 */
async function resolveExerciseContext(exerciseRowId: string): Promise<ExerciseContext | null> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return null;

  const { data: exercise } = await supabase
    .from('coach_assigned_workout_exercises')
    .select('*')
    .eq('id', exerciseRowId)
    .maybeSingle();
  if (!exercise) return null;

  const { data: section } = await supabase
    .from('coach_assigned_workout_sections')
    .select('section_type')
    .eq('id', exercise.section_id)
    .maybeSingle();

  const { data: workout } = await supabase
    .from('coach_assigned_workouts')
    .select('id, assignment_id, coach_id, corrective_tags, equipment, program_week')
    .eq('id', exercise.assigned_workout_id)
    .maybeSingle();
  if (!workout) return null;

  // A corrective program is delivered as one assignment per weekly
  // session, so "this program" is the whole group. Without this a swap
  // would rewrite Session B and leave Sessions A and C carrying the
  // exercise she just asked to be rid of.
  const { data: lifecycle } = await supabase
    .from('member_program_lifecycle')
    .select('id, program_group_key')
    .eq('id', workout.assignment_id)
    .maybeSingle();
  const programGroupKey = (lifecycle?.program_group_key as string | null) ?? null;

  let assignmentIds = [workout.assignment_id as string];
  if (programGroupKey) {
    const { data: siblings } = await supabase
      .from('member_program_lifecycle')
      .select('id')
      .eq('program_group_key', programGroupKey);
    if (siblings && siblings.length > 0) {
      assignmentIds = siblings.map((row) => row.id as string);
    }
  }

  return {
    supabase,
    memberId: user.id,
    timezone: await memberTimezone(supabase, user.id),
    exercise: exercise as CoachAssignedWorkoutExercise,
    sectionType: (section?.section_type as string | null) ?? 'strength',
    workout: workout as ExerciseContext['workout'],
    programGroupKey,
    assignmentIds,
  };
}

/** The week, as digits, or nothing at all. Written as a spread so an absent week produces no key rather than an explicit undefined, which is the shape MemberWellnessEventPayload allows. */
function weekPayload(context: ExerciseContext): { week?: string } {
  return context.workout.program_week === null || context.workout.program_week === undefined
    ? {}
    : { week: String(context.workout.program_week) };
}

// ---------------------------------------------------------------------
// 1. What she lifted
// ---------------------------------------------------------------------

export interface LoggedWeightPrefill {
  load: number | null;
  unit: LoggedLoadUnit | null;
  perSide: boolean;
  /** True when the number came from an earlier session rather than from this one. */
  fromPreviousSession: boolean;
}

/**
 * What her weight field starts on: this occurrence's own number if she
 * already logged one, otherwise the most recent number she logged for this
 * exercise anywhere. A prefill from a previous session is marked as such,
 * so the screen can say so rather than pretending she already logged today.
 */
export async function getLoggedWeightPrefillAction(
  exerciseRowId: string
): Promise<LoggedWeightPrefill | null> {
  const context = await resolveExerciseContext(exerciseRowId);
  if (!context) return null;

  if (context.exercise.logged_load !== null && context.exercise.logged_load !== undefined) {
    return {
      load: Number(context.exercise.logged_load),
      unit: context.exercise.logged_load_unit ?? null,
      perSide: context.exercise.logged_load_per_side === true,
      fromPreviousSession: false,
    };
  }

  const previous = await lastLoggedLoadFor(
    context.supabase,
    context.memberId,
    context.exercise.external_id
  );
  if (!previous) {
    return { load: null, unit: null, perSide: context.exercise.unilateral === true, fromPreviousSession: false };
  }
  return {
    load: previous.load,
    unit: previous.unit,
    perSide: previous.perSide,
    fromPreviousSession: true,
  };
}

/**
 * Saves what she used on this occurrence. A blank value clears it, which
 * is a real answer: she may have logged one by mistake.
 *
 * Never blocks anything. The return value says whether the write landed
 * and nothing on any screen waits for it.
 */
export async function logExerciseWeightAction(
  exerciseRowId: string,
  input: { load: string | null; unit: LoggedLoadUnit }
): Promise<ActionResult> {
  const context = await resolveExerciseContext(exerciseRowId);
  if (!context) return { error: 'Sign in required.' };

  if (!acceptsWeightLog(context.exercise)) {
    return { error: 'This one is a hold, so there is no weight to log.' };
  }

  const load = parseLoggedLoad(input.load);
  const perSide = context.exercise.unilateral === true;

  const { error } = await context.supabase
    .from('coach_assigned_workout_exercises')
    .update({
      logged_load: load,
      logged_load_unit: load === null ? null : input.unit,
      logged_load_per_side: load === null ? false : perSide,
      logged_load_at: load === null ? null : new Date().toISOString(),
    })
    .eq('id', exerciseRowId);
  if (error) {
    console.error('logExerciseWeightAction failed', error);
    return { error: 'Could not save that. Please try again.' };
  }

  if (load !== null) {
    // The number itself stays on the exercise row, which is where the
    // history a progression engine reads lives. The event records that she
    // logged one, and carries no free text.
    await recordMemberEvent(context.supabase, {
      memberId: context.memberId,
      eventType: 'exercise_weight_logged',
      timezone: context.timezone,
      payload: {
        unit: input.unit,
        perSide: perSide ? 'true' : 'false',
        ...weekPayload(context),
      },
      sourceRecordId: exerciseRowId,
    });
  }

  return {};
}

// ---------------------------------------------------------------------
// 2. How it felt
// ---------------------------------------------------------------------

/**
 * She picked a reason. This decides what happens, records it, and hands
 * back what her screen should say and offer.
 *
 * Everything that follows a report happens here, in one call, so there is
 * no state on the client that a second request could disagree with.
 */
export async function submitExerciseFeedbackAction(
  exerciseRowId: string,
  input: { reason: ExerciseFeedbackReason; otherText?: string | null }
): Promise<ExerciseFeedbackDecision | { error: string }> {
  const context = await resolveExerciseContext(exerciseRowId);
  if (!context) return { error: 'Sign in required.' };
  if (!isFeedbackReason(input.reason)) return { error: 'Pick one of the options.' };

  const otherText = (input.otherText ?? '').trim().slice(0, 500) || null;
  // Her words are read for exactly one thing: whether they belong to the
  // pain family, so that "my knee is killing me" typed into Other reaches
  // the safety branch rather than a list of alternatives.
  const branch = branchForReason(input.reason, readsAsPain(otherText));
  const isLocked = context.exercise.is_locked === true;

  // --- Safety. No options are computed at all on this path, by any
  //     branch of any condition, which is what makes "no replacement is
  //     ever offered for pain" a property of the code rather than of a
  //     screen.
  if (branch === 'safety') {
    const decision = exerciseSafetyDecision({
      exerciseName: context.exercise.exercise_name,
    });
    if (decision.stop) await markExerciseStopped(context.supabase, exerciseRowId);

    const feedback = await recordExerciseFeedback(context.supabase, {
      memberId: context.memberId,
      coachId: context.workout.coach_id,
      assignedWorkoutExerciseId: exerciseRowId,
      assignedWorkoutId: context.workout.id,
      assignmentId: context.workout.assignment_id,
      programGroupKey: context.programGroupKey,
      programWeek: context.workout.program_week,
      provider: context.exercise.provider,
      externalId: context.exercise.external_id,
      exerciseName: context.exercise.exercise_name,
      reason: input.reason,
      otherText,
      branch,
      outcome: 'stopped_for_pain',
      coachNotified: true,
    });

    // Immediately, not after it repeats. A movement that hurt her is not
    // offered to her again until a coach says otherwise.
    await recordAvoidance(context.supabase, {
      memberId: context.memberId,
      provider: context.exercise.provider,
      externalId: context.exercise.external_id,
      exerciseName: context.exercise.exercise_name,
      source: 'pain',
      feedbackId: feedback?.id ?? null,
    });

    await recordMemberEvent(context.supabase, {
      memberId: context.memberId,
      eventType: 'exercise_stopped_for_pain',
      timezone: context.timezone,
      payload: {
        reason: input.reason,
        branch,
        outcome: 'stopped_for_pain',
        ...weekPayload(context),
      },
      sourceRecordId: exerciseRowId,
    });

    return {
      branch,
      message: branchMessage({ branch, isLocked: false, optionCount: 0 }),
      options: [],
      stopped: true,
      coachNotified: true,
      feedbackId: feedback?.id ?? null,
    };
  }

  // --- Everything else. Options are computed only where the rules allow
  //     any, and "too easy" and "locked" allow none by construction.
  let options: ExerciseSwapOption[] = [];
  if (!offersNothing(input.reason, isLocked)) {
    options = await computeOptions(context, input.reason);
  }

  const coachNotified = branch === 'progression_note';
  const outcome =
    branch === 'progression_note'
      ? 'logged_for_coach'
      : options.length === 0
        ? 'no_options'
        : 'kept_original';

  const feedback = await recordExerciseFeedback(context.supabase, {
    memberId: context.memberId,
    coachId: context.workout.coach_id,
    assignedWorkoutExerciseId: exerciseRowId,
    assignedWorkoutId: context.workout.id,
    assignmentId: context.workout.assignment_id,
    programGroupKey: context.programGroupKey,
    programWeek: context.workout.program_week,
    provider: context.exercise.provider,
    externalId: context.exercise.external_id,
    exerciseName: context.exercise.exercise_name,
    reason: input.reason,
    otherText,
    branch,
    // 'kept_original' is the honest starting state for a report that
    // offered options: nothing has been swapped unless and until she picks
    // one, and applyExerciseSwapAction is what changes it.
    outcome,
    coachNotified,
  });

  // Repeated dislikes become an avoidance. One bad day with an exercise is
  // not a verdict on it, so the first report never does.
  const reportCount = await countReportsFor(
    context.supabase,
    context.memberId,
    context.exercise.external_id
  );
  const avoidanceSource = avoidanceSourceFor({ branch, reason: input.reason, reportCount });
  const skippedTooOften = await hasRepeatedSkips(
    context.supabase,
    context.memberId,
    context.exercise.external_id
  );
  if (avoidanceSource || skippedTooOften) {
    await recordAvoidance(context.supabase, {
      memberId: context.memberId,
      provider: context.exercise.provider,
      externalId: context.exercise.external_id,
      exerciseName: context.exercise.exercise_name,
      source: avoidanceSource ?? 'repeated_skip',
      feedbackId: feedback?.id ?? null,
    });
  }

  await recordMemberEvent(context.supabase, {
    memberId: context.memberId,
    eventType:
      branch === 'progression_note' ? 'exercise_progression_flagged' : 'exercise_feedback_reported',
    timezone: context.timezone,
    payload: {
      reason: input.reason,
      branch,
      outcome,
      ...weekPayload(context),
    },
    sourceRecordId: exerciseRowId,
  });

  return {
    branch,
    message: branchMessage({ branch, isLocked, optionCount: options.length }),
    options,
    stopped: false,
    coachNotified,
    feedbackId: feedback?.id ?? null,
  };
}

/**
 * The two or three she may pick from. Kept as its own function because
 * applyExerciseSwapAction calls it again before it writes anything: an
 * option that was not offered cannot be accepted, however the request
 * reaches the server.
 */
async function computeOptions(
  context: ExerciseContext,
  reason: ExerciseFeedbackReason
): Promise<ExerciseSwapOption[]> {
  const block = blockForSectionType(context.sectionType);

  let avoided: string[] = [];
  try {
    avoided = await loadAvoidedExternalIds(context.supabase, context.memberId);
  } catch {
    // A failed avoidance read must never widen what she is offered, so it
    // offers nothing at all rather than offering something she asked not
    // to see again.
    return [];
  }

  const [candidates, memberEquipment] = await Promise.all([
    loadSwapCandidates(context.supabase, {
      block,
      correctiveTags: context.workout.corrective_tags ?? [],
      equipment: context.workout.equipment ?? [],
    }),
    loadMemberEquipment(context.supabase, context.memberId),
  ]);

  const originalGrading = candidates.find(
    (candidate) => candidate.externalId === context.exercise.external_id
  );
  const { data: originalRow } = await context.supabase
    .from('exercise_catalog')
    .select('equipment, difficulty')
    .eq('external_id', context.exercise.external_id)
    .maybeSingle();

  return offersForFeedback({
    reason,
    isLocked: context.exercise.is_locked === true,
    original: {
      provider: context.exercise.provider,
      externalId: context.exercise.external_id,
      name: context.exercise.exercise_name,
      isClientAssignable: true,
      block,
      movementPattern: context.exercise.movement_pattern ?? null,
      equipment:
        (originalRow?.equipment as string | null) ?? originalGrading?.equipment ?? null,
      difficulty:
        (originalRow?.difficulty as never) ?? originalGrading?.difficulty ?? null,
    },
    block,
    criteria: readReplacementCriteria({
      replacement_criteria: (context.exercise.replacement_criteria ?? {}) as never,
    }),
    candidates,
    avoidedExternalIds: avoided,
    memberEquipment,
  });
}

// ---------------------------------------------------------------------
// 3. She picked one
// ---------------------------------------------------------------------

export interface SwapResult {
  message: string;
  occurrencesUpdated: number;
  replacementName: string;
}

export async function applyExerciseSwapAction(
  exerciseRowId: string,
  input: { reason: ExerciseFeedbackReason; externalId: string; feedbackId?: string | null }
): Promise<SwapResult | { error: string }> {
  const context = await resolveExerciseContext(exerciseRowId);
  if (!context) return { error: 'Sign in required.' };
  if (!isFeedbackReason(input.reason)) return { error: 'Pick one of the options.' };
  if (context.exercise.is_locked === true) {
    return { error: 'Your coach chose this one specifically.' };
  }

  // Recomputed, not trusted. The client sends an id; the rules decide
  // whether that id was ever on offer, and a request that was edited on
  // the way here gets the same answer as one that was not.
  const options = await computeOptions(context, input.reason);
  const chosen = options.find((option) => option.externalId === input.externalId);
  if (!chosen) return { error: 'That option is not available for this exercise.' };

  const targets = await findSwapTargets(context.supabase, {
    memberId: context.memberId,
    assignedWorkoutExerciseId: exerciseRowId,
    assignmentIds: context.assignmentIds,
    externalId: context.exercise.external_id,
    today: todaysLocalDate(context.timezone),
  });

  const previousExternalId = context.exercise.external_id;
  const previousName = context.exercise.exercise_name;

  const updated = await applySwap(context.supabase, {
    exerciseRowIds: targets,
    provider: chosen.provider,
    externalId: chosen.externalId,
    exerciseName: chosen.name,
    // The slot's job did not change, which is why the swap was allowed, so
    // the line keeps the slot's own reasoning and adds the one honest new
    // fact: she chose this one.
    memberReasoning: memberExerciseReasoningForMemberSwap({
      block: blockForSectionType(context.sectionType),
      movementPattern: context.exercise.movement_pattern ?? null,
      isPerSide: context.exercise.unilateral === true,
      priorityRank: null,
      variantSeed: context.workout.assignment_id,
      variantIndex: context.exercise.sequence_index,
    }),
    previousExternalId,
    previousExerciseName: previousName,
  });

  if (updated === 0) return { error: 'Could not make that change. Please try again.' };

  if (input.feedbackId) {
    await attachSwapToFeedback(context.supabase, input.feedbackId, {
      provider: chosen.provider,
      externalId: chosen.externalId,
      exerciseName: chosen.name,
      occurrencesUpdated: updated,
    });
  }

  // The exercise she swapped away from is not offered back to her as an
  // alternative to something else later.
  await recordAvoidance(context.supabase, {
    memberId: context.memberId,
    provider: context.exercise.provider,
    externalId: previousExternalId,
    exerciseName: previousName,
    source: 'swapped_away',
    feedbackId: input.feedbackId ?? null,
  });

  await recordMemberEvent(context.supabase, {
    memberId: context.memberId,
    eventType: 'exercise_swapped',
    timezone: context.timezone,
    payload: {
      reason: input.reason,
      branch: branchForReason(input.reason, false),
      outcome: 'swapped',
      occurrencesUpdated: String(updated),
      ...weekPayload(context),
    },
    sourceRecordId: exerciseRowId,
  });

  return {
    message: swapConfirmationMessage({
      replacementName: chosen.name,
      occurrencesUpdated: updated,
    }),
    occurrencesUpdated: updated,
    replacementName: chosen.name,
  };
}

/** She read the options and kept what she had. Recorded, because being offered and declining is a different fact from never being offered. */
export async function keepOriginalExerciseAction(feedbackId: string): Promise<ActionResult> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return { error: 'Sign in required.' };
  const ok = await markFeedbackKeptOriginal(supabase, feedbackId);
  return ok ? {} : { error: 'Could not save that. Please try again.' };
}
