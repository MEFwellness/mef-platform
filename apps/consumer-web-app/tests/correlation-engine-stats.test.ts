import { describe, it, expect } from 'vitest';
import { rankValues, spearmanRho, hasSufficientVariation, MAX_MODE_SHARE } from '../lib/correlation-engine/stats';

describe('rankValues', () => {
  it('assigns 1..n ranks for distinct ascending values', () => {
    expect(rankValues([10, 20, 30])).toEqual([1, 2, 3]);
  });

  it('assigns average ranks for tied values', () => {
    // values 1,1,2,2 -> ties at (1,2) average 1.5, ties at (3,4) average 3.5
    expect(rankValues([1, 1, 2, 2])).toEqual([1.5, 1.5, 3.5, 3.5]);
  });

  it('handles a value appearing out of sorted order in the input array', () => {
    expect(rankValues([30, 10, 20])).toEqual([3, 1, 2]);
  });
});

describe('spearmanRho', () => {
  it('is 1 for a perfectly monotonic increasing pair', () => {
    const rho = spearmanRho([1, 2, 3, 4, 5], [10, 20, 30, 40, 50]);
    expect(rho).toBeCloseTo(1, 10);
  });

  it('is -1 for a perfectly monotonic decreasing pair', () => {
    const rho = spearmanRho([1, 2, 3, 4, 5], [50, 40, 30, 20, 10]);
    expect(rho).toBeCloseTo(-1, 10);
  });

  it('is 0 for a hand-verified uncorrelated tied pair', () => {
    // x=[1,1,2,2] ranks [1.5,1.5,3.5,3.5]; y=[1,2,1,2] ranks [1.5,3.5,1.5,3.5]
    // covariance of the rank series is 0 by hand calculation.
    const rho = spearmanRho([1, 1, 2, 2], [1, 2, 1, 2]);
    expect(rho).toBeCloseTo(0, 10);
  });

  it('is unaffected by a monotonic non-linear transform (rank-based, not magnitude-based)', () => {
    const rho = spearmanRho([1, 2, 3, 4, 5], [1, 4, 9, 16, 25]); // y = x^2, still monotonic
    expect(rho).toBeCloseTo(1, 10);
  });

  it('returns 0 rather than NaN for a flat (zero-variance) series', () => {
    const rho = spearmanRho([5, 5, 5, 5], [1, 2, 3, 4]);
    expect(rho).toBe(0);
    expect(Number.isNaN(rho)).toBe(false);
  });

  it('returns 0 for fewer than 2 points', () => {
    expect(spearmanRho([1], [1])).toBe(0);
    expect(spearmanRho([], [])).toBe(0);
  });

  it('returns 0 for mismatched lengths rather than throwing', () => {
    expect(spearmanRho([1, 2, 3], [1, 2])).toBe(0);
  });
});

describe('hasSufficientVariation', () => {
  it('rejects a perfectly flat series', () => {
    expect(hasSufficientVariation([3, 3, 3, 3, 3])).toBe(false);
  });

  it('rejects a series with fewer than 2 points', () => {
    expect(hasSufficientVariation([3])).toBe(false);
    expect(hasSufficientVariation([])).toBe(false);
  });

  it('rejects a series where one value dominates past MAX_MODE_SHARE', () => {
    // 18 of 20 values are the same (90% > 85% ceiling), 2 are different.
    const values = [...Array(18).fill(1), 2, 3];
    expect(hasSufficientVariation(values)).toBe(false);
  });

  it('accepts a series with real, spread-out variation', () => {
    const values = [1, 2, 3, 4, 5, 1, 2, 3, 4, 5];
    expect(hasSufficientVariation(values)).toBe(true);
  });

  it('accepts a series right at the MAX_MODE_SHARE boundary', () => {
    // 17 of 20 (85%) is the boundary itself — should still pass (<=).
    const values = [...Array(17).fill(1), 2, 3, 4];
    expect(values.length).toBe(20);
    expect(hasSufficientVariation(values)).toBe(true);
    expect(17 / 20).toBe(MAX_MODE_SHARE);
  });
});
