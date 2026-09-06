/**
 * The check-in history, turned into something a coach can read in a glance
 * instead of scrolling.
 *
 * The list this feeds sits on the coach's client detail page and nowhere
 * else. Nothing here reaches a member screen, and nothing here is a new
 * fact: every value is a column of a row the list under the chart already
 * prints, and the only arithmetic is calendar arithmetic.
 *
 * A DAY SHE DID NOT CHECK IN IS A GAP. This is the whole reason the series
 * is built here rather than by mapping the rows straight onto x positions.
 * Fourteen rows plotted side by side draw a continuous line whether they
 * are fourteen consecutive days or fourteen days spread over two months,
 * and a missing day silently becomes a straight line between its
 * neighbours. So the axis is real calendar days from the oldest row to the
 * newest, a day with no row carries null on every series, and each series
 * is drawn as one path per unbroken run. Zero is never substituted for
 * absent, because zero is a real answer to some of these questions.
 */

import type { DailyCheckin } from '@mef/shared-types-contracts';
import type { SleepDurationBucket } from '../daily-checkin-adaptive/sleepMath';

/**
 * The hour a sleep band is drawn at.
 *
 * sleep_duration is stored as a band, not a number, so a chart with an
 * hours axis has to place each band somewhere. These are the midpoints of
 * the bands deriveDurationBucket itself cuts (under 5, 5 to 6, 6 to 7,
 * 7 to 8, 8 and over), and the open ended bands at each end are placed
 * half an hour outside their boundary rather than pretending to a
 * precision the stored value does not have. Every label a coach reads
 * still names the BAND, never this number.
 */
export const SLEEP_BAND_HOURS: Record<SleepDurationBucket, number> = {
  '<5h': 4.5,
  '5-6h': 5.5,
  '6-7h': 6.5,
  '7-8h': 7.5,
  '8h+': 8.5,
};

/** What one calendar day contributes to the chart. Every value is null on a day with no row. */
export type CheckinSeriesPoint = {
  /** YYYY-MM-DD, her own calendar day exactly as the row stores it. */
  date: string;
  logged: boolean;
  mood: number | null;
  energy: number | null;
  stress: number | null;
  /** Where the band is drawn on the hours axis. Null when she logged no sleep band. */
  sleepHours: number | null;
  /** The band itself, which is what every label prints. */
  sleepBand: SleepDurationBucket | null;
};

/** Pure calendar arithmetic. Date.UTC, never local construction, so no zone can shift a day. */
function addDays(localDate: string, days: number): string {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + days)).toISOString().slice(0, 10);
}

/** Whole days from one calendar day to another, both plain YYYY-MM-DD. */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const a = Date.UTC(fy!, fm! - 1, fd!);
  const b = Date.UTC(ty!, tm! - 1, td!);
  return Math.round((b - a) / 86_400_000);
}

/** Guards a runaway axis if a client ever has two rows years apart. Fourteen rows is all this page fetches. */
const MAX_DAYS_ON_AXIS = 90;

/**
 * One point per calendar day between the oldest and newest row she has,
 * oldest first.
 *
 * Takes the rows exactly as getClientCheckins returns them, newest first,
 * because that is what the list under the chart is handed too.
 */
export function buildCheckinSeries(checkins: DailyCheckin[]): CheckinSeriesPoint[] {
  if (checkins.length === 0) return [];

  const byDate = new Map<string, DailyCheckin>();
  for (const checkin of checkins) {
    // Newest first, so the first row for a day wins. Rows are one per day
    // anyway; this only decides a tie that cannot happen.
    if (!byDate.has(checkin.local_date)) byDate.set(checkin.local_date, checkin);
  }

  const dates = [...byDate.keys()].sort();
  const first = dates[0]!;
  const last = dates[dates.length - 1]!;
  const span = Math.min(daysBetween(first, last), MAX_DAYS_ON_AXIS);

  const points: CheckinSeriesPoint[] = [];
  for (let offset = 0; offset <= span; offset += 1) {
    const date = addDays(first, offset);
    const checkin = byDate.get(date);
    if (!checkin) {
      points.push({
        date,
        logged: false,
        mood: null,
        energy: null,
        stress: null,
        sleepHours: null,
        sleepBand: null,
      });
      continue;
    }
    const band = checkin.sleep_duration;
    points.push({
      date,
      logged: true,
      mood: checkin.mood_level,
      energy: checkin.energy_level,
      stress: checkin.stress_level,
      sleepHours: band ? SLEEP_BAND_HOURS[band] : null,
      sleepBand: band,
    });
  }
  return points;
}

/**
 * The unbroken runs of one series, as index ranges into the points above.
 *
 * A chart draws one path per run, which is what makes a missing day a real
 * hole rather than a line passing through it. A run of one is kept, so a
 * single logged day between two blanks still shows as its own dot.
 */
export function seriesSegments(
  points: CheckinSeriesPoint[],
  read: (point: CheckinSeriesPoint) => number | null
): number[][] {
  const segments: number[][] = [];
  let current: number[] = [];
  points.forEach((point, index) => {
    if (read(point) === null) {
      if (current.length > 0) segments.push(current);
      current = [];
      return;
    }
    current.push(index);
  });
  if (current.length > 0) segments.push(current);
  return segments;
}

/**
 * How many of the last N calendar days carry a check-in.
 *
 * The window is named wherever this is printed, because "3 days so far"
 * beside "4 check-ins so far" is exactly the pair of numbers that made a
 * coach stop trusting either one.
 */
export function loggedDaysInWindow(
  checkins: DailyCheckin[],
  todayLocalDate: string,
  windowDays: number
): number {
  const earliest = addDays(todayLocalDate, -(windowDays - 1));
  const seen = new Set<string>();
  for (const checkin of checkins) {
    if (checkin.local_date >= earliest && checkin.local_date <= todayLocalDate) {
      seen.add(checkin.local_date);
    }
  }
  return seen.size;
}

/** The window every "checked in on X of the last Y days" line on this page counts over. */
export const CHECKIN_WINDOW_DAYS = 7;
