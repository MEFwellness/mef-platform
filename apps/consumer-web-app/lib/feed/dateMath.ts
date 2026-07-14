/**
 * Plain YYYY-MM-DD date arithmetic shared by the coaching memory/continuity
 * modules (memory.ts, streakIntelligence.ts, adaptiveDifficulty.ts). All of
 * this app's "local date" values (DailyCheckin.local_date,
 * DailyFeedItem.local_date) are already resolved to a member's local
 * calendar day elsewhere (see app/actions/checkin.ts's resolveLocalDate) —
 * these helpers only ever compare/shift those plain date strings, never a
 * timezone-aware instant, so parsing as UTC midnight is safe and avoids
 * DST edge cases entirely.
 */

export function addDaysToLocalDate(localDate: string, days: number): string {
  const date = new Date(`${localDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Whole calendar days from `fromDate` to `toDate` (positive when `toDate` is later). */
export function daysBetweenLocalDates(fromDate: string, toDate: string): number {
  const from = new Date(`${fromDate}T00:00:00Z`).getTime();
  const to = new Date(`${toDate}T00:00:00Z`).getTime();
  return Math.round((to - from) / 86_400_000);
}
