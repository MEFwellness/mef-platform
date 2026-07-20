/**
 * Merges a raw ExerciseAPI.dev exercise with its (optional) MEF metadata
 * row and the signed-in member's favorite state into the one normalized
 * shape every Exercise Library UI component renders
 * (ExerciseLibraryExercise, shared-types-contracts). Nothing downstream of
 * this function ever touches ExerciseApiExercise or MefExerciseMetadata
 * directly — swapping or adding a content provider later means adding a
 * normalizer like this one, not changing every component that reads an
 * exercise.
 */

import type { ExerciseLibraryExercise, MefExerciseMetadata } from '@mef/shared-types-contracts';
import type { ExerciseApiExercise } from './apiClient';
import { resolveExerciseImageUrl } from './imageUrl';

export function normalizeExerciseApiExercise(
  exercise: ExerciseApiExercise,
  metadata: MefExerciseMetadata | null,
  isFavorited: boolean
): ExerciseLibraryExercise {
  const firstVideo = exercise.videos?.[0]?.url ?? null;
  const firstImage = exercise.images?.[0];

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
    imageUrl: firstImage ? resolveExerciseImageUrl(firstImage) : null,
    metadata,
    isFavorited,
  };
}
