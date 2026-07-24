import type { ComparisonDirection, RankedComparisonInput } from './types';

/**
 * Pure rank-based classifier — no I/O, generalizes
 * lib/registry/trendStatus.ts's computeFindingTrendStatus() with two
 * additions that function doesn't need: an explicit "current absent"
 * case (registry finding-adapters always write a concrete next value;
 * comparing two full assessment attempts needs to detect an item that
 * simply isn't present anymore) and a `higherIsWorse` flag (the existing
 * comparison modules disagree on which rank direction is better).
 *
 * Returns null only when there is genuinely nothing to compare (both
 * sides null) — mirrors computeFindingTrendStatus's own null-return
 * convention rather than inventing a sixth vocabulary value.
 */
export function classifyComparison({
  previousRank,
  currentRank,
  higherIsWorse = true,
}: RankedComparisonInput): ComparisonDirection | null {
  if (previousRank === null && currentRank === null) return null;
  if (currentRank === null) return 'resolved';
  if (previousRank === null) return 'new';
  if (currentRank === previousRank) return 'unchanged';

  const currentIsWorse = higherIsWorse ? currentRank > previousRank : currentRank < previousRank;
  return currentIsWorse ? 'worsened' : 'improved';
}
