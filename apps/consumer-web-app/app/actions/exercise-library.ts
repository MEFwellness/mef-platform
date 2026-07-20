/**
 * Server actions for the Exercise Library — favoriting only. Search/detail
 * reads go through app/api/exercises/route.ts (client-driven, interactive
 * search) or a direct server-side apiClient call (the exercise detail
 * page); favoriting is a first-party write with no interactive round-trip
 * needed, so it's a server action instead, same convention as every other
 * mutation in app/actions/.
 */

'use server';

import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from './auth';
import {
  addExerciseFavorite,
  listMyExerciseFavoriteIds,
  removeExerciseFavorite,
} from '@/lib/exercise-library/favorites';

async function resolveMemberId(): Promise<{ supabase: ReturnType<typeof createClient>; memberId: string } | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { supabase, memberId: user.id };
}

export async function toggleExerciseFavorite(
  externalId: string,
  nextIsFavorited: boolean
): Promise<ActionResult> {
  const context = await resolveMemberId();
  if (!context) return { error: 'Sign in required.' };

  const { supabase, memberId } = context;
  const ok = nextIsFavorited
    ? await addExerciseFavorite(supabase, memberId, 'exercise_api_dev', externalId)
    : await removeExerciseFavorite(supabase, memberId, 'exercise_api_dev', externalId);

  if (!ok) return { error: 'Could not update favorites. Please try again.' };
  return {};
}

export async function getMyExerciseFavoriteIds(): Promise<string[]> {
  const context = await resolveMemberId();
  if (!context) return [];
  const ids = await listMyExerciseFavoriteIds(context.supabase, context.memberId, 'exercise_api_dev');
  return Array.from(ids);
}
