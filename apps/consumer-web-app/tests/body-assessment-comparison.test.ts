import { describe, it, expect } from 'vitest';
import { compareFindingSets, type ComparableFinding } from '../lib/body-assessment/comparison';

function finding(overrides: Partial<ComparableFinding> = {}): ComparableFinding {
  return {
    finding_type: 'forward_head',
    severity: 'moderate',
    confidence: 0.7,
    status: 'confirmed',
    ...overrides,
  };
}

describe('compareFindingSets', () => {
  it('returns only the overall row (unknown) when both sides are empty', () => {
    const rows = compareFindingSets([], []);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.dimension).toBe('overall');
    expect(rows[0]!.trend).toBe('unknown');
  });

  it('marks a finding_type improved when severity drops', () => {
    const earlier = [finding({ severity: 'significant' })];
    const later = [finding({ severity: 'mild' })];
    const rows = compareFindingSets(earlier, later);
    const row = rows.find((r) => r.dimension === 'forward_head')!;
    expect(row.trend).toBe('improved');
  });

  it('marks a finding_type declined when severity rises', () => {
    const earlier = [finding({ severity: 'mild' })];
    const later = [finding({ severity: 'significant' })];
    const rows = compareFindingSets(earlier, later);
    const row = rows.find((r) => r.dimension === 'forward_head')!;
    expect(row.trend).toBe('declined');
  });

  it('marks a finding_type stable when severity is unchanged', () => {
    const earlier = [finding({ severity: 'moderate' })];
    const later = [finding({ severity: 'moderate' })];
    const rows = compareFindingSets(earlier, later);
    const row = rows.find((r) => r.dimension === 'forward_head')!;
    expect(row.trend).toBe('stable');
  });

  it('a brand-new finding not present earlier is treated as declined, never improved', () => {
    const rows = compareFindingSets([], [finding({ severity: 'mild' })]);
    const row = rows.find((r) => r.dimension === 'forward_head')!;
    expect(row.trend).toBe('declined');
  });

  it('a finding that disappears entirely (resolved) is treated as improved', () => {
    const rows = compareFindingSets([finding({ severity: 'moderate' })], []);
    const row = rows.find((r) => r.dimension === 'forward_head')!;
    expect(row.trend).toBe('improved');
  });

  it("'unknown' severity on either side means the trend cannot be determined", () => {
    const earlier = [finding({ severity: 'unknown', confidence: 0.2 })];
    const later = [finding({ severity: 'moderate' })];
    const rows = compareFindingSets(earlier, later);
    const row = rows.find((r) => r.dimension === 'forward_head')!;
    expect(row.trend).toBe('unknown');
  });

  it('dismissed and superseded findings are excluded from comparison on both sides', () => {
    const earlier = [finding({ severity: 'significant', status: 'dismissed' })];
    const later = [finding({ severity: 'mild', status: 'superseded' })];
    const rows = compareFindingSets(earlier, later);
    // Neither side contributes an active finding, so there is no
    // forward_head dimension row at all — just the overall unknown rollup.
    expect(rows.find((r) => r.dimension === 'forward_head')).toBeUndefined();
    expect(rows.find((r) => r.dimension === 'overall')!.trend).toBe('unknown');
  });

  it('picks the most severe active finding per type when multiple exist on one side', () => {
    const earlier = [
      finding({ severity: 'mild', confidence: 0.5 }),
      finding({ severity: 'significant', confidence: 0.9 }),
    ];
    const later = [finding({ severity: 'mild' })];
    const rows = compareFindingSets(earlier, later);
    const row = rows.find((r) => r.dimension === 'forward_head')!;
    // significant -> mild is an improvement, proving the significant one
    // (not the mild one) was chosen as the "earlier" representative.
    expect(row.trend).toBe('improved');
  });

  describe('overall rollup', () => {
    it('is declined if any single dimension declined, even when others improved', () => {
      const earlier = [
        finding({ finding_type: 'forward_head', severity: 'significant' }),
        finding({ finding_type: 'pelvic_tilt', severity: 'mild' }),
      ];
      const later = [
        finding({ finding_type: 'forward_head', severity: 'mild' }), // improved
        finding({ finding_type: 'pelvic_tilt', severity: 'significant' }), // declined
      ];
      const rows = compareFindingSets(earlier, later);
      expect(rows.find((r) => r.dimension === 'overall')!.trend).toBe('declined');
    });

    it('is improved when nothing declined and at least one thing improved', () => {
      const earlier = [finding({ severity: 'significant' })];
      const later = [finding({ severity: 'none' })];
      const rows = compareFindingSets(earlier, later);
      expect(rows.find((r) => r.dimension === 'overall')!.trend).toBe('improved');
    });

    it('is stable when every dimension is stable', () => {
      const earlier = [finding({ severity: 'moderate' })];
      const later = [finding({ severity: 'moderate' })];
      const rows = compareFindingSets(earlier, later);
      expect(rows.find((r) => r.dimension === 'overall')!.trend).toBe('stable');
    });
  });
});
