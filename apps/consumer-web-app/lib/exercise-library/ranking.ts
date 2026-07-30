/**
 * Media-availability ranking for Exercise Library search results. Applied
 * as a stable re-sort *after* the catalog's own name-relevance ordering —
 * Array.prototype.sort is stable per spec, so this only ever reorders
 * across media tiers (video > cues > none); it never reorders two
 * exercises already in the same tier. Nothing here removes an exercise —
 * a no-media result still appears, just after every media/cues-having
 * one.
 *
 * Only two real tiers exist now that Your Move is the sole catalog source
 * (856/857 exercises have video; the remainder plus any tap-to-play
 * failure falls back to generated cues) — there is no longer an
 * open-license-image fallback tier (see the Phase 3 removal note in
 * migration 119).
 */

export type ExerciseMediaTier = 'video' | 'cues' | 'none';

const TIER_RANK: Record<ExerciseMediaTier, number> = { video: 0, cues: 1, none: 2 };

export function getExerciseMediaTier(exercise: { hasVideo: boolean; cues: string[] }): ExerciseMediaTier {
  if (exercise.hasVideo) return 'video';
  if (exercise.cues.length > 0) return 'cues';
  return 'none';
}

export function rankByMediaAvailability<T extends { hasVideo: boolean; cues: string[] }>(exercises: T[]): T[] {
  return [...exercises].sort((a, b) => TIER_RANK[getExerciseMediaTier(a)] - TIER_RANK[getExerciseMediaTier(b)]);
}
