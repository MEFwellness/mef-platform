/**
 * Data access for member_exercise_completions (migration 81) — the
 * permanent, append-only record of a member completing, partially
 * completing, or skipping an exercise from the Exercise Library. Same
 * shape as every other data.ts in this codebase: pure functions taking a
 * SupabaseClient, RLS (member_read_own / coach_read_assigned /
 * member_insert_own, no update or delete for anyone but
 * platform_administrator) is the real authorization boundary. Nothing here
 * ever updates or deletes a row — history is never overwritten, per the
 * milestone's own requirement.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ExerciseCompletionSource,
  ExerciseCompletionStatus,
  ExerciseComfortRating,
  ExerciseDifficultyRating,
  ExerciseEnjoymentRating,
  ExerciseLibraryProvider,
  MemberExerciseCompletion,
} from '@mef/shared-types-contracts';

export type RecordExerciseCompletionInput = {
  memberId: string;
  provider: ExerciseLibraryProvider;
  externalId: string;
  exerciseName: string;
  status: ExerciseCompletionStatus;
  durationSeconds?: number | null | undefined;
  completionSource?: ExerciseCompletionSource | undefined;
  memberNotes?: string | null | undefined;
  difficultyRating?: ExerciseDifficultyRating | null | undefined;
  comfortRating?: ExerciseComfortRating | null | undefined;
  enjoymentRating?: ExerciseEnjoymentRating | null | undefined;
};

export async function recordExerciseCompletion(
  supabase: SupabaseClient,
  input: RecordExerciseCompletionInput
): Promise<MemberExerciseCompletion | null> {
  const { data, error } = await supabase
    .from('member_exercise_completions')
    .insert({
      member_id: input.memberId,
      provider: input.provider,
      external_id: input.externalId,
      exercise_name: input.exerciseName,
      status: input.status,
      duration_seconds: input.durationSeconds ?? null,
      completion_source: input.completionSource ?? 'exercise_library',
      member_notes: input.memberNotes ?? null,
      difficulty_rating: input.difficultyRating ?? null,
      comfort_rating: input.comfortRating ?? null,
      enjoyment_rating: input.enjoymentRating ?? null,
    })
    .select('*')
    .single();

  if (error) {
    console.error('recordExerciseCompletion failed', error);
    return null;
  }
  return data as MemberExerciseCompletion;
}

/** Newest first, across every exercise — powers the "recently completed" rail and the member's own history view. */
export async function listMyExerciseCompletions(
  supabase: SupabaseClient,
  memberId: string,
  limit = 50
): Promise<MemberExerciseCompletion[]> {
  const { data, error } = await supabase
    .from('member_exercise_completions')
    .select('*')
    .eq('member_id', memberId)
    .order('occurred_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('listMyExerciseCompletions failed', error);
    return [];
  }
  return data as MemberExerciseCompletion[];
}

/** Newest first, for one specific exercise — the exercise detail page's "your history with this exercise" section, and the input to review-detection heuristics. */
export async function listExerciseCompletionHistory(
  supabase: SupabaseClient,
  memberId: string,
  provider: ExerciseLibraryProvider,
  externalId: string,
  limit = 20
): Promise<MemberExerciseCompletion[]> {
  const { data, error } = await supabase
    .from('member_exercise_completions')
    .select('*')
    .eq('member_id', memberId)
    .eq('provider', provider)
    .eq('external_id', externalId)
    .order('occurred_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('listExerciseCompletionHistory failed', error);
    return [];
  }
  return data as MemberExerciseCompletion[];
}

/** For a coach viewing an assigned client's exercise history — same query shape, gated by coach_read_assigned_exercise_completions instead of member_read_own. */
export async function listClientExerciseCompletions(
  supabase: SupabaseClient,
  memberId: string,
  limit = 50
): Promise<MemberExerciseCompletion[]> {
  return listMyExerciseCompletions(supabase, memberId, limit);
}
