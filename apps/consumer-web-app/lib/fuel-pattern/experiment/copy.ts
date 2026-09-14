/**
 * Rooted Reset Fuel Pattern Assessment, Build 4 — every word the 7 Day
 * Fuel Experiment puts in front of a member.
 *
 * THE VOICE IS BUILD 2'S, AND THE STAKES ARE HIGHER HERE. An observation
 * about a finished questionnaire is a reading. A line that follows three
 * real meals is one step from an instruction, so every one of them says
 * "appears", "may" or "worth trying", and none of them tells her to do
 * anything. The words must, requires, ideal, optimal and prescription
 * appear nowhere below, and nothing here names a condition.
 *
 * DIGITS ARE ALLOWED IN THIS FILE, AND ONLY HERE. The rest of this
 * instrument carries no number at all on a member's screen, deliberately
 * (lib/fuel-pattern/copy.ts). A seven day experiment cannot say which day
 * she is on in words without becoming coy, so the day counter and the
 * check count are digits, they are the ONLY digits, and the result page's
 * own guard marks each of those nodes rather than dropping the rule.
 *
 * NO STREAK, NO SCORE, NO PRESSURE. A count is printed as a fact about
 * what she did, never against a target, because there is no target. Zero
 * checks on day 7 is a real week and the completion screen says so
 * without apology on either side.
 */

import { FPA_EXPERIMENT_DAYS } from './types';

/** The section header on the result page, and the title of her own experiment screen. */
export const FPA_EXPERIMENT_HEADER = 'YOUR 7-DAY FUEL EXPERIMENT';

/** The invitation, before she has started anything. Approved copy, verbatim. */
export const FPA_EXPERIMENT_INVITATION =
  'Try your starting pattern for the next 7 days and notice how your body responds. After meals, you can log a quick check that takes about ten seconds. Rooted Reset will look for patterns in what you notice.';

export const FPA_EXPERIMENT_START_LABEL = 'START MY EXPERIMENT';
export const FPA_EXPERIMENT_LOG_LABEL = 'LOG A CHECK';
export const FPA_EXPERIMENT_DONE_LABEL = 'DONE';
export const FPA_EXPERIMENT_RESTART_LABEL = 'RESTART EXPERIMENT';

/** "Day 3 of 7". The day counter, made in one place. */
export function fpaExperimentDayLine(day: number): string {
  return `Day ${Math.min(day, FPA_EXPERIMENT_DAYS)} of ${FPA_EXPERIMENT_DAYS}`;
}

/**
 * What she has logged so far, said as a fact and never as a shortfall.
 * Nothing is expected of her, so nothing here can be behind.
 */
export function fpaExperimentCheckLine(count: number): string {
  if (count === 0) return 'No checks logged yet. Log one whenever a meal is worth noticing.';
  if (count === 1) return '1 check logged so far.';
  return `${count} checks logged so far.`;
}

/** The quiet line under the day counter while a run is going. */
export const FPA_EXPERIMENT_ACTIVE_LEAD =
  'Log a quick check after a meal whenever you like. Several in a day is fine, and a day with none is fine too.';

/** The quick check sheet. Three taps, and a fourth she can skip. */
export const FPA_QUICK_CHECK = {
  title: 'A quick check',
  subtitle: 'Three taps. About ten seconds.',
  close: 'Close',
  energyHeader: 'ENERGY',
  hungerHeader: 'HUNGER 2 TO 3 HOURS LATER',
  clarityHeader: 'MENTAL CLARITY',
  mealHeader: 'WHICH MEAL WAS THIS?',
  mealOptional: 'Optional',
  confirmation: 'Noted. That helps.',
} as const;

export const FPA_ENERGY_LABEL = {
  low: 'Low',
  steady: 'Steady',
  great: 'Great',
} as const;

export const FPA_HUNGER_LABEL = {
  hungry: 'Hungry',
  comfortable: 'Comfortable',
  still_very_full: 'Still very full',
} as const;

export const FPA_CLARITY_LABEL = {
  foggy: 'Foggy',
  normal: 'Normal',
  clear: 'Clear',
} as const;

/** The part of the day, as she is offered it on the sheet. */
export const FPA_CHECK_MEAL_TYPE_LABEL = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
} as const;

/**
 * The same four in the middle of a sentence, which is where an insight
 * names one. "Your breakfast may be the one to adjust first."
 */
export const FPA_CHECK_MEAL_TYPE_IN_SENTENCE = {
  breakfast: 'breakfast',
  lunch: 'lunch',
  dinner: 'dinner',
  snack: 'snack',
} as const;

/** The completion screen, once the seventh day has passed. */
export const FPA_EXPERIMENT_COMPLETION = {
  header: 'YOUR FIRST WEEK, NOTICED.',
  /** Approved copy, verbatim, for a week where no insight ever qualified. */
  noInsightLine:
    'Nothing pulled strongly in one direction this week, which usually means your starting pattern is a reasonable home.',
  /** Approved copy, verbatim. The last thing she reads at the end of the week. */
  closingLine:
    'This is exactly how a starting pattern becomes yours: not by rules, but by noticing. Your coach can see what you noticed, and your pattern can keep refining from here.',
} as const;

/**
 * How many checks the week held, assembled from her real rows. The zero
 * case is written to be read without a flinch: a week with no checks is
 * a week, and the closing line still applies to it.
 */
export function fpaExperimentCompletionCheckLine(count: number): string {
  if (count === 0) return 'You logged no checks this week, which is a perfectly ordinary week.';
  if (count === 1) return 'You logged 1 check this week.';
  return `You logged ${count} checks this week.`;
}

/** The quiet state a finished, acknowledged run collapses to. */
export const FPA_EXPERIMENT_COMPLETED_QUIET =
  'Your first week is noticed and put away. You can start another whenever you like.';

/** Her own experiment screen, reached from the Food Lens tile. */
export const FPA_MY_EXPERIMENT = {
  title: 'My Fuel Experiment',
  tileLabel: 'My Fuel Experiment',
  lead: 'Seven days of noticing how your starting pattern actually lands.',
  back: 'Back to Food Lens',
  /** The tile's own status line when she has never started one. */
  tileNotStarted: 'Not started',
  /** The tile's status line once a run is finished. */
  tileComplete: 'Week complete',
  /** What her screen says when there is no reading to build an experiment on yet. */
  noReading:
    'Your 7-Day Fuel Experiment opens once you have taken the Rooted Reset Fuel Pattern Assessment.',
  noReadingLink: 'Take the assessment',
  /** The list of what she has already logged, on her own screen only. */
  logHeader: 'WHAT YOU HAVE NOTICED',
  logEmpty: 'Nothing logged yet. Your first check will appear here.',
} as const;
