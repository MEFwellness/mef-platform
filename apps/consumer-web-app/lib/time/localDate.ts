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

/**
 * An instant, as the wall clock a `<input type="datetime-local">` wants,
 * in a named timezone: `YYYY-MM-DDTHH:mm`.
 *
 * The form these replace was `d.setMinutes(d.getMinutes() -
 * d.getTimezoneOffset())` followed by `toISOString().slice(0, 16)`, which
 * reads the RUNTIME's own offset. In a client component that is UTC during
 * the server pass and the reader's zone during the client pass, so a
 * controlled input hydrates with a different value than it was served with
 * (React #418/#423/#425), and the value a member then edits is in a
 * different zone than the time displayed beside it. Naming the zone fixes
 * both: the member's own zone, resolved on the server.
 */
export function instantToZonedInputValue(isoInstant: string, timezone: string): string {
  return wallClockAsUtc(new Date(isoInstant), timezone).toISOString().slice(0, 16);
}

/** Right now, as that same wall-clock string. The default value of a "when did you eat this" input. */
export function nowAsZonedInputValue(timezone: string): string {
  return nowInTimezone(timezone).toISOString().slice(0, 16);
}

/**
 * The inverse: a `YYYY-MM-DDTHH:mm` wall clock read in a named timezone,
 * back to the instant it names.
 *
 * Solved rather than looked up, because there is no offset table here.
 * Treating the wall clock as if it were UTC gives a first guess; the
 * difference between that guess re-read in the target zone and the guess
 * itself is the zone's offset, and subtracting it lands on the instant.
 * The second pass is what makes it right across a DST boundary, where the
 * offset at the guess is not the offset at the answer.
 */
export function zonedInputValueToInstant(inputValue: string, timezone: string): Date {
  const asIfUtc = new Date(`${inputValue.slice(0, 16)}:00.000Z`);
  if (Number.isNaN(asIfUtc.getTime())) return new Date(NaN);
  const offsetAt = (instant: Date): number =>
    wallClockAsUtc(instant, timezone).getTime() - instant.getTime();
  const first = new Date(asIfUtc.getTime() - offsetAt(asIfUtc));
  return new Date(asIfUtc.getTime() - offsetAt(first));
}
