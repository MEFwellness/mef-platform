/**
 * Pure derivation functions that turn real member data into narrative
 * drafts — no I/O, no fabrication. Every function here reuses an
 * already-built, already-tested calculation from lib/wellness/* or
 * lib/onboarding/* rather than re-deriving a trend or score a second way
 * (same discipline as lib/ai/agents/*.ts and lib/ai/rules/facts.ts).
 *
 * Wording discipline: correlation is stated as correlation ("tends to"),
 * never causation ("stress increases because sleep drops"). A claim is
 * only ever emitted when the underlying data actually supports it — see
 * each function's minimum-sample-size guard.
 */

import type { DailyCheckin, SafetyClassification } from '@mef/shared-types-contracts';
import type { NarrativeItemDraft } from './types';
import { detectInsights } from '../wellness/insights';
import { WELLNESS_METRIC_LABEL } from '../wellness/wellness-index';
import type { ComparisonMetric, ProgressSummary } from '../onboarding/comparison';

const LOW_SLEEP_DURATIONS = new Set(['<5h', '5-6h']);
const MIN_SAMPLE_PER_BUCKET = 3;
const MEANINGFUL_STRESS_DELTA = 1; // points, on the 1-5 stress scale

/**
 * The milestone's own worked example: "your stress has increased during
 * weeks when sleep falls below six hours." A real, conservative
 * correlation check — requires at least 3 low-sleep days AND 3
 * adequate-sleep days in the given history before saying anything at
 * all, and only emits when the difference is large enough to be worth
 * mentioning (not any nonzero difference).
 */
export function deriveStressSleepPattern(
  checkinsOldestFirst: DailyCheckin[]
): NarrativeItemDraft | null {
  const lowSleepStress: number[] = [];
  const adequateSleepStress: number[] = [];

  for (const checkin of checkinsOldestFirst) {
    if (checkin.stress_level === null || checkin.sleep_duration === null) continue;
    if (LOW_SLEEP_DURATIONS.has(checkin.sleep_duration)) {
      lowSleepStress.push(checkin.stress_level);
    } else {
      adequateSleepStress.push(checkin.stress_level);
    }
  }

  if (
    lowSleepStress.length < MIN_SAMPLE_PER_BUCKET ||
    adequateSleepStress.length < MIN_SAMPLE_PER_BUCKET
  ) {
    return null;
  }

  const avg = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
  const lowSleepAvg = avg(lowSleepStress);
  const adequateSleepAvg = avg(adequateSleepStress);
  const delta = lowSleepAvg - adequateSleepAvg;

  if (delta < MEANINGFUL_STRESS_DELTA) return null;

  return {
    category: 'recurring_patterns',
    title: 'Stress tends to rise on lower-sleep days',
    summary: `On days with less than 6 hours of sleep, stress has averaged ${lowSleepAvg.toFixed(1)}/5, compared to ${adequateSleepAvg.toFixed(1)}/5 on days with more sleep. This is a pattern worth watching, not a guaranteed cause.`,
    provenance: 'inferred',
    confidence: Math.min(0.5 + (lowSleepStress.length + adequateSleepStress.length) / 40, 0.85),
    memberVisible: true,
    sourceRefs: [
      {
        type: 'daily_checkin_range',
        id: `${checkinsOldestFirst[0]?.id ?? ''}..${checkinsOldestFirst[checkinsOldestFirst.length - 1]?.id ?? ''}`,
      },
    ],
  };
}

const MIN_TREND_SAMPLE = 4;

/** Turns detectInsights()'s real trend/sustained findings into recurring_patterns / recent_changes narrative drafts — never a second, independently-derived trend signal. */
export function deriveFromWellnessInsights(
  checkinsOldestFirst: DailyCheckin[]
): NarrativeItemDraft[] {
  if (checkinsOldestFirst.length < MIN_TREND_SAMPLE) return [];

  const insights = detectInsights(checkinsOldestFirst);
  const latestIds = checkinsOldestFirst.slice(-MIN_TREND_SAMPLE).map((c) => c.id);

  return insights.map((insight) => ({
    category: insight.kind === 'sustained' ? 'recurring_patterns' : 'recent_changes',
    title: `${WELLNESS_METRIC_LABEL[insight.key]} ${insight.kind === 'sustained' ? 'has been a sustained concern' : `is ${insight.direction}`}`,
    summary: insight.message,
    provenance: 'system_observed',
    confidence: insight.kind === 'sustained' ? 0.75 : 0.6,
    memberVisible: true,
    sourceRefs: latestIds.map((id) => ({ type: 'daily_checkin', id })),
  }));
}

/** Reuses buildComparison/buildProgressSummary's output directly — a progress_trends/unresolved_concerns narrative item is only ever created for a metric that computation already decided was the biggest mover. */
export function deriveFromProgressComparison(
  summary: ProgressSummary,
  baselineSubmissionId: string | null,
  latestSubmissionId: string | null
): NarrativeItemDraft[] {
  const drafts: NarrativeItemDraft[] = [];
  const refs = [
    ...(baselineSubmissionId ? [{ type: 'onboarding_submission', id: baselineSubmissionId }] : []),
    ...(latestSubmissionId ? [{ type: 'onboarding_submission', id: latestSubmissionId }] : []),
  ];

  if (summary.biggestImprovement) {
    const m: ComparisonMetric = summary.biggestImprovement;
    drafts.push({
      category: 'successful_interventions',
      title: `${m.label} has improved since baseline`,
      summary: `${m.label} moved from ${m.baseline?.displayValue} to ${m.latest?.displayValue} between your baseline and most recent reassessment.`,
      provenance: 'system_observed',
      confidence: 0.8,
      memberVisible: true,
      sourceRefs: refs,
    });
  }

  if (summary.needsAttention) {
    const m: ComparisonMetric = summary.needsAttention;
    drafts.push({
      category: 'unresolved_concerns',
      title: `${m.label} still needs attention`,
      summary: `${m.label} was ${m.latest?.displayValue} at your most recent reassessment and remains a priority area.`,
      provenance: 'system_observed',
      confidence: 0.75,
      memberVisible: true,
      sourceRefs: refs,
    });
  }

  return drafts;
}

const RESTRICTION_LEVELS = new Set(['coach_review_required', 'safety_response_only']);

/** An 'active_restrictions' item — honest, non-alarming, always member-visible since the underlying message was already shown to the member directly (Milestone 1). Only created for classifications that actually restrict something. */
export function deriveFromSafetyClassification(
  classification: Pick<
    SafetyClassification,
    'id' | 'classification_level' | 'restricted_topics' | 'created_at'
  >
): NarrativeItemDraft | null {
  if (!RESTRICTION_LEVELS.has(classification.classification_level)) return null;
  if (classification.restricted_topics.length === 0) return null;

  const topics = classification.restricted_topics.join(', ');
  return {
    category: 'active_restrictions',
    title: `Coaching is currently limited on: ${topics}`,
    summary: `Personalized coaching on ${topics} is paused until your coach has reviewed it — everything else in your coaching experience continues as normal.`,
    provenance: 'system_observed',
    confidence: 1,
    memberVisible: true,
    sourceRefs: [{ type: 'safety_classification', id: classification.id }],
  };
}

const STREAK_MILESTONES = [7, 14, 30, 60, 90, 180, 365];

/** A recent_wins item for a genuine streak milestone — reuses the same milestone list lib/ai/agents/accountability.ts checks against, so the narrative never celebrates a number the accountability agent itself wouldn't. */
export function deriveStreakWin(
  streak: number,
  latestCheckinId: string | null
): NarrativeItemDraft | null {
  if (!STREAK_MILESTONES.includes(streak)) return null;

  return {
    category: 'recent_wins',
    title: `${streak}-day check-in streak`,
    summary: `${streak} consecutive days of check-ins — real, consistent follow-through worth recognizing.`,
    provenance: 'system_observed',
    confidence: 1,
    memberVisible: true,
    sourceRefs: latestCheckinId ? [{ type: 'daily_checkin', id: latestCheckinId }] : [],
  };
}

/**
 * AI Body Assessment Framework — deterministic bookkeeping only, same
 * discipline as every other function in this file: this never interprets
 * what a finding means (that's a future dedicated posture/movement
 * provider's job), it only records that an assessment happened and how
 * many findings are awaiting review. Title is stable per assessment
 * (dedup key), the finding count lives in `summary` so it can vary run to
 * run without creating a duplicate item.
 */
export function deriveFromBodyAssessment(
  assessmentId: string,
  assessmentTypeLabel: string,
  findingsCount: number
): NarrativeItemDraft | null {
  if (findingsCount <= 0) return null;

  return {
    category: 'recent_changes',
    title: `Completed a ${assessmentTypeLabel} assessment`,
    summary: `A ${assessmentTypeLabel} assessment produced ${findingsCount} finding${findingsCount === 1 ? '' : 's'} awaiting coach review.`,
    provenance: 'system_observed',
    confidence: 1,
    memberVisible: true,
    sourceRefs: [{ type: 'body_assessment', id: assessmentId }],
  };
}
