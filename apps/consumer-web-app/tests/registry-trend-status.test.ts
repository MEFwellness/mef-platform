import { describe, it, expect } from 'vitest';
import { computeFindingTrendStatus } from '../lib/registry/trendStatus';

describe('computeFindingTrendStatus', () => {
  it('returns null for a metric (no severity)', () => {
    expect(computeFindingTrendStatus(null, { severity: null })).toBeNull();
  });

  it('returns "new" when there is no previous active entry', () => {
    expect(computeFindingTrendStatus(null, { severity: 'mild' })).toBe('new');
  });

  it('returns "resolved" when the new entry is marked resolved', () => {
    expect(
      computeFindingTrendStatus({ severity: 'moderate' }, { severity: 'none', resolved: true })
    ).toBe('resolved');
  });

  it('returns "worsening" when severity rank increases', () => {
    expect(computeFindingTrendStatus({ severity: 'mild' }, { severity: 'significant' })).toBe(
      'worsening'
    );
  });

  it('returns "improving" when severity rank decreases', () => {
    expect(computeFindingTrendStatus({ severity: 'significant' }, { severity: 'mild' })).toBe(
      'improving'
    );
  });

  it('returns "stable" when severity rank is unchanged', () => {
    expect(computeFindingTrendStatus({ severity: 'moderate' }, { severity: 'moderate' })).toBe(
      'stable'
    );
  });
});
