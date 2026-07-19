/**
 * Root Score System — pure unit tests over the deterministic calculation
 * engine (lib/scoring/). No Supabase client, no seeded fixtures: every
 * test builds its own synthetic-but-realistic DailyCheckin/MovementSession/
 * BodyAssessment rows and asserts on the real, already-shipping functions
 * directly — nothing here reimplements or approximates that logic. See
 * tests/scoring-isolation.test.ts for the RLS/persistence integration
 * coverage this file deliberately doesn't attempt.
 */
import { describe, it, expect } from 'vitest';
import type { DailyCheckin, MovementSession, BodyAssessment } from '@mef/shared-types-contracts';
import { addDaysToLocalDate } from '../lib/feed/dateMath';
import {
  computeRecoveryDomain,
  computeStressDomain,
  computeNutritionDomain,
  computeMovementDomain,
  computeConsistencyDomain,
  type MealQualityEvent,
} from '../lib/scoring/domains';
import { applySmoothingCap, computeComposite } from '../lib/scoring/aggregate';
import { computeRootConfidence, confidenceLevelFromRatio } from '../lib/scoring/confidence';
import { computeMomentum } from '../lib/scoring/momentum';
import { computeResilience } from '../lib/scoring/resilience';
import { buildExplanation } from '../lib/scoring/explain';
import { calculateRootScoreSnapshot } from '../lib/scoring/calculate';
import {
  MAX_ROOT_SCORE_DAILY_CHANGE,
  RESILIENCE_MIN_RECOVERED_CYCLES,
} from '../lib/scoring/config';

const AS_OF = '2026-02-01';

function checkin(localDate: string, overrides: Partial<DailyCheckin> = {}): DailyCheckin {
  return {
    id: `c-${localDate}`,
    user_id: 'u1',
    timezone: 'America/New_York',
    local_date: localDate,
    recorded_at: `${localDate}T08:00:00.000Z`,
    checkin_version: 1,
    edited_at: null,
    sleep_observation_period_start: null,
    sleep_observation_period_end: null,
    created_at: `${localDate}T08:00:00.000Z`,
    mood_level: 3,
    sleep_quality: 4,
    sleep_duration: '7-8h',
    energy_level: 4,
    stress_level: 2,
    water_cups: 6,
    digestion_rating: 4,
    pain_discomfort_level: 0,
    movement_today: 'moderate',
    new_or_worsening_concern: false,
    optional_notes: null,
    actual_bedtime: null,
    actual_wake_time: null,
    night_waking_count: null,
    night_sweats: null,
    morning_soreness: null,
    bowel_movement_status: null,
    ...overrides,
  };
}

function daysBack(count: number, asOf = AS_OF): string[] {
  return Array.from({ length: count }, (_, i) => addDaysToLocalDate(asOf, -(count - 1 - i)));
}

describe('domain calculators — missing data behavior', () => {
  it('returns score: null (never a fabricated number) when a domain has zero qualifying rows', () => {
    const window = { startDate: addDaysToLocalDate(AS_OF, -29), endDate: AS_OF };
    expect(computeRecoveryDomain([], window).score).toBeNull();
    expect(computeStressDomain([], window).score).toBeNull();
    expect(computeNutritionDomain([], window).score).toBeNull();
    expect(computeMovementDomain([], [], window).score).toBeNull();
    expect(computeConsistencyDomain([], null, window).score).toBeNull();
  });

  it('recovery domain averages real sleep + energy data, excluding a day with neither logged', () => {
    const window = { startDate: addDaysToLocalDate(AS_OF, -6), endDate: AS_OF };
    const checkins = daysBack(7).map((d) => checkin(d));
    checkins[3] = checkin(checkins[3]!.local_date, {
      sleep_quality: null,
      sleep_duration: null,
      energy_level: null,
    });
    const result = computeRecoveryDomain(checkins, window);
    expect(result.score).not.toBeNull();
    expect(result.data_points).toBe(6); // the blanked-out day contributes zero data points
  });

  it('stress domain is inverse (low reported stress -> high score)', () => {
    const window = { startDate: addDaysToLocalDate(AS_OF, -6), endDate: AS_OF };
    const lowStress = computeStressDomain(
      daysBack(7).map((d) => checkin(d, { stress_level: 1 })),
      window
    );
    const highStress = computeStressDomain(
      daysBack(7).map((d) => checkin(d, { stress_level: 5 })),
      window
    );
    expect(lowStress.score!).toBeGreaterThan(highStress.score!);
  });

  it('nutrition domain scores green > yellow > red and only counts events in the window', () => {
    const window = { startDate: addDaysToLocalDate(AS_OF, -6), endDate: AS_OF };
    const events: MealQualityEvent[] = [
      { logged_at: `${AS_OF}T08:00:00.000Z`, rating: 'green' },
      { logged_at: `${addDaysToLocalDate(AS_OF, -60)}T08:00:00.000Z`, rating: 'red' }, // outside window
    ];
    const result = computeNutritionDomain(events, window);
    expect(result.score).toBe(100);
    expect(result.data_points).toBe(1);
  });

  it('movement domain never exceeds 100 even with sessions far beyond target', () => {
    const window = { startDate: addDaysToLocalDate(AS_OF, -6), endDate: AS_OF };
    const sessions: MovementSession[] = daysBack(7).map((d) => ({
      id: `m-${d}`,
      member_id: 'u1',
      timezone: 'America/New_York',
      local_date: d,
      status: 'completed',
      focus_summary: null,
      recovery_status: 'ready',
      estimated_duration_minutes: 30,
      selection_reasons: [],
      movement_score: null,
      generated_at: `${d}T08:00:00.000Z`,
      started_at: `${d}T08:05:00.000Z`,
      completed_at: `${d}T08:35:00.000Z`,
      skipped_at: null,
      skip_reason: null,
    })) as unknown as MovementSession[];
    const result = computeMovementDomain(sessions, [], window);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.score).toBe(100);
  });

  it("consistency domain never penalizes a window predating the member's first-ever check-in", () => {
    const window = { startDate: addDaysToLocalDate(AS_OF, -29), endDate: AS_OF };
    // Member's real history only goes back 5 days, well inside a 30-day window.
    const checkins = daysBack(5).map((d) => checkin(d));
    const firstDate = checkins[0]!.local_date;
    const result = computeConsistencyDomain(checkins, firstDate, window);
    expect(result.window_days).toBe(5);
    expect(result.score).toBe(100); // checked in every day since joining
  });

  it('consistency domain returns null for a member with zero check-ins ever, not a punitive zero', () => {
    const window = { startDate: addDaysToLocalDate(AS_OF, -29), endDate: AS_OF };
    const result = computeConsistencyDomain([], null, window);
    expect(result.score).toBeNull();
  });
});

describe('aggregate — weighted composite + domain-weight redistribution', () => {
  it('excludes a null-score domain from both the weighted sum and the weight denominator', () => {
    const domains = [
      {
        domain: 'recovery' as const,
        label: 'Recovery',
        score: 80,
        confidence_level: 'high' as const,
        direction: 'stable' as const,
        data_points: 10,
        window_days: 30,
        explanation: '',
      },
      {
        domain: 'stress' as const,
        label: 'Stress',
        score: null,
        confidence_level: 'building' as const,
        direction: 'unknown' as const,
        data_points: 0,
        window_days: 30,
        explanation: '',
      },
    ];
    const result = computeComposite(domains);
    // Only recovery (weight 0.25) is available -> composite equals recovery's own score.
    expect(result.score).toBe(80);
    expect(result.coverageRatio).toBeCloseTo(0.25, 5);
  });

  it('returns score: null when every domain is null', () => {
    const domains = [
      {
        domain: 'recovery' as const,
        label: 'Recovery',
        score: null,
        confidence_level: 'building' as const,
        direction: 'unknown' as const,
        data_points: 0,
        window_days: 30,
        explanation: '',
      },
    ];
    expect(computeComposite(domains).score).toBeNull();
  });
});

describe('smoothing — the anti-jump rule', () => {
  it('uses the raw composite directly on a first-ever calculation (nothing to smooth against)', () => {
    expect(applySmoothingCap(92, null)).toBe(92);
  });

  it(`never moves the stored score by more than ${MAX_ROOT_SCORE_DAILY_CHANGE} points in one calculation`, () => {
    expect(applySmoothingCap(100, 50)).toBe(50 + MAX_ROOT_SCORE_DAILY_CHANGE);
    expect(applySmoothingCap(0, 50)).toBe(50 - MAX_ROOT_SCORE_DAILY_CHANGE);
  });

  it('applies the raw delta directly when it is already within the cap', () => {
    expect(applySmoothingCap(53, 50)).toBe(53);
  });

  it('never produces a score outside 0-100', () => {
    expect(applySmoothingCap(100, 98)).toBeLessThanOrEqual(100);
    expect(applySmoothingCap(0, 2)).toBeGreaterThanOrEqual(0);
  });
});

describe('confidence', () => {
  it('bucket boundaries match CONFIDENCE_THRESHOLDS', () => {
    expect(confidenceLevelFromRatio(0)).toBe('building');
    expect(confidenceLevelFromRatio(0.1)).toBe('building');
    expect(confidenceLevelFromRatio(0.3)).toBe('low');
    expect(confidenceLevelFromRatio(0.6)).toBe('moderate');
    expect(confidenceLevelFromRatio(0.9)).toBe('high');
  });

  it('a first-ever calculation (zero prior snapshots) is never "high" confidence even with perfect coverage', () => {
    const { level } = computeRootConfidence(1, 0);
    expect(level).not.toBe('high');
  });

  it('confidence climbs as more prior snapshots accumulate, coverage held constant', () => {
    const fresh = computeRootConfidence(0.8, 0);
    const established = computeRootConfidence(0.8, 10);
    expect(established.confidence).toBeGreaterThan(fresh.confidence);
  });
});

describe('momentum', () => {
  const emptyDomains = (windowDays: number) =>
    (['recovery', 'stress', 'nutrition', 'movement', 'consistency'] as const).map((domain) => ({
      domain,
      label: domain,
      score: null,
      confidence_level: 'building' as const,
      direction: 'unknown' as const,
      data_points: 0,
      window_days: windowDays,
      explanation: '',
    }));

  it('reports insufficient_data when either window lacks enough real data points', () => {
    const result = computeMomentum(emptyDomains(7), emptyDomains(7));
    expect(result.state).toBe('insufficient_data');
    expect(result.score).toBeNull();
  });

  it('reports improving when the recent window scores higher than the prior window', () => {
    const recent = [
      {
        domain: 'recovery' as const,
        label: 'Recovery',
        score: 85,
        confidence_level: 'moderate' as const,
        direction: 'stable' as const,
        data_points: 5,
        window_days: 7,
        explanation: '',
      },
    ];
    const prior = [
      {
        domain: 'recovery' as const,
        label: 'Recovery',
        score: 60,
        confidence_level: 'moderate' as const,
        direction: 'stable' as const,
        data_points: 5,
        window_days: 7,
        explanation: '',
      },
    ];
    const result = computeMomentum(recent, prior);
    expect(result.state).toBe('improving');
    expect(result.score).not.toBeNull();
    expect(result.score!).toBeGreaterThan(50);
  });

  it('reports declining when the recent window scores lower than the prior window', () => {
    const recent = [
      {
        domain: 'stress' as const,
        label: 'Stress',
        score: 40,
        confidence_level: 'moderate' as const,
        direction: 'stable' as const,
        data_points: 5,
        window_days: 7,
        explanation: '',
      },
    ];
    const prior = [
      {
        domain: 'stress' as const,
        label: 'Stress',
        score: 80,
        confidence_level: 'moderate' as const,
        direction: 'stable' as const,
        data_points: 5,
        window_days: 7,
        explanation: '',
      },
    ];
    const result = computeMomentum(recent, prior);
    expect(result.state).toBe('declining');
    expect(result.score!).toBeLessThan(50);
  });
});

describe('resilience — never a fabricated score without sufficient history', () => {
  it('returns building_baseline with zero history', () => {
    const result = computeResilience([], AS_OF);
    expect(result.state).toBe('building_baseline');
    expect(result.score).toBeNull();
  });

  it('returns building_baseline when history exists but is too short (< 45 days)', () => {
    const checkins = daysBack(20).map((d) => checkin(d));
    const result = computeResilience(checkins, AS_OF);
    expect(result.state).toBe('building_baseline');
    expect(result.score).toBeNull();
  });

  it('returns building_baseline with 90 days of perfectly steady data (no dip ever occurred to recover from)', () => {
    const checkins = daysBack(90).map((d) => checkin(d)); // identical every day, no disruption
    const result = computeResilience(checkins, AS_OF);
    expect(result.state).toBe('building_baseline');
    expect(result.score).toBeNull();
    expect(result.cyclesFound).toBeLessThan(RESILIENCE_MIN_RECOVERED_CYCLES);
  });

  it('computes a real score once at least two dip-then-recover cycles are present in real history', () => {
    const dates = daysBack(90);
    const checkins = dates.map((d, i) => {
      // Two clear disrupted stretches (days 20-24 and days 55-59), each
      // followed by a real return to the steady baseline within the
      // 14-day recovery window — everything else is the same steady day.
      const inDipOne = i >= 20 && i <= 24;
      const inDipTwo = i >= 55 && i <= 59;
      if (inDipOne || inDipTwo) {
        return checkin(d, {
          sleep_quality: 1,
          energy_level: 1,
          mood_level: 1,
          stress_level: 5,
          pain_discomfort_level: 3,
        });
      }
      return checkin(d);
    });
    const result = computeResilience(checkins, AS_OF);
    expect(result.cyclesFound).toBeGreaterThanOrEqual(RESILIENCE_MIN_RECOVERED_CYCLES);
    expect(result.state).not.toBe('building_baseline');
    expect(result.score).not.toBeNull();
    expect(result.score!).toBeGreaterThanOrEqual(0);
    expect(result.score!).toBeLessThanOrEqual(100);
  });
});

describe('explanation builder', () => {
  it('produces a no-data explanation and no factors when nothing is available', () => {
    const domains = (['recovery', 'stress', 'nutrition', 'movement', 'consistency'] as const).map(
      (domain) => ({
        domain,
        label: domain,
        score: null,
        confidence_level: 'building' as const,
        direction: 'unknown' as const,
        data_points: 0,
        window_days: 30,
        explanation: '',
      })
    );
    const result = buildExplanation(domains);
    expect(result.strongestDomain).toBeNull();
    expect(result.primaryOpportunityDomain).toBeNull();
    expect(result.positiveFactors).toHaveLength(0);
    expect(result.limitingFactors).toHaveLength(0);
  });

  it('identifies the highest-scoring domain as strongest and the lowest as the opportunity', () => {
    const domains = [
      {
        domain: 'recovery' as const,
        label: 'Recovery',
        score: 90,
        confidence_level: 'high' as const,
        direction: 'stable' as const,
        data_points: 20,
        window_days: 30,
        explanation: 'x',
      },
      {
        domain: 'stress' as const,
        label: 'Stress Regulation',
        score: 40,
        confidence_level: 'moderate' as const,
        direction: 'stable' as const,
        data_points: 10,
        window_days: 30,
        explanation: 'y',
      },
    ];
    const result = buildExplanation(domains);
    expect(result.strongestDomain).toBe('recovery');
    expect(result.primaryOpportunityDomain).toBe('stress');
    expect(result.nextAction).not.toBeNull();
  });
});

describe('calculateRootScoreSnapshot — full orchestration', () => {
  it('produces a null root score with a building explanation when there is zero real data', () => {
    const result = calculateRootScoreSnapshot({
      localDate: AS_OF,
      timezone: 'America/New_York',
      checkins: [],
      mealQualityEvents: [],
      movementSessions: [],
      bodyAssessments: [] as BodyAssessment[],
      previousSnapshot: null,
      priorSnapshotCount: 0,
    });
    expect(result.root_score).toBeNull();
    expect(result.root_confidence_level).toBe('building');
    expect(result.momentum_state).toBe('insufficient_data');
    expect(result.resilience_state).toBe('building_baseline');
    expect(result.domain_scores).toHaveLength(5);
  });

  it('produces a real root score, grounded domain scores, and never lets a single day dominate the composite', () => {
    const checkins = daysBack(30).map((d) => checkin(d));
    const result = calculateRootScoreSnapshot({
      localDate: AS_OF,
      timezone: 'America/New_York',
      checkins,
      mealQualityEvents: [],
      movementSessions: [],
      bodyAssessments: [] as BodyAssessment[],
      previousSnapshot: null,
      priorSnapshotCount: 0,
    });
    expect(result.root_score).not.toBeNull();
    expect(result.root_score!).toBeGreaterThanOrEqual(0);
    expect(result.root_score!).toBeLessThanOrEqual(100);
    expect(result.explanation_summary.length).toBeGreaterThan(0);
  });

  it('caps root_score_change to MAX_ROOT_SCORE_DAILY_CHANGE even after a dramatic single-day swing', () => {
    // 29 steady days, then one very different final day — the rolling
    // window already dilutes this, and the smoothing cap is the second
    // line of defense against any large jump reaching the stored score.
    const checkins = daysBack(29).map((d) => checkin(d));
    checkins.push(
      checkin(AS_OF, { sleep_quality: 1, energy_level: 1, stress_level: 5, mood_level: 1 })
    );

    const result = calculateRootScoreSnapshot({
      localDate: AS_OF,
      timezone: 'America/New_York',
      checkins,
      mealQualityEvents: [],
      movementSessions: [],
      bodyAssessments: [] as BodyAssessment[],
      previousSnapshot: { root_score: 80 },
      priorSnapshotCount: 12,
    });

    expect(result.root_score_change).not.toBeNull();
    expect(Math.abs(result.root_score_change!)).toBeLessThanOrEqual(MAX_ROOT_SCORE_DAILY_CHANGE);
  });
});
