/**
 * Coaching insights — simple pattern detection over a client's real
 * check-in history. Reuses computeMetricCandidates() (the same per-metric
 * normalized scoring wellness-index.ts uses for the Daily Wellness Index
 * itself) rather than re-deriving scores from raw values a second way,
 * so "sleep's score on a given day" means exactly one thing everywhere
 * in the app.
 *
 * Two pattern types, matching what a coach actually wants to see at a
 * glance:
 *  - Trend: is this metric's recent average meaningfully different from
 *    its earlier average within the same window (declining/improving)?
 *  - Sustained: has this metric been in the "poor" band for every
 *    check-in in the recent window, regardless of trend direction (e.g.
 *    "water consistently low" even if it isn't actively getting worse)?
 *
 * Requires a minimum amount of real history before saying anything —
 * returns an empty array rather than a guess when there isn't enough
 * data, and a metric that was never logged in a given window is simply
 * excluded from that window's average, never treated as zero.
 */

import type { DailyCheckin } from '@mef/shared-types-contracts';
import {
  computeMetricCandidates,
  inputsFromCheckin,
  WELLNESS_METRIC_LABEL,
  type WellnessMetricKey,
} from './wellness-index';

export type InsightDirection = 'improving' | 'declining';
export type InsightKind = 'trend' | 'sustained';

export type WellnessInsight = {
  key: WellnessMetricKey;
  kind: InsightKind;
  direction: InsightDirection;
  message: string;
};

const MIN_CHECKINS_FOR_TREND = 4;
const SIGNIFICANT_CHANGE = 12; // points on the 0-100 normalized scale
const MIN_CHECKINS_FOR_SUSTAINED = 3;
const SUSTAINED_POOR_THRESHOLD = 40; // roughly matches status.ts's 'poor' band

const METRIC_KEYS: WellnessMetricKey[] = [
  'sleep',
  'stress',
  'energy',
  'mood',
  'hydration',
  'digestion',
  'movement',
  'pain',
];

/** Wording direct for most metrics; stress/pain get worsening/reducing language per the task's own examples. */
function trendMessage(key: WellnessMetricKey, direction: InsightDirection): string {
  if (key === 'stress') {
    return direction === 'declining'
      ? 'Stress has been increasing over recent check-ins.'
      : 'Stress has been decreasing over recent check-ins — a positive sign.';
  }
  if (key === 'pain') {
    return direction === 'declining'
      ? 'Pain has been worsening over recent check-ins.'
      : 'Pain has been easing over recent check-ins — a positive sign.';
  }
  const label = WELLNESS_METRIC_LABEL[key];
  return direction === 'declining'
    ? `${label} has been declining over recent check-ins.`
    : `${label} has been improving over recent check-ins.`;
}

function sustainedMessage(key: WellnessMetricKey): string {
  if (key === 'hydration') return 'Water intake has been consistently low across recent check-ins.';
  if (key === 'stress') return 'Stress has been consistently high across recent check-ins.';
  if (key === 'pain') return 'Pain has been consistently present across recent check-ins.';
  return `${WELLNESS_METRIC_LABEL[key]} has been consistently low across recent check-ins.`;
}

function scoresForKey(checkins: DailyCheckin[], key: WellnessMetricKey): number[] {
  return checkins
    .map((c) => computeMetricCandidates(inputsFromCheckin(c)).find((m) => m.key === key)?.score)
    .filter((v): v is number => v !== null && v !== undefined);
}

/**
 * @param checkinsOldestFirst Real check-in history, oldest first (same
 *   ordering getRecentCheckins/getClientCheckins already return after a
 *   reverse — see callers).
 */
export function detectInsights(checkinsOldestFirst: DailyCheckin[]): WellnessInsight[] {
  const insights: WellnessInsight[] = [];

  if (checkinsOldestFirst.length >= MIN_CHECKINS_FOR_TREND) {
    const mid = Math.floor(checkinsOldestFirst.length / 2);
    const earlier = checkinsOldestFirst.slice(0, mid);
    const recent = checkinsOldestFirst.slice(mid);

    for (const key of METRIC_KEYS) {
      const earlierScores = scoresForKey(earlier, key);
      const recentScores = scoresForKey(recent, key);
      if (earlierScores.length === 0 || recentScores.length === 0) continue;

      const earlierAvg = earlierScores.reduce((s, v) => s + v, 0) / earlierScores.length;
      const recentAvg = recentScores.reduce((s, v) => s + v, 0) / recentScores.length;
      const delta = recentAvg - earlierAvg;
      if (Math.abs(delta) < SIGNIFICANT_CHANGE) continue;

      const direction: InsightDirection = delta > 0 ? 'improving' : 'declining';
      insights.push({ key, kind: 'trend', direction, message: trendMessage(key, direction) });
    }
  }

  const recentWindow = checkinsOldestFirst.slice(-MIN_CHECKINS_FOR_SUSTAINED);
  if (recentWindow.length >= MIN_CHECKINS_FOR_SUSTAINED) {
    for (const key of METRIC_KEYS) {
      const scores = scoresForKey(recentWindow, key);
      if (scores.length < MIN_CHECKINS_FOR_SUSTAINED) continue;
      const allPoor = scores.every((s) => s < SUSTAINED_POOR_THRESHOLD);
      if (!allPoor) continue;
      // Don't duplicate a trend insight already covering the same metric.
      if (insights.some((i) => i.key === key && i.kind === 'trend')) continue;
      insights.push({
        key,
        kind: 'sustained',
        direction: 'declining',
        message: sustainedMessage(key),
      });
    }
  }

  return insights;
}
