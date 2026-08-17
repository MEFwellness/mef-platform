/**
 * Correlation Engine — per-day variable catalog. Each entry is a pure
 * extractor from ONE day's already-fetched data (a DailyCheckin row, or
 * that day's wearable metric values) to a single ordinal/numeric value,
 * or null if that day has no real value for it — extractors never guess,
 * interpolate, or carry a prior day's value forward (requirement 7).
 *
 * Only variables backed by a real column today are catalogued here — see
 * migration 105's seed comment for which MEF-driver-library-v1.md drivers
 * have no daily-loggable source yet and were left out rather than faked.
 *
 * `checkin.*` keys read a single DailyCheckin row; `wearable.*` keys read
 * a same-day metric-code -> numeric_value map (one member can have
 * multiple wearable_daily_metrics rows for the same day, one per
 * metric_code — service.ts pivots that into this shape before calling in).
 */

import type { DailyCheckin } from '@mef/shared-types-contracts';
import { gatedWaterCups } from '../hydration/gate';

export type WearableDayValues = Map<string, number>;

type Extractor = (
  checkin: DailyCheckin | undefined,
  wearable: WearableDayValues | undefined
) => number | null;

const SLEEP_DURATION_SCORE: Record<string, number> = {
  '<5h': 1,
  '5-6h': 2,
  '6-7h': 3,
  '7-8h': 4,
  '8h+': 5,
};

const MOVEMENT_TODAY_SCORE: Record<string, number> = {
  none: 0,
  light: 1,
  moderate: 2,
  full_session: 3,
};

/**
 * Postgres `time` (no date) as "minutes since noon," wrapping bedtimes
 * after midnight forward past 1440 rather than treating them as
 * impossibly early — so 22:00 (1320), 23:30 (1410), and 00:30 (1470) sort
 * in the order a person would actually call "later," which is what
 * "how late you went to bed" needs to mean. Times between noon and
 * midnight need no adjustment; times between midnight and noon (an
 * unusually early bedtime, or an unusually late one past midnight) get
 * +1440. HH:MM format, per DailyCheckinInput's own comment.
 */
function bedtimeLatenessMinutes(actualBedtime: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(actualBedtime);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours > 23 || minutes > 59) return null;
  const minutesSinceMidnight = hours * 60 + minutes;
  const minutesSinceNoon = minutesSinceMidnight - 12 * 60;
  return minutesSinceNoon < 0 ? minutesSinceNoon + 1440 : minutesSinceNoon;
}

const CHECKIN_EXTRACTORS: Record<string, Extractor> = {
  'checkin.pain': (c) => c?.pain_discomfort_level ?? null,
  'checkin.energy': (c) => c?.energy_level ?? null,
  'checkin.stress': (c) => c?.stress_level ?? null,
  'checkin.sleep_quality': (c) => c?.sleep_quality ?? null,
  'checkin.digestion': (c) => c?.digestion_rating ?? null,
  'checkin.mood': (c) => c?.mood_level ?? null,
  // Conditional water tracking (migration 163). Null for a member who does
  // not track water, so no day of hers ever becomes a paired observation on
  // this variable and no hydration correlation can reach the evidence
  // gates. lib/correlation-engine/service.ts skips those pairs outright as
  // well; this is the belt to that braces, and the thing that keeps a pair
  // added later (by seed data or a coach) from slipping past.
  'checkin.hydration': (c) => gatedWaterCups(c),
  'checkin.night_wakings': (c) => c?.night_waking_count ?? null,
  'checkin.night_sweats': (c) => (c?.night_sweats == null ? null : c.night_sweats ? 1 : 0),
  'checkin.bowel_irregularity': (c) =>
    c?.bowel_movement_status == null ? null : c.bowel_movement_status === 'normal' ? 0 : 1,
  'checkin.sleep_duration_score': (c) =>
    c?.sleep_duration == null ? null : (SLEEP_DURATION_SCORE[c.sleep_duration] ?? null),
  'checkin.movement_today_score': (c) =>
    c?.movement_today == null ? null : (MOVEMENT_TODAY_SCORE[c.movement_today] ?? null),
  'checkin.bedtime_lateness': (c) =>
    c?.actual_bedtime == null ? null : bedtimeLatenessMinutes(c.actual_bedtime),
};

const WEARABLE_EXTRACTORS: Record<string, Extractor> = {
  'wearable.steps': (_c, w) => w?.get('steps') ?? null,
  'wearable.hrv': (_c, w) => w?.get('hrv_ms') ?? null,
  'wearable.sleep_duration_minutes': (_c, w) => w?.get('sleep_duration_minutes') ?? null,
  'wearable.readiness_score': (_c, w) => w?.get('readiness_score') ?? null,
};

export const VARIABLE_EXTRACTORS: Record<string, Extractor> = {
  ...CHECKIN_EXTRACTORS,
  ...WEARABLE_EXTRACTORS,
};

export function isKnownVariable(key: string): boolean {
  return key in VARIABLE_EXTRACTORS;
}

/** The wearable metric_codes a candidate-pair variable set actually needs, so service.ts only fetches history for codes in use. */
export function wearableMetricCodesFor(variableKeys: string[]): string[] {
  const codes = new Set<string>();
  for (const key of variableKeys) {
    if (key === 'wearable.steps') codes.add('steps');
    else if (key === 'wearable.hrv') codes.add('hrv_ms');
    else if (key === 'wearable.sleep_duration_minutes') codes.add('sleep_duration_minutes');
    else if (key === 'wearable.readiness_score') codes.add('readiness_score');
  }
  return [...codes];
}

/**
 * One member's full checkin + wearable history reduced to a single
 * variable's day -> value series, skipping any day where the extractor
 * returns null (no guessing, no carrying forward — requirement 7). Walks
 * the union of both sources' dates — a wearable-only variable (e.g.
 * 'wearable.steps') must not be limited to days that also happen to have
 * a check-in, and vice versa.
 */
export function extractDailySeries(
  variableKey: string,
  checkinsByDate: Map<string, DailyCheckin>,
  wearableByDate: Map<string, WearableDayValues>
): Map<string, number> {
  const extractor = VARIABLE_EXTRACTORS[variableKey];
  const series = new Map<string, number>();
  if (!extractor) return series;

  const allDates = new Set([...checkinsByDate.keys(), ...wearableByDate.keys()]);
  for (const localDate of allDates) {
    const value = extractor(checkinsByDate.get(localDate), wearableByDate.get(localDate));
    if (value !== null && Number.isFinite(value)) series.set(localDate, value);
  }
  return series;
}
