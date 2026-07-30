/**
 * "Related exercises" for the Exercise Library detail page — same primary
 * muscle or category as the exercise being viewed, excluding itself.
 * Called directly from app/exercises/[id]/page.tsx (already a server
 * component doing direct Supabase calls) rather than as a separate server
 * action, since there's no client-side interactivity here beyond an
 * initial page load.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExerciseLibraryExercise } from '@mef/shared-types-contracts';
import { searchExerciseCatalog } from '../your-move/catalog';
import { getExerciseMetadataMap } from './metadata';
import { listMyExerciseFavoriteIds } from './favorites';
import { normalizeExerciseCatalogRow } from './normalize';
import { getExtractedPosterMap } from '../your-move/posters';

export async function getRelatedExercises(
  supabase: SupabaseClient,
  memberId: string,
  current: { externalId: string; primaryMuscle: string | null; category: string | null },
  limit = 6
): Promise<ExerciseLibraryExercise[]> {
  if (!current.primaryMuscle && !current.category) return [];

  try {
    const result = await searchExerciseCatalog(supabase, {
      muscle: current.primaryMuscle ?? undefined,
      category: current.primaryMuscle ? undefined : (current.category ?? undefined),
      excludeExternalId: current.externalId,
      limit,
    });
    const candidates = result.data;
    if (candidates.length === 0) return [];

    const externalIds = candidates.map((e) => e.external_id);
    const [metadataMap, favoriteIds, posterMap] = await Promise.all([
      getExerciseMetadataMap(supabase, 'your_move', externalIds),
      listMyExerciseFavoriteIds(supabase, memberId, 'your_move'),
      getExtractedPosterMap(supabase, externalIds),
    ]);

    return candidates.map((exercise) =>
      normalizeExerciseCatalogRow(
        exercise,
        metadataMap.get(exercise.external_id) ?? null,
        favoriteIds.has(exercise.external_id),
        posterMap.get(exercise.external_id) ?? null
      )
    );
  } catch (err) {
    console.error('getRelatedExercises failed', err);
    return [];
  }
}
