import { resolveBodyRegion, type BodyRegion } from './bodyRegions';

export type PlaceholderMark = BodyRegion | 'default';
export type PlaceholderTone = 0 | 1 | 2 | 3;

export interface PlaceholderVisual {
  mark: PlaceholderMark;
  tone: PlaceholderTone;
}

/** Simple deterministic string hash — no randomness, so the same exercise always renders the same look across renders/reloads. */
function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * The look of the branded video-poster placeholder (VideoPosterPlaceholder.tsx),
 * shown for a video-tier exercise before poster extraction has run for it.
 * `mark` reuses bodyRegions' existing muscle→region map (no new muscle
 * vocabulary invented) so the abstract mark is tied to the exercise's real
 * primary muscle group. `tone` is hashed off category so exercises sharing
 * a muscle group still pick up a different accent treatment — a results
 * grid reads as varied, not one repeated tile — while staying fully
 * deterministic (same exercise, same look, every time).
 */
export function getPlaceholderVisual(exercise: {
  primaryMuscle: string | null;
  category: string | null;
}): PlaceholderVisual {
  const mark: PlaceholderMark = exercise.primaryMuscle
    ? resolveBodyRegion(exercise.primaryMuscle) ?? 'default'
    : 'default';
  const toneSeed = exercise.category ?? exercise.primaryMuscle ?? 'default';
  const tone = (hashString(toneSeed) % 4) as PlaceholderTone;
  return { mark, tone };
}
