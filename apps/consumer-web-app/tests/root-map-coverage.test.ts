/**
 * Guard tests for Root Map per-domain coverage counts (Part 3). A domain
 * with no trackable per-day source (nutrition, and the four uninstrumented
 * domains) must render no count at all — never a fabricated zero. A
 * domain that DOES have a trackable source but genuinely zero matching
 * rows this window is a real "0 of 21" result, not a placeholder, and is
 * expected to render.
 */
import { describe, it, expect } from 'vitest';
import {
  computeDomainCoverage,
  computeAllDomainCoverage,
  formatCoverageLabel,
  COVERAGE_WINDOW_DAYS,
  type CheckinCoverageRow,
} from '../lib/root-map/coverage';

function row(overrides: Partial<CheckinCoverageRow> = {}): CheckinCoverageRow {
  return {
    sleep_quality: null,
    movement_today: null,
    energy_level: null,
    pain_discomfort_level: null,
    digestion_rating: null,
    stress_level: null,
    mood_level: null,
    ...overrides,
  };
}

describe('computeDomainCoverage', () => {
  it('returns null (never a zero) for a domain with no trackable per-day source at all', () => {
    expect(computeDomainCoverage('nutrition_metabolic_health', [row({ sleep_quality: 4 })])).toBeNull();
    expect(computeDomainCoverage('identity_self_concept', [row({ sleep_quality: 4 })])).toBeNull();
    expect(computeDomainCoverage('purpose_motivation', [])).toBeNull();
    expect(computeDomainCoverage('relationships_social_connection', [])).toBeNull();
    expect(computeDomainCoverage('environment_daily_rhythm', [])).toBeNull();
  });

  it('counts only non-null entries for the mapped column, over the real rows given', () => {
    const rows = [
      row({ sleep_quality: 3 }),
      row({ sleep_quality: null }),
      row({ sleep_quality: 5 }),
      row({ sleep_quality: 2 }),
    ];
    expect(computeDomainCoverage('sleep_circadian_rhythm', rows)).toEqual({
      count: 3,
      windowDays: COVERAGE_WINDOW_DAYS,
    });
  });

  it('is a real zero (not null) when the source exists but nothing was logged this window', () => {
    expect(computeDomainCoverage('stress_nervous_system', [])).toEqual({
      count: 0,
      windowDays: COVERAGE_WINDOW_DAYS,
    });
  });

  it('never double-counts across domains — each mapped column is independent', () => {
    const rows = [row({ stress_level: 4, mood_level: null }), row({ stress_level: 3, mood_level: 2 })];
    const all = computeAllDomainCoverage(rows);
    expect(all.stress_nervous_system).toEqual({ count: 2, windowDays: COVERAGE_WINDOW_DAYS });
    expect(all.emotional_resilience_mood).toEqual({ count: 1, windowDays: COVERAGE_WINDOW_DAYS });
  });
});

describe('formatCoverageLabel', () => {
  it('matches the exact "N of M days logged" phrasing CaseEmptyState.tsx already uses', () => {
    expect(formatCoverageLabel({ count: 4, windowDays: 21 })).toBe('4 of 21 days logged');
  });
});
