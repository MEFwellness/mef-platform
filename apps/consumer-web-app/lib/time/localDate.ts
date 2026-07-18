/**
 * Same "now in the member's timezone" conversion app/actions/checkin.ts's
 * resolveLocalDate already establishes for the check-in flow — replicated
 * here (not imported from that 'use server' file) so every new
 * event-stream write agrees with the check-in flow on what "today" means
 * for a given member, without creating a cross-import between server
 * action modules.
 */
export function nowInTimezone(timezone: string): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));
}

export function toLocalDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function todaysLocalDate(timezone: string): string {
  return toLocalDateString(nowInTimezone(timezone));
}
