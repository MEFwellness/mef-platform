/**
 * How the admin analytics dashboard turns service layer values into words.
 *
 * Pure, so every honesty rule below is testable without a browser or a
 * database. No LLM is involved anywhere: every string here is a template
 * over numbers the service layer already computed.
 *
 * THE RULES.
 *
 * A null rate is never a zero. The service layer returns null for every
 * rate whose denominator is zero, deliberately, because real activity is
 * currently tiny and a fabricated "0 percent completion" would be read as a
 * failure that did not happen. Below the minimum the service layer defines
 * (a denominator of at least one), this shows the raw counts and says the
 * numbers are too few to rate.
 *
 * An unmeasurable thing is never a dash. Purchases, experience completion
 * and per-question drop-off each come back with measurable: false and a
 * reason. The reason is what gets rendered.
 *
 * An empty view says what will fill it. Not a spinner, not a zero, not a
 * shrug: a sentence describing the behavior that would make a number appear
 * here.
 */

/** Thousands separators only. Analytics counts are always whole. */
export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'Not available';
  return Math.round(value).toLocaleString('en-US');
}

/** One decimal place, matching the precision the database rounds to. */
export function formatRate(value: number | null | undefined): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

/** A count with a noun that agrees with it. "1 members scanned something" reads as a bug in the dashboard. */
export function countNoun(value: number, singular: string, plural = `${singular}s`): string {
  return `${formatCount(value)} ${value === 1 ? singular : plural}`;
}

/**
 * @param unit a plural noun. A value of exactly one drops the trailing "s",
 *   because "1 sessions" reads as a bug in the dashboard rather than a
 *   number.
 *
 * A real value that rounds away to zero keeps two decimal places instead.
 * One active day across ninety days is 0.01 per day, and printing that as
 * "0 per day" would say nothing happened when something did.
 */
export function formatAverage(value: number | null | undefined, unit: string): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const rounded = Math.round(value * 10) / 10;
  const shown = rounded === 0 && value > 0 ? value.toFixed(2) : `${rounded}`;
  const noun = Number(shown) === 1 && unit.endsWith('s') ? unit.slice(0, -1) : unit;
  return `${shown} ${noun}`;
}

/**
 * The one place the "too few to rate" decision is made.
 *
 * The service layer defines the minimum: it returns a rate only when the
 * denominator is at least one, and null otherwise. Nothing here invents a
 * second, stricter threshold, because a threshold the database does not
 * know about would put the label and the number out of step.
 *
 * The starts count travels with the rate even when there is one, so a 100
 * percent completion built on a single start cannot be misread as a strong
 * result.
 */
export type RateReadout = {
  rateText: string | null;
  tooFewToRate: boolean;
  /** A clause, not a sentence: no trailing punctuation, so a caller can build a line around it. */
  basis: string;
};

/** The label shown wherever tooFewToRate is true. One wording, used everywhere. */
export const TOO_FEW_TO_RATE_LABEL = 'Too few to rate';

export function rateReadout(
  rate: number | null,
  started: number | null,
  completed: number | null,
  unit: string = 'starts'
): RateReadout {
  const startedText = formatCount(started ?? 0);
  const completedText = formatCount(completed ?? 0);

  if (rate === null || started === null || started < 1) {
    return {
      rateText: null,
      tooFewToRate: true,
      basis: `${startedText} ${unit}, ${completedText} completed`,
    };
  }

  return {
    rateText: formatRate(rate),
    tooFewToRate: false,
    basis: `${completedText} of ${startedText} ${unit}`,
  };
}

/**
 * What will make an empty view fill in. Each one names the behavior, not the
 * data: an administrator reading this should know what a member has to do
 * for a number to appear.
 */
export const EMPTY_STATE_COPY = {
  overview: {
    title: 'No member activity in this window',
    body: 'This fills in as members open the app, start a Daily Reset, or scan a meal from today onward. Widen the date range or turn on test accounts to see the shape of a populated view.',
  },
  funnelNoCohort: {
    title: 'No one signed up inside this window',
    body: 'The cohort here is everyone whose account creation was recorded inside the date range. Accounts created before signup tracking shipped have no signup event, so they cannot be in a cohort. This fills in as members sign up from today onward.',
  },
  featureUsage: {
    title: 'No feature has been used in this window',
    body: 'Every feature below is listed with real zeros rather than hidden. This fills in the first time a member opens a screen or acts on something in it.',
  },
  dropOff: {
    title: 'No flow was started in this window',
    body: 'Started and completed counts appear here once a member begins a Daily Reset, onboarding, a Today’s Focus item, Reset Plan setup, or a Priority Card. This fills in from the next start onward.',
  },
} as const;

/**
 * The exact sentence required when the funnel cohort is empty because the
 * accounts that exist predate the signup trigger. Only shown when that is
 * genuinely the case: profiles were created in the window but no signup
 * event was recorded for any of them.
 */
export const PRE_TRACKING_COHORT_COPY =
  'The cohort is zero because these accounts predate the signup trigger, so no signup event was ever recorded for them.';

/**
 * The funnel's empty state. When accounts exist in the window but none of
 * them has a signup event, the reason is stated in exactly those words,
 * because "no cohort" and "the tracking did not exist yet" are different
 * facts and only one of them is a problem.
 */
export function funnelEmptyState(
  profilesCreatedInRange: number
): { title: string; body: string } {
  if (profilesCreatedInRange > 0) {
    return {
      title: EMPTY_STATE_COPY.funnelNoCohort.title,
      body: `${PRE_TRACKING_COHORT_COPY} ${formatCount(profilesCreatedInRange)} accounts were created in this window and none of them can be followed through the funnel. This fills in as members sign up from today onward.`,
    };
  }
  return EMPTY_STATE_COPY.funnelNoCohort;
}

/**
 * The line under a funnel stage's bar.
 *
 * A null percentOfPreviousMeasurableStage has two completely different
 * causes and they must not read the same: either this is the first
 * measurable stage and there is nothing before it, or the stage before it
 * had nobody in it to divide by. Collapsing them made seven stages out of
 * nine claim to be the first one.
 */
export function funnelStageComparison(
  stage: {
    percentOfPreviousMeasurableStage: number | null;
    membersLostFromPreviousStage: number | null;
  },
  isFirstMeasurableStage: boolean
): string {
  const lead = isFirstMeasurableStage
    ? 'This is the first measurable stage, so there is nothing before it to compare against.'
    : stage.percentOfPreviousMeasurableStage !== null
      ? `${formatRate(stage.percentOfPreviousMeasurableStage)} of the previous measurable stage.`
      : 'Nobody reached the previous measurable stage, so there is no percentage to give.';

  const lost = stage.membersLostFromPreviousStage;
  if (isFirstMeasurableStage || lost === null || lost <= 0) return lead;
  return `${lead} ${formatCount(lost)} ${lost === 1 ? 'member' : 'members'} did not carry through from the stage before.`;
}

export function cohortGapNotice(
  cohortSize: number,
  profilesCreatedInRange: number
): string | null {
  if (cohortSize > 0) {
    if (profilesCreatedInRange > cohortSize) {
      const gap = profilesCreatedInRange - cohortSize;
      return `${formatCount(profilesCreatedInRange)} accounts were created in this window but only ${formatCount(cohortSize)} have a recorded signup event. The other ${formatCount(gap)} predate the signup trigger and cannot be followed through the funnel.`;
    }
    return null;
  }
  if (profilesCreatedInRange > 0) return PRE_TRACKING_COHORT_COPY;
  return null;
}

/**
 * The daily-active series comes back sparse: the database returns a point
 * only for days that had activity. Drawing that as-is would space four
 * scattered days evenly and make a quiet month look busy. This fills the
 * gaps with real zeros so the chart's x axis is the calendar, not a list of
 * the good days.
 */
export function densifyDailySeries(
  series: Array<{ localDate: string; members: number }>,
  start: string,
  end: string
): Array<{ localDate: string; members: number }> {
  const byDate = new Map(series.map((point) => [point.localDate, point.members]));
  const out: Array<{ localDate: string; members: number }> = [];
  const cursor = new Date(`${start}T00:00:00.000Z`);
  const last = new Date(`${end}T00:00:00.000Z`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(last.getTime())) return series;

  // A hard stop so a malformed range can never spin: no analytics window
  // this dashboard offers is longer than a few hundred days.
  for (let guard = 0; cursor.getTime() <= last.getTime() && guard < 1000; guard += 1) {
    const key = cursor.toISOString().slice(0, 10);
    out.push({ localDate: key, members: byDate.get(key) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/** True when a feature genuinely saw nothing in the window, so it can be labelled unused rather than dropped. */
export function isUnusedFeature(feature: { uniqueMembers: number; totalEvents: number }): boolean {
  return feature.uniqueMembers === 0 && feature.totalEvents === 0;
}

/** The label for the test-account toggle when it is on. Deliberately loud. */
export const TEST_ACCOUNTS_ON_LABEL = 'Test accounts included';
export const TEST_ACCOUNTS_ON_DETAIL =
  'These numbers include internal test accounts. Turn the toggle off for real members only.';
