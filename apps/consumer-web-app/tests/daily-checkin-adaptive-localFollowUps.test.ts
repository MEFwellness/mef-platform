import { describe, it, expect } from 'vitest';
import { isLocalFollowUpEligible, localFollowUpsForScreen } from '../lib/daily-checkin-adaptive/localFollowUps';
import type { DriverProbeQuestion } from '../lib/daily-checkin-adaptive/types';

function followUp(overrides: Partial<DriverProbeQuestion> = {}): DriverProbeQuestion {
  return {
    questionKey: 'checkin_probe.what_kept_you_up',
    driverId: null,
    prompt: 'What kept you up?',
    responseType: 'single_select',
    options: [],
    storage: 'probe_answer',
    dailyCheckinsColumn: null,
    wearableMetricCode: null,
    requires: [{ question_key: 'checkin_probe.bedtime_later_than_wanted', op: 'eq', value: true }],
    excludes: [],
    priority: 0,
    active: true,
    screen: 'morning',
    displayStyle: null,
    ...overrides,
  };
}

describe('isLocalFollowUpEligible', () => {
  it('is ineligible before its parent question is answered at all', () => {
    expect(isLocalFollowUpEligible(followUp(), {})).toBe(false);
  });

  it('is ineligible when the parent answer does not satisfy the rule', () => {
    expect(
      isLocalFollowUpEligible(followUp(), { 'checkin_probe.bedtime_later_than_wanted': false })
    ).toBe(false);
  });

  it('becomes eligible once the parent answer satisfies the rule', () => {
    expect(
      isLocalFollowUpEligible(followUp(), { 'checkin_probe.bedtime_later_than_wanted': true })
    ).toBe(true);
  });

  it('supports an "in" rule against a multi-value parent, e.g. desk hours -> got_up_hourly', () => {
    const gotUpHourly = followUp({
      questionKey: 'checkin_probe.got_up_hourly',
      requires: [{ question_key: 'checkin_probe.desk_hours_today', op: 'in', value: ['4_to_6h', 'over_6h'] }],
    });
    expect(isLocalFollowUpEligible(gotUpHourly, { 'checkin_probe.desk_hours_today': 'under_2h' })).toBe(false);
    expect(isLocalFollowUpEligible(gotUpHourly, { 'checkin_probe.desk_hours_today': '4_to_6h' })).toBe(true);
  });

  it('supports a numeric threshold rule, e.g. meals skipped -> which meal', () => {
    const skippedMealWhich = followUp({
      questionKey: 'checkin_probe.skipped_meal_which',
      requires: [{ question_key: 'checkin_probe.meals_skipped_today', op: 'gte', value: 1 }],
    });
    expect(isLocalFollowUpEligible(skippedMealWhich, { 'checkin_probe.meals_skipped_today': 0 })).toBe(false);
    expect(isLocalFollowUpEligible(skippedMealWhich, { 'checkin_probe.meals_skipped_today': 2 })).toBe(true);
  });

  it('with no requires at all is always eligible', () => {
    expect(isLocalFollowUpEligible(followUp({ requires: [] }), {})).toBe(true);
  });

  it('respects excludes even when requires is satisfied', () => {
    const q = followUp({
      requires: [],
      excludes: [{ question_key: 'checkin_probe.some_flag', op: 'eq', value: true }],
    });
    expect(isLocalFollowUpEligible(q, { 'checkin_probe.some_flag': true })).toBe(false);
    expect(isLocalFollowUpEligible(q, { 'checkin_probe.some_flag': false })).toBe(true);
  });
});

describe('localFollowUpsForScreen', () => {
  it('keeps only null-driver_id rows matching the requested screen', () => {
    const questions = [
      followUp({ questionKey: 'a', screen: 'morning' }),
      followUp({ questionKey: 'b', screen: 'evening' }),
      followUp({ questionKey: 'c', driverId: 'SLP-1', screen: 'morning' }),
    ];
    expect(localFollowUpsForScreen(questions, 'morning').map((q) => q.questionKey)).toEqual(['a']);
  });
});
