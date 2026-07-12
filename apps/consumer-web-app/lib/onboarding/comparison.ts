/**
 * Baseline-vs-latest-reassessment comparison across the 8 metrics used
 * throughout this app (WellnessMetricKey, from lib/wellness/wellness-
 * index.ts) — reuses that exact key set and label map, and reuses status.ts's
 * classifiers wherever the onboarding question's scale genuinely matches
 * the daily check-in's (sleep/stress/energy/digestion all use the same 1-5
 * scale in both places by design).
 *
 * Two of the 8 — mood and hydration — are never collected by the
 * onboarding assessment at all (no such question exists; see
 * supabase/seed/01_onboarding_questions.sql). Rather than inventing a
 * number for them, they resolve to null on both sides and the UI shows
 * them as not tracked by this assessment. Pain and movement ARE collected,
 * but as a different shape than the daily check-in (a list of body areas,
 * and a weekly-frequency bucket, vs. a same-day 0-5 severity and an
 * activity-level enum) — real data, just not the same measurement
 * instrument, so they get their own small classifiers below instead of
 * reusing painStatus/movementStatus, which expect the check-in's shapes.
 */

import {
  stressStatus,
  energyStatus,
  sleepQualityStatus,
  digestionStatus,
  type MetricStatus,
} from '../wellness/status';
import {
  SEVERITY,
  WELLNESS_METRIC_LABEL,
  type WellnessMetricKey,
} from '../wellness/wellness-index';
import { WELLNESS_COACHING } from '../wellness/coaching';
import { formatAnswerValue, type BaselineAssessment, type BaselineAnswer } from './baseline';

export type ComparisonSide = {
  status: MetricStatus;
  displayValue: string;
};

export type ComparisonMetric = {
  key: WellnessMetricKey;
  label: string;
  /** False for mood/hydration — the onboarding assessment never asks about them, so there's nothing to compare, not just missing data. */
  trackedByAssessment: boolean;
  baseline: ComparisonSide | null;
  latest: ComparisonSide | null;
  direction: 'improved' | 'declined' | 'stable' | null;
};

export const COMPARISON_METRIC_ORDER: WellnessMetricKey[] = [
  'sleep',
  'stress',
  'energy',
  'mood',
  'hydration',
  'digestion',
  'pain',
  'movement',
];

const TRACKED_METRICS = new Set<WellnessMetricKey>([
  'sleep',
  'stress',
  'energy',
  'digestion',
  'pain',
  'movement',
]);

function findAnswer(
  assessment: BaselineAssessment | null,
  questionKey: string
): BaselineAnswer | undefined {
  return assessment?.answers.find((a) => a.questionKey === questionKey);
}

/** baseline_movement_frequency is a weekly-frequency enum ('0'..'5+'), not the check-in's today-only activity level — its own classifier, same 3-tier vocabulary. */
function movementFrequencyStatus(value: string): MetricStatus {
  if (value === '5+' || value === '3-4') return 'good';
  if (value === '1-2') return 'attention';
  return 'poor'; // '0'
}

/** baseline_pain_areas is a list of body areas, not a 0-5 severity — the real, honest measure here is how many areas were selected. */
function painAreaCountStatus(count: number): MetricStatus {
  if (count === 0) return 'good';
  if (count <= 2) return 'attention';
  return 'poor';
}

function extractSide(
  assessment: BaselineAssessment | null,
  key: WellnessMetricKey
): ComparisonSide | null {
  if (!assessment) return null;

  switch (key) {
    case 'sleep': {
      const a = findAnswer(assessment, 'baseline_sleep_quality');
      if (!a || typeof a.value !== 'number') return null;
      return { status: sleepQualityStatus(a.value), displayValue: formatAnswerValue(a) };
    }
    case 'stress': {
      const a = findAnswer(assessment, 'baseline_stress_level');
      if (!a || typeof a.value !== 'number') return null;
      return { status: stressStatus(a.value), displayValue: formatAnswerValue(a) };
    }
    case 'energy': {
      const a = findAnswer(assessment, 'baseline_energy_level');
      if (!a || typeof a.value !== 'number') return null;
      return { status: energyStatus(a.value), displayValue: formatAnswerValue(a) };
    }
    case 'digestion': {
      const a = findAnswer(assessment, 'baseline_digestion');
      if (!a || typeof a.value !== 'number') return null;
      return { status: digestionStatus(a.value), displayValue: formatAnswerValue(a) };
    }
    case 'movement': {
      const a = findAnswer(assessment, 'baseline_movement_frequency');
      if (!a || typeof a.value !== 'string') return null;
      return {
        status: movementFrequencyStatus(a.value),
        displayValue: `${a.value} days/week`,
      };
    }
    case 'pain': {
      const a = findAnswer(assessment, 'baseline_pain_areas');
      if (!a || !Array.isArray(a.value)) return null;
      const areas = a.value.filter((v) => v !== 'none');
      return {
        status: painAreaCountStatus(areas.length),
        displayValue: areas.length === 0 ? 'None' : formatAnswerValue(a),
      };
    }
    case 'mood':
    case 'hydration':
      return null;
    default:
      return null;
  }
}

export function buildComparison(
  baseline: BaselineAssessment | null,
  latest: BaselineAssessment | null
): ComparisonMetric[] {
  return COMPARISON_METRIC_ORDER.map((key) => {
    const baselineSide = extractSide(baseline, key);
    const latestSide = extractSide(latest, key);

    let direction: ComparisonMetric['direction'] = null;
    if (baselineSide && latestSide) {
      const delta = SEVERITY[latestSide.status] - SEVERITY[baselineSide.status];
      direction = delta > 0 ? 'improved' : delta < 0 ? 'declined' : 'stable';
    }

    return {
      key,
      label: WELLNESS_METRIC_LABEL[key],
      trackedByAssessment: TRACKED_METRICS.has(key),
      baseline: baselineSide,
      latest: latestSide,
      direction,
    };
  });
}

export type ProgressSummary = {
  biggestImprovement: ComparisonMetric | null;
  needsAttention: ComparisonMetric | null;
  stableAreas: ComparisonMetric[];
  suggestedFocusAction: string | null;
};

/** Pure summary over already-computed comparison rows — every field traces back to a real stored answer, nothing here infers or diagnoses anything. */
export function buildProgressSummary(comparison: ComparisonMetric[]): ProgressSummary {
  const comparable = comparison.filter((m) => m.baseline && m.latest);

  const improvements = comparable.filter((m) => m.direction === 'improved');
  const biggestImprovement =
    improvements.length > 0
      ? improvements.reduce((best, m) => {
          const bestDelta = SEVERITY[best.latest!.status] - SEVERITY[best.baseline!.status];
          const delta = SEVERITY[m.latest!.status] - SEVERITY[m.baseline!.status];
          return delta > bestDelta ? m : best;
        })
      : null;

  const attentionCandidates = comparable
    .filter((m) => m.latest!.status === 'poor' || m.latest!.status === 'attention')
    .sort((a, b) => SEVERITY[a.latest!.status] - SEVERITY[b.latest!.status]);
  const needsAttention = attentionCandidates[0] ?? null;

  const stableAreas = comparable.filter((m) => m.direction === 'stable');

  const suggestedFocusAction = needsAttention
    ? WELLNESS_COACHING[needsAttention.key].priorityAction
    : null;

  return { biggestImprovement, needsAttention, stableAreas, suggestedFocusAction };
}
