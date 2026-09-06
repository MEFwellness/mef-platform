/**
 * Which seven days the band is about, and how it says so.
 *
 * ONE FRIDAY DEFINITION IN THIS APP. Both functions below are imported
 * from lib/weekly-reflection/week.ts and neither is restated here:
 *
 *   mostRecentReflectionWeekStart  the Friday the member is standing in,
 *                                  or the one that just passed. Never
 *                                  null, which is what lets a coach open
 *                                  this on a Tuesday and still read a week.
 *   recapRangeFor                  that Friday and the six days before it.
 *
 * Those are the identical two calls lib/weekly-reflection/recap.ts and
 * lib/weekly-reflection/data.ts make, so the band's "3 of 7 days" and the
 * recap's "you checked in on 3 days" are the same three days by
 * construction rather than by agreement.
 *
 * IT IS NOT THE OFFER WINDOW. `reflectionWeekStartFor` is the function
 * that decides whether the member may write her reflection today and goes
 * null Monday through Thursday. Nothing here calls it, because a coach
 * reading her client on a Tuesday still needs a week to read.
 *
 * THE DATE HANDED IN IS ALWAYS HERS, resolved on the server from her
 * stored profile timezone (lib/time/memberToday.ts). Nothing in this file
 * consults a clock.
 */

import { formatDisplayDate } from '../time/displayDate';
import { mostRecentReflectionWeekStart, recapRangeFor } from '../weekly-reflection/week';
import type { ThisWeekWindow } from './types';

/**
 * "Aug 29", for naming a boundary day.
 *
 * A bare YYYY-MM-DD parses as UTC midnight, so UTC is the zone that hands
 * back the same calendar day it was stored as, in every reader's zone.
 * That is what formatDisplayDate is for, and it is the identical helper
 * the assignment status line and the reflection panel's week chips use, so
 * two surfaces can never name one day differently.
 */
function dayText(localDate: string): string {
  const text = formatDisplayDate(localDate, { month: 'short', day: 'numeric' });
  return /^[A-Za-z]+ \d+$/.test(text) ? text : localDate;
}

/** How the band names its own seven days. Printed with the band, always. */
export function thisWeekWindowLabel(range: { from: string; to: string }): string {
  return `Week of ${dayText(range.from)} to ${dayText(range.to)}`;
}

/**
 * The window for a member standing on `memberLocalDate`.
 *
 * The whole of the day arithmetic is the two imports above. This function
 * adds the label and nothing else.
 */
export function thisWeekWindowFor(memberLocalDate: string): ThisWeekWindow {
  const weekStart = mostRecentReflectionWeekStart(memberLocalDate);
  const range = recapRangeFor(weekStart);
  return {
    weekStart,
    from: range.from,
    to: range.to,
    label: thisWeekWindowLabel(range),
  };
}

/** Whether a bare local date falls inside the window, inclusive. Plain string comparison, safe on YYYY-MM-DD. */
export function withinThisWeek(localDate: string, window: { from: string; to: string }): boolean {
  return localDate >= window.from && localDate <= window.to;
}
