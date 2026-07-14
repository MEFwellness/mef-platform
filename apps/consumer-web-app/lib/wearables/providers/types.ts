/**
 * The provider boundary for the Wearable Integration Layer — mirrors
 * lib/body-assessment/providers/types.ts exactly on purpose: business
 * logic (the connect/sync flow, trend detection, the Daily Coaching
 * Brief) must never import an Oura/Apple Health/Google Fit SDK directly,
 * or swapping/adding a provider becomes a rewrite instead of a config
 * change.
 *
 * Nothing in this milestone calls a real wearable API — every entry in
 * registry.ts is an UnconfiguredProvider stub. This file exists so that
 * whichever future milestone wires in a real Oura Cloud API, Apple
 * HealthKit export, or Google Fit / Health Connect integration has a
 * contract to implement rather than inventing one under deadline.
 */

import type { WearableMetricDomain, WearableMetricCode } from '@mef/shared-types-contracts';

export type WearableDailyMetricResult = {
  localDate: string;
  metricDomain: WearableMetricDomain;
  metricCode: WearableMetricCode;
  numericValue: number;
  unit: string | null;
  recordedAt: string;
  rawPayload?: Record<string, unknown>;
};

export type FetchWearableDailyMetricsRequest = {
  connectionId: string;
  memberId: string;
  /** Only metrics on or after this local date should be returned — a real provider uses this to avoid re-fetching a member's entire history on every sync. */
  sinceLocalDate: string;
};

export interface WearableProvider {
  readonly name: string;
  fetchDailyMetrics(
    request: FetchWearableDailyMetricsRequest
  ): Promise<WearableDailyMetricResult[]>;
}
