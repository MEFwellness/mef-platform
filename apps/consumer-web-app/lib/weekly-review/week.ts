/**
 * The Weekly Root Review — which week is it, in the member's own calendar.
 *
 * Deliberately not a new week-boundary implementation. lib/food-lens/
 * weeklyReportData.ts already established this app's one answer to "which
 * Monday-start week does this local date belong to", it is a pure function
 * over a YYYY-MM-DD string, and its own weekly report is keyed by exactly
 * the same value. Importing it is the point: two weekly features must never
 * disagree about where a week begins.
 *
 * The local date handed in is always the member's own, resolved from her
 * stored profile timezone by the same path every other daily surface uses.
 * Nothing here ever consults the server's clock.
 */

import { addCalendarDays, weekBoundsFor } from '../food-lens/weeklyReportData';

export { addCalendarDays, weekBoundsFor };

/** Her own local Monday for the week containing `localDate`. */
export function weekStartFor(localDate: string): string {
  return weekBoundsFor(localDate).weekStart;
}

/** The Monday before `weekStart`. The week the review is actually about. */
export function previousWeekStartFor(weekStart: string): string {
  return addCalendarDays(weekStart, -7);
}

/**
 * The inclusive day range of the week that a review composed on
 * `weekStart` is REVIEWING, which is the week BEFORE it.
 *
 * This is the load-bearing distinction of the whole feature and it is easy
 * to get backwards. The review is delivered on the first open on or after
 * her local Monday, and what it looks back at is the seven days that just
 * finished, not the two or three days of the new week that have elapsed.
 * "What this week showed" is what she reads; what Root reads is last week,
 * complete.
 */
export function reviewedRangeFor(weekStart: string): { from: string; to: string } {
  const from = addCalendarDays(weekStart, -7);
  return { from, to: addCalendarDays(weekStart, -1) };
}

/** Whether `localDate` falls inside the (inclusive) range. Plain string comparison, which is safe on YYYY-MM-DD. */
export function withinRange(localDate: string, range: { from: string; to: string }): boolean {
  return localDate >= range.from && localDate <= range.to;
}

/** Whole days between two local dates, positive when `to` is later. */
export function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00.000Z`).getTime();
  const b = new Date(`${to}T00:00:00.000Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}
