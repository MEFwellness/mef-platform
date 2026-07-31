/**
 * Same "now in the member's timezone" conversion app/actions/checkin.ts's
 * resolveLocalDate already establishes for the check-in flow — replicated
 * here (not imported from that 'use server' file) so every new
 * event-stream write agrees with the check-in flow on what "today" means
 * for a given member, without creating a cross-import between server
 * action modules.
 *
 * Built via Intl.DateTimeFormat's own `timeZone` option (formatToParts),
 * not a toLocaleString-then-reparse round trip — the reparse form silently
 * depends on the *host process's own* local timezone (Date's non-ISO
 * string parsing uses the runtime's local zone), so it only ever produced
 * the right answer when the process happened to run with TZ=UTC (true on
 * Vercel, not true for a developer running tests locally in their own
 * timezone). formatToParts takes the target timezone directly and never
 * consults the process's own zone at all, so this is correct everywhere —
 * with no change in behavior for any caller already running under TZ=UTC.
 */
function wallClockAsUtc(instant: Date, timezone: string): Date {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  return new Date(
    Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    )
  );
}

export function nowInTimezone(timezone: string): Date {
  return wallClockAsUtc(new Date(), timezone);
}

/** Same conversion as nowInTimezone, but for an arbitrary instant (e.g. a row's created_at) rather than the current moment — for batch jobs (Coaching Intelligence Engine sources) that need each row's own local_date, not just "today's". */
export function instantInTimezone(isoInstant: string, timezone: string): Date {
  return wallClockAsUtc(new Date(isoInstant), timezone);
}

export function toLocalDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function todaysLocalDate(timezone: string): string {
  return toLocalDateString(nowInTimezone(timezone));
}

export function localDateStringFor(isoInstant: string, timezone: string): string {
  return toLocalDateString(instantInTimezone(isoInstant, timezone));
}
