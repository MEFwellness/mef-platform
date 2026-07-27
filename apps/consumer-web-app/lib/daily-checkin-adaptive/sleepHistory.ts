/**
 * "Pre-fill from her usual times" (sleep dial fix, task 3c) — a plain,
 * server-side computation over her own recent check-ins, read once per
 * page load. No schema added: this reads the exact same
 * actual_bedtime/actual_wake_time columns the arc has always written,
 * just aggregated across recent days rather than a single one.
 */

import {
  deriveDurationBucket,
  durationMinutes,
  parseTimeToMinutes,
  formatMinutesToTimeValue,
  typicalMinutesOfDay,
  type SleepDurationBucket,
} from './sleepMath';

/** Noon — bedtime samples (which cluster in the evening/night, sometimes past midnight) are rotated around this boundary rather than midnight, so a late bedtime and an early-morning one don't get averaged into a nonsense noon result. */
const BEDTIME_DAY_BOUNDARY_MINUTES = 12 * 60;
/** Midnight — wake samples cluster in the morning and don't straddle the wrap point, so no rotation is needed. */
const WAKE_DAY_BOUNDARY_MINUTES = 0;

export type TypicalSleepTimes = {
  bedtime: string | null;
  wakeTime: string | null;
  durationBucket: SleepDurationBucket | null;
};

/**
 * From however many recent check-in rows are available (any with a real
 * bedtime/wake pair count, older or newer), derives her typical bedtime
 * and wake time independently (a night with only one of the two logged
 * still contributes to that one side) and the duration bucket a
 * bedtime/wake pair at those two typical times would produce. Returns
 * all-null when there's no history at all — the caller is expected to
 * fall back to a sensible, clearly-not-hers default in that case, never
 * to invent a fake "typical" from zero samples.
 */
export function typicalSleepTimes(
  recentCheckins: readonly { actual_bedtime: string | null; actual_wake_time: string | null }[]
): TypicalSleepTimes {
  const bedtimeSamples = recentCheckins
    .map((c) => (c.actual_bedtime ? parseTimeToMinutes(c.actual_bedtime) : null))
    .filter((m): m is number => m !== null);
  const wakeSamples = recentCheckins
    .map((c) => (c.actual_wake_time ? parseTimeToMinutes(c.actual_wake_time) : null))
    .filter((m): m is number => m !== null);

  const typicalBedtimeMinutes = typicalMinutesOfDay(bedtimeSamples, BEDTIME_DAY_BOUNDARY_MINUTES);
  const typicalWakeMinutes = typicalMinutesOfDay(wakeSamples, WAKE_DAY_BOUNDARY_MINUTES);

  return {
    bedtime: typicalBedtimeMinutes !== null ? formatMinutesToTimeValue(typicalBedtimeMinutes) : null,
    wakeTime: typicalWakeMinutes !== null ? formatMinutesToTimeValue(typicalWakeMinutes) : null,
    durationBucket:
      typicalBedtimeMinutes !== null && typicalWakeMinutes !== null
        ? deriveDurationBucket(durationMinutes(typicalBedtimeMinutes, typicalWakeMinutes))
        : null,
  };
}
