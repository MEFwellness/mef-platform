import { describe, it, expect } from 'vitest';
import {
  domainOfDriverId,
  morningScreenForQuestion,
  eveningScreenForQuestion,
} from '../lib/daily-checkin-adaptive/screenGrouping';
import type { DriverProbeQuestion } from '../lib/daily-checkin-adaptive/types';

function question(overrides: Partial<DriverProbeQuestion> = {}): DriverProbeQuestion {
  return {
    questionKey: 'checkin_probe.example',
    driverId: null,
    prompt: 'Example?',
    responseType: 'boolean',
    options: [],
    storage: 'probe_answer',
    dailyCheckinsColumn: null,
    wearableMetricCode: null,
    requires: [],
    excludes: [],
    priority: 0,
    active: true,
    screen: 'morning',
    displayStyle: null,
    ...overrides,
  };
}

describe('domainOfDriverId', () => {
  it('extracts the domain prefix from a driver id', () => {
    expect(domainOfDriverId('SLP-2')).toBe('SLP');
    expect(domainOfDriverId('STR-1')).toBe('STR');
  });
  it('returns null for a null driverId (local follow-ups)', () => {
    expect(domainOfDriverId(null)).toBeNull();
  });
});

describe('morningScreenForQuestion — every morning-eligible domain routes somewhere real', () => {
  it('SLP (sleep) -> night', () => {
    expect(morningScreenForQuestion(question({ driverId: 'SLP-2' }))).toBe('night');
  });
  it('DIG (digestion) -> body', () => {
    expect(morningScreenForQuestion(question({ driverId: 'DIG-1' }))).toBe('body');
  });
  it('MOV (movement/soreness) -> body', () => {
    expect(morningScreenForQuestion(question({ driverId: 'MOV-5' }))).toBe('body');
  });
  it('STR (stress) -> feeling', () => {
    expect(morningScreenForQuestion(question({ driverId: 'STR-1' }))).toBe('feeling');
  });
  it('CTX (context), with no more specific mapping -> other, never throws', () => {
    expect(morningScreenForQuestion(question({ driverId: 'CTX-3' }))).toBe('other');
  });
  it('an unknown future domain falls back to "other" rather than throwing', () => {
    expect(morningScreenForQuestion(question({ driverId: 'ZZZ-1' }))).toBe('other');
  });
  it('a local follow-up (driverId null) routes via its parent question_key hint', () => {
    const whatKeptYouUp = question({
      driverId: null,
      requires: [{ question_key: 'checkin_probe.bedtime_later_than_wanted', op: 'eq', value: true }],
    });
    expect(morningScreenForQuestion(whatKeptYouUp)).toBe('night');
  });
  it('a local follow-up with no requires and no driver falls back to "other"', () => {
    expect(morningScreenForQuestion(question({ driverId: null, requires: [] }))).toBe('other');
  });
  it('got_up_hourly (parent: checkin_probe.desk_hours_today) routes to "body", not "other" (2026-07-28 fix)', () => {
    const gotUpHourly = question({
      driverId: null,
      requires: [{ question_key: 'checkin_probe.desk_hours_today', op: 'in', value: ['4_to_6h', 'over_6h'] }],
    });
    expect(morningScreenForQuestion(gotUpHourly)).toBe('body');
  });
});

describe('eveningScreenForQuestion — every evening-eligible domain routes somewhere real', () => {
  it('FUE (fuel) -> body', () => {
    expect(eveningScreenForQuestion(question({ driverId: 'FUE-2', screen: 'evening' }))).toBe('body');
  });
  it('DIG (digestion) -> body', () => {
    expect(eveningScreenForQuestion(question({ driverId: 'DIG-2', screen: 'evening' }))).toBe('body');
  });
  it('MEC (mechanics/posture) -> body', () => {
    expect(eveningScreenForQuestion(question({ driverId: 'MEC-1', screen: 'evening' }))).toBe('body');
  });
  it('STR (stress) -> day', () => {
    expect(eveningScreenForQuestion(question({ driverId: 'STR-4', screen: 'evening' }))).toBe('day');
  });
  it('CTX (context) -> other', () => {
    expect(eveningScreenForQuestion(question({ driverId: 'CTX-1', screen: 'evening' }))).toBe('other');
  });
  it('a local follow-up routes via its parent (e.g. skipped_meal_which -> FUE -> body)', () => {
    const skippedMealWhich = question({
      driverId: null,
      screen: 'evening',
      requires: [{ question_key: 'checkin_probe.meals_skipped_today', op: 'gte', value: 1 }],
    });
    expect(eveningScreenForQuestion(skippedMealWhich)).toBe('body');
  });
});
