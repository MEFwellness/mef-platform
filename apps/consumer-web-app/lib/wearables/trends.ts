/**
 * Wearable trend detection — pure functions over real WearableDailyMetric
 * history (oldest-first, per lib/wearables/data.ts's
 * listWearableMetricHistory contract), same discipline as
 * lib/feed/streakIntelligence.ts and lib/brain/riskEngine.ts: no database
 * access, no fabricated thresholds beyond what's documented inline,
 * reused identically by the sync path (to decide which AiEvents to emit)
 * and the Coaching Brain (to phrase today's recovery/movement/sleep/
 * stress recommendation) so the two never diverge.
 */

import type { WearableDailyMetric } from '@mef/shared-types-contracts';

export type WearableTrend = 'declining' | 'stable' | 'improving';
export type RecoveryLevel = 'excellent' | 'good' | 'fair' | 'poor';

const TREND_WINDOW_DAYS = 3;

/**
 * "Trending downward for three days" means exactly that: the most recent
 * TREND_WINDOW_DAYS values, oldest to newest, strictly decreasing (or
 * strictly increasing for 'improving'). Fewer than 3 real values, or a
 * gap where consecutive values don't strictly move the same direction,
 * yields 'stable' — never guessed from a partial history.
 */
export function classifyTrend(history: WearableDailyMetric[]): WearableTrend | null {
  if (history.length < TREND_WINDOW_DAYS) return null;

  const recent = history.slice(-TREND_WINDOW_DAYS);
  let declining = true;
  let improving = true;

  for (let i = 1; i < recent.length; i++) {
    const prev = recent[i - 1]!.numeric_value;
    const current = recent[i]!.numeric_value;
    if (current >= prev) declining = false;
    if (current <= prev) improving = false;
  }

  if (declining) return 'declining';
  if (improving) return 'improving';
  return 'stable';
}

/** HRV (hrv_ms) history in — a real three-consecutive-day decline out, or null when there isn't enough history to say. */
export function detectHrvTrend(history: WearableDailyMetric[]): WearableTrend | null {
  return classifyTrend(history);
}

/** Sleep duration or sleep score history in — same trend classifier, named for where lib/wearables and lib/brain call it from. */
export function detectSleepTrend(history: WearableDailyMetric[]): WearableTrend | null {
  return classifyTrend(history);
}

/** Steps or active-calories history in — a real declining-activity signal out. */
export function detectActivityTrend(history: WearableDailyMetric[]): WearableTrend | null {
  return classifyTrend(history);
}

/**
 * A single day's readiness_score (0-100, the vocabulary Oura and
 * comparable providers already use) mapped to a plain-language recovery
 * level — thresholds chosen to match Oura's own published readiness
 * bands. Null input (no wearable data yet) yields null, never a guess.
 */
export function detectRecoveryLevel(readinessScore: number | null): RecoveryLevel | null {
  if (readinessScore === null) return null;
  if (readinessScore >= 85) return 'excellent';
  if (readinessScore >= 70) return 'good';
  if (readinessScore >= 50) return 'fair';
  return 'poor';
}
