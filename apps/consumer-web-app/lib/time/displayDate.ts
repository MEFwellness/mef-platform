/**
 * Renders a stored ISO timestamp as text for a coach-view component, with
 * an explicit `timeZone: 'UTC'` on every call. Without that explicit zone,
 * `toLocaleDateString`/`toLocaleString` resolve against the *host
 * process's own local timezone*: Vercel's server always runs in UTC, but
 * a coach's browser runs in whatever zone they are physically in, so the
 * exact same instant renders as different text server-side vs.
 * client-side, and React flags it as a hydration mismatch (minified error
 * codes #418/#423/#425). `components/case-view/OverlayChart.tsx` and
 * `components/case-view/GoalProgressChart.tsx` each already carry this
 * exact fix, locally, with their own copy of the comment above. This
 * file generalizes that proven fix into one shared helper so every
 * coach-view display-date call site applies it the same way.
 *
 * This solves a different problem than lib/time/localDate.ts. That file's
 * `wallClockAsUtc`/`instantInTimezone` answer "which calendar day did
 * this instant fall on, in this specific member's own timezone" for
 * business logic (check-in windows, food-log local dates), where the
 * answer legitimately depends on the member's zone. This file only ever
 * produces text for a human to read, always pinned to UTC so server and
 * client agree, and its output never feeds a comparison, a database
 * write, or any other logic.
 */

/** Returned for null, undefined, empty string, or a string that fails to parse into a real date. Never invents a date. */
const UNAVAILABLE = 'date not available';

export function formatDisplayDate(
  iso: string | null | undefined,
  options: Intl.DateTimeFormatOptions
): string {
  if (!iso) return UNAVAILABLE;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return UNAVAILABLE;
  return date.toLocaleString('en-US', { ...options, timeZone: 'UTC' });
}
