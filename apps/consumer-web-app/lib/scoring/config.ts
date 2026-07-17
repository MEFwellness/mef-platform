/**
 * Root Score System — configuration. Every weight, window length, and
 * threshold the scoring engine uses lives here so the formula can be
 * tuned without touching calculation logic or any UI component (UI
 * components only ever render a normalized RootScoreSnapshot, never these
 * constants directly). Bump SCORE_VERSION whenever a change here would
 * make an old snapshot's numbers not directly comparable to a new one.
 */

import type { ScoreDomainKey } from '@mef/shared-types-contracts';

export const SCORE_VERSION = 1;

/** Root Score reads a 30-day rolling window — long enough that one day never dominates it. */
export const ROOT_WINDOW_DAYS = 30;

/** Momentum compares the trailing 7 days against the 7 days before that. */
export const MOMENTUM_RECENT_WINDOW_DAYS = 7;
export const MOMENTUM_PRIOR_WINDOW_DAYS = 7;
/** Minimum qualifying data points required in *each* momentum window before a direction is claimed. */
export const MOMENTUM_MIN_DATA_POINTS_PER_WINDOW = 2;

/**
 * The single most important anti-gaming rule in this file: no matter how
 * much the raw 30-day composite moved since the last calculation, the
 * stored Root Score can only move this many points. Combined with the
 * rolling window itself (a single day is already diluted to ~1/30th of
 * the composite), this makes a large jump from one meal, workout, or
 * check-in structurally impossible.
 */
export const MAX_ROOT_SCORE_DAILY_CHANGE = 6;

/** Root confidence keeps climbing (independent of data coverage) as more calculations accumulate — a brand-new score is never shown as fully confident even with a perfect check-in streak. */
export const ROOT_SNAPSHOTS_FOR_FULL_HISTORY_CONFIDENCE = 5;

/** Resilience eligibility gate — see lib/scoring/resilience.ts. Real numbers only after real history. */
export const RESILIENCE_LOOKBACK_DAYS = 90;
export const RESILIENCE_MIN_HISTORY_DAYS = 45;
export const RESILIENCE_MIN_CHECKIN_COUNT = 20;
/** A "dip" is a run of at least this many consecutive days at least this many points below baseline. */
export const RESILIENCE_DIP_MIN_CONSECUTIVE_DAYS = 3;
export const RESILIENCE_DIP_THRESHOLD_POINTS = 15;
/** A dip "recovers" if, within this many days of ending, the daily composite returns within this many points of baseline. */
export const RESILIENCE_RECOVERY_WINDOW_DAYS = 14;
export const RESILIENCE_RECOVERY_THRESHOLD_POINTS = 5;
/** Need at least this many recovered dip-cycles before a real Resilience Score is shown. */
export const RESILIENCE_MIN_RECOVERED_CYCLES = 2;

export const CONFIDENCE_THRESHOLDS = {
  low: 0.25,
  moderate: 0.5,
  high: 0.75,
} as const;

/**
 * Initial weighting across the five domains the platform currently has
 * legitimate longitudinal data for. Sums to 1.0. A domain missing data
 * entirely for a given member is excluded and the remaining weights are
 * renormalized — exactly the redistribution rule lib/wellness/wellness-
 * index.ts already established for the Daily Wellness Index, applied here
 * at the rolling-window level instead of the single-day level.
 */
export const DOMAIN_WEIGHTS: Record<ScoreDomainKey, number> = {
  recovery: 0.25,
  stress: 0.2,
  nutrition: 0.2,
  movement: 0.2,
  consistency: 0.15,
};

export const DOMAIN_LABEL: Record<ScoreDomainKey, string> = {
  recovery: 'Recovery',
  stress: 'Stress Regulation',
  nutrition: 'Nutrition',
  movement: 'Movement',
  consistency: 'Consistency',
};

export const DOMAIN_ORDER: ScoreDomainKey[] = [
  'recovery',
  'stress',
  'nutrition',
  'movement',
  'consistency',
];
