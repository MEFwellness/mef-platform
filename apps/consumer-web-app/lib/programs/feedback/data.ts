/**
 * The writes. One file talks to member_exercise_feedback and
 * member_exercise_avoidance, same "one file owns this table" discipline as
 * lib/events/service.ts and lib/timeline/data.ts.
 *
 * WHAT A SWAP ACTUALLY DOES, precisely, because it is the one thing here
 * that changes a program a coach approved:
 *
 *   it rewrites the exercise on the occurrences she has NOT reached yet,
 *   in THIS program group only, and it touches nothing else. A session
 *   she already did keeps the exercise she actually did. A session she is
 *   standing in right now is included, because that is the one she asked
 *   about. Another program she is on is not touched at all, because she
 *   asked about this one.
 *
 *   it keeps the whole prescription. Sets, reps, hold, tempo, rest, per
 *   side: all of it stays exactly as her coach wrote it. The slot's job
 *   did not change, which is the entire reason the swap was allowed, so
 *   the dose the slot carries does not change either.
 *
 *   it records what it replaced, on the row. So a coach reading one
 *   occurrence can see it was swapped without joining anything.
 *
 * EVERY WRITE RUNS UNDER HER OWN SESSION. There is no service-role client
 * in this module. member_update_own_assigned_workout_exercises (migration
 * 82) is what permits the rewrite and member_read_own gates what she can
 * even find, so a bug in this file could not reach another member's rows.
 *
 * NO EM DASHES, per the house rule.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ExerciseAvoidanceSource,
  ExerciseFeedbackBranch,
  ExerciseFeedbackOutcome,
  ExerciseFeedbackReason,
  MemberExerciseFeedback,
} from '@mef/shared-types-contracts';
import { REPEATED_SKIP_THRESHOLD } from './reasons';

export interface RecordFeedbackInput {
  memberId: string;
  coachId: string | null;
  assignedWorkoutExerciseId: string;
  assignedWorkoutId: string;
  assignmentId: string | null;
  programGroupKey: string | null;
  programWeek: number | null;
  provider: string;
  externalId: string;
  exerciseName: string;
  reason: ExerciseFeedbackReason;
  otherText: string | null;
  branch: ExerciseFeedbackBranch;
  outcome: ExerciseFeedbackOutcome;
  coachNotified: boolean;
}

export async function recordExerciseFeedback(
  supabase: SupabaseClient,
  input: RecordFeedbackInput
): Promise<MemberExerciseFeedback | null> {
  const { data, error } = await supabase
    .from('member_exercise_feedback')
    .insert({
      member_id: input.memberId,
      coach_id: input.coachId,
      assigned_workout_exercise_id: input.assignedWorkoutExerciseId,
      assigned_workout_id: input.assignedWorkoutId,
      assignment_id: input.assignmentId,
      program_group_key: input.programGroupKey,
      program_week: input.programWeek,
      provider: input.provider,
      external_id: input.externalId,
      exercise_name: input.exerciseName,
      reason: input.reason,
      other_text: input.otherText,
      branch: input.branch,
      outcome: input.outcome,
      initiated_by: 'member',
      coach_notified: input.coachNotified,
    })
    .select('*')
    .single();

  if (error) {
    console.error('recordExerciseFeedback failed', error);
    return null;
  }
  return data as MemberExerciseFeedback;
}

/** Attaches the swap she chose to the report that produced it. */
export async function attachSwapToFeedback(
  supabase: SupabaseClient,
  feedbackId: string,
  input: {
    provider: string;
    externalId: string;
    exerciseName: string;
    occurrencesUpdated: number;
  }
): Promise<boolean> {
  const { error } = await supabase
    .from('member_exercise_feedback')
    .update({
      outcome: 'swapped',
      replacement_provider: input.provider,
      replacement_external_id: input.externalId,
      replacement_exercise_name: input.exerciseName,
      occurrences_updated: input.occurrencesUpdated,
    })
    .eq('id', feedbackId);
  if (error) {
    console.error('attachSwapToFeedback failed', error);
    return false;
  }
  return true;
}

/** She read the options and kept what she had. Recorded, because "she was offered and said no" is a different fact from "she was never offered". */
export async function markFeedbackKeptOriginal(
  supabase: SupabaseClient,
  feedbackId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('member_exercise_feedback')
    .update({ outcome: 'kept_original' })
    .eq('id', feedbackId);
  if (error) {
    console.error('markFeedbackKeptOriginal failed', error);
    return false;
  }
  return true;
}

/** How many times she has reported this exercise before, this report included. Decides whether a dislike has become an avoidance. */
export async function countReportsFor(
  supabase: SupabaseClient,
  memberId: string,
  externalId: string
): Promise<number> {
  const { count, error } = await supabase
    .from('member_exercise_feedback')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', memberId)
    .eq('external_id', externalId);
  if (error) {
    console.error('countReportsFor failed', error);
    return 0;
  }
  return count ?? 0;
}

/**
 * Puts an exercise on her do-not-offer list, or leaves it there if it
 * already is. Idempotent by the table's own unique key rather than by a
 * read first: two taps in a row must not produce two rows.
 */
export async function recordAvoidance(
  supabase: SupabaseClient,
  input: {
    memberId: string;
    provider: string;
    externalId: string;
    exerciseName: string;
    source: ExerciseAvoidanceSource;
    feedbackId: string | null;
  }
): Promise<boolean> {
  const { error } = await supabase.from('member_exercise_avoidance').upsert(
    {
      member_id: input.memberId,
      provider: input.provider,
      external_id: input.externalId,
      exercise_name: input.exerciseName,
      source: input.source,
      feedback_id: input.feedbackId,
      released_at: null,
    },
    { onConflict: 'member_id,provider,external_id' }
  );
  if (error) {
    console.error('recordAvoidance failed', error);
    return false;
  }
  return true;
}

/**
 * Whether she has skipped this exercise often enough to stop being offered
 * it. Counted across her whole history with the exercise rather than
 * within one program, because a member who has skipped the same movement
 * three times has told us something about the movement.
 */
export async function hasRepeatedSkips(
  supabase: SupabaseClient,
  memberId: string,
  externalId: string
): Promise<boolean> {
  const { count, error } = await supabase
    .from('coach_assigned_workout_exercises')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', memberId)
    .eq('external_id', externalId)
    .eq('status', 'skipped');
  if (error) {
    console.error('hasRepeatedSkips failed', error);
    return false;
  }
  return (count ?? 0) >= REPEATED_SKIP_THRESHOLD;
}

// ---------------------------------------------------------------------
// The swap itself
// ---------------------------------------------------------------------

export interface SwapTargetsInput {
  memberId: string;
  /** The occurrence she is looking at. Always included, whatever its date. */
  assignedWorkoutExerciseId: string;
  /** Every weekly session of this program. Nothing outside it is touched. */
  assignmentIds: string[];
  externalId: string;
  /** Her own local date. Occurrences scheduled before today are history and are left alone. */
  today: string;
}

/**
 * The rows a swap will rewrite: this occurrence, plus every occurrence of
 * the same exercise in this program that is scheduled today or later.
 */
export async function findSwapTargets(
  supabase: SupabaseClient,
  input: SwapTargetsInput
): Promise<string[]> {
  const ids = new Set<string>([input.assignedWorkoutExerciseId]);
  if (input.assignmentIds.length === 0) return [...ids];

  const { data: workouts, error: workoutsError } = await supabase
    .from('coach_assigned_workouts')
    .select('id')
    .eq('member_id', input.memberId)
    .in('assignment_id', input.assignmentIds)
    .gte('scheduled_date', input.today);
  if (workoutsError) {
    console.error('findSwapTargets (workouts) failed', workoutsError);
    return [...ids];
  }
  const workoutIds = (workouts ?? []).map((row) => row.id as string);
  if (workoutIds.length === 0) return [...ids];

  const { data: exercises, error: exercisesError } = await supabase
    .from('coach_assigned_workout_exercises')
    .select('id, status')
    .eq('member_id', input.memberId)
    .eq('external_id', input.externalId)
    .in('assigned_workout_id', workoutIds);
  if (exercisesError) {
    console.error('findSwapTargets (exercises) failed', exercisesError);
    return [...ids];
  }
  for (const row of exercises ?? []) {
    // Something she already finished, skipped or stopped is a record of
    // what happened. Rewriting it would change history.
    const status = row.status as string;
    if (status === 'completed' || status === 'partially_completed' || status === 'skipped' || status === 'stopped') {
      continue;
    }
    ids.add(row.id as string);
  }
  return [...ids];
}

export interface ApplySwapInput {
  exerciseRowIds: string[];
  provider: string;
  externalId: string;
  exerciseName: string;
  /** The line she reads under "Why this exercise" for the new one. Composed by rule, never stored free text. */
  memberReasoning: string;
  previousExternalId: string;
  previousExerciseName: string;
}

/**
 * Rewrites the exercise on those rows and nothing else about them. The
 * prescription columns are deliberately absent from this patch: the slot's
 * job did not change, so the dose her coach wrote does not change either.
 */
export async function applySwap(
  supabase: SupabaseClient,
  input: ApplySwapInput
): Promise<number> {
  if (input.exerciseRowIds.length === 0) return 0;
  const { data, error } = await supabase
    .from('coach_assigned_workout_exercises')
    .update({
      provider: input.provider,
      external_id: input.externalId,
      exercise_name: input.exerciseName,
      member_reasoning: input.memberReasoning,
      // The coach's own reasoning described the exercise that is no longer
      // here, so leaving it would attach one exercise's clinical rationale
      // to a different exercise.
      selection_reasoning: null,
      // The cues belonged to the old movement too. The catalog's own cues
      // for the new one are what her screen falls back to.
      coaching_cues: null,
      swapped_from_external_id: input.previousExternalId,
      swapped_from_exercise_name: input.previousExerciseName,
      swapped_at: new Date().toISOString(),
    })
    .in('id', input.exerciseRowIds)
    .select('id');
  if (error) {
    console.error('applySwap failed', error);
    return 0;
  }
  return (data ?? []).length;
}

/** Marks the occurrence stopped for pain. Its own status, not 'skipped': see migration 177. */
export async function markExerciseStopped(
  supabase: SupabaseClient,
  exerciseRowId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('coach_assigned_workout_exercises')
    .update({ status: 'stopped', stopped_at: new Date().toISOString(), comfort_rating: 'pain' })
    .eq('id', exerciseRowId);
  if (error) {
    console.error('markExerciseStopped failed', error);
    return false;
  }
  return true;
}

/** Her most recent logged weight for one exercise, for prefilling the field. Null when she has never logged one. */
export async function lastLoggedLoadFor(
  supabase: SupabaseClient,
  memberId: string,
  externalId: string
): Promise<{ load: number; unit: 'lbs' | 'kg' | null; perSide: boolean } | null> {
  const { data, error } = await supabase
    .from('coach_assigned_workout_exercises')
    .select('logged_load, logged_load_unit, logged_load_per_side, logged_load_at')
    .eq('member_id', memberId)
    .eq('external_id', externalId)
    .not('logged_load', 'is', null)
    .order('logged_load_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return {
    load: Number(data.logged_load),
    unit: (data.logged_load_unit as 'lbs' | 'kg' | null) ?? null,
    perSide: data.logged_load_per_side === true,
  };
}
