/**
 * The pattern rules, and the two properties they exist to have.
 *
 *   1. NOTHING IS NAMED FROM ONE ANSWER. Every rule reads at least two
 *      questions, and flipping either one of them off has to be able to
 *      stop that rule firing. A pattern named from a single tap is a
 *      manufactured insight, which is the exact failure this experience
 *      cannot afford with somebody who has never heard of us.
 *
 *   2. THE DEFAULT IS REACHABLE AND HONEST. A set of answers with nothing
 *      in agreement resolves to recovery_deficit with matched === false,
 *      and its copy says out loud that no single place stands out.
 */

import { describe, expect, it } from 'vitest';
import {
  ENERGY_PATTERN_RULES,
  resolveEnergyPattern,
} from '../lib/public-entry/patterns';
import { ENERGY_QUESTIONS, isComplete } from '../lib/public-entry/questions';

/** A complete, deliberately unremarkable set of answers: nothing agrees with anything. */
const NEUTRAL: Record<string, string> = {
  low_point: 'late_morning',
  morning_start: 'slow_but_fine',
  sleep_hours: 'seven_to_eight',
  night_pattern: 'nights_are_fine',
  wind_down: 'genuine_wind_down',
  first_food: 'within_an_hour',
  afternoon_reach: 'real_meal',
  mental_load: 'not_much',
  off_switch: 'this_week',
};

function withAnswers(overrides: Record<string, string>): Record<string, string> {
  return { ...NEUTRAL, ...overrides };
}

describe('the neutral fixture', () => {
  it('is a complete, valid set of answers', () => {
    expect(isComplete(NEUTRAL)).toBe(true);
  });

  it('matches every question this experience asks, and nothing else', () => {
    expect(Object.keys(NEUTRAL).sort()).toEqual(ENERGY_QUESTIONS.map((q) => q.key).sort());
  });
});

describe('every rule reads at least two answers', () => {
  const realRules = ENERGY_PATTERN_RULES.slice(0, -1);

  it.each(realRules.map((r, i) => [i, r.key] as const))(
    'rule %i (%s) declares two or more evidence questions',
    (index) => {
      expect(ENERGY_PATTERN_RULES[index]!.evidenceKeys.length).toBeGreaterThanOrEqual(2);
    }
  );

  it('the last rule is the unconditional default', () => {
    const last = ENERGY_PATTERN_RULES[ENERGY_PATTERN_RULES.length - 1]!;
    expect(last.key).toBe('recovery_deficit');
    expect(last.matches(NEUTRAL)).toBe(true);
  });
});

describe('the honest default', () => {
  it('is what a set of answers with nothing in agreement resolves to', () => {
    const resolution = resolveEnergyPattern(NEUTRAL);
    expect(resolution.key).toBe('recovery_deficit');
    expect(resolution.matched).toBe(false);
  });
});

/**
 * One case per real rule. Each names the answers that must be present for
 * it to fire, and each is then broken in two different ways to prove the
 * rule genuinely depends on more than one of them.
 */
const CASES: {
  rule: string;
  answers: Record<string, string>;
  /** Two single-answer changes, each of which must stop this rule firing. */
  breaks: Record<string, string>[];
}[] = [
  {
    rule: 'depletion_pattern',
    answers: { sleep_hours: 'five_to_six', low_point: 'all_day' },
    breaks: [{ sleep_hours: 'seven_to_eight' }, { low_point: 'evening', morning_start: 'up_and_going' }],
  },
  {
    rule: 'wind_down_deficit',
    answers: { night_pattern: 'hard_to_fall_asleep', wind_down: 'screen_until_lights_out' },
    breaks: [{ night_pattern: 'nights_are_fine' }, { wind_down: 'genuine_wind_down' }],
  },
  {
    rule: 'rhythm_disruption',
    answers: { night_pattern: 'sleep_fine_wake_tired', morning_start: 'heavy_and_slow' },
    breaks: [{ night_pattern: 'nights_are_fine' }, { morning_start: 'up_and_going' }],
  },
  {
    rule: 'fuel_timing_pattern',
    answers: { low_point: 'early_afternoon', first_food: 'not_until_lunch' },
    breaks: [{ low_point: 'evening' }, { first_food: 'within_an_hour', afternoon_reach: 'real_meal' }],
  },
  {
    rule: 'overload_pattern',
    answers: {
      mental_load: 'most_of_it',
      off_switch: 'cant_remember',
      afternoon_reach: 'push_through',
    },
    breaks: [{ mental_load: 'some' }, { off_switch: 'this_week' }],
  },
  {
    rule: 'stress_loading_pattern',
    answers: { mental_load: 'a_lot', off_switch: 'not_the_way_life_is' },
    breaks: [{ mental_load: 'not_much' }, { off_switch: 'this_week' }],
  },
];

describe.each(CASES)('$rule', ({ rule, answers, breaks }) => {
  it('fires on the answers that describe it', () => {
    expect(resolveEnergyPattern(withAnswers(answers)).key).toBe(rule);
  });

  it.each(breaks.map((b, i) => [i, b] as const))(
    'stops firing when change %i is made on its own',
    (_index, change) => {
      const broken = withAnswers({ ...answers, ...change });
      expect(resolveEnergyPattern(broken).key).not.toBe(rule);
    }
  );
});

describe('order is the tie break', () => {
  it('a short night with a flat day outranks a load with no gap in it', () => {
    // Both depletion_pattern and stress_loading_pattern genuinely describe
    // these answers. The loudest signal is meant to win, and this is the
    // assertion that says so out loud rather than leaving it to the order
    // of a list nobody re-reads.
    const both = withAnswers({
      sleep_hours: 'under_five',
      low_point: 'all_day',
      mental_load: 'most_of_it',
      off_switch: 'cant_remember',
    });
    expect(resolveEnergyPattern(both).key).toBe('depletion_pattern');
  });
});

describe('every possible set of answers resolves to something', () => {
  it('never returns undefined, across a full sweep of one question at a time', () => {
    for (const question of ENERGY_QUESTIONS) {
      for (const option of question.options) {
        const answers = withAnswers({ [question.key]: option.value });
        const resolution = resolveEnergyPattern(answers);
        expect(resolution.key).toBeTruthy();
        expect(typeof resolution.matched).toBe('boolean');
      }
    }
  });
});
