/**
 * Rooted Reset Fuel Pattern Assessment — the words only a COACH reads.
 *
 * WHY THIS IS ITS OWN FILE. Confidence levels, response tendencies and the
 * digestive discomfort note are coaching vocabulary. None of them belongs
 * on a member screen, and the surest way to keep them off one is to keep
 * them out of the module her screens import. lib/fuel-pattern/copy.ts is
 * everything she reads; this is everything he reads, and
 * tests/fuel-pattern-member-payload.test.ts is the guard that proves her
 * import graph never reaches this file.
 *
 * No em dash anywhere, by the standing rule.
 */

import type { FpaConfidence } from './types';

/** The label a coach reads beside the confidence level. Never shown to a member. */
export const FPA_CONFIDENCE_LABEL: Record<FpaConfidence, string> = {
  high: 'High',
  moderate: 'Moderate',
  low: 'Low',
};

/** Response tendencies, in words. Nothing here reaches a member screen. */
export const FPA_TENDENCY_LABEL: Record<string, string> = {
  salty_crunchy_craving: 'Reaches for something salty or crunchy when very hungry',
  skips_breakfast: 'Usually does not eat breakfast',
  no_post_exercise_appetite: 'No particular appetite after exercise',
  afternoon_dip_regardless: 'An afternoon dip that arrives whatever lunch was',
  snacks_rarely_satisfy: 'Snacks rarely satisfy',
  highly_variable_appetite: 'Appetite varies a lot day to day',
  meal_size_changes_through_day: 'Preferred meal size changes through the day',
  appetite_decreases_under_stress: 'Appetite decreases under stress',
  eating_unpredictable_under_stress: 'Eating becomes unpredictable under stress',
  energy_changes_regardless_of_food: 'Energy changes considerably whatever the food',
};

/**
 * THE DIGESTIVE DISCOMFORT FLAG, WORDED AS A COACHING SIGNAL AND NOTHING
 * ELSE. It is never scored, it never moves a pattern, and the sentence
 * says both of those things so a coach reading it in a hurry cannot take
 * it for a finding. It diagnoses nothing.
 */
export const FPA_DIGESTIVE_DISCOMFORT_NOTE =
  'Reports frequent digestive discomfort regardless of meal type. Coaching signal only, did not influence the pattern.';

/** Her Question 23 answers, in words. Contextual only, never scored, never interpreted. */
export const FPA_VITALITY_LABEL: Record<string, string> = {
  strong_consistent: 'Strong and consistent',
  generally_good: 'Generally good',
  comes_and_goes: 'Comes and goes',
  noticeably_lower: 'Noticeably lower than usual',
  very_low: 'Very low lately',
  prefer_not_to_answer: 'Preferred not to answer',
};

/** What the panel prints when she was never asked, or the row predates the question. */
export const FPA_VITALITY_NOT_ANSWERED = 'Not answered';
