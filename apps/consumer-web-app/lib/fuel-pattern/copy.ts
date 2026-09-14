/**
 * Rooted Reset Fuel Pattern Assessment — everything a MEMBER reads.
 *
 * THE VOICE. Observational, never prescriptive. "Your responses suggest",
 * "may", "appears", "a starting point". Never "your metabolism", never
 * "your body requires", never "you must eat", never "your perfect
 * macros", never "your biological type". Nothing on any of these screens
 * diagnoses a metabolic, hormonal, blood sugar, digestive or endocrine
 * condition or a food intolerance, and no em dash appears anywhere in
 * this file.
 *
 * WHAT IS NOT HERE. No score, no confidence level, no tendency code, no
 * internal number of any kind. Those are the coach's, and they live in
 * lib/fuel-pattern/coachCopy.ts so that her screens cannot import them
 * even by accident.
 *
 * BUILD 2 OF 4. This is the full result experience: the reveal, the four
 * supporting sections and the forward look. Meals and the 7 Day Fuel
 * Experiment are Builds 3 and 4; nothing here mentions, promises or
 * gestures at either of them, and FPA_WATCH_FOR_COPY is deliberately one
 * shared block so that handing off into the experiment later is a single
 * change in one place.
 */

import type { FuelPattern } from './types';

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

/** The name of each outcome, exactly as a member reads it. One name per thing, everywhere. */
export const FUEL_PATTERN_LABEL: Record<FuelPattern, string> = {
  protein_supportive: 'Protein-Supportive',
  balanced_fuel: 'Balanced Fuel',
  carb_supportive: 'Carb-Supportive',
  flexible_fuel: 'Flexible Fuel',
};

/**
 * THE ONE SENTENCE UNDER HER PATTERN NAME, approved copy, used verbatim.
 * It is the second thing on the result page and it is the only sentence
 * that interprets the whole reading, so it is stated once here and read
 * from here by the reveal and by the stored results page alike.
 */
export const FUEL_PATTERN_INTERPRETATION: Record<FuelPattern, string> = {
  protein_supportive:
    'Your responses suggest that you currently feel best when meals are built around protein, with vegetables and healthy fat doing much of the supporting work.',
  balanced_fuel:
    'Your responses suggest that you currently feel best with a fairly even mix of protein, carbohydrate and healthy fats.',
  carb_supportive:
    'Your responses suggest that you currently feel best when whole-food carbohydrates carry a little more of the load, with protein and healthy fat alongside.',
  flexible_fuel:
    'Your responses suggest that your body responds well to more than one way of eating, which gives you a genuinely flexible starting point.',
};

/** The reveal, beat by beat. */
export const FPA_REVEAL_COPY = {
  completeHeadline: 'Assessment complete.',
  patternEyebrow: 'YOUR FUEL PATTERN',
} as const;

/** The headers on the result page, in the order the page prints them. */
export const FPA_SECTION_HEADERS = {
  why: 'WHY THIS PATTERN FITS YOU',
  whyLeadIn: 'You told us:',
  range: 'YOUR STARTING RANGE',
  plate: 'YOUR STARTING PLATE',
  watchFor: 'WHAT ROOTED RESET WILL WATCH FOR',
} as const;

/**
 * HER STARTING RANGE, IN WORDS AND ONLY IN WORDS. No percentage, no gram
 * target, no calorie figure and no number of any kind: a number here
 * would read as a prescription, and this is a place to start from and
 * notice, not a plan to comply with. The words IDEAL, MACROS, REQUIRES
 * and MUST appear nowhere in this block, and
 * tests/fuel-pattern-result-copy.test.ts is what keeps them out.
 *
 * `extraLine` exists for exactly one pattern. Flexible Fuel gets the same
 * three moderate rows as Balanced Fuel, so without it her range would say
 * nothing about the one thing that actually distinguishes her reading.
 */
export type FpaRangeRow = { nutrient: string; level: string };

export const FPA_STARTING_RANGE: Record<
  FuelPattern,
  { rows: FpaRangeRow[]; extraLine: string | null }
> = {
  protein_supportive: {
    rows: [
      { nutrient: 'Protein', level: 'Higher' },
      { nutrient: 'Carbohydrate', level: 'Lighter' },
      { nutrient: 'Healthy Fat', level: 'Moderate' },
    ],
    extraLine: null,
  },
  balanced_fuel: {
    rows: [
      { nutrient: 'Protein', level: 'Moderate' },
      { nutrient: 'Carbohydrate', level: 'Moderate' },
      { nutrient: 'Healthy Fat', level: 'Moderate' },
    ],
    extraLine: null,
  },
  carb_supportive: {
    rows: [
      { nutrient: 'Protein', level: 'Moderate' },
      { nutrient: 'Carbohydrate', level: 'A little higher' },
      { nutrient: 'Healthy Fat', level: 'Lighter' },
    ],
    extraLine: null,
  },
  flexible_fuel: {
    rows: [
      { nutrient: 'Protein', level: 'Moderate' },
      { nutrient: 'Carbohydrate', level: 'Moderate' },
      { nutrient: 'Healthy Fat', level: 'Moderate' },
    ],
    extraLine: 'Your flexibility means you can adjust these freely and notice what feels best.',
  },
};

/** The quiet line under the starting range. */
export const FPA_RANGE_FOOTNOTE =
  'This is a starting point, not a prescription. It is meant to be refined through your own feedback over time.';

/**
 * THE ONE FORWARD LOOKING BLOCK, AND IT PROMISES NOTHING THAT DOES NOT
 * EXIST. No experiment, no check-in, no meal feedback, because none of
 * those has shipped. When Build 4 does ship, this function is the single
 * place that changes.
 */
export function fpaWatchForCopy(pattern: FuelPattern): string {
  return `Your ${FUEL_PATTERN_LABEL[pattern]} starting point is a hypothesis, not a verdict. Over the coming days, notice how your energy holds between meals, how satisfied you feel an hour or two after eating, and how clearly you think through the afternoon. What you notice is exactly the kind of information that refines a starting pattern into one that truly fits you.`;
}

/** The button that ends the page. It returns her to the dashboard and says so. */
export const FPA_CONTINUE_LABEL = 'Continue';
