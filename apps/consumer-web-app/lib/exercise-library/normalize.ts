/**
 * Merges a raw ExerciseAPI.dev exercise with its (optional) MEF metadata
 * row, Your Move media link, extracted poster, open-license image, and the
 * signed-in member's favorite state into the one normalized shape every
 * Exercise Library UI component renders (ExerciseLibraryExercise,
 * shared-types-contracts). Nothing downstream of this function ever
 * touches ExerciseApiExercise or MefExerciseMetadata directly — swapping
 * or adding a content provider later means adding a normalizer like this
 * one, not changing every component that reads an exercise.
 *
 * Media resolution order, per the Your Move dominance rule (its video wins
 * over ExerciseAPI.dev's whenever both exist):
 *   1. yourMoveLink present -> hasVideo=true, videoSource='your_move',
 *      videoUrl stays null (fetched fresh at play time via
 *      /api/exercises/[id]/video-url — never eagerly, per Your Move's 48h
 *      URL-expiry terms).
 *   2. else raw ExerciseAPI.dev video present -> hasVideo=true,
 *      videoSource='exercise_api_dev', videoUrl eager (that vendor's URLs
 *      don't expire).
 *   3. else no video -> posterUrl/imageUrl/cues fall through to whichever
 *      of extractedPoster / openLicenseImageUrl / metadata.coaching_cues
 *      is present (Phase 3/4 coverage). imageUrl was always null before
 *      this — ExerciseAPI.dev's own `images` field is a bare relative path
 *      it doesn't host (see the Exercise Library media investigation) —
 *      it now carries a Phase 3 open-license image instead, never the
 *      vendor's broken path.
 */

import type { ExerciseLibraryExercise, MefExerciseMetadata, YourMoveExerciseLink, ExerciseExtractedPoster } from '@mef/shared-types-contracts';
import type { ExerciseApiExercise } from './apiClient';
import { toPublicMediaUrl } from '../your-move/posters';

export function normalizeExerciseApiExercise(
  exercise: ExerciseApiExercise,
  metadata: MefExerciseMetadata | null,
  isFavorited: boolean,
  yourMoveLink: YourMoveExerciseLink | null = null,
  extractedPoster: ExerciseExtractedPoster | null = null,
  openLicenseImageStoragePath: string | null = null
): ExerciseLibraryExercise {
  const rawVideoUrl = exercise.videos?.[0]?.url ?? null;

  const hasVideo = Boolean(yourMoveLink) || Boolean(rawVideoUrl);
  const videoSource: ExerciseLibraryExercise['videoSource'] = yourMoveLink
    ? 'your_move'
    : rawVideoUrl
      ? 'exercise_api_dev'
      : null;
  // Your Move's own video URL is NEVER included here — only fetched at
  // play time. ExerciseAPI.dev's is eager since it doesn't expire.
  const videoUrl = videoSource === 'exercise_api_dev' ? rawVideoUrl : null;

  const posterUrl = extractedPoster ? toPublicMediaUrl(extractedPoster.storage_path) : null;
  const imageUrl = !hasVideo && openLicenseImageStoragePath ? toPublicMediaUrl(openLicenseImageStoragePath) : null;
  const cues = !hasVideo && !imageUrl ? (metadata?.coaching_cues ?? []) : [];

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
    videoUrl,
    hasVideo,
    videoSource,
    posterUrl,
    imageUrl,
    cues,
    metadata,
    isFavorited,
  };
}
