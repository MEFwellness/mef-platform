/**
 * Daily Wellness Index — a single 0-100 score computed from real check-in
 * data, weighted by category. Nothing here is hardcoded or fabricated:
 * every input comes from an actual DailyCheckin row, and a metric that
 * wasn't logged is excluded from the average entirely (its weight is
 * redistributed across whatever was logged) rather than guessed at.
 *
 * Status color for each sub-metric reuses status.ts's classifiers
 * directly, applied to the same raw value the tracker cards use — so a
 * given stress/pain/etc. reading is never shown as one color on the
 * tracker card and a different color inside the index breakdown. The
 * numeric 0-100 score computed here exists only for weighting and for
 * ranking which metric is the day's priority/strongest area; it never
 * drives a color on its own except for the final composite score, which
 * uses the exact bands specified for the index itself.
 *
 * Architecture note (foundation for weekly/monthly index, not built
 * yet): calculateWellnessIndex() takes a plain WellnessIndexInputs value
 * bag, not a DailyCheckin — inputsFromCheckin() is the only place that
 * knows about a single day's row. A weekly/monthly version would average
 * several days into the same WellnessIndexInputs shape (or extend it)
 * and call the same calculator; nothing in the scoring/weighting logic
 * below is coupled to "today."
 */

import type { DailyCheckin } from '@mef/shared-types-contracts';
import {
  stressStatus,
  painStatus,
  sleepQualityStatus,
  sleepDurationStatus,
  waterStatus,
  moodStatus,
  digestionStatus,
  movementStatus,
  energyStatus,
  type MetricStatus,
} from './status';

export type WellnessMetricKey =
  'sleep' | 'stress' | 'energy' | 'mood' | 'hydration' | 'digestion' | 'movement' | 'pain';

/** Single source of truth for the weighting — reused by any future period-level index. */
export const WELLNESS_WEIGHTS: Record<WellnessMetricKey, number> = {
  sleep: 0.2,
  stress: 0.15,
  energy: 0.15,
  mood: 0.15,
  hydration: 0.1,
  digestion: 0.1,
  movement: 0.1,
  pain: 0.05,
};

export const WELLNESS_METRIC_LABEL: Record<WellnessMetricKey, string> = {
  sleep: 'Sleep',
  stress: 'Stress',
  energy: 'Energy',
  mood: 'Mood',
  hydration: 'Hydration',
  digestion: 'Digestion',
  movement: 'Movement',
  pain: 'Pain',
};

export type WellnessIndexInputs = {
  sleepQuality: number | null;
  sleepDuration: '<5h' | '5-6h' | '6-7h' | '7-8h' | '8h+' | null;
  stressLevel: number | null;
  energyLevel: number | null;
  moodLevel: number | null;
  waterCups: number | null;
  digestionRating: number | null;
  movementToday: 'none' | 'light' | 'moderate' | 'full_session' | null;
  painLevel: number | null;
};

/** The only place that knows how to pull index inputs out of a single day's check-in row. */
export function inputsFromCheckin(checkin: DailyCheckin | null): WellnessIndexInputs {
  return {
    sleepQuality: checkin?.sleep_quality ?? null,
    sleepDuration: checkin?.sleep_duration ?? null,
    stressLevel: checkin?.stress_level ?? null,
    energyLevel: checkin?.energy_level ?? null,
    moodLevel: checkin?.mood_level ?? null,
    waterCups: checkin?.water_cups ?? null,
    digestionRating: checkin?.digestion_rating ?? null,
    movementToday: checkin?.movement_today ?? null,
    painLevel: checkin?.pain_discomfort_level ?? null,
  };
}

function fivePointDirect(level: number | null): number | null {
  if (level === null) return null;
  return ((level - 1) / 4) * 100;
}

function fivePointInverse(level: number | null): number | null {
  if (level === null) return null;
  return ((5 - level) / 4) * 100;
}

const SLEEP_DURATION_SCORE: Record<NonNullable<WellnessIndexInputs['sleepDuration']>, number> = {
  '<5h': 10,
  '5-6h': 45,
  '6-7h': 65,
  '7-8h': 90,
  '8h+': 100,
};

const MOVEMENT_SCORE: Record<NonNullable<WellnessIndexInputs['movementToday']>, number> = {
  none: 0,
  light: 33,
  moderate: 67,
  full_session: 100,
};

function hydrationScore(cups: number | null): number | null {
  if (cups === null) return null;
  return Math.min(100, (cups / 8) * 100);
}

function painScoreOf(level: number | null): number | null {
  if (level === null) return null;
  return ((5 - level) / 5) * 100;
}

/** poor is more severe than attention, which is more severe than good. */
const SEVERITY: Record<MetricStatus, number> = { poor: 0, attention: 1, good: 2, 'no-data': 3 };
function worseOf(a: MetricStatus, b: MetricStatus): MetricStatus {
  return SEVERITY[a] <= SEVERITY[b] ? a : b;
}

/** Composite-score bands — exactly the ranges specified for the index itself. */
export function scoreToStatus(score: number): MetricStatus {
  if (score >= 70) return 'good';
  if (score >= 55) return 'attention';
  return 'poor';
}

/** Wording matches the app-wide status vocabulary: green=Healthy/On Track, gold=Needs Attention, red=Priority. */
export function scoreLabel(score: number): string {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'On Track';
  if (score >= 55) return 'Needs Attention';
  return 'Priority Focus';
}

export type WellnessMetricScore = {
  key: WellnessMetricKey;
  label: string;
  score: number; // 0-100, for weighting/ranking only
  status: MetricStatus; // from status.ts, same value the tracker cards show
};

export type WellnessIndexResult = {
  score: number;
  status: MetricStatus;
  label: string;
  metrics: WellnessMetricScore[];
  priority: WellnessMetricScore | null;
  strongest: WellnessMetricScore | null;
};

/**
 * Returns null when there's not enough real data to compute a meaningful
 * index (no check-in logged) — callers must show "Building your Daily
 * Wellness Index" in that case, never a fabricated number.
 */
export function calculateWellnessIndex(inputs: WellnessIndexInputs): WellnessIndexResult | null {
  const sleepScoreParts = [
    fivePointDirect(inputs.sleepQuality),
    inputs.sleepDuration ? SLEEP_DURATION_SCORE[inputs.sleepDuration] : null,
  ].filter((v): v is number => v !== null);
  const sleepStatus =
    inputs.sleepQuality !== null && inputs.sleepDuration !== null
      ? worseOf(sleepQualityStatus(inputs.sleepQuality), sleepDurationStatus(inputs.sleepDuration))
      : inputs.sleepQuality !== null
        ? sleepQualityStatus(inputs.sleepQuality)
        : inputs.sleepDuration !== null
          ? sleepDurationStatus(inputs.sleepDuration)
          : 'no-data';

  const candidates: {
    key: WellnessMetricKey;
    score: number | null;
    status: MetricStatus;
  }[] = [
    {
      key: 'sleep',
      score:
        sleepScoreParts.length > 0
          ? sleepScoreParts.reduce((sum, v) => sum + v, 0) / sleepScoreParts.length
          : null,
      status: sleepStatus,
    },
    {
      key: 'stress',
      score: fivePointInverse(inputs.stressLevel),
      status: stressStatus(inputs.stressLevel),
    },
    {
      key: 'energy',
      score: fivePointDirect(inputs.energyLevel),
      status: energyStatus(inputs.energyLevel),
    },
    { key: 'mood', score: fivePointDirect(inputs.moodLevel), status: moodStatus(inputs.moodLevel) },
    {
      key: 'hydration',
      score: hydrationScore(inputs.waterCups),
      status: waterStatus(inputs.waterCups),
    },
    {
      key: 'digestion',
      score: fivePointDirect(inputs.digestionRating),
      status: digestionStatus(inputs.digestionRating),
    },
    {
      key: 'movement',
      score: inputs.movementToday ? MOVEMENT_SCORE[inputs.movementToday] : null,
      status: movementStatus(inputs.movementToday),
    },
    { key: 'pain', score: painScoreOf(inputs.painLevel), status: painStatus(inputs.painLevel) },
  ];

  const available = candidates.filter(
    (m): m is { key: WellnessMetricKey; score: number; status: MetricStatus } => m.score !== null
  );

  if (available.length === 0) return null;

  const totalWeight = available.reduce((sum, m) => sum + WELLNESS_WEIGHTS[m.key], 0);
  const weightedSum = available.reduce((sum, m) => sum + m.score * WELLNESS_WEIGHTS[m.key], 0);
  const finalScore = Math.round(weightedSum / totalWeight);

  const metrics: WellnessMetricScore[] = available.map((m) => ({
    key: m.key,
    label: WELLNESS_METRIC_LABEL[m.key],
    score: Math.round(m.score),
    status: m.status,
  }));

  const sorted = [...metrics].sort((a, b) => a.score - b.score);

  return {
    score: finalScore,
    status: scoreToStatus(finalScore),
    label: scoreLabel(finalScore),
    metrics,
    priority: sorted[0] ?? null,
    strongest: sorted[sorted.length - 1] ?? null,
  };
}
