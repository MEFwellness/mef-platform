/**
 * Personalized Recommendations — one deterministic rule set per domain,
 * every entry traceable to a real trend, pattern, hypothesis, or priority
 * this run already computed. Reuses lib/wellness/coaching.ts's
 * WELLNESS_COACHING copy (the same "why this matters" / action text the
 * member dashboard and coach dashboard already show) for the metric-
 * driven domains rather than authoring a second, possibly-diverging set
 * of coaching copy.
 */

import { WELLNESS_COACHING } from '../wellness/coaching';
import { areaLabel } from '../intelligence/copy';
import type { WellnessMetricKey } from '../wellness/wellness-index';
import { ASSESSMENT_OVERDUE_DAYS } from './thresholds';
import type {
  CoachingPriorities,
  LongitudinalTrend,
  MemberHealthProfile,
  PatternInsight,
  Recommendation,
  RecommendationDomain,
  RootCauseHypothesis,
} from './types';

/** Exported for reuse by lib/recommendation-engine/ — the medical-referral routing check maps a wellness-area reference back onto RecommendationDomain via this exact table rather than duplicating it. */
export const AREA_DOMAINS: Partial<Record<WellnessMetricKey, RecommendationDomain[]>> = {
  sleep: ['sleep'],
  stress: ['stress', 'breathing'],
  energy: ['recovery'],
  mood: ['reflection'],
  hydration: ['hydration'],
  digestion: ['nutrition'],
  movement: ['movement'],
  pain: ['recovery'],
};

function priorityFor(
  area: WellnessMetricKey,
  priorities: CoachingPriorities
): Recommendation['priority'] {
  if (priorities.primaryPriority === area) return 'high';
  if (priorities.secondaryPriority === area || priorities.emergingConcern === area) return 'medium';
  return 'low';
}

/** One recommendation per relevant domain for every area that is currently a priority or actively declining — never for an area that's simply fine. */
function areaDrivenRecommendations(
  trends: LongitudinalTrend[],
  priorities: CoachingPriorities
): Recommendation[] {
  const relevant = trends.filter(
    (t) =>
      t.direction === 'declining' ||
      priorities.primaryPriority === t.area ||
      priorities.secondaryPriority === t.area
  );

  return relevant.flatMap((trend) => {
    const domains = AREA_DOMAINS[trend.area] ?? [];
    const copy = WELLNESS_COACHING[trend.area];
    const evidence = [
      `${areaLabel(trend.area)} trend: ${trend.direction} (${Math.round(trend.confidence * 100)}% confidence).`,
    ];

    return domains.map((domain) => ({
      domain,
      title: copy.priorityTitle,
      detail:
        domain === 'breathing'
          ? `Slow, deliberate breathing can help lower ${areaLabel(trend.area).toLowerCase()} — ${copy.priorityAction}`
          : copy.priorityAction,
      priority: priorityFor(trend.area, priorities),
      confidence: trend.confidence,
      evidence,
    }));
  });
}

function reflectionRecommendation(profile: MemberHealthProfile): Recommendation | null {
  const reflectionInsight = profile.wellnessInsights.find(
    (i) => i.wellness_area === 'reflections' || i.wellness_area === 'lesson_engagement'
  );
  if (!reflectionInsight) return null;

  return {
    domain: 'reflection',
    title: 'Prompt a short reflection',
    detail: reflectionInsight.recommended_coaching_response ?? reflectionInsight.member_summary,
    priority: reflectionInsight.severity === 'important' ? 'high' : 'medium',
    confidence: reflectionInsight.confidence,
    evidence: [reflectionInsight.title],
  };
}

function educationRecommendation(trends: LongitudinalTrend[]): Recommendation | null {
  const emerging = trends.find((t) => t.trendState === 'newly_emerging');
  if (!emerging) return null;

  return {
    domain: 'education',
    title: `Share education content on ${areaLabel(emerging.area).toLowerCase()}`,
    detail: `${areaLabel(emerging.area)} shows an early, fresh change this week — brief educational content can help before coaching further.`,
    priority: 'medium',
    confidence: emerging.confidence,
    evidence: emerging.evidenceRefs.map((e) => e.note ?? e.type),
  };
}

function assessmentsRecommendation(profile: MemberHealthProfile): Recommendation | null {
  if (
    profile.daysSinceLastReassessmentOrBaseline === null ||
    profile.daysSinceLastReassessmentOrBaseline < ASSESSMENT_OVERDUE_DAYS
  ) {
    return null;
  }

  return {
    domain: 'assessments',
    title: 'Request a reassessment',
    detail: `It has been ${profile.daysSinceLastReassessmentOrBaseline} days since the member's last baseline/reassessment — a fresh reassessment would give both the member and their coach an updated picture.`,
    priority: 'medium',
    confidence: 0.9,
    evidence: [`${profile.daysSinceLastReassessmentOrBaseline} days since last assessment`],
  };
}

function coachFollowUpRecommendation(priorities: CoachingPriorities): Recommendation | null {
  if (
    priorities.recommendedCoachAttentionLevel !== 'priority' &&
    priorities.recommendedCoachAttentionLevel !== 'discuss'
  ) {
    return null;
  }

  const area = priorities.primaryPriority ?? priorities.secondaryPriority;
  return {
    domain: 'coach_follow_up',
    title: 'Flag for coach follow-up',
    detail: area
      ? `${areaLabel(area)} is currently the member's top priority — worth a direct conversation at the next touchpoint.`
      : 'The current priority picture is worth a direct conversation at the next touchpoint.',
    priority: priorities.recommendedCoachAttentionLevel === 'priority' ? 'high' : 'medium',
    confidence: 0.75,
    evidence: [`Coach attention level: ${priorities.recommendedCoachAttentionLevel}`],
  };
}

function dailyCoachingRecommendation(profile: MemberHealthProfile): Recommendation {
  const decision = profile.brainDecision;
  return {
    domain: 'daily_coaching',
    title: `Today's coaching focus: ${decision.focusLabel}`,
    detail: decision.reasonText,
    priority:
      decision.riskLevel === 'elevated'
        ? 'high'
        : decision.riskLevel === 'watch'
          ? 'medium'
          : 'low',
    confidence: 0.9,
    evidence: [`Coaching Brain reason: ${decision.reason}`, `Mode: ${decision.mode}`],
  };
}

function conversationPromptRecommendation(
  priorities: CoachingPriorities,
  hypotheses: RootCauseHypothesis[]
): Recommendation | null {
  const topHypothesis = hypotheses[0];
  const area = priorities.primaryPriority;
  if (!topHypothesis && !area) return null;

  return {
    domain: 'conversation_prompts',
    title: 'Suggested Conversation Coach prompt',
    detail: topHypothesis
      ? `${topHypothesis.statement} ${topHypothesis.recommendedCoachingDirection}`
      : `Ask how ${areaLabel(area!).toLowerCase()} has been feeling lately — it's the member's current top priority.`,
    priority: 'medium',
    confidence: topHypothesis?.confidence ?? 0.6,
    evidence: topHypothesis ? topHypothesis.knownFacts : [`Primary priority: ${area}`],
  };
}

function notificationsRecommendation(
  priorities: CoachingPriorities,
  patterns: PatternInsight[]
): Recommendation | null {
  const burnout = patterns.find((p) => p.kind === 'burnout_signal');
  if (priorities.recommendedCoachAttentionLevel !== 'priority' && !burnout) return null;

  return {
    domain: 'notifications',
    title: 'Notification-worthy change',
    detail: burnout
      ? 'A burnout-like pattern was detected — this is significant enough to notify the assigned coach.'
      : 'The member has a priority-level concern — this is significant enough to notify the assigned coach.',
    priority: 'high',
    confidence: burnout?.confidence ?? 0.7,
    evidence: burnout ? [burnout.description] : [`Coach attention level: priority`],
  };
}

function automationRecommendation(profile: MemberHealthProfile): Recommendation | null {
  if (profile.adherence.level !== 'low' || profile.adherence.sampleSize < 5) return null;

  return {
    domain: 'automation',
    title: 'Candidate for an automated nudge',
    detail:
      "Completion of daily coaching actions has been consistently low — a future automated reminder at the member's usual check-in time is a good candidate once that capability exists.",
    priority: 'low',
    confidence: 0.6,
    evidence: [
      `Adherence rate: ${profile.adherence.rate ?? 'n/a'} over ${profile.adherence.sampleSize} days`,
    ],
  };
}

export function buildRecommendations(
  profile: MemberHealthProfile,
  trends: LongitudinalTrend[],
  patterns: PatternInsight[],
  hypotheses: RootCauseHypothesis[],
  priorities: CoachingPriorities
): Recommendation[] {
  const recommendations = [
    ...areaDrivenRecommendations(trends, priorities),
    reflectionRecommendation(profile),
    educationRecommendation(trends),
    assessmentsRecommendation(profile),
    coachFollowUpRecommendation(priorities),
    dailyCoachingRecommendation(profile),
    conversationPromptRecommendation(priorities, hypotheses),
    notificationsRecommendation(priorities, patterns),
    automationRecommendation(profile),
  ].filter((r): r is Recommendation => r !== null);

  return recommendations;
}
