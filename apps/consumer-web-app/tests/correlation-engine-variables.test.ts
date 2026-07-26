import { describe, it, expect } from 'vitest';
import {
  VARIABLE_EXTRACTORS,
  extractDailySeries,
  isKnownVariable,
  wearableMetricCodesFor,
} from '../lib/correlation-engine/variables';
import type { DailyCheckin } from '@mef/shared-types-contracts';

function checkin(overrides: Partial<DailyCheckin> = {}): DailyCheckin {
  return {
    id: 'c1',
    user_id: 'u1',
    recorded_at: '2026-07-01T08:00:00.000Z',
    checkin_version: 1,
    edited_at: null,
    timezone: 'America/New_York',
    local_date: '2026-07-01',
    mood_level: null,
    sleep_quality: null,
    sleep_duration: null,
    sleep_observation_period_start: null,
    sleep_observation_period_end: null,
    energy_level: null,
    stress_level: null,
    water_cups: null,
    digestion_rating: null,
    pain_discomfort_level: null,
    movement_today: null,
    new_or_worsening_concern: false,
    optional_notes: null,
    actual_bedtime: null,
    actual_wake_time: null,
    night_waking_count: null,
    night_sweats: null,
    morning_soreness: null,
    bowel_movement_status: null,
    created_at: '2026-07-01T08:00:00.000Z',
    ...overrides,
  };
}

describe('isKnownVariable', () => {
  it('recognizes every catalogued key', () => {
    expect(isKnownVariable('checkin.pain')).toBe(true);
    expect(isKnownVariable('wearable.steps')).toBe(true);
  });

  it('rejects an unknown key', () => {
    expect(isKnownVariable('checkin.made_up_field')).toBe(false);
  });
});

describe('checkin.* extractors', () => {
  it('reads direct numeric fields', () => {
    const c = checkin({ pain_discomfort_level: 3, energy_level: 4, stress_level: 2, digestion_rating: 5, mood_level: 1 });
    expect(VARIABLE_EXTRACTORS['checkin.pain']!(c, undefined)).toBe(3);
    expect(VARIABLE_EXTRACTORS['checkin.energy']!(c, undefined)).toBe(4);
    expect(VARIABLE_EXTRACTORS['checkin.stress']!(c, undefined)).toBe(2);
    expect(VARIABLE_EXTRACTORS['checkin.digestion']!(c, undefined)).toBe(5);
    expect(VARIABLE_EXTRACTORS['checkin.mood']!(c, undefined)).toBe(1);
  });

  it('returns null for a null field rather than guessing', () => {
    const c = checkin({ pain_discomfort_level: null });
    expect(VARIABLE_EXTRACTORS['checkin.pain']!(c, undefined)).toBeNull();
  });

  it('returns null when the checkin itself is undefined (no check-in that day)', () => {
    expect(VARIABLE_EXTRACTORS['checkin.pain']!(undefined, undefined)).toBeNull();
  });

  it('maps night_sweats boolean to 0/1', () => {
    expect(VARIABLE_EXTRACTORS['checkin.night_sweats']!(checkin({ night_sweats: true }), undefined)).toBe(1);
    expect(VARIABLE_EXTRACTORS['checkin.night_sweats']!(checkin({ night_sweats: false }), undefined)).toBe(0);
    expect(VARIABLE_EXTRACTORS['checkin.night_sweats']!(checkin({ night_sweats: null }), undefined)).toBeNull();
  });

  it('maps bowel_movement_status to an irregularity flag (normal=0, anything else=1)', () => {
    const f = VARIABLE_EXTRACTORS['checkin.bowel_irregularity']!;
    expect(f(checkin({ bowel_movement_status: 'normal' }), undefined)).toBe(0);
    expect(f(checkin({ bowel_movement_status: 'constipated' }), undefined)).toBe(1);
    expect(f(checkin({ bowel_movement_status: 'loose' }), undefined)).toBe(1);
    expect(f(checkin({ bowel_movement_status: 'none' }), undefined)).toBe(1);
    expect(f(checkin({ bowel_movement_status: null }), undefined)).toBeNull();
  });

  it('maps sleep_duration bucket to an ordinal 1-5 score', () => {
    const f = VARIABLE_EXTRACTORS['checkin.sleep_duration_score']!;
    expect(f(checkin({ sleep_duration: '<5h' }), undefined)).toBe(1);
    expect(f(checkin({ sleep_duration: '5-6h' }), undefined)).toBe(2);
    expect(f(checkin({ sleep_duration: '6-7h' }), undefined)).toBe(3);
    expect(f(checkin({ sleep_duration: '7-8h' }), undefined)).toBe(4);
    expect(f(checkin({ sleep_duration: '8h+' }), undefined)).toBe(5);
  });

  it('maps movement_today enum to an ordinal 0-3 score', () => {
    const f = VARIABLE_EXTRACTORS['checkin.movement_today_score']!;
    expect(f(checkin({ movement_today: 'none' }), undefined)).toBe(0);
    expect(f(checkin({ movement_today: 'light' }), undefined)).toBe(1);
    expect(f(checkin({ movement_today: 'moderate' }), undefined)).toBe(2);
    expect(f(checkin({ movement_today: 'full_session' }), undefined)).toBe(3);
  });

  describe('checkin.bedtime_lateness — minutes since noon, wrapping past-midnight bedtimes forward', () => {
    const f = VARIABLE_EXTRACTORS['checkin.bedtime_lateness']!;

    it('treats an evening bedtime as minutes after noon directly', () => {
      expect(f(checkin({ actual_bedtime: '22:00' }), undefined)).toBe(600); // 10pm = 10h after noon
    });

    it('orders a later evening bedtime as a larger value', () => {
      const at2200 = f(checkin({ actual_bedtime: '22:00' }), undefined)!;
      const at2330 = f(checkin({ actual_bedtime: '23:30' }), undefined)!;
      expect(at2330).toBeGreaterThan(at2200);
    });

    it('wraps a past-midnight bedtime forward so it reads later than any evening bedtime', () => {
      const at2330 = f(checkin({ actual_bedtime: '23:30' }), undefined)!;
      const at0030 = f(checkin({ actual_bedtime: '00:30' }), undefined)!;
      const at0100 = f(checkin({ actual_bedtime: '01:00' }), undefined)!;
      expect(at0030).toBeGreaterThan(at2330);
      expect(at0100).toBeGreaterThan(at0030);
    });

    it('returns null for a missing bedtime', () => {
      expect(f(checkin({ actual_bedtime: null }), undefined)).toBeNull();
    });
  });
});

describe('wearable.* extractors', () => {
  it('reads from the same-day metric-code map', () => {
    const wearable = new Map([['steps', 8500], ['hrv_ms', 55]]);
    expect(VARIABLE_EXTRACTORS['wearable.steps']!(checkin(), wearable)).toBe(8500);
    expect(VARIABLE_EXTRACTORS['wearable.hrv']!(checkin(), wearable)).toBe(55);
  });

  it('returns null when the metric code is absent for that day', () => {
    const wearable = new Map([['steps', 8500]]);
    expect(VARIABLE_EXTRACTORS['wearable.hrv']!(checkin(), wearable)).toBeNull();
  });

  it('returns null when there is no wearable data for that day at all', () => {
    expect(VARIABLE_EXTRACTORS['wearable.steps']!(checkin(), undefined)).toBeNull();
  });
});

describe('wearableMetricCodesFor', () => {
  it('maps variable keys to the underlying metric_code values, deduplicated', () => {
    const codes = wearableMetricCodesFor(['wearable.steps', 'wearable.hrv', 'checkin.pain', 'wearable.steps']);
    expect(codes.sort()).toEqual(['hrv_ms', 'steps']);
  });

  it('returns an empty array when no wearable variables are requested', () => {
    expect(wearableMetricCodesFor(['checkin.pain', 'checkin.stress'])).toEqual([]);
  });
});

describe('extractDailySeries', () => {
  it('skips days where the extractor returns null — never interpolates or carries forward', () => {
    const checkinsByDate = new Map([
      ['2026-07-01', checkin({ local_date: '2026-07-01', pain_discomfort_level: 2 })],
      ['2026-07-02', checkin({ local_date: '2026-07-02', pain_discomfort_level: null })],
      ['2026-07-03', checkin({ local_date: '2026-07-03', pain_discomfort_level: 4 })],
    ]);
    const series = extractDailySeries('checkin.pain', checkinsByDate, new Map());
    expect([...series.entries()].sort()).toEqual([
      ['2026-07-01', 2],
      ['2026-07-03', 4],
    ]);
  });

  it('includes wearable-only days that have no matching check-in', () => {
    const checkinsByDate = new Map<string, ReturnType<typeof checkin>>();
    const wearableByDate = new Map([['2026-07-05', new Map([['steps', 9000]])]]);
    const series = extractDailySeries('wearable.steps', checkinsByDate, wearableByDate);
    expect(series.get('2026-07-05')).toBe(9000);
  });

  it('returns an empty series for an unrecognized variable key', () => {
    const series = extractDailySeries('checkin.not_a_real_key', new Map(), new Map());
    expect(series.size).toBe(0);
  });
});
