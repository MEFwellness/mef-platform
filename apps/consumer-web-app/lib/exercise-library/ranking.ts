/**
 * Media-availability ranking for Exercise Library search results. Applied
 * as a stable re-sort *after* the vendor's own relevance ranking and after
 * every filter — Array.prototype.sort is stable per spec, so this only
 * ever reorders across media tiers (video > image > no media); it never
 * reorders two exercises that are already in the same tier, which is what
 * preserves the provider's exact relevance order within each tier. Nothing
 * here removes an exercise — a no-media result still appears, just after
 * every media-having one, per the "never hide exercises with no media"
 * requirement.
 */

export type ExerciseMediaTier = 'video' | 'image' | 'none';

const TIER_RANK: Record<ExerciseMediaTier, number> = { video: 0, image: 1, none: 2 };

export function getExerciseMediaTier(exercise: {
  videoUrl: string | null;
  imageUrl: string | null;
}): ExerciseMediaTier {
  if (exercise.videoUrl) return 'video';
  if (exercise.imageUrl) return 'image';
  return 'none';
}

export function rankByMediaAvailability<
  T extends { videoUrl: string | null; imageUrl: string | null },
>(exercises: T[]): T[] {
  return [...exercises].sort(
    (a, b) => TIER_RANK[getExerciseMediaTier(a)] - TIER_RANK[getExerciseMediaTier(b)]
  );
}
