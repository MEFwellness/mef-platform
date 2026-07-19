/**
 * Wellness Profile — 15 named coaching-model dimensions (never diagnoses),
 * each a plain-language rollup of data the Personal Wellness Intelligence
 * Engine / MEF Intelligence Engine / Coaching Brain / Daily Feed already
 * computed. No dimension here re-derives a metric trend from raw
 * check-ins; every one reads LongitudinalTrend, MemberSummary, Coaching
 * Priorities, StreakInsight, or AdherenceInfo that
 * lib/intelligence-engine/profile.ts already gathered.
 *
 * `nutrition_consistency` is a documented proxy: this app doesn't yet
 * collect dedicated nutrition-tracking data (see the milestone's "FUTURE
 * READY" nutrition-tracking integration point), so it reads the check-in's
 * digestion rating, the closest real signal currently collected — the
 * rationale text always says so explicitly rather than silently
 * pretending it's true nutrition data.
 */

import type { WellnessMetricKey } from '../wellness/wellness-index';
import type {
  LongitudinalTrend,
  MemberHealthProfile,
  MemberIntelligenceReport,
} from '../intelligence-engine/types';
import { areaLabel } from '../intelligence/copy';
import { confidenceFromSample } from '../intelligence/confidence';
import type { CoachingStyleComputation, WellnessDimensionComputation } from './types';
import type { WellnessProfileLevel } from '@mef/shared-types-contracts';

function levelFromScore(score: number | null): WellnessProfileLevel {
  if (score === null) return 'insufficient_data';
  if (score >= 85) return 'very_high';
  if (score >= 70) return 'high';
  if (score >= 55) return 'moderate';
  if (score >= 35) return 'low';
  return 'very_low';
}

const WINDOW_PREFERENCE: {
  window: LongitudinalTrend['points'][number]['window'];
  minSample: number;
}[] = [
  { window: 'last_30_days', minSample: 10 },
  { window: 'last_14_days', minSample: 6 },
  { window: 'last_7_days', minSample: 4 },
];

function bestPoint(trend: LongitudinalTrend | undefined) {
  if (!trend) return null;
  for (const { window, minSample } of WINDOW_PREFERENCE) {
    const point = trend.points.find((p) => p.window === window);
    if (point && point.averageScore !== null && point.sampleSize >= minSample) {
      return { point, trend };
    }
  }
  return null;
}

function dimensionFromArea(
  dimension: WellnessDimensionComputation['dimension'],
  trends: LongitudinalTrend[],
  area: WellnessMetricKey,
  describe: (label: string, score: number, direction: string) => string,
  proxyNote?: string
): WellnessDimensionComputation {
  const trend = trends.find((t) => t.area === area);
  const best = bestPoint(trend);

  if (!best) {
    return {
      dimension,
      level: 'insufficient_data',
      score: null,
      confidence: 0,
      trendDirection: 'insufficient_data',
      evidenceCount: 0,
      rationale: `Not enough ${areaLabel(area).toLowerCase()} check-ins yet to compute this dimension.${proxyNote ? ` ${proxyNote}` : ''}`,
      contributingEvidence: [],
    };
  }

  const score = Math.round(best.point.averageScore!);
  return {
    dimension,
    level: levelFromScore(score),
    score,
    confidence: best.trend.confidence,
    trendDirection:
      best.trend.direction === 'insufficient_data' ? 'insufficient_data' : best.trend.direction,
    evidenceCount: best.point.sampleSize,
    rationale: `${describe(areaLabel(area), score, best.trend.direction)}${proxyNote ? ` ${proxyNote}` : ''}`,
    contributingEvidence: best.trend.evidenceRefs,
  };
}

function averageDimension(
  dimension: WellnessDimensionComputation['dimension'],
  trends: LongitudinalTrend[],
  areas: WellnessMetricKey[],
  describe: (score: number) => string
): WellnessDimensionComputation {
  const points = areas
    .map((area) => bestPoint(trends.find((t) => t.area === area)))
    .filter((p) => p !== null);
  if (points.length === 0) {
    return {
      dimension,
      level: 'insufficient_data',
      score: null,
      confidence: 0,
      trendDirection: 'insufficient_data',
      evidenceCount: 0,
      rationale: `Not enough data yet across ${areas.map(areaLabel).join(' and ')} to compute this dimension.`,
      contributingEvidence: [],
    };
  }
  const score = Math.round(
    points.reduce((sum, p) => sum + p!.point.averageScore!, 0) / points.length
  );
  const avgConfidence = points.reduce((sum, p) => sum + p!.trend.confidence, 0) / points.length;
  const evidenceCount = points.reduce((sum, p) => sum + p!.point.sampleSize, 0);
  const directions = new Set(points.map((p) => p!.trend.direction));
  const trendDirection = directions.size === 1 ? points[0]!.trend.direction : 'stable';

  return {
    dimension,
    level: levelFromScore(score),
    score,
    confidence: avgConfidence,
    trendDirection,
    evidenceCount,
    rationale: describe(score),
    contributingEvidence: points.flatMap((p) => p!.trend.evidenceRefs),
  };
}

function lifestyleConsistencyDimension(profile: MemberHealthProfile): WellnessDimensionComputation {
  const { adherence } = profile;
  if (adherence.rate === null) {
    return {
      dimension: 'lifestyle_consistency',
      level: 'insufficient_data',
      score: null,
      confidence: 0,
      trendDirection: 'insufficient_data',
      evidenceCount: adherence.sampleSize,
      rationale: 'Not enough recent daily coaching history yet to compute lifestyle consistency.',
      contributingEvidence: [],
    };
  }
  const score = Math.round(adherence.rate * 100);
  return {
    dimension: 'lifestyle_consistency',
    level: levelFromScore(score),
    score,
    confidence: confidenceFromSample(adherence.sampleSize, 0.5, 14, 0.85),
    trendDirection:
      adherence.level === 'high' ? 'improving' : adherence.level === 'low' ? 'declining' : 'stable',
    evidenceCount: adherence.sampleSize,
    rationale: `Completed ${score}% of daily coaching actions over the last ${adherence.sampleSize} days (adherence level: ${adherence.level}).`,
    contributingEvidence: [{ type: 'daily_feed_history', id: 'adherence_window' }],
  };
}

function habitReliabilityDimension(profile: MemberHealthProfile): WellnessDimensionComputation {
  const { streak, adherence } = profile;
  if (streak.longestStreak === 0) {
    return {
      dimension: 'habit_reliability',
      level: 'insufficient_data',
      score: null,
      confidence: 0,
      trendDirection: 'insufficient_data',
      evidenceCount: 0,
      rationale: 'No check-in history yet to compute habit reliability.',
      contributingEvidence: [],
    };
  }
  const momentumRatio = streak.currentStreak / streak.longestStreak;
  const adherencePart = adherence.rate ?? momentumRatio;
  const score = Math.round(((momentumRatio + adherencePart) / 2) * 100);
  return {
    dimension: 'habit_reliability',
    level: levelFromScore(score),
    score,
    confidence: confidenceFromSample(streak.longestStreak, 0.5, 20, 0.85),
    trendDirection: streak.isLongestInWindow
      ? 'improving'
      : momentumRatio < 0.5
        ? 'declining'
        : 'stable',
    evidenceCount: streak.longestStreak,
    rationale: `Current check-in streak is ${streak.currentStreak} day(s) vs. a longest streak of ${streak.longestStreak}.`,
    contributingEvidence: [{ type: 'checkin_streak', id: 'current_vs_longest' }],
  };
}

function motivationProfileDimension(
  profile: MemberHealthProfile,
  report: MemberIntelligenceReport
): WellnessDimensionComputation {
  const { adherence, streak } = profile;
  const momentumRatio =
    streak.longestStreak > 0 ? streak.currentStreak / streak.longestStreak : null;
  const parts = [adherence.rate, momentumRatio].filter((v): v is number => v !== null);
  const score =
    parts.length > 0 ? Math.round((parts.reduce((s, v) => s + v, 0) / parts.length) * 100) : null;

  return {
    dimension: 'motivation_profile',
    level: levelFromScore(score),
    score,
    confidence: score !== null ? confidenceFromSample(adherence.sampleSize, 0.5, 20, 0.8) : 0,
    trendDirection:
      report.memberSummary.wellnessTrajectory === 'improving'
        ? 'improving'
        : report.memberSummary.wellnessTrajectory === 'declining'
          ? 'declining'
          : score !== null
            ? 'stable'
            : 'insufficient_data',
    evidenceCount: adherence.sampleSize,
    rationale: report.memberSummary.currentMotivation,
    contributingEvidence: [{ type: 'member_summary', id: 'current_motivation' }],
  };
}

/** Aggregates the already-classified per-area directions (never re-derives one) into a net momentum score — distinct from motivation_profile (which reads adherence/streak): this one asks "across everything being tracked, is the overall balance right now improving or declining." */
function behaviorChangeMomentumDimension(
  report: MemberIntelligenceReport
): WellnessDimensionComputation {
  const classified = report.longitudinalTrends.filter((t) => t.direction !== 'insufficient_data');
  if (classified.length === 0) {
    return {
      dimension: 'behavior_change_momentum',
      level: 'insufficient_data',
      score: null,
      confidence: 0,
      trendDirection: 'insufficient_data',
      evidenceCount: 0,
      rationale: 'Not enough classified trends yet to gauge overall momentum.',
      contributingEvidence: [],
    };
  }

  const improving = classified.filter((t) => t.direction === 'improving').length;
  const declining = classified.filter((t) => t.direction === 'declining').length;
  const net = improving - declining;
  const score = Math.max(0, Math.min(100, 50 + net * 12));
  const trendDirection: WellnessDimensionComputation['trendDirection'] =
    net > 0 ? 'improving' : net < 0 ? 'declining' : 'stable';
  const confidence = classified.reduce((sum, t) => sum + t.confidence, 0) / classified.length;

  return {
    dimension: 'behavior_change_momentum',
    level: levelFromScore(score),
    score,
    confidence,
    trendDirection,
    evidenceCount: classified.length,
    rationale: `${improving} area${improving === 1 ? '' : 's'} improving vs. ${declining} declining across the wellness metrics currently being tracked.`,
    contributingEvidence: classified.flatMap((t) => t.evidenceRefs),
  };
}

const ATTENTION_TO_RISK_SCORE: Record<
  MemberIntelligenceReport['priorities']['recommendedCoachAttentionLevel'],
  number
> = {
  none: 90,
  monitor: 70,
  discuss: 45,
  priority: 20,
};

function riskAwarenessDimension(report: MemberIntelligenceReport): WellnessDimensionComputation {
  const level = report.priorities.recommendedCoachAttentionLevel;
  const score = ATTENTION_TO_RISK_SCORE[level];
  return {
    dimension: 'risk_awareness',
    level: levelFromScore(score),
    score,
    confidence: report.longitudinalTrends.length > 0 ? 0.65 : 0,
    trendDirection: 'stable',
    evidenceCount: report.longitudinalTrends.length,
    rationale:
      report.priorities.coachAttentionReason ??
      'No current concern has reached a level that needs direct coach attention.',
    contributingEvidence: [{ type: 'coaching_priorities', id: 'recommended_attention_level' }],
  };
}

/** Every dimension except coaching_style_preference, which is computed from the already-run CoachingStyleComputation in service.ts (see computeCoachingStyleDimension below) rather than from LongitudinalTrend data. */
export function computeAllProfileDimensions(
  profile: MemberHealthProfile,
  report: MemberIntelligenceReport
): WellnessDimensionComputation[] {
  const trends = report.longitudinalTrends;

  return [
    dimensionFromArea(
      'sleep_stability',
      trends,
      'sleep',
      (label, score, dir) => `${label} has averaged ${score}/100 recently and is currently ${dir}.`
    ),
    dimensionFromArea(
      'energy_stability',
      trends,
      'energy',
      (label, score, dir) => `${label} has averaged ${score}/100 recently and is currently ${dir}.`
    ),
    dimensionFromArea(
      'pain_stability',
      trends,
      'pain',
      (label, score, dir) =>
        `${label} comfort has averaged ${score}/100 recently and is currently ${dir}.`
    ),
    dimensionFromArea(
      'hydration_consistency',
      trends,
      'hydration',
      (label, score, dir) => `${label} has averaged ${score}/100 recently and is currently ${dir}.`
    ),
    dimensionFromArea(
      'nutrition_consistency',
      trends,
      'digestion',
      (label, score, dir) =>
        `Digestion (the closest currently-collected proxy for nutrition) has averaged ${score}/100 and is currently ${dir}.`,
      'Replace with real nutrition-tracking data once that integration exists.'
    ),
    dimensionFromArea(
      'stress_resilience',
      trends,
      'stress',
      (label, score, dir) => `${label} has averaged ${score}/100 recently and is currently ${dir}.`
    ),
    dimensionFromArea(
      'emotional_stability',
      trends,
      'mood',
      (label, score, dir) => `${label} has averaged ${score}/100 recently and is currently ${dir}.`
    ),
    dimensionFromArea(
      'movement_confidence',
      trends,
      'movement',
      (label, score, dir) => `${label} has averaged ${score}/100 recently and is currently ${dir}.`
    ),
    averageDimension(
      'recovery_capacity',
      trends,
      ['energy', 'pain'],
      (score) =>
        `Blends recent energy and pain comfort into a single recovery picture (${score}/100).`
    ),
    lifestyleConsistencyDimension(profile),
    habitReliabilityDimension(profile),
    motivationProfileDimension(profile, report),
    riskAwarenessDimension(report),
    behaviorChangeMomentumDimension(report),
  ];
}

/** The 15th dimension — a rollup of how well-understood (not how "good") the member's coaching style currently is, computed after coachingStyle.ts runs. */
export function computeCoachingStyleDimension(
  style: CoachingStyleComputation
): WellnessDimensionComputation {
  const score = Math.round(style.confidence * 100);
  return {
    dimension: 'coaching_style_preference',
    level: levelFromScore(score),
    score,
    confidence: style.confidence,
    trendDirection: style.evidenceCount > 0 ? 'stable' : 'insufficient_data',
    evidenceCount: style.evidenceCount,
    rationale: style.rationale,
    contributingEvidence: [],
  };
}
