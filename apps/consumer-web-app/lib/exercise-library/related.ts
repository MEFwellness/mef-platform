/**
 * "Related exercises" for the Exercise Library detail page — same primary
 * muscle or category as the exercise being viewed, excluding itself.
 * Called directly from app/exercises/[id]/page.tsx (already a server
 * component doing direct apiClient/Supabase calls, per that page's own
 * doc comment) rather than as a separate server action, since there's no
 * client-side interactivity here beyond an initial page load.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExerciseLibraryExercise } from '@mef/shared-types-contracts';
import type { ExerciseApiClient } from './apiClient';
import { getExerciseMetadataMap } from './metadata';
import { listMyExerciseFavoriteIds } from './favorites';
import { normalizeExerciseApiExercise } from './normalize';

export async function getRelatedExercises(
  client: ExerciseApiClient,
  supabase: SupabaseClient,
  memberId: string,
  current: { externalId: string; primaryMuscle: string | null; category: string | null },
  limit = 6
): Promise<ExerciseLibraryExercise[]> {
  if (!current.primaryMuscle && !current.category) return [];

  try {
    const result = await client.searchExercises({
      muscle: current.primaryMuscle ?? undefined,
      category: current.primaryMuscle ? undefined : (current.category ?? undefined),
      limit: limit + 1,
    });
    const candidates = result.data.filter((e) => e.id !== current.externalId).slice(0, limit);
    if (candidates.length === 0) return [];

    const externalIds = candidates.map((e) => e.id);
    const [metadataMap, favoriteIds] = await Promise.all([
      getExerciseMetadataMap(supabase, 'exercise_api_dev', externalIds),
      listMyExerciseFavoriteIds(supabase, memberId, 'exercise_api_dev'),
    ]);

    return candidates.map((exercise) =>
      normalizeExerciseApiExercise(
        exercise,
        metadataMap.get(exercise.id) ?? null,
        favoriteIds.has(exercise.id)
      )
    );
  } catch (err) {
    console.error('getRelatedExercises failed', err);
    return [];
  }
}
