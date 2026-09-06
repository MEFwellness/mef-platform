/**
 * The coach's "This Week" band, the vocabulary.
 *
 * ONE WEEK, NAMED OUT LOUD, AND IT IS THE RECAP'S WEEK. Every count in
 * this band is counted over the seven days ending on the member's own
 * FRIDAY, which is exactly the window lib/weekly-reflection/recap.ts
 * reports on. The day arithmetic is not restated here: ./window.ts imports
 * `mostRecentReflectionWeekStart` and `recapRangeFor` from
 * lib/weekly-reflection/week.ts, so there is one Friday definition in this
 * app and the band and the recap cannot come to mean different weeks.
 *
 * It is deliberately NOT the Friday-to-Sunday OFFER window. That window
 * decides when the member may write her reflection. This band is what a
 * coach reads about the week that just ran, on any day of the week.
 *
 * NOTHING HERE COMPUTES A VERDICT, and nothing here re-derives a number a
 * feature's own reader already produces. Every row is a READ of a system
 * that already owns its answer: the recap's check-in dates, the
 * reflection's delivery line, the program builder's stored workout
 * statuses, the experiments feature's own effective status, the Reset
 * Plan's three explicit states, and the assignment ledger's status line.
 *
 * THE WORDS THE BAND MAY NOT USE. "Missed" never appears, anywhere. A day
 * with no row is not a miss: the app cannot tell "she decided not to" from
 * "she never opened the screen", and saying either would be inventing a
 * fact. Where a state genuinely cannot be told apart from another, the
 * sentence says so in plain words. And no em dashes: commas, periods,
 * colons and parentheses.
 */

/** The seven days the band counted, and how it names them on the screen. */
export type ThisWeekWindow = {
  /** The member's own Friday that ends the window. The recap's week key. */
  weekStart: string;
  /** The first of the seven days, inclusive. */
  from: string;
  /** The last of the seven days, inclusive. Always the Friday. */
  to: string;
  /** "Week of Aug 29 to Sep 4". Printed with every band, so no count ever appears without its days. */
  label: string;
};

/** One line under a row. `overdue` is set only where a real stored deadline has already passed. */
export type ThisWeekDetail = {
  text: string;
  overdue?: boolean;
};

export type ThisWeekRowKey =
  | 'checkins'
  | 'weekly_reflection'
  | 'programs'
  | 'experiments'
  | 'reset_plan'
  | 'assignments';

/** One row of the band: what it is, the one sentence, and the lines under it. */
export type ThisWeekRow = {
  key: ThisWeekRowKey;
  /** The name of the thing, as a coach already knows it from the rest of the app. */
  label: string;
  /** One sentence. Always true of THIS window, and never a claim about a day with no row. */
  statement: string;
  details: ThisWeekDetail[];
};

/** The whole band, for one member, for one week. Null when she is not on the program tier. */
export type ThisWeekBand = {
  window: ThisWeekWindow;
  rows: ThisWeekRow[];
};
