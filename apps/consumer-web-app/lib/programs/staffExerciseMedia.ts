/**
 * The poster and cues a STAFF program screen renders, per exercise.
 *
 * WHY THIS EXISTS AND WHY IT IS NOT loadAssignedWorkoutMedia. The member's
 * version reads coaching cues from `member_exercise_cues`, a view whose
 * WHERE clause is "an exercise this member is entitled to see". A coach
 * reviewing a program nobody has been given yet is entitled to none of
 * them, so she would get an empty map from it. Staff read
 * `mef_exercise_metadata` directly, which migration 170 made staff-only.
 * Same posters, same catalog, different door for the cues, because there
 * genuinely are two doors.
 *
 * ZERO VIDEO REQUESTS, exactly as on the member side. A poster is a public
 * URL for a frame this product extracted and stored itself; nothing here
 * asks Your Move for anything. The video URL is fetched by exactly one
 * component in the product, on tap. That is what makes it safe to put a
 * player on a review screen at all: a coach opening a 24 exercise program
 * spends nothing, and only the movement she taps costs a play.
 *
 * The shape returned is AssignedExerciseMediaMap, unchanged, so the same
 * TapToPlayVideo call site works on a coach screen and a member screen
 * without a second prop contract to keep in step.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getExercisesByExternalIds } from '../your-move/catalog';
import { getExerciseMetadataMap } from '../exercise-library/metadata';
import { getExtractedPosterMap, toPublicMediaUrl } from '../your-move/posters';
import type { AssignedExerciseMediaMap } from '../coach-program-builder/assignedWorkoutMedia';

/**
 * A plain object rather than a Map: this crosses the server/client
 * component boundary, and a Map does not survive that serialization.
 */
export async function loadStaffExerciseMedia(
  supabase: SupabaseClient,
  externalIds: readonly string[]
): Promise<AssignedExerciseMediaMap> {
  const ids = Array.from(new Set(externalIds.filter((id) => id && id.trim() !== '')));
  if (ids.length === 0) return {};

  const [catalog, metadata, posters] = await Promise.all([
    getExercisesByExternalIds(supabase, ids),
    getExerciseMetadataMap(supabase, ids),
    getExtractedPosterMap(supabase, ids),
  ]);

  const media: AssignedExerciseMediaMap = {};
  for (const externalId of ids) {
    const exercise = catalog.get(externalId);
    const poster = posters.get(externalId);
    media[externalId] = {
      primaryMuscle: exercise?.primary_muscle ?? null,
      category: exercise?.category ?? null,
      posterUrl: poster ? toPublicMediaUrl(poster.storage_path) : null,
      cues: metadata.get(externalId)?.coaching_cues ?? [],
    };
  }
  return media;
}
