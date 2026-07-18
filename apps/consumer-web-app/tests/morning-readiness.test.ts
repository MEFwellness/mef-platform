/**
 * Pure unit tests, no Supabase — same style as tests/scoring-engine.test.ts.
 * Exercises lib/wellness/morningReadiness.ts directly: eligibility must be
 * a hard gate (false unless bedtime/wake/energy/stress/mood all exist),
 * and the score itself must never fabricate a value for a metric that
 * wasn't logged.
 */
import { describe, it, expect } from 'vitest';
import {
  isMorningReadinessEligible,
  calculateMorningReadinessScore,
  sleepDurationMinutes,
  inputsFromCheckin,
  type MorningReadinessInputs,
} from '../lib/wellness/morningReadiness';
import type { DailyCheckin } from '@mef/shared-types-contracts';

const EMPTY: MorningReadinessInputs = {
  actualBedtime: null,
  actualWakeTime: null,
  nightWakingCount: null,
  nightSweats: null,
  morningEnergy: null,
  morningSoreness: null,
  stressOnWaking: null,
  mood: null,
  bowelMovementStatus: null,
};

const FULL: MorningReadinessInputs = {
  actualBedtime: '23:00',
  actualWakeTime: '06:30',
  nightWakingCount: 0,
  nightSweats: false,
  morningEnergy: 4,
  morningSoreness: 2,
  stressOnWaking: 2,
  mood: 4,
  bowelMovementStatus: 'normal',
};

describe('isMorningReadinessEligible', () => {
  it('is false with no data at all', () => {
    expect(isMorningReadinessEligible(EMPTY)).toBe(false);
  });

  it('is false when only mood/energy/stress exist but bedtime/wake are missing (a member who only did the "feelings" section)', () => {
    expect(
      isMorningReadinessEligible({ ...EMPTY, mood: 3, morningEnergy: 3, stressOnWaking: 3 })
    ).toBe(false);
  });

  it('is false when bedtime/wake exist but mood/energy/stress do not', () => {
    expect(
      isMorningReadinessEligible({ ...EMPTY, actualBedtime: '23:00', actualWakeTime: '06:30' })
    ).toBe(false);
  });

  it('is true once bedtime, wake time, energy, stress, and mood all exist — matching CheckinForm.tsx submit validation exactly', () => {
    expect(
      isMorningReadinessEligible({
        ...EMPTY,
        actualBedtime: '23:00',
        actualWakeTime: '06:30',
        morningEnergy: 3,
        stressOnWaking: 3,
        mood: 3,
      })
    ).toBe(true);
  });

  it('is true even when night waking, night sweats, soreness, and bowel movement status are all absent — those are optional-but-encouraged, not eligibility-blocking', () => {
    const eligible: MorningReadinessInputs = {
      actualBedtime: '23:00',
      actualWakeTime: '06:30',
      morningEnergy: 3,
      stressOnWaking: 3,
      mood: 3,
      nightWakingCount: null,
      nightSweats: null,
      morningSoreness: null,
      bowelMovementStatus: null,
    };
    expect(isMorningReadinessEligible(eligible)).toBe(true);
  });
});

describe('calculateMorningReadinessScore', () => {
  it('never includes a metric that was not logged — the weighted average only spans metrics actually present', () => {
    const minimal: MorningReadinessInputs = {
      ...EMPTY,
      actualBedtime: '23:00',
      actualWakeTime: '06:30',
      morningEnergy: 4,
      stressOnWaking: 1,
      mood: 4,
    };
    const result = calculateMorningReadinessScore(minimal);
    const keys = result.metrics.map((m) => m.key);

    expect(keys).toContain('sleepDuration');
    expect(keys).toContain('morningEnergy');
    expect(keys).toContain('stressOnWaking');
    expect(keys).toContain('mood');
    // Never logged in `minimal` — must be absent from the result, not present as 0.
    expect(keys).not.toContain('nightWaking');
    expect(keys).not.toContain('morningSoreness');
    expect(keys).not.toContain('bowelMovement');
  });

  it('a fully-answered morning produces a high score for good inputs', () => {
    const result = calculateMorningReadinessScore(FULL);
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.status).toBe('good');
  });

  it('poor inputs (short sleep, high stress, high soreness, low mood) produce a low score', () => {
    const poor: MorningReadinessInputs = {
      actualBedtime: '01:00',
      actualWakeTime: '05:30',
      nightWakingCount: 4,
      nightSweats: true,
      morningEnergy: 1,
      morningSoreness: 5,
      stressOnWaking: 5,
      mood: 1,
      bowelMovementStatus: 'constipated',
    };
    const result = calculateMorningReadinessScore(poor);
    expect(result.score).toBeLessThan(55);
    expect(result.status).toBe('poor');
  });
});

describe('sleepDurationMinutes', () => {
  it('handles a same-day-looking bedtime/wake pair (e.g. 23:00 -> 06:30) as an overnight span', () => {
    expect(sleepDurationMinutes('23:00', '06:30')).toBe(7 * 60 + 30);
  });

  it('handles a post-midnight bedtime (e.g. 00:30 -> 08:00)', () => {
    expect(sleepDurationMinutes('00:30', '08:00')).toBe(7 * 60 + 30);
  });

  it('returns null when either time is missing', () => {
    expect(sleepDurationMinutes(null, '08:00')).toBeNull();
    expect(sleepDurationMinutes('23:00', null)).toBeNull();
  });
});

describe('inputsFromCheckin', () => {
  it('returns all-null inputs for a null checkin (no fabricated defaults)', () => {
    const inputs = inputsFromCheckin(null);
    expect(inputs.actualBedtime).toBeNull();
    expect(inputs.mood).toBeNull();
    expect(inputs.bowelMovementStatus).toBeNull();
  });

  it('maps a real checkin row field-for-field', () => {
    const checkin = {
      actual_bedtime: '22:45',
      actual_wake_time: '06:15',
      night_waking_count: 2,
      night_sweats: true,
      energy_level: 3,
      morning_soreness: 4,
      stress_level: 3,
      mood_level: 4,
      bowel_movement_status: 'loose',
    } as unknown as DailyCheckin;

    const inputs = inputsFromCheckin(checkin);
    expect(inputs.actualBedtime).toBe('22:45');
    expect(inputs.actualWakeTime).toBe('06:15');
    expect(inputs.nightWakingCount).toBe(2);
    expect(inputs.nightSweats).toBe(true);
    expect(inputs.morningEnergy).toBe(3);
    expect(inputs.morningSoreness).toBe(4);
    expect(inputs.stressOnWaking).toBe(3);
    expect(inputs.mood).toBe(4);
    expect(inputs.bowelMovementStatus).toBe('loose');
  });
});
