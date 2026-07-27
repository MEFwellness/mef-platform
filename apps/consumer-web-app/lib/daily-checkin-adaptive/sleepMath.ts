/**
 * Pure time math shared between the sleep arc (components/checkin/SleepArc.tsx,
 * a 'use client' component) and the server-side "typical bedtime/wake"
 * pre-fill (sleepHistory.ts, read by app/checkin/page.tsx). Kept in its
 * own framework-agnostic module — no 'use client', no React — so a
 * Server Component can compute a member's typical sleep window without
 * pulling a client component into the server bundle graph.
 */

export const MINUTES_PER_DAY = 24 * 60;

export type SleepDurationBucket = '<5h' | '5-6h' | '6-7h' | '7-8h' | '8h+';

/** Derives the existing sleep_duration bucket field straight from the arc's own bedtime/wake gesture — the separate "About how many hours did you sleep?" question this replaced asked the same thing a second time. */
export function deriveDurationBucket(totalMinutes: number): SleepDurationBucket {
  const hours = totalMinutes / 60;
  if (hours < 5) return '<5h';
  if (hours < 6) return '5-6h';
  if (hours < 7) return '6-7h';
  if (hours < 8) return '7-8h';
  return '8h+';
}

/**
 * Accepts both the "HH:MM" strings this app writes and the "HH:MM:SS"
 * strings Postgres's `time` type actually round-trips as through
 * supabase-js — the original regex only matched the former, which meant
 * a real stored actual_bedtime/actual_wake_time value (always fetched as
 * "HH:MM:SS") silently failed to parse and fell back to the hardcoded
 * default. Found and fixed while building the typical-time pre-fill
 * below, which depends on parsing real stored values correctly.
 */
export function parseTimeToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

export function formatMinutesToTimeValue(totalMinutes: number): string {
  const normalized = ((totalMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function formatMinutesForDisplay(totalMinutes: number): string {
  const normalized = ((totalMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours24 = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  const period = hours24 < 12 ? 'AM' : 'PM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(minutes).padStart(2, '0')} ${period}`;
}

/** The sleep window's length in minutes, always positive — wraps past midnight when wake is numerically "before" bedtime, which is the normal case. */
export function durationMinutes(bedtime: number, wake: number): number {
  const raw = wake - bedtime;
  return raw <= 0 ? raw + MINUTES_PER_DAY : raw;
}

/** Sleep dial sanity guard (task 3b): a window over ~14h or under ~2h is almost certainly a mis-drag (two handles landed in an implausible relationship, not a real answer) rather than being blocked outright, it just gets flagged with a quiet inline note — "some people genuinely sleep oddly," per the task's own wording. Pure and directly testable without a rendering harness. */
export function isImplausibleSleepWindow(totalMinutes: number, minPlausible = 120, maxPlausible = 840): boolean {
  return totalMinutes < minPlausible || totalMinutes > maxPlausible;
}

/**
 * The median of a set of times-of-day, correctly handling wraparound —
 * a plain arithmetic mean of e.g. 23:30 and 00:30 would land on noon,
 * nonsense for "typical bedtime." `dayBoundaryMinutes` rotates the frame
 * so the values being averaged don't straddle the wrap point: bedtime
 * samples (which cluster in the evening/night) are rotated so the "day"
 * runs noon-to-noon instead of midnight-to-midnight; wake samples (which
 * cluster in the morning) don't need it but rotating by 0 is harmless.
 */
export function typicalMinutesOfDay(samples: readonly number[], dayBoundaryMinutes: number): number | null {
  if (samples.length === 0) return null;
  const rotated = samples
    .map((m) => (((m - dayBoundaryMinutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY)
    .sort((a, b) => a - b);
  const mid = Math.floor(rotated.length / 2);
  const lower = rotated[mid - 1] ?? rotated[mid] ?? 0;
  const upper = rotated[mid] ?? lower;
  const medianRotated = rotated.length % 2 === 0 ? (lower + upper) / 2 : upper;
  return Math.round(((medianRotated + dayBoundaryMinutes) % MINUTES_PER_DAY + MINUTES_PER_DAY) % MINUTES_PER_DAY);
}
