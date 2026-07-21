/**
 * Recomputes member_movement_profiles.favorite_movement_types from the
 * member's actual favorited exercises — real data, not a self-report
 * field, same "trace to an actual row" discipline as every derived signal
 * in lib/movement/rules/facts.ts. Reads each favorite's
 * mef_exercise_metadata.movement_category (falling back to
 * program_section when a favorite has no curated movement_category) and
 * keeps the categories that appear most often. Called after every favorite
 * add/remove — see app/actions/exercise-library.ts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { listMyExerciseFavorites } from '../exercise-library/favorites';
import { getExerciseMetadataMap } from '../exercise-library/metadata';

const MAX_FAVORITE_MOVEMENT_TYPES = 5;

export async function computeFavoriteMovementTypes(
  supabase: SupabaseClient,
  memberId: string
): Promise<string[]> {
  const favorites = await listMyExerciseFavorites(supabase, memberId);
  if (favorites.length === 0) return [];

  const metadataMap = await getExerciseMetadataMap(
    supabase,
    'exercise_api_dev',
    favorites.map((f) => f.external_id)
  );

  const counts = new Map<string, number>();
  for (const favorite of favorites) {
    const metadata = metadataMap.get(favorite.external_id);
    const category = metadata?.movement_category || metadata?.program_section;
    if (!category) continue;
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_FAVORITE_MOVEMENT_TYPES)
    .map(([category]) => category);
}
