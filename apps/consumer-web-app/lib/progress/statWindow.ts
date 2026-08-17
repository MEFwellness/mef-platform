/**
 * Honesty guard: a stat label states the data actually behind the number,
 * never the size of the window that data was pulled from.
 *
 * Progress showed "AVG ENERGY 3.0 / 5 in the last 30 recorded days" to a
 * member with three recorded days. Thirty was the query's cap, not her
 * history, and the same screen a few inches above already said the true
 * number out loud ("You have 3 recorded days for energy in the last 30
 * days"), so the page contradicted itself about the same member on the
 * same load.
 *
 * The rule this file exists to hold: whatever fed the number is what the
 * label says. A cap can be mentioned separately if it is useful, but it
 * can never stand in for the count.
 *
 * This changes nothing about how any stat is computed. It changes what the
 * label is allowed to claim about it.
 */

/**
 * "from 3 recorded days" / "from 1 recorded day".
 *
 * `recordedCount` must be the real number of records the stat was computed
 * from, which for an average means its own denominator, not the number of
 * days in the requested range and not the number of days since the member
 * joined.
 */
export function recordedDaysLabel(recordedCount: number): string {
  return `from ${recordedCount} recorded ${recordedCount === 1 ? 'day' : 'days'}`;
}
