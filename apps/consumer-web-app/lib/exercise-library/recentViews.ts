/**
 * Data access for member_exercise_recent_views (migration 81) — a recency
 * pointer (one row per exercise, upserted on every view), not history.
 * Same shape as lib/exercise-library/favorites.ts. Powers "Recently
 * Viewed" and "resume where you left off" (the single most recent row).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExerciseLibraryProvider, MemberExerciseRecentView } from '@mef/shared-types-contracts';

export async function recordExerciseView(
  supabase: SupabaseClient,
  memberId: string,
  provider: ExerciseLibraryProvider,
  externalId: string,
  exerciseName: string
): Promise<boolean> {
  const { error } = await supabase.from('member_exercise_recent_views').upsert(
    {
      member_id: memberId,
      provider,
      external_id: externalId,
      exercise_name: exerciseName,
      viewed_at: new Date().toISOString(),
    },
    { onConflict: 'member_id,provider,external_id' }
  );
  if (error) {
    console.error('recordExerciseView failed', error);
    return false;
  }
  return true;
}

/** Newest first — the "Recently Viewed" rail. */
export async function listMyRecentlyViewedExercises(
  supabase: SupabaseClient,
  memberId: string,
  limit = 10
): Promise<MemberExerciseRecentView[]> {
  const { data, error } = await supabase
    .from('member_exercise_recent_views')
    .select('*')
    .eq('member_id', memberId)
    .order('viewed_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('listMyRecentlyViewedExercises failed', error);
    return [];
  }
  return data as MemberExerciseRecentView[];
}

/** The single most recent view — "resume where you left off." */
export async function getMyMostRecentlyViewedExercise(
  supabase: SupabaseClient,
  memberId: string
): Promise<MemberExerciseRecentView | null> {
  const rows = await listMyRecentlyViewedExercises(supabase, memberId, 1);
  return rows[0] ?? null;
}
