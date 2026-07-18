import { describe, it, expect } from 'vitest';
import { buildRuleFacts } from '../lib/ai/rules/facts';
import type { DailyCheckin } from '@mef/shared-types-contracts';

let counter = 0;

function checkin(localDate: string, overrides: Partial<DailyCheckin> = {}): DailyCheckin {
  counter += 1;
  return {
    id: `checkin-${counter}`,
    user_id: 'member-1',
    recorded_at: `${localDate}T12:00:00.000Z`,
    timezone: 'America/New_York',
    local_date: localDate,
    checkin_version: 1,
    edited_at: null,
    sleep_observation_period_start: null,
    sleep_observation_period_end: null,
    created_at: `${localDate}T12:00:00.000Z`,
    mood_level: 3,
    sleep_quality: 3,
    sleep_duration: '6-7h',
    energy_level: 3,
    stress_level: 3,
    water_cups: 4,
    digestion_rating: 3,
    pain_discomfort_level: 1,
    movement_today: 'light',
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

describe('buildRuleFacts — empty history', () => {
  it('returns all-null facts when there is no check-in history at all', () => {
    const facts = buildRuleFacts([], '2026-01-10');
    expect(facts.daysSinceLastCheckin).toBeNull();
    expect(facts.stressTrend).toBeNull();
    expect(facts.sleepTrend).toBeNull();
    expect(facts.wellnessIndexScore).toBeNull();
    expect(facts.wellnessIndexDelta).toBeNull();
    expect(facts.stressConsecutiveIncreaseDays).toBe(0);
    expect(facts.sleepConsecutiveDecreaseDays).toBe(0);
  });
});

describe('buildRuleFacts — daysSinceLastCheckin', () => {
  it('measures the gap between the most recent check-in and the reference date', () => {
    const facts = buildRuleFacts([checkin('2026-01-01')], '2026-01-06');
    expect(facts.daysSinceLastCheckin).toBe(5);
  });

  it('is zero when the reference date is the same day as the last check-in', () => {
    const facts = buildRuleFacts([checkin('2026-01-06')], '2026-01-06');
    expect(facts.daysSinceLastCheckin).toBe(0);
  });
});

describe('buildRuleFacts — consecutive streaks', () => {
  it('counts a real day-over-day stress increase streak, not just "stress is high"', () => {
    const checkins = [
      checkin('2026-01-01', { stress_level: 2 }),
      checkin('2026-01-02', { stress_level: 3 }),
      checkin('2026-01-03', { stress_level: 4 }),
      checkin('2026-01-04', { stress_level: 5 }),
    ];
    const facts = buildRuleFacts(checkins, '2026-01-04');
    expect(facts.stressConsecutiveIncreaseDays).toBe(3);
  });

  it('breaks the streak on a flat or decreasing day', () => {
    const checkins = [
      checkin('2026-01-01', { stress_level: 2 }),
      checkin('2026-01-02', { stress_level: 3 }),
      checkin('2026-01-03', { stress_level: 3 }), // no change — breaks the streak
      checkin('2026-01-04', { stress_level: 5 }),
    ];
    const facts = buildRuleFacts(checkins, '2026-01-04');
    expect(facts.stressConsecutiveIncreaseDays).toBe(1);
  });

  it('counts a real sleep-quality decrease streak', () => {
    const checkins = [
      checkin('2026-01-01', { sleep_quality: 5 }),
      checkin('2026-01-02', { sleep_quality: 4 }),
      checkin('2026-01-03', { sleep_quality: 2 }),
    ];
    const facts = buildRuleFacts(checkins, '2026-01-03');
    expect(facts.sleepConsecutiveDecreaseDays).toBe(2);
  });

  it('never fabricates a streak across a missing value', () => {
    const checkins = [
      checkin('2026-01-01', { stress_level: 2 }),
      checkin('2026-01-02', { stress_level: null as unknown as number }),
      checkin('2026-01-03', { stress_level: 5 }),
    ];
    const facts = buildRuleFacts(checkins, '2026-01-03');
    expect(facts.stressConsecutiveIncreaseDays).toBe(0);
  });
});

describe('buildRuleFacts — wellness index score/delta', () => {
  it('scores the most recent check-in and diffs it against the one before', () => {
    const checkins = [
      checkin('2026-01-01', {
        mood_level: 2,
        sleep_quality: 2,
        energy_level: 2,
        stress_level: 4,
        digestion_rating: 2,
        pain_discomfort_level: 2,
        water_cups: 3,
        movement_today: 'light',
      }),
      checkin('2026-01-02', {
        mood_level: 5,
        sleep_quality: 5,
        energy_level: 5,
        stress_level: 1,
        digestion_rating: 5,
        pain_discomfort_level: 0,
        water_cups: 8,
        movement_today: 'full_session',
      }),
    ];
    const facts = buildRuleFacts(checkins, '2026-01-02');
    expect(facts.wellnessIndexScore).not.toBeNull();
    expect(facts.wellnessIndexDelta).not.toBeNull();
    expect(facts.wellnessIndexDelta!).toBeGreaterThan(0); // day 2 was strictly better across every metric
  });
});

describe('buildRuleFacts — trend facts reuse detectInsights', () => {
  it('reports a declining trend for a metric that meaningfully worsened over the window', () => {
    const checkins = [
      checkin('2026-01-01', { stress_level: 1 }),
      checkin('2026-01-02', { stress_level: 1 }),
      checkin('2026-01-03', { stress_level: 5 }),
      checkin('2026-01-04', { stress_level: 5 }),
    ];
    const facts = buildRuleFacts(checkins, '2026-01-04');
    expect(facts.stressTrend).toBe('declining');
  });

  it('reports stable (not null) when there is data but no significant trend', () => {
    const checkins = [
      checkin('2026-01-01', { digestion_rating: 3 }),
      checkin('2026-01-02', { digestion_rating: 3 }),
    ];
    const facts = buildRuleFacts(checkins, '2026-01-02');
    expect(facts.digestionTrend).toBe('stable');
  });
});
