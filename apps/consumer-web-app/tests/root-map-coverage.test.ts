/**
 * Guard tests for Root Map per-domain coverage counts (Part 3). A domain
 * with no trackable per-day source (nutrition, and the four uninstrumented
 * domains) must render no count at all — never a fabricated zero. A
 * domain that DOES have a trackable source but genuinely zero matching
 * rows this window is a real "0 of 21" result, not a placeholder, and is
 * expected to render.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  computeDomainCoverage,
  computeAllDomainCoverage,
  computeNutritionCoverage,
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
    // nutrition_metabolic_health genuinely has no daily_checkins_current
    // column (unchanged by the 2026-07-29 fix below) — its real coverage
    // now comes from a different source entirely, see
    // computeNutritionCoverage/fetchNutritionCoverage.
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

describe('computeNutritionCoverage (2026-07-29) — the real, previously-unwired FUE probe-answer source', () => {
  // Nutrition & Metabolic Health had no badge on any test account, but not
  // because of a bug or a genuine zero: daily_checkin_probe_answers
  // (migration 106/109) already collects real per-day "Fuel and nutrition"
  // evidence (last meal timing, hydration, cravings, protein, etc.) — that
  // table simply predates this coverage module and was never read by it.
  it('is a real zero, not null, when the member has genuinely never answered a nutrition probe', () => {
    expect(computeNutritionCoverage([])).toEqual({ count: 0, windowDays: COVERAGE_WINDOW_DAYS });
  });

  it('counts distinct days, not distinct answers — a day with several nutrition probes answered still counts once', () => {
    expect(
      computeNutritionCoverage(['2026-07-01', '2026-07-01', '2026-07-01', '2026-07-02'])
    ).toEqual({ count: 2, windowDays: COVERAGE_WINDOW_DAYS });
  });

  it('matches the same "N of 21 days logged" phrasing every other domain uses', () => {
    expect(formatCoverageLabel(computeNutritionCoverage(['2026-07-01', '2026-07-02', '2026-07-03']))).toBe(
      '3 of 21 days logged'
    );
  });
});

describe('fetchDomainCoverage source shape — reuses the real question bank, never a second hardcoded FUE list', () => {
  // A coach can add/retire "Fuel and nutrition" probe questions from
  // /coach/questions with no deploy (migration 110). If this file kept its
  // own separate, hardcoded list of FUE question keys, that list would
  // silently drift out of sync with the coach's actual edits. Confirmed by
  // source scan that it reads the live reference data instead.
  const SOURCE = readFileSync(path.resolve(__dirname, '../lib/root-map/coverage.ts'), 'utf-8');

  it('reads driver/probe-question reference data rather than a hardcoded question-key list', () => {
    expect(SOURCE).toMatch(/listActiveDrivers/);
    expect(SOURCE).toMatch(/listActiveDriverProbeQuestions/);
    expect(SOURCE).not.toMatch(/checkin_probe\.last_meal_timing/);
  });

  it('merges nutrition coverage into the same map fetchDomainCoverage returns for every other domain', () => {
    expect(SOURCE).toMatch(/result\.nutrition_metabolic_health = nutritionCoverage/);
  });
});
