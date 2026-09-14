/**
 * Rooted Reset Fuel Pattern Assessment — everything a member reads.
 *
 * THE VOICE. Observational, never prescriptive. "Your responses suggest",
 * "may", "a starting pattern". Never "your metabolism", never "your body
 * requires", never "you must eat", never "your biological type". Nothing
 * on any of these screens diagnoses anything, and no em dash appears
 * anywhere in this file.
 *
 * THIS IS BUILD 1. The reveal below is deliberately short: one line that
 * the assessment is complete, a pause, then the pattern name and one
 * sentence. The full result page, the meal system and the 7 day
 * experiment are later builds, and everything here is written so it can
 * be replaced wholesale rather than unpicked.
 */

import type { FpaConfidence, FuelPattern } from './types';

export const FPA_INTRO_COPY = {
  eyebrow: 'Nutrition',
  title: 'How you run best',
  lines: [
    'Twenty four questions about how food actually lands for you. How long a meal holds you, what an afternoon feels like, what you reach for when you are genuinely hungry.',
    'There are no right answers and nothing here is a test. Answer the way your ordinary week really goes.',
    'One question at a time, and you can stop and pick it up again whenever you like.',
  ],
  button: "Let's begin",
} as const;

/** The name of each outcome, exactly as a member reads it. */
export const FUEL_PATTERN_LABEL: Record<FuelPattern, string> = {
  protein_supportive: 'Protein-Supportive',
  balanced_fuel: 'Balanced Fuel',
  carb_supportive: 'Carb-Supportive',
  flexible_fuel: 'Flexible Fuel',
};

/**
 * One supporting sentence per pattern. Each one starts from her responses
 * and stops there: it describes what the answers point at, and it does
 * not instruct, prescribe or explain a mechanism.
 */
export const FUEL_PATTERN_SENTENCE: Record<FuelPattern, string> = {
  protein_supportive:
    'Your responses suggest you may feel steadiest when meals are built around protein, with vegetables and some healthy fat alongside.',
  balanced_fuel:
    'Your responses suggest you may feel steadiest when meals hold protein, carbohydrate and fat together in roughly even measure.',
  carb_supportive:
    'Your responses suggest you may feel steadiest when meals lean toward whole-food carbohydrate, with protein and fat in supporting roles.',
  flexible_fuel:
    'Your responses suggest no single direction stands out yet, which often means a range of meals may work for you rather than one narrow shape.',
};

/** The label a coach reads beside the confidence level. Never shown to a member in Build 1. */
export const FPA_CONFIDENCE_LABEL: Record<FpaConfidence, string> = {
  high: 'High',
  moderate: 'Moderate',
  low: 'Low',
};

export const FPA_REVEAL_COPY = {
  completeHeadline: 'Assessment complete',
  completeLine: 'Thank you for answering honestly.',
  patternEyebrow: 'YOUR FUEL PATTERN',
  footnote: 'This is a starting pattern based on your responses, and it can change as you learn more about yourself.',
  button: 'Continue',
} as const;

/** Response tendencies, in words, for the coach view in Build 2. Nothing here reaches a member screen today. */
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

export const FPA_DIGESTIVE_DISCOMFORT_NOTE =
  'Reported frequent digestive discomfort after usual meals, whatever the meal was.';

/** Her Question 23 answers, in words, for the coach view. Contextual only, never scored, never interpreted. */
export const FPA_VITALITY_LABEL: Record<string, string> = {
  strong_consistent: 'Strong and consistent',
  generally_good: 'Generally good',
  comes_and_goes: 'Comes and goes',
  noticeably_lower: 'Noticeably lower than usual',
  very_low: 'Very low lately',
  prefer_not_to_answer: 'Preferred not to answer',
};
