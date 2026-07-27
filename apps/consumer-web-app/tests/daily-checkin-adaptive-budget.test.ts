import { describe, it, expect } from 'vitest';
import { followUpParentKeys, selectRotatingProbesWithBudget } from '../lib/daily-checkin-adaptive/probeBank';
import { FIXED_CORE_QUESTION_KEYS, MAX_DAILY_QUESTIONS, ROTATING_PROBE_TARGET_COUNT } from '../lib/daily-checkin-adaptive/constants';
import type { DriverProbeQuestion } from '../lib/daily-checkin-adaptive/types';
import type { AdaptiveQuestion } from '../lib/adaptive-assessment-engine/types';

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

function bankQuestion(overrides: Partial<AdaptiveQuestion> = {}): AdaptiveQuestion {
  return {
    question_key: 'a',
    weight: 1,
    priority: 0,
    requires: null,
    excludes: null,
    ...overrides,
  };
}

describe('60-second-ceiling pass: the daily question count', () => {
  it('a normal day is six protected core questions plus two or three rotating probes — ROTATING_PROBE_TARGET_COUNT is tuned to 3, MAX_DAILY_QUESTIONS to 9', () => {
    expect(FIXED_CORE_QUESTION_KEYS.length).toBe(6);
    expect(ROTATING_PROBE_TARGET_COUNT).toBe(3);
    expect(MAX_DAILY_QUESTIONS).toBe(9);
  });
});

describe('followUpParentKeys', () => {
  it('collects the requires target of every active local follow-up (driver_id null, non-empty requires)', () => {
    const questions = [
      question({ questionKey: 'checkin_probe.digestion_rating', driverId: 'DIG-2' }),
      question({
        questionKey: 'checkin_probe.digestive_symptom_type',
        driverId: null,
        requires: [{ question_key: 'checkin_probe.digestion_rating', op: 'lte', value: 2 }],
      }),
      question({
        questionKey: 'checkin_probe.crash_timing',
        driverId: null,
        requires: [{ question_key: 'checkin_probe.energy_crash_today', op: 'eq', value: true }],
      }),
    ];
    const keys = followUpParentKeys(questions);
    expect(keys.has('checkin_probe.digestion_rating')).toBe(true);
    expect(keys.has('checkin_probe.energy_crash_today')).toBe(true);
    expect(keys.size).toBe(2);
  });

  it('does not count a rotating probe (driver_id set) as a follow-up parent, even with requires-like data', () => {
    const questions = [question({ questionKey: 'a', driverId: 'MOV-1' })];
    expect(followUpParentKeys(questions).size).toBe(0);
  });

  it('ignores local follow-ups with no requires (nothing to be a parent of)', () => {
    const questions = [question({ questionKey: 'a', driverId: null, requires: [] })];
    expect(followUpParentKeys(questions).size).toBe(0);
  });
});

describe('selectRotatingProbesWithBudget — follow-ups count toward the daily ceiling, not outside it', () => {
  it('spends the whole budget on plain (no-follow-up) picks: budget 3 -> 3 picks', () => {
    const bank = [
      bankQuestion({ question_key: 'a', weight: 3 }),
      bankQuestion({ question_key: 'b', weight: 2 }),
      bankQuestion({ question_key: 'c', weight: 1 }),
      bankQuestion({ question_key: 'd', weight: 0 }),
    ];
    const picks = selectRotatingProbesWithBudget(bank, new Set(), 3, () => 0);
    expect(picks).toHaveLength(3);
  });

  it('a follow-up-bearing pick costs 2 units, leaving room for exactly one more plain pick under a budget of 3', () => {
    const bank = [
      bankQuestion({ question_key: 'risky', weight: 3 }),
      bankQuestion({ question_key: 'plain-1', weight: 2 }),
      bankQuestion({ question_key: 'plain-2', weight: 1 }),
    ];
    const picks = selectRotatingProbesWithBudget(bank, new Set(['risky']), 3, () => 0);
    expect(picks.map((p) => p.question_key)).toEqual(['risky', 'plain-1']);
  });

  it('a single follow-up-bearing pick already spends more than half a budget of 3, leaving no room for a second one (regression: follow-ups must not sit outside the ceiling)', () => {
    const bank = [
      bankQuestion({ question_key: 'risky-1', weight: 3 }),
      bankQuestion({ question_key: 'risky-2', weight: 2 }),
      bankQuestion({ question_key: 'plain', weight: 1 }),
    ];
    const picks = selectRotatingProbesWithBudget(bank, new Set(['risky-1', 'risky-2']), 3, () => 0);
    // risky-1 costs 2, leaving 1 unit — not enough for another 2-cost
    // follow-up-bearing pick, and no plain (1-cost) candidate scored
    // highly enough to win the tiebreak here — so the day simply gets a
    // shorter rotating set rather than a follow-up-triggering question
    // silently pushing the total over the ceiling.
    expect(picks.map((p) => p.question_key)).toEqual(['risky-1']);
  });

  it('a budget large enough for two follow-up-bearing picks (4) does select both', () => {
    const bank = [
      bankQuestion({ question_key: 'risky-1', weight: 3 }),
      bankQuestion({ question_key: 'risky-2', weight: 2 }),
    ];
    const picks = selectRotatingProbesWithBudget(bank, new Set(['risky-1', 'risky-2']), 4, () => 0);
    expect(picks.map((p) => p.question_key)).toEqual(['risky-1', 'risky-2']);
  });

  it('stops early once the bank is exhausted, same as selectBatch', () => {
    const bank = [bankQuestion({ question_key: 'only-one' })];
    const picks = selectRotatingProbesWithBudget(bank, new Set(), 3, () => 0);
    expect(picks).toHaveLength(1);
  });

  it('never spends more than the given budget, across many random seeds', () => {
    const bank = Array.from({ length: 10 }, (_, i) => bankQuestion({ question_key: `q${i}`, weight: i }));
    const followUpParents = new Set(['q1', 'q3', 'q5', 'q7']);
    for (let seed = 0; seed < 20; seed++) {
      const random = () => (seed * 0.13 + 0.05) % 1;
      const picks = selectRotatingProbesWithBudget(bank, followUpParents, ROTATING_PROBE_TARGET_COUNT, random);
      const spent = picks.reduce((sum, p) => sum + (followUpParents.has(p.question_key) ? 2 : 1), 0);
      expect(spent).toBeLessThanOrEqual(ROTATING_PROBE_TARGET_COUNT);
    }
  });
});
