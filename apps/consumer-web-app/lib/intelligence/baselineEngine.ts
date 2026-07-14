/**
 * The "since_baseline" / "since_reassessment" analysis windows (section 1)
 * — wraps lib/onboarding/comparison.ts's own buildComparison /
 * buildProgressSummary (already real, already tested in
 * tests/onboarding-comparison.test.ts) into WellnessInsightDraft rows,
 * rather than re-deriving a baseline-vs-latest comparison a second way.
 */

import type { ComparisonMetric, ProgressSummary } from '../onboarding/comparison';
import { areaLabel } from './copy';
import type { WellnessInsightDraft } from './types';
import type { WellnessTrendState } from '@mef/shared-types-contracts';

function directionToTrendState(metric: ComparisonMetric): WellnessTrendState {
  if (metric.direction === 'improved') return 'improving';
  if (metric.direction === 'declined') return 'declining';
  const status = metric.latest?.status;
  return status === 'poor' || status === 'attention' ? 'recurring_pattern' : 'stable';
}

function draftFromComparisonMetric(
  metric: ComparisonMetric,
  baselineSubmissionId: string,
  latestSubmissionId: string,
  polarity: 'improvement' | 'concern'
): WellnessInsightDraft {
  const label = areaLabel(metric.key);
  const trendState = directionToTrendState(metric);
  const evidenceRefs = [
    { type: 'onboarding_submission', id: baselineSubmissionId, note: 'baseline' },
    { type: 'onboarding_submission', id: latestSubmissionId, note: 'latest reassessment' },
  ];

  if (polarity === 'improvement') {
    return {
      insightType: 'trend',
      wellnessArea: metric.key,
      trendState,
      trendStrength: 'moderate',
      patternKey: `since_baseline_${metric.key}`,
      title: `${label} has improved since your baseline`,
      memberSummary: `${label} has moved from ${metric.baseline?.displayValue} to ${metric.latest?.displayValue} since you first joined — real progress.`,
      coachDetail: `${label}: baseline ${metric.baseline?.status} (${metric.baseline?.displayValue}) -> latest ${metric.latest?.status} (${metric.latest?.displayValue}).`,
      confidence: 0.8,
      severity: 'info',
      timeWindow: 'since_baseline',
      evidenceRefs,
      reasoningCodes: [`SINCE_BASELINE_IMPROVED_${metric.key.toUpperCase()}`],
      recommendedCoachingResponse: 'Acknowledge this as a milestone since baseline.',
      recommendedCoachAction: null,
      memberVisible: true,
    };
  }

  return {
    insightType: 'trend',
    wellnessArea: metric.key,
    trendState,
    trendStrength: 'moderate',
    patternKey: `since_baseline_${metric.key}`,
    title: `${label} still needs attention since your baseline`,
    memberSummary: `${label} remains a priority area — it was ${metric.baseline?.displayValue} at baseline and is ${metric.latest?.displayValue} now.`,
    coachDetail: `${label}: baseline ${metric.baseline?.status} (${metric.baseline?.displayValue}) -> latest ${metric.latest?.status} (${metric.latest?.displayValue}), direction: ${metric.direction}.`,
    confidence: 0.75,
    severity: 'notable',
    timeWindow: 'since_reassessment',
    evidenceRefs,
    reasoningCodes: [`SINCE_BASELINE_ATTENTION_${metric.key.toUpperCase()}`],
    recommendedCoachingResponse: `Keep ${label.toLowerCase()} coaching gentle and specific.`,
    recommendedCoachAction: `Worth reviewing ${label.toLowerCase()} directly against the original baseline goals.`,
    memberVisible: true,
  };
}

/** Returns [] when there's no reassessment yet — nothing to compare, not a fabricated "insufficient data" claim. */
export function sinceBaselineInsights(
  summary: ProgressSummary,
  baselineSubmissionId: string | null,
  latestSubmissionId: string | null
): WellnessInsightDraft[] {
  if (!baselineSubmissionId || !latestSubmissionId) return [];

  const drafts: WellnessInsightDraft[] = [];
  if (summary.biggestImprovement) {
    drafts.push(
      draftFromComparisonMetric(
        summary.biggestImprovement,
        baselineSubmissionId,
        latestSubmissionId,
        'improvement'
      )
    );
  }
  if (summary.needsAttention) {
    drafts.push(
      draftFromComparisonMetric(
        summary.needsAttention,
        baselineSubmissionId,
        latestSubmissionId,
        'concern'
      )
    );
  }
  return drafts;
}
