/**
 * Which day of the experiment she is on, and whether it is over.
 *
 * =====================================================================
 * TWO BARE CALENDAR DAYS, SUBTRACTED. NO CLOCK IS READ HERE.
 * =====================================================================
 *
 * Both arguments are `YYYY-MM-DD` strings. `startedOn` is the day she
 * pressed START MY EXPERIMENT, and `today` is the day she is living in,
 * resolved on the SERVER from her own timezone through
 * lib/time/memberToday.ts and handed down as a prop. Nothing in this
 * file calls `new Date()` with no argument, because a component that
 * decided today for itself would decide it in UTC during the server pass
 * and in the reader's zone during the client pass, which is the standing
 * rule this app already enforces in tests/no-unpinned-dates-guard.test.ts.
 *
 * Parsed as UTC midnight on purpose: both values name a calendar day and
 * nothing else, so reading them in one fixed zone makes the subtraction
 * exact. A DST boundary inside the seven days cannot move the answer,
 * because neither operand carries a time at all.
 */

import { FPA_EXPERIMENT_DAYS, type FpaExperimentStatus } from './types';

const MS_PER_DAY = 86_400_000;

/** A bare YYYY-MM-DD as UTC midnight. NaN for anything that is not one. */
function calendarDay(day: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return NaN;
  return Date.parse(`${day}T00:00:00.000Z`);
}

/** Whole calendar days from `from` to `to`. Negative when `to` is earlier. */
export function fpaDaysBetween(from: string, to: string): number {
  const a = calendarDay(from);
  const b = calendarDay(to);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / MS_PER_DAY);
}

/**
 * The day she is on, counting the start day as day 1.
 *
 * It can exceed seven, and that is how "the seventh day has passed" is
 * known. It is never below one: a run cannot have started tomorrow, and
 * clamping is kinder than printing "Day 0 of 7" if a clock ever
 * disagreed with itself.
 */
export function fpaExperimentDayNumber(startedOn: string, today: string): number {
  return Math.max(1, fpaDaysBetween(startedOn, today) + 1);
}

/** The last calendar day of a run, which is the seventh day inclusive. */
export function fpaExperimentLastDay(startedOn: string): string {
  const start = calendarDay(startedOn);
  if (Number.isNaN(start)) return startedOn;
  return new Date(start + (FPA_EXPERIMENT_DAYS - 1) * MS_PER_DAY).toISOString().slice(0, 10);
}

/**
 * Where a run stands. `archivedAt` is the only stored half of this; the
 * rest is a question about today.
 */
export function fpaExperimentStatus(
  startedOn: string,
  today: string,
  archivedAt: string | null
): FpaExperimentStatus {
  if (archivedAt) return 'archived';
  return fpaExperimentDayNumber(startedOn, today) > FPA_EXPERIMENT_DAYS ? 'complete' : 'active';
}
