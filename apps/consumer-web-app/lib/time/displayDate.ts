/**
 * Renders a stored instant as text, with an EXPLICIT timezone on every
 * call. Without one, `toLocaleDateString`/`toLocaleString` resolve against
 * the *host process's own local timezone*: Vercel's server always runs in
 * UTC, but a browser runs in whatever zone the reader is physically in, so
 * the exact same instant renders as different text server-side vs.
 * client-side, and React flags it as a hydration mismatch (minified error
 * codes #418/#423/#425).
 *
 * There are two right answers, and which one is right depends on who is
 * reading:
 *
 * - `formatDisplayDate` pins to UTC. For a STAFF surface reading a
 *   record's timestamp, and for a value that is a bare calendar date
 *   (`YYYY-MM-DD`, a `date` column) rather than an instant: a bare date
 *   parses as UTC midnight, so formatting it in UTC gives back the same
 *   calendar day it was stored as, in every zone. Formatting it in a
 *   negative-offset zone would render it as the day before, which is the
 *   off-by-one this helper exists to prevent.
 * - `formatInTimeZone` pins to a zone the caller names. For a MEMBER
 *   surface reading her own instants (when a notification arrived, when
 *   she logged a meal), the only correct zone is her own
 *   `profiles.timezone`, resolved on the server and handed down as a prop.
 *   UTC would be deterministic but visibly wrong: an 8pm meal would read
 *   as tomorrow's date at midnight.
 *
 * Both are deterministic across server and client, which is what makes
 * either safe in a component that hydrates. Neither may feed a comparison,
 * a database write, or any other logic: for "which calendar day did this
 * instant fall on for this member", use lib/time/localDate.ts, and for
 * "what is today for this member", use lib/time/memberToday.ts.
 *
 * `components/case-view/OverlayChart.tsx` and
 * `components/case-view/GoalProgressChart.tsx` each already carried this
 * exact fix locally, with their own copy of the comment above. This file
 * is that proven fix, stated once.
 */

/** Returned for null, undefined, empty string, or a string that fails to parse into a real date. Never invents a date. */
const UNAVAILABLE = 'date not available';

/**
 * Text for a human, pinned to the timezone the caller names. Member
 * surfaces pass the member's own `profiles.timezone`, resolved on the
 * server (lib/time/memberToday.ts's `memberTimezone`) so both render
 * passes format the same instant in the same zone.
 */
export function formatInTimeZone(
  iso: string | null | undefined,
  options: Intl.DateTimeFormatOptions,
  timeZone: string
): string {
  if (!iso) return UNAVAILABLE;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return UNAVAILABLE;
  return date.toLocaleString('en-US', { ...options, timeZone });
}

/** Text for a human, pinned to UTC. See the header for when that is the right zone. */
export function formatDisplayDate(
  iso: string | null | undefined,
  options: Intl.DateTimeFormatOptions
): string {
  return formatInTimeZone(iso, options, 'UTC');
}
