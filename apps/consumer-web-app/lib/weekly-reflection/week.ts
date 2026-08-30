/**
 * The Weekly Reflection — which three day window is it, in the member's
 * own calendar.
 *
 * The experience opens on her local FRIDAY and stays open through Sunday
 * night. All three days resolve to the same Friday, and that Friday is the
 * week key: it is what the unique constraint on member_weekly_reflections
 * scopes the once-per-week rule to, and it is what the pop-up message key
 * carries so next Friday is a genuinely new message rather than a repeat.
 *
 * Deliberately NOT a second week-boundary implementation. Day arithmetic
 * is addCalendarDays from lib/food-lens/weeklyReportData.ts, the one
 * answer this app already has for "a YYYY-MM-DD plus or minus n days",
 * which lib/weekly-review/week.ts also reuses rather than re-deriving.
 *
 * This is a different week ANCHOR from the Weekly Root Review's, and the
 * difference is the point rather than a drift: that review looks back at a
 * finished Monday-to-Sunday week on Monday morning, and this one is the
 * member's Friday sit-down before her coach reads it with her. Two
 * features, two real cadences, one set of date helpers underneath.
 *
 * The local date handed in is always the member's own, resolved from her
 * stored profile timezone by lib/time/memberToday.ts on the server.
 * Nothing here ever consults the server's clock, and nothing here calls
 * new Date() on anything but a pinned YYYY-MM-DDT00:00:00.000Z string.
 */

import { addCalendarDays } from '../food-lens/weeklyReportData';

export { addCalendarDays };

/** Sunday is 0, Friday is 5, Saturday is 6. Read off a UTC-pinned parse of the bare local date, so it is the member's own weekday and not the server's. */
export function weekdayIndexFor(localDate: string): number {
  return new Date(`${localDate}T00:00:00.000Z`).getUTCDay();
}

/** The three weekdays the experience is offered on, in the order they occur. */
export const REFLECTION_OPEN_WEEKDAYS = [5, 6, 0] as const;

/**
 * The Friday that anchors the window containing `localDate`, or null on
 * Monday through Thursday, when the experience is simply not offered.
 *
 * Null is the availability answer as well as the key answer, on purpose:
 * there is no separate "is it open" flag that could disagree with "which
 * week is it". A caller that has a week start has an open window.
 */
export function reflectionWeekStartFor(localDate: string): string | null {
  switch (weekdayIndexFor(localDate)) {
    case 5:
      return localDate;
    case 6:
      return addCalendarDays(localDate, -1);
    case 0:
      return addCalendarDays(localDate, -2);
    default:
      return null;
  }
}

/** Whether the Friday-to-Sunday window is open on this local date. */
export function isReflectionWindowOpen(localDate: string): boolean {
  return reflectionWeekStartFor(localDate) !== null;
}

/**
 * The seven days the recap reads, inclusive: the Friday itself and the six
 * days before it.
 *
 * Anchored on the Friday rather than on "today" so the recap does not
 * change under her between Friday and Sunday, and so the coach reading it
 * on Monday sees the same seven days she did. A window that shifted with
 * the day would make "you checked in on 3 days" mean three different
 * things across one weekend.
 */
export function recapRangeFor(weekStart: string): { from: string; to: string } {
  return { from: addCalendarDays(weekStart, -6), to: weekStart };
}

/** Whether a local date falls inside the inclusive range. Plain string comparison, which is safe on YYYY-MM-DD. */
export function withinRange(localDate: string, range: { from: string; to: string }): boolean {
  return localDate >= range.from && localDate <= range.to;
}

/**
 * The Friday of the window she is in, or of the one that most recently
 * closed. Never null.
 *
 * `reflectionWeekStartFor` is the availability answer and stays null on
 * Monday through Thursday, because on those days the experience is simply
 * not offered. A coach reading her client's screen on a Tuesday still
 * needs a week to report on, and the honest one is the weekend that just
 * finished rather than the one that has not started. So this is a separate
 * function rather than a softening of that one: nothing that decides
 * whether to OFFER the reflection may call this.
 */
export function mostRecentReflectionWeekStart(localDate: string): string {
  const open = reflectionWeekStartFor(localDate);
  if (open) return open;
  // Monday is 1 and its Friday is 3 days back, Thursday is 4 and its
  // Friday is 6 days back: index + 2, for every one of the four.
  return addCalendarDays(localDate, -(weekdayIndexFor(localDate) + 2));
}
