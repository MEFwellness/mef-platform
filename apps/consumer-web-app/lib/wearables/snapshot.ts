/**
 * Reshapes today's active `registry_entries` (domain='wearable') into a
 * small, typed snapshot — the one place any consumer (the Coaching Brain,
 * a future UI card) reads "today's wearable numbers" from, rather than
 * each re-deriving its own lookup over RegistryEntry[]. Never queries the
 * database itself — callers already have registryEntries from
 * MemberHealthProfile / CoachingSignals gathering.
 */

import type { RegistryEntry } from '@mef/shared-types-contracts';

export type WearableDailySnapshot = {
  readinessScore: number | null;
  recoveryScore: number | null;
  sleepScore: number | null;
  sleepDurationMinutes: number | null;
  restingHeartRate: number | null;
  hrvMs: number | null;
  steps: number | null;
  stressScore: number | null;
};

function findValue(entries: RegistryEntry[], code: string): number | null {
  const entry = entries.find((e) => e.domain === 'wearable' && e.code === code);
  return entry?.numeric_value ?? null;
}

/** Null when the member has no active wearable registry entries at all — the honest empty state every consumer should render, never a zeroed-out snapshot. */
export function buildWearableSnapshot(
  registryEntries: RegistryEntry[]
): WearableDailySnapshot | null {
  const wearableEntries = registryEntries.filter((e) => e.domain === 'wearable');
  if (wearableEntries.length === 0) return null;

  return {
    readinessScore: findValue(wearableEntries, 'readiness_score'),
    recoveryScore: findValue(wearableEntries, 'recovery_score'),
    sleepScore: findValue(wearableEntries, 'sleep_score'),
    sleepDurationMinutes: findValue(wearableEntries, 'sleep_duration_minutes'),
    restingHeartRate: findValue(wearableEntries, 'resting_heart_rate'),
    hrvMs: findValue(wearableEntries, 'hrv_ms'),
    steps: findValue(wearableEntries, 'steps'),
    stressScore: findValue(wearableEntries, 'stress_score'),
  };
}
