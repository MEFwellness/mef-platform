/**
 * Pure unit tests, no Supabase. Exercises the hard eligibility gate the
 * product spec calls for: "The Daily Wellness Score must not exist until
 * its required eligibility query returns true... do not show zero, do
 * not show a placeholder number." These tests pin that behavior down
 * directly against lib/wellness/dailyWellnessScore.ts.
 */
import { describe, it, expect } from 'vitest';
import {
  isDailyWellnessScoreEligible,
  calculateDailyWellnessScore,
} from '../lib/wellness/dailyWellnessScore';
import type { DailyCheckin, EveningReflection } from '@mef/shared-types-contracts';

function fullMorningCheckin(overrides: Partial<DailyCheckin> = {}): DailyCheckin {
  return {
    id: 'c1',
    user_id: 'u1',
    recorded_at: '2026-01-05T08:00:00.000Z',
    local_date: '2026-01-05',
    timezone: 'America/New_York',
    checkin_version: 1,
    edited_at: null,
    mood_level: 4,
    sleep_quality: 4,
    sleep_duration: '7-8h',
    sleep_observation_period_start: null,
    sleep_observation_period_end: null,
    energy_level: 4,
    stress_level: 2,
    water_cups: 6,
    digestion_rating: 4,
    pain_discomfort_level: 0,
    movement_today: 'moderate',
    new_or_worsening_concern: false,
    optional_notes: null,
    actual_bedtime: '23:00',
    actual_wake_time: '06:30',
    night_waking_count: 0,
    night_sweats: false,
    morning_soreness: 2,
    bowel_movement_status: 'normal',
    created_at: '2026-01-05T08:00:00.000Z',
    ...overrides,
  };
}

function reflection(overrides: Partial<EveningReflection> = {}): EveningReflection {
  return {
    id: 'r1',
    member_id: 'u1',
    timezone: 'America/New_York',
    local_date: '2026-01-05',
    overall_day_rating: 4,
    daytime_stress: 2,
    energy_pattern: 'steady',
    symptoms_or_changes: null,
    recovery: 4,
    occurred_at: '2026-01-05T21:00:00.000Z',
    recorded_at: '2026-01-05T21:00:00.000Z',
    created_at: '2026-01-05T21:00:00.000Z',
    updated_at: '2026-01-05T21:00:00.000Z',
    ...overrides,
  };
}

describe('isDailyWellnessScoreEligible', () => {
  it('is false with no checkin and no reflection', () => {
    expect(isDailyWellnessScoreEligible(null, null)).toBe(false);
  });

  it('is false with a complete Morning Readiness but no Evening Reflection yet — the exact "unlocks after evening reflection" case', () => {
    expect(isDailyWellnessScoreEligible(fullMorningCheckin(), null)).toBe(false);
  });

  it('is false with an Evening Reflection but no Morning Readiness data', () => {
    expect(isDailyWellnessScoreEligible(null, reflection())).toBe(false);
  });

  it('is false with an Evening Reflection but an incomplete morning checkin (missing bedtime)', () => {
    const incomplete = fullMorningCheckin({ actual_bedtime: null });
    expect(isDailyWellnessScoreEligible(incomplete, reflection())).toBe(false);
  });

  it('is true only once both a complete Morning Readiness AND an Evening Reflection exist', () => {
    expect(isDailyWellnessScoreEligible(fullMorningCheckin(), reflection())).toBe(true);
  });
});

describe('calculateDailyWellnessScore', () => {
  it('produces a real composite score when both halves of the day are present', () => {
    const result = calculateDailyWellnessScore(fullMorningCheckin(), reflection());
    expect(result.score).toBeGreaterThan(0);
    expect(result.evening.score).not.toBeNull();
  });

  it('never fabricates the evening component when the reflection left every field blank — falls back to morning-only, not zero', () => {
    const blankReflection = reflection({
      overall_day_rating: null,
      daytime_stress: null,
      energy_pattern: null,
      recovery: null,
    });
    const result = calculateDailyWellnessScore(fullMorningCheckin(), blankReflection);

    expect(result.evening.score).toBeNull();
    // Falls back to the morning score exactly, rather than averaging in a
    // fabricated zero for the empty evening half.
    expect(result.score).toBe(result.morning.score);
  });

  it('a poor day scores low, a good day scores high — sanity check the composite direction', () => {
    const goodDay = calculateDailyWellnessScore(
      fullMorningCheckin(),
      reflection({
        overall_day_rating: 5,
        daytime_stress: 1,
        recovery: 5,
        energy_pattern: 'improved',
      })
    );
    const badDay = calculateDailyWellnessScore(
      fullMorningCheckin({ energy_level: 1, stress_level: 5, mood_level: 1, morning_soreness: 5 }),
      reflection({
        overall_day_rating: 1,
        daytime_stress: 5,
        recovery: 1,
        energy_pattern: 'crashed',
      })
    );
    expect(goodDay.score).toBeGreaterThan(badDay.score);
  });
});
