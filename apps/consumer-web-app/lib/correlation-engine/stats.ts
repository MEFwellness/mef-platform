/**
 * Correlation Engine — pure statistics, no I/O. These are ordinal scales
 * (1-5 ratings, 0-5 pain, bucketed sleep-duration scores, binary flags),
 * so Spearman rank correlation is the right tool here, not Pearson
 * (requirement 2) — everything below operates on ranks, never raw
 * magnitudes, and ties are handled with the standard average-rank method.
 */

/** Fractional (average) ranks, 1-indexed — the standard tie-handling method for Spearman's rho. */
export function rankValues(values: number[]): number[] {
  const indexed = values.map((value, index) => ({ value, index }));
  indexed.sort((a, b) => a.value - b.value);

  const ranks = new Array<number>(values.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1]!.value === indexed[i]!.value) j++;
    // Every tied element gets the average of the ranks it spans (i..j, 1-indexed).
    const averageRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[indexed[k]!.index] = averageRank;
    i = j + 1;
  }
  return ranks;
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let covariance = 0;
  let varianceX = 0;
  let varianceY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - meanX;
    const dy = ys[i]! - meanY;
    covariance += dx * dy;
    varianceX += dx * dx;
    varianceY += dy * dy;
  }

  if (varianceX === 0 || varianceY === 0) return 0;
  return covariance / Math.sqrt(varianceX * varianceY);
}

/**
 * Spearman's rho over two equal-length, already-paired series (index i of
 * each array is the same real observation — pairing.ts is what guarantees
 * that, never this function). Returns 0 for a degenerate input (fewer
 * than 2 points, or either series has zero variance in rank) rather than
 * NaN, so callers can compare it against a floor without a NaN check.
 */
export function spearmanRho(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length || xs.length < 2) return 0;
  const rx = rankValues(xs);
  const ry = rankValues(ys);
  const rho = pearson(rx, ry);
  return Number.isFinite(rho) ? rho : 0;
}

/** No single value may make up more than this share of a series — guards against a near-flat series with one outlier day reading as "correlated" by coincidence. */
export const MAX_MODE_SHARE = 0.85;

/**
 * "Enough variation in both variables that the result isn't an artifact
 * of a flat series" (requirement 4) — real spread, not just technically
 * non-constant. Checked per-series; a pair only passes when both sides do.
 */
export function hasSufficientVariation(values: number[]): boolean {
  if (values.length < 2) return false;

  const distinct = new Set(values);
  if (distinct.size < 2) return false;

  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const modeShare = Math.max(...counts.values()) / values.length;
  return modeShare <= MAX_MODE_SHARE;
}
