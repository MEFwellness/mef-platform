/**
 * Data access for member_exercise_favorites (migration 80). Same shape as
 * lib/food-products/savedMeals.ts's member_food_favorites functions — pure
 * functions taking a SupabaseClient, RLS (member_read_own/insert/delete
 * own) is the real authorization boundary.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type { ExerciseLibraryProvider, MemberExerciseFavorite } from '@mef/shared-types-contracts';

export async function listMyExerciseFavorites(
  supabase: SupabaseClient,
  memberId: string
): Promise<MemberExerciseFavorite[]> {
  const { data, error } = await supabase
    .from('member_exercise_favorites')
    .select('*')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('listMyExerciseFavorites failed', error);
    return [];
  }
  return data as MemberExerciseFavorite[];
}

/** Just the external ids, as a Set, for cheaply marking hearts in a search-results grid. */
export async function listMyExerciseFavoriteIds(
  supabase: SupabaseClient,
  memberId: string,
  provider: ExerciseLibraryProvider
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('member_exercise_favorites')
    .select('external_id')
    .eq('member_id', memberId)
    .eq('provider', provider);
  if (error) {
    console.error('listMyExerciseFavoriteIds failed', error);
    return new Set();
  }
  return new Set((data as { external_id: string }[]).map((row) => row.external_id));
}

export async function isExerciseFavorited(
  supabase: SupabaseClient,
  memberId: string,
  provider: ExerciseLibraryProvider,
  externalId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('member_exercise_favorites')
    .select('id')
    .eq('member_id', memberId)
    .eq('provider', provider)
    .eq('external_id', externalId)
    .maybeSingle();
  if (error) {
    console.error('isExerciseFavorited failed', error);
    return false;
  }
  return Boolean(data);
}

/** Upsert with ignoreDuplicates — a double-tap of the favorite button hits the unique (member_id, provider, external_id) index rather than erroring. */
export async function addExerciseFavorite(
  supabase: SupabaseClient,
  memberId: string,
  provider: ExerciseLibraryProvider,
  externalId: string
): Promise<boolean> {
  const { error } = await supabase.from('member_exercise_favorites').upsert(
    {
      id: randomUUID(),
      member_id: memberId,
      provider,
      external_id: externalId,
      created_at: new Date().toISOString(),
    },
    { onConflict: 'member_id,provider,external_id', ignoreDuplicates: true }
  );
  if (error) {
    console.error('addExerciseFavorite failed', error);
    return false;
  }
  return true;
}

export async function removeExerciseFavorite(
  supabase: SupabaseClient,
  memberId: string,
  provider: ExerciseLibraryProvider,
  externalId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('member_exercise_favorites')
    .delete()
    .eq('member_id', memberId)
    .eq('provider', provider)
    .eq('external_id', externalId);
  if (error) {
    console.error('removeExerciseFavorite failed', error);
    return false;
  }
  return true;
}
