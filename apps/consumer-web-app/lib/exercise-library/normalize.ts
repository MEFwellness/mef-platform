/**
 * Merges a raw ExerciseAPI.dev exercise with its (optional) MEF metadata
 * row and the signed-in member's favorite state into the one normalized
 * shape every Exercise Library UI component renders
 * (ExerciseLibraryExercise, shared-types-contracts). Nothing downstream of
 * this function ever touches ExerciseApiExercise or MefExerciseMetadata
 * directly — swapping or adding a content provider later means adding a
 * normalizer like this one, not changing every component that reads an
 * exercise.
 *
 * imageUrl is always null today. ExerciseAPI.dev's own docs
 * (https://exerciseapi.dev/llms.txt, "Videos" section) are explicit that
 * `images` is a bare relative path (e.g. "Barbell_Bench_Press/0.jpg") that
 * ExerciseAPI.dev does NOT host — "prepend your own image base URL" if you
 * want to use it. MEF has no such base URL (no image hosting of our own
 * for this content), so there is no real host to prepend; a prior version
 * of this function guessed `https://cdn.exerciseapi.dev` and produced a
 * URL that 404s for every exercise (confirmed against the live API — see
 * the Exercise Library media investigation), which is what rendered as a
 * broken-image icon on the browse grid. `videos[0].url` is unaffected —
 * those ARE absolute, ExerciseAPI.dev-hosted URLs per the same docs, and
 * work correctly.
 */

import type { ExerciseLibraryExercise, MefExerciseMetadata } from '@mef/shared-types-contracts';
import type { ExerciseApiExercise } from './apiClient';

export function normalizeExerciseApiExercise(
  exercise: ExerciseApiExercise,
  metadata: MefExerciseMetadata | null,
  isFavorited: boolean
): ExerciseLibraryExercise {
  const firstVideo = exercise.videos?.[0]?.url ?? null;

  return {
    provider: 'exercise_api_dev',
    externalId: exercise.id,
    name: exercise.name,
    category: exercise.category ?? null,
    level: exercise.level ?? null,
    mechanic: exercise.mechanic ?? null,
    force: exercise.force ?? null,
    equipment: exercise.equipment ?? null,
    primaryMuscles: exercise.primaryMuscles ?? [],
    secondaryMuscles: exercise.secondaryMuscles ?? [],
    instructions: exercise.instructions ?? [],
    exerciseTips: exercise.exerciseTips ?? [],
    commonMistakes: exercise.commonMistakes ?? [],
    safetyInfo: exercise.safetyInfo ?? null,
    overview: exercise.overview ?? null,
    variations: exercise.variations ?? [],
    videoUrl: firstVideo,
    imageUrl: null,
    metadata,
    isFavorited,
  };
}
