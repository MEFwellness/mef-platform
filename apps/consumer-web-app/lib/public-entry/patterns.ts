/**
 * Which pattern the nine answers resolve to, decided by plain rules over
 * the answers themselves and nothing else.
 *
 * TWO RULES THIS FILE OBEYS.
 *
 *   1. EVERY RULE NEEDS AT LEAST TWO ANSWERS TO AGREE. A single answer is
 *      never enough to name a pattern, because a single answer is a fact
 *      about one question and a pattern is a claim about a day. Requiring
 *      two corroborating answers is what stops this from manufacturing an
 *      insight out of one tap, and it is asserted in
 *      tests/public-entry-patterns.test.ts for every rule here.
 *
 *   2. THE DEFAULT IS HONEST, NOT A GUESS. When nothing agrees, the answer
 *      is `recovery_deficit`, and its copy says out loud that no single
 *      place stands out. There is no "closest match" scoring and no
 *      tie-break that quietly picks something more interesting.
 *
 * THE VOCABULARY IS BORROWED, DELIBERATELY. These are the same pattern keys
 * the lead capture agent has assigned since migration 123, so a lead that
 * arrives through the chat widget and a lead that arrives through this
 * experience read the same way on a coach's screen and in the same
 * captured_leads row.
 *
 * ORDER IS THE TIE-BREAK. Rules are checked top to bottom and the first
 * whose conditions all hold wins. The order runs loudest signal first: a
 * night that is genuinely short outranks a night that is merely late,
 * which outranks a timing problem, which outranks a load problem.
 */

import type { PublicEntryPatternKey } from '@mef/shared-types-contracts';
import type { EnergyAnswers } from './questions';

export type EnergyPatternRule = {
  readonly key: PublicEntryPatternKey;
  /**
   * The question keys this rule reads. At least two, always, and the test
   * suite fails the build if one of these lists is shorter than two.
   */
  readonly evidenceKeys: readonly string[];
  readonly matches: (a: EnergyAnswers) => boolean;
};

const SHORT_NIGHTS = new Set(['under_five', 'five_to_six']);
const LATE_MIND = new Set(['screen_until_lights_out', 'working_or_chores']);
const HEAVY_MORNING = new Set(['heavy_and_slow', 'need_something_first']);
const LATE_FUEL = new Set(['mid_morning', 'not_until_lunch', 'no_pattern']);
const QUICK_LIFT = new Set(['caffeine', 'something_sweet']);
const HIGH_LOAD = new Set(['most_of_it', 'a_lot']);
const NO_OFF_SWITCH = new Set(['cant_remember', 'not_the_way_life_is']);

/**
 * In priority order. The first match wins, and the last entry has no
 * conditions at all because it is the honest default rather than a rule.
 */
export const ENERGY_PATTERN_RULES: readonly EnergyPatternRule[] = [
  {
    // The tank is not being refilled, and it shows all day rather than at
    // one point in it.
    key: 'depletion_pattern',
    evidenceKeys: ['sleep_hours', 'low_point'],
    matches: (a) =>
      SHORT_NIGHTS.has(a.sleep_hours ?? '') &&
      (a.low_point === 'all_day' || HEAVY_MORNING.has(a.morning_start ?? '')),
  },
  {
    // Getting to sleep is the problem, and the hour before bed is doing
    // nothing to help.
    key: 'wind_down_deficit',
    evidenceKeys: ['night_pattern', 'wind_down'],
    matches: (a) => a.night_pattern === 'hard_to_fall_asleep' && LATE_MIND.has(a.wind_down ?? ''),
  },
  {
    // Sleep happens but does not restore, and the morning carries it.
    key: 'rhythm_disruption',
    evidenceKeys: ['night_pattern', 'morning_start'],
    matches: (a) =>
      (a.night_pattern === 'wake_in_the_night' || a.night_pattern === 'sleep_fine_wake_tired') &&
      (HEAVY_MORNING.has(a.morning_start ?? '') || a.low_point === 'early_morning'),
  },
  {
    // The drop lands at a specific time of day and the fuelling around it
    // is late, thin, or propped up.
    key: 'fuel_timing_pattern',
    evidenceKeys: ['low_point', 'first_food'],
    matches: (a) =>
      (a.low_point === 'early_afternoon' || a.low_point === 'late_morning') &&
      (LATE_FUEL.has(a.first_food ?? '') || QUICK_LIFT.has(a.afternoon_reach ?? '')),
  },
  {
    // There is more being asked than there is day, and it never lets up.
    key: 'overload_pattern',
    evidenceKeys: ['mental_load', 'off_switch'],
    matches: (a) =>
      a.mental_load === 'most_of_it' &&
      NO_OFF_SWITCH.has(a.off_switch ?? '') &&
      (a.low_point === 'all_day' || a.afternoon_reach === 'push_through'),
  },
  {
    // Carrying a lot, with no real gap in it, but the day still has a
    // shape rather than being flat.
    key: 'stress_loading_pattern',
    evidenceKeys: ['mental_load', 'off_switch'],
    matches: (a) => HIGH_LOAD.has(a.mental_load ?? '') && NO_OFF_SWITCH.has(a.off_switch ?? ''),
  },
  {
    // A late night that is not a short night, showing up as an evening
    // that never really closes.
    key: 'wind_down_deficit',
    evidenceKeys: ['wind_down', 'low_point'],
    matches: (a) =>
      a.wind_down === 'collapse_without_warning' &&
      (a.low_point === 'evening' || a.night_pattern === 'sleep_fine_wake_tired'),
  },
  {
    // The honest default. See this file's header: no scoring, no closest
    // match, and copy that says so.
    key: 'recovery_deficit',
    evidenceKeys: ['low_point', 'sleep_hours'],
    matches: () => true,
  },
] as const;

export type EnergyPatternResolution = {
  readonly key: PublicEntryPatternKey;
  /** True when a real rule fired. False means the default, and the copy says so out loud. */
  readonly matched: boolean;
  /** Which rule index fired, so a test can assert the ordering rather than only the outcome. */
  readonly ruleIndex: number;
};

export function resolveEnergyPattern(answers: EnergyAnswers): EnergyPatternResolution {
  for (let i = 0; i < ENERGY_PATTERN_RULES.length; i += 1) {
    const rule = ENERGY_PATTERN_RULES[i]!;
    if (rule.matches(answers)) {
      return { key: rule.key, matched: i < ENERGY_PATTERN_RULES.length - 1, ruleIndex: i };
    }
  }
  // Unreachable: the last rule always matches. Kept so the function is
  // total without relying on that fact being obvious to a reader.
  return { key: 'recovery_deficit', matched: false, ruleIndex: ENERGY_PATTERN_RULES.length - 1 };
}
