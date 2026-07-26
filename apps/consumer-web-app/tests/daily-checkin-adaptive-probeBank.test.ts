import { describe, it, expect } from 'vitest';
import { buildProbeBank, type ProbeBankInputs } from '../lib/daily-checkin-adaptive/probeBank';
import { FIXED_CORE_QUESTION_KEYS } from '../lib/daily-checkin-adaptive/constants';
import type { DriverProbeQuestion } from '../lib/daily-checkin-adaptive/types';

function question(overrides: Partial<DriverProbeQuestion> = {}): DriverProbeQuestion {
  return {
    questionKey: 'checkin_probe.night_waking_count',
    driverId: 'SLP-2',
    prompt: 'How many times did you wake up during the night?',
    responseType: 'count',
    options: [0, 1, 2, 3, 4, 5],
    storage: 'daily_checkins_column',
    dailyCheckinsColumn: 'night_waking_count',
    wearableMetricCode: null,
    requires: [],
    excludes: [],
    priority: 0,
    active: true,
    ...overrides,
  };
}

function baseInputs(overrides: Partial<ProbeBankInputs> = {}): ProbeBankInputs {
  return {
    questions: [question()],
    memberGoalKeys: [],
    goalWeights: [],
    driverStates: new Map(),
    lastAskedDates: new Map(),
    wearableSuppliedQuestionKeys: new Set(),
    todayLocalDate: '2026-07-26',
    ...overrides,
  };
}

describe('buildProbeBank — protecting the fixed core', () => {
  it('throws if a driver_probe_questions row reuses a fixed-core question key, for every core key', () => {
    for (const coreKey of FIXED_CORE_QUESTION_KEYS) {
      const inputs = baseInputs({ questions: [question({ questionKey: coreKey })] });
      expect(() => buildProbeBank(inputs)).toThrow();
    }
  });

  it('never includes any fixed-core key in a normal bank', () => {
    const bank = buildProbeBank(baseInputs());
    const coreKeySet = new Set<string>(FIXED_CORE_QUESTION_KEYS);
    expect(bank.some((q) => coreKeySet.has(q.question_key))).toBe(false);
  });
});

describe('buildProbeBank — exclusions', () => {
  it('excludes a ruled-out driver entirely (score zero and stop appearing)', () => {
    const inputs = baseInputs({ driverStates: new Map([['SLP-2', 'ruled_out']]) });
    expect(buildProbeBank(inputs)).toHaveLength(0);
  });

  it('excludes a question a connected wearable already supplies', () => {
    const inputs = baseInputs({
      questions: [question({ questionKey: 'x.wearable_backed', wearableMetricCode: 'steps' })],
      wearableSuppliedQuestionKeys: new Set(['x.wearable_backed']),
    });
    expect(buildProbeBank(inputs)).toHaveLength(0);
  });

  it('excludes a local follow-up (null driver_id) from the rotating pool', () => {
    const inputs = baseInputs({
      questions: [question({ questionKey: 'checkin_probe.pain_location', driverId: null })],
    });
    expect(buildProbeBank(inputs)).toHaveLength(0);
  });

  it('excludes an inactive question', () => {
    const inputs = baseInputs({ questions: [question({ active: false })] });
    expect(buildProbeBank(inputs)).toHaveLength(0);
  });
});

describe('buildProbeBank — scoring reflects goal weight, recency, and uncertainty', () => {
  it('a driver weighted "high" for the member\'s goal scores above one weighted "medium"', () => {
    const highQ = question({ questionKey: 'a', driverId: 'STR-1' });
    const medQ = question({ questionKey: 'b', driverId: 'SLP-6' });
    const inputs = baseInputs({
      questions: [highQ, medQ],
      memberGoalKeys: ['sleep_better'],
      goalWeights: [
        { driverId: 'STR-1', goalKey: 'sleep_better', weight: 'high' },
        { driverId: 'SLP-6', goalKey: 'sleep_better', weight: 'medium' },
      ],
    });
    const bank = buildProbeBank(inputs);
    const high = bank.find((q) => q.question_key === 'a')!;
    const med = bank.find((q) => q.question_key === 'b')!;
    expect(high.weight).toBeGreaterThan(med.weight);
  });

  it('a driver never asked before outscores one asked yesterday, all else equal', () => {
    const neverAsked = question({ questionKey: 'a', driverId: 'DIG-1' });
    const askedYesterday = question({ questionKey: 'b', driverId: 'DIG-2' });
    const inputs = baseInputs({
      questions: [neverAsked, askedYesterday],
      lastAskedDates: new Map([['b', '2026-07-25']]),
    });
    const bank = buildProbeBank(inputs);
    const a = bank.find((q) => q.question_key === 'a')!;
    const b = bank.find((q) => q.question_key === 'b')!;
    expect(a.weight).toBeGreaterThan(b.weight);
  });
});
