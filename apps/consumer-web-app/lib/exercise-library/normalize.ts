/**
 * Merges a raw exercise_catalog row (Your Move, the sole catalog source)
 * with its (optional) MEF metadata row, extracted poster, and the
 * signed-in member's favorite state into the one normalized shape every
 * Exercise Library UI component renders (ExerciseLibraryExercise,
 * shared-types-contracts). Nothing downstream of this function ever
 * touches ExerciseCatalogRow or MefExerciseMetadata directly.
 *
 * Media resolution:
 *   1. has_video -> hasVideo=true. videoUrl is never populated here —
 *      fetched fresh at play time via /api/exercises/[id]/video-url (per
 *      Your Move's 48h URL-expiry terms). posterUrl is an extracted
 *      mid-movement frame we store ourselves, shown behind the play
 *      button (may be null if Phase 2 extraction hasn't run for this
 *      exercise yet — the tap-to-play button still works, just with a
 *      plain background instead of a poster).
 *   2. else no video -> cues (generated from Your Move's own
 *      instructions/importantPoints, see cueGeneration.ts). Also used as
 *      the graceful fallback if a video's tap-to-play fetch ever fails
 *      (see ExerciseDetailView's TapToPlayVideo) — never a broken player.
 */

import type { ExerciseCatalogRow, ExerciseLibraryExercise, MefExerciseMetadata, ExerciseExtractedPoster } from '@mef/shared-types-contracts';
import { toPublicMediaUrl } from '../your-move/posters';

export function normalizeExerciseCatalogRow(
  exercise: ExerciseCatalogRow,
  metadata: MefExerciseMetadata | null,
  isFavorited: boolean,
  extractedPoster: ExerciseExtractedPoster | null = null
): ExerciseLibraryExercise {
  const posterUrl = extractedPoster ? toPublicMediaUrl(extractedPoster.storage_path) : null;
  const cues = !exercise.has_video ? (metadata?.coaching_cues ?? []) : [];

  return {
    provider: exercise.provider,
    externalId: exercise.external_id,
    name: exercise.name,
    category: exercise.category,
    level: exercise.difficulty,
    equipment: exercise.equipment,
    primaryMuscle: exercise.primary_muscle,
    secondaryMuscles: exercise.secondary_muscles,
    instructions: exercise.instructions,
    exerciseTips: exercise.exercise_tips,
    hasVideo: exercise.has_video,
    isClientAssignable: exercise.is_client_assignable,
    posterUrl,
    cues,
    metadata,
    isFavorited,
  };
}
