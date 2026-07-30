/**
 * Media-availability ranking for Exercise Library search results. Applied
 * as a stable re-sort *after* the vendor's own relevance ranking and after
 * every filter — Array.prototype.sort is stable per spec, so this only
 * ever reorders across media tiers (video > image > cues > no media); it
 * never reorders two exercises already in the same tier, which is what
 * preserves the provider's exact relevance order within each tier. Nothing
 * here removes an exercise — a no-media result still appears, just after
 * every media/cues-having one, per the "never hide exercises with no
 * media" requirement.
 *
 * Tier check uses hasVideo, not videoUrl — a your_move-sourced exercise
 * has hasVideo=true but a null videoUrl until the member actually taps
 * play (fetched fresh then, never eagerly), so videoUrl alone would
 * wrongly rank it as if it had no media.
 */

export type ExerciseMediaTier = 'video' | 'image' | 'cues' | 'none';

const TIER_RANK: Record<ExerciseMediaTier, number> = { video: 0, image: 1, cues: 2, none: 3 };

export function getExerciseMediaTier(exercise: {
  hasVideo: boolean;
  imageUrl: string | null;
  cues: string[];
}): ExerciseMediaTier {
  if (exercise.hasVideo) return 'video';
  if (exercise.imageUrl) return 'image';
  if (exercise.cues.length > 0) return 'cues';
  return 'none';
}

export function rankByMediaAvailability<
  T extends { hasVideo: boolean; imageUrl: string | null; cues: string[] },
>(exercises: T[]): T[] {
  return [...exercises].sort(
    (a, b) => TIER_RANK[getExerciseMediaTier(a)] - TIER_RANK[getExerciseMediaTier(b)]
  );
}
