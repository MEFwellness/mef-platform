/**
 * Conditional water tracking — the vocabulary every other file shares.
 *
 * Water is not a universal metric. It exists for a member who actually has
 * a water problem and, for everybody else, it does not exist at all: no
 * check-in question, no Today tracker, no score, no trend, no insight, no
 * line on a coach's screen. The decision is one boolean on the member's
 * profile (profiles.hydration_focus, migration 163), and everything in
 * this folder exists so no surface has to invent its own answer to
 * "should this member see water?"
 *
 * The three states, and why the third is not simply false:
 *
 *   true   track it
 *   false  do not track it, and never count its absence against her
 *   null   she has not been asked yet. Every member who finished intake
 *          before this existed is in this state, and null behaves exactly
 *          like true so nothing about her app changes on deploy. Root's
 *          one-time pop-up is what moves her out of it.
 */

/** The intake question (migration 163), asked once of every new member right after the lifestyle anchors. */
export const HYDRATION_QUESTION_KEY = 'baseline_hydration';

/**
 * The digestion concern bank's own water question (migration 97). Now that
 * every member is asked HYDRATION_QUESTION_KEY, a member whose primary
 * concern is digestion would otherwise be asked about her water intake
 * twice in one sitting, in two different scales. lib/onboarding/adaptivePlan.ts
 * excludes it from her deep dive for that reason.
 */
export const HYDRATION_CONCERN_BANK_DUPLICATE_KEY = 'digestion_hydration_habit';

/**
 * The three answers, in the order they are shown. The first two are a
 * member telling us water is a problem for her; the third is a member
 * telling us it is not.
 */
export const HYDRATION_ANSWER_VALUES = ['very_little', 'a_few_glasses', 'plenty'] as const;

export type HydrationAnswerValue = (typeof HYDRATION_ANSWER_VALUES)[number];

/** Member-facing copy. No em dashes anywhere here — app copy rule. */
export const HYDRATION_PROMPT = 'On a typical day, how much water do you drink?';

export const HYDRATION_ANSWER_LABELS: Record<HydrationAnswerValue, string> = {
  very_little: 'Very little, I often forget',
  a_few_glasses: 'A few glasses, but not consistently',
  plenty: 'I drink plenty of water throughout the day',
};

/**
 * The whole rule, in one place: the first two answers mean water is worth
 * tracking, the third means it is not. Anything that is not one of the
 * three real answers (skipped, "not sure", "prefer not to answer", a value
 * from some future edit of the question) returns null, which leaves the
 * flag untouched rather than guessing at her on her behalf.
 */
export function hydrationFocusFromAnswer(value: unknown): boolean | null {
  if (value === 'very_little' || value === 'a_few_glasses') return true;
  if (value === 'plenty') return false;
  return null;
}

/**
 * The Hydration driver (driver_library, migration 106). Its probe
 * questions are the water questions in the daily check-in, and its
 * candidate pairs are the hydration correlations — gating on this id is
 * how both stay away from a member who does not track water, including
 * any question a coach adds to the driver later on /coach/questions.
 */
export const HYDRATION_DRIVER_ID = 'FUE-3';

/** The daily_checkins column water lives in. Any probe question writing to it is a water question, whatever it is called. */
export const HYDRATION_CHECKIN_COLUMN = 'water_cups';

/**
 * The correlation-engine variable for water. Used to skip candidate pairs
 * on either side of the pair, not only the ones filed under the Hydration
 * driver.
 */
export const HYDRATION_CORRELATION_VARIABLE = 'checkin.hydration';

/** The Daily Wellness Index / trend / insight metric key for water. */
export const HYDRATION_WELLNESS_METRIC_KEY = 'hydration';

/**
 * Root's one-time pop-up for members who finished intake before the
 * question existed. A fixed key, not scoped to a date or a row id: this is
 * asked once in a membership and then never again, which is exactly what
 * a constant key plus the existing dismissal table already expresses.
 */
export const HYDRATION_POPUP_MESSAGE_KEY = 'hydration_focus:v1';
