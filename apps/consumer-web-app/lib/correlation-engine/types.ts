/**
 * Correlation Engine — shared types. See ./variables.ts (the per-day
 * variable catalog), ./stats.ts (pure Spearman math), ./evidence.ts (the
 * gates), ./classify.ts (turns a gate result into a three-tier
 * LongitudinalSignal), and ./service.ts (orchestration).
 */

export type CorrelationLag = 'same_day' | 'next_day';
export type CorrelationDirection = 'positive' | 'negative';

/** A variable's value on one calendar day — never interpolated or carried forward, so a missing day is simply absent from the map, not a guessed value. */
export type DailySeries = Map<string, number>;

export type CandidatePair = {
  pairKey: string;
  driverId: string;
  outcomeVariable: string;
  driverVariable: string;
  label: string;
  weight: 'high' | 'medium';
  goalKeys: string[];
};

/** The result of testing one lag (same-day or next-day) for one pair — before the cross-lag/split-window decision in evidence.ts. */
export type LagTestResult = {
  lag: CorrelationLag;
  rho: number;
  observationCount: number;
  spanDays: number;
};

/**
 * The final, gated result for one member/pair — null when the base
 * evidence gate (requirement 4) was never met at either lag, in which
 * case the caller records an 'insufficient_data' state rather than a
 * measurement.
 */
export type CorrelationEvidence = {
  lag: CorrelationLag;
  direction: CorrelationDirection;
  rho: number;
  observationCount: number;
  spanDays: number;
  splitWindowAgreement: boolean;
};

export type CorrelationFindingRow = {
  memberId: string;
  pairKey: string;
  lag: CorrelationLag | null;
  direction: CorrelationDirection | null;
  rho: number | null;
  observationCount: number;
  spanDays: number | null;
  splitWindowAgreement: boolean;
  state: 'insufficient_data' | 'one_time_observation' | 'repeated_signal' | 'emerging_pattern' | 'established_pattern' | 'stale';
  tier: 1 | 2 | 3 | null;
  confidence: number;
  computedAt: string;
};
