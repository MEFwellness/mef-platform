/** Pure calendar-day difference between two YYYY-MM-DD strings — UTC-safe, same pattern used throughout this app's date math (see app/dashboard/page.tsx's previousLocalDate, lib/ai/rules/facts.ts's daysBetweenLocalDates). */
export function daysBetweenLocalDates(earlierLocalDate: string, laterLocalDate: string): number {
  const [ey, em, ed] = earlierLocalDate.split('-').map(Number);
  const [ly, lm, ld] = laterLocalDate.split('-').map(Number);
  const earlierUtc = Date.UTC(ey!, em! - 1, ed!);
  const laterUtc = Date.UTC(ly!, lm! - 1, ld!);
  return Math.round((laterUtc - earlierUtc) / (1000 * 60 * 60 * 24));
}

export function localDateNDaysBefore(localDate: string, n: number): string {
  const [y, m, d] = localDate.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d! - n));
  return date.toISOString().slice(0, 10);
}
