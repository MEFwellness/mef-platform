/**
 * Correlation Engine — turns two independent day -> value series into
 * paired observation arrays at a given lag. Pure, no I/O.
 *
 * "Pair only days where both values genuinely exist. Never interpolate,
 * never carry a value forward" (requirement 7): a pair is only ever
 * formed from two real recorded values on the two exact calendar dates
 * the lag calls for — a missing day breaks the pair, it never falls back
 * to the nearest other day.
 */

import type { DailySeries } from './types';

/** Calendar-day arithmetic on a 'YYYY-MM-DD' string — parsed as UTC noon purely to avoid month/DST edge cases in the offset math; no timezone semantics are implied, this is pure calendar-date bookkeeping over already-resolved local_date strings. */
export function addDays(localDate: string, days: number): string {
  const date = new Date(`${localDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export type PairedObservations = {
  outcome: number[];
  driver: number[];
  /** The driver-side date of each pair, oldest first — what span/split-window math (evidence.ts) walks. */
  dates: string[];
};

/**
 * Same-day pairing: outcome[d] with driver[d], for every date d present in
 * both series.
 */
export function pairSameDay(outcomeSeries: DailySeries, driverSeries: DailySeries): PairedObservations {
  const outcome: number[] = [];
  const driver: number[] = [];
  const dates: string[] = [];

  const sortedDates = [...driverSeries.keys()].sort();
  for (const date of sortedDates) {
    const outcomeValue = outcomeSeries.get(date);
    const driverValue = driverSeries.get(date);
    if (outcomeValue === undefined || driverValue === undefined) continue;
    outcome.push(outcomeValue);
    driver.push(driverValue);
    dates.push(date);
  }
  return { outcome, driver, dates };
}

/**
 * Next-day pairing: driver[d] with outcome[d+1], for every date d whose
 * exact calendar-next day also has a real outcome value — a gap on either
 * side (she skipped a check-in, or d+1 simply isn't in the series) breaks
 * that one pair, not the whole series.
 */
export function pairNextDay(outcomeSeries: DailySeries, driverSeries: DailySeries): PairedObservations {
  const outcome: number[] = [];
  const driver: number[] = [];
  const dates: string[] = [];

  const sortedDriverDates = [...driverSeries.keys()].sort();
  for (const date of sortedDriverDates) {
    const nextDate = addDays(date, 1);
    const outcomeValue = outcomeSeries.get(nextDate);
    const driverValue = driverSeries.get(date);
    if (outcomeValue === undefined || driverValue === undefined) continue;
    outcome.push(outcomeValue);
    driver.push(driverValue);
    dates.push(date);
  }
  return { outcome, driver, dates };
}

/** Elapsed calendar days between the earliest and latest paired observation — `dates` must already be sorted ascending (both pairSameDay/pairNextDay produce it that way). */
export function spanDays(dates: string[]): number {
  if (dates.length < 2) return 0;
  const first = new Date(`${dates[0]}T12:00:00Z`).getTime();
  const last = new Date(`${dates[dates.length - 1]}T12:00:00Z`).getTime();
  return Math.round((last - first) / (24 * 60 * 60 * 1000));
}

/**
 * Splits paired observations into two halves by date order (not by
 * observation count) — the first half is everything up to and including
 * the midpoint date, the second half everything after. Used by
 * evidence.ts's split-window stability check (requirement 5).
 */
export function splitInHalf(paired: PairedObservations): [PairedObservations, PairedObservations] {
  const n = paired.dates.length;
  const mid = Math.floor(n / 2);
  return [
    { outcome: paired.outcome.slice(0, mid), driver: paired.driver.slice(0, mid), dates: paired.dates.slice(0, mid) },
    { outcome: paired.outcome.slice(mid), driver: paired.driver.slice(mid), dates: paired.dates.slice(mid) },
  ];
}
