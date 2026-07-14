/**
 * Coach Alerts — every draft here is a deterministic rule over real,
 * already-computed data (MemberHealthProfile + this run's own
 * LongitudinalTrend[]/PatternInsight[]), and every draft's `reason` field
 * is a concrete, evidence-referencing sentence — never a bare label, per
 * the milestone's explicit "every alert must explain WHY." Persistence
 * (dedup by alertKey, reopen/protect-from-reopen) lives in data.ts, not
 * here — this module only produces the pure drafts.
 */

import { areaLabel } from '../intelligence/copy';
import { buildRegistryCoachAlertDrafts } from './registryFindings';
import {
  ASSESSMENT_OVERDUE_DAYS,
  NO_CHECKIN_ALERT_DAYS,
  REPEATED_SAFETY_FLAGS_MIN,
} from './thresholds';
import type {
  CoachAlertDraft,
  LongitudinalTrend,
  MemberHealthProfile,
  PatternInsight,
} from './types';

function needsReviewAlerts(profile: MemberHealthProfile): CoachAlertDraft[] {
  return profile.wellnessInsights
    .filter(
      (insight) =>
        insight.status === 'active' &&
        insight.severity === 'important' &&
        insight.coach_reviewed_at === null
    )
    .map((insight) => ({
      alertType: 'needs_review' as const,
      severity: 'important' as const,
      title: `Needs review: ${insight.title}`,
      reason: `An important-severity insight ("${insight.title}") has been active since ${insight.created_at.slice(0, 10)} and hasn't been reviewed by a coach yet.`,
      alertKey: `needs_review_${insight.pattern_key}`,
      evidenceRefs: insight.evidence_refs,
      sourceRefs: [{ type: 'wellness_insight', id: insight.id }],
    }));
}

function burnoutRiskAlert(patterns: PatternInsight[]): CoachAlertDraft | null {
  const burnout = patterns.find((p) => p.kind === 'burnout_signal');
  if (!burnout) return null;

  return {
    alertType: 'burnout_risk',
    severity: burnout.confidence >= 0.7 ? 'important' : 'notable',
    title: 'Possible burnout risk',
    reason: burnout.description,
    alertKey: 'burnout_risk',
    evidenceRefs: burnout.evidenceRefs,
    sourceRefs: [],
  };
}

function assessmentOverdueAlert(profile: MemberHealthProfile): CoachAlertDraft | null {
  if (
    profile.daysSinceLastReassessmentOrBaseline === null ||
    profile.daysSinceLastReassessmentOrBaseline < ASSESSMENT_OVERDUE_DAYS
  ) {
    return null;
  }

  return {
    alertType: 'assessment_overdue',
    severity: 'notable',
    title: 'Reassessment overdue',
    reason: `It has been ${profile.daysSinceLastReassessmentOrBaseline} days since this member's last baseline or reassessment (overdue past ${ASSESSMENT_OVERDUE_DAYS} days).`,
    alertKey: 'assessment_overdue',
    evidenceRefs: [],
    sourceRefs: [],
  };
}

function noCheckinAlert(profile: MemberHealthProfile): CoachAlertDraft | null {
  if (
    profile.streak.daysSinceLastCheckin === null ||
    profile.streak.daysSinceLastCheckin < NO_CHECKIN_ALERT_DAYS
  ) {
    return null;
  }

  return {
    alertType: 'no_checkin',
    severity:
      profile.streak.daysSinceLastCheckin >= NO_CHECKIN_ALERT_DAYS * 2 ? 'important' : 'notable',
    title: 'No recent check-in',
    reason: `This member hasn't checked in for ${profile.streak.daysSinceLastCheckin} days.`,
    alertKey: 'no_checkin',
    evidenceRefs: [],
    sourceRefs: [],
  };
}

const WORSENING_SYMPTOM_AREAS = new Set(['pain', 'digestion']);

function symptomsWorseningAlerts(trends: LongitudinalTrend[]): CoachAlertDraft[] {
  return trends
    .filter(
      (t) =>
        WORSENING_SYMPTOM_AREAS.has(t.area) &&
        t.direction === 'declining' &&
        (t.trendStrength === 'strong' || t.trendStrength === 'moderate')
    )
    .map((t) => ({
      alertType: 'symptoms_worsening' as const,
      severity: t.trendStrength === 'strong' ? ('important' as const) : ('notable' as const),
      title: `${areaLabel(t.area)} worsening`,
      reason: `${areaLabel(t.area)} has been declining over the last 30 days with ${t.trendStrength} strength (${Math.round(t.confidence * 100)}% confidence).`,
      alertKey: `symptoms_worsening_${t.area}`,
      evidenceRefs: t.evidenceRefs,
      sourceRefs: [],
    }));
}

function rapidImprovementAlerts(trends: LongitudinalTrend[]): CoachAlertDraft[] {
  return trends
    .filter((t) => t.trendState === 'improving' && t.trendStrength === 'strong')
    .map((t) => ({
      alertType: 'rapid_improvement' as const,
      severity: 'info' as const,
      title: `${areaLabel(t.area)} improving rapidly`,
      reason: `${areaLabel(t.area)} has improved sharply over the last 30 days (${Math.round(t.confidence * 100)}% confidence) — a good moment to acknowledge this with the member.`,
      alertKey: `rapid_improvement_${t.area}`,
      evidenceRefs: t.evidenceRefs,
      sourceRefs: [],
    }));
}

function plateauAlerts(patterns: PatternInsight[]): CoachAlertDraft[] {
  return patterns
    .filter((p) => p.kind === 'plateau')
    .map((p) => ({
      alertType: 'plateau' as const,
      severity: 'notable' as const,
      title: p.label,
      reason: p.description,
      alertKey: p.key,
      evidenceRefs: p.evidenceRefs,
      sourceRefs: [],
    }));
}

function recurringBarriersAlert(
  profile: MemberHealthProfile,
  patterns: PatternInsight[]
): CoachAlertDraft | null {
  const barrier = patterns.find((p) => p.kind === 'repeating_barrier' && p.confidence >= 0.6);
  const lowAdherence = profile.adherence.level === 'low' && profile.adherence.sampleSize >= 5;
  if (!barrier && !lowAdherence) return null;

  return {
    alertType: 'recurring_barriers',
    severity: 'notable',
    title: 'Recurring barrier to adherence',
    reason:
      barrier?.description ??
      `Completion of suggested daily coaching actions has been low across ${profile.adherence.sampleSize} recent days.`,
    alertKey: 'recurring_barriers',
    evidenceRefs: barrier?.evidenceRefs ?? [],
    sourceRefs: [],
  };
}

function repeatedSafetyFlagsAlert(profile: MemberHealthProfile): CoachAlertDraft | null {
  if (profile.openSafetyReviewCount < REPEATED_SAFETY_FLAGS_MIN) return null;

  return {
    alertType: 'repeated_safety_flags',
    severity: 'important',
    title: 'Repeated safety flags open',
    reason: `This member currently has ${profile.openSafetyReviewCount} open Coach Review Queue cases.`,
    alertKey: 'repeated_safety_flags',
    evidenceRefs: [],
    sourceRefs: [],
  };
}

const MEDICAL_EVAL_CLASSIFICATION_LEVEL = 'medical_evaluation_recommended';
const SUSTAINED_STRONG_STATES = new Set(['recurring_pattern']);

function medicalEvaluationRecommendedAlerts(
  profile: MemberHealthProfile,
  trends: LongitudinalTrend[]
): CoachAlertDraft[] {
  const fromClassifiedInsights = profile.wellnessInsights
    .filter((i) => i.safety_classification_level === MEDICAL_EVAL_CLASSIFICATION_LEVEL)
    .map((i) => ({
      alertType: 'medical_evaluation_recommended' as const,
      severity: 'important' as const,
      title: `Consider recommending a medical evaluation: ${i.title}`,
      reason: `A safety classification on this member's record ("${i.title}") was flagged at the medical_evaluation_recommended level.`,
      alertKey: `medical_evaluation_${i.pattern_key}`,
      evidenceRefs: i.evidence_refs,
      sourceRefs: [
        { type: 'wellness_insight', id: i.id },
        ...(i.safety_classification_id
          ? [{ type: 'safety_classification', id: i.safety_classification_id }]
          : []),
      ],
    }));

  const painTrend = trends.find(
    (t) =>
      t.area === 'pain' &&
      t.trendState !== null &&
      SUSTAINED_STRONG_STATES.has(t.trendState) &&
      t.trendStrength === 'strong'
  );

  const fromSustainedPain = painTrend
    ? [
        {
          alertType: 'medical_evaluation_recommended' as const,
          severity: 'notable' as const,
          title: 'Sustained pain pattern — consider a medical evaluation',
          reason:
            'Pain/discomfort has been a sustained, strong concern across both the last 30 and prior 30 days — worth suggesting the member speak with a healthcare provider, never a diagnosis from this app.',
          alertKey: 'medical_evaluation_sustained_pain',
          evidenceRefs: painTrend.evidenceRefs,
          sourceRefs: [],
        },
      ]
    : [];

  return [...fromClassifiedInsights, ...fromSustainedPain];
}

export function buildCoachAlertDrafts(
  profile: MemberHealthProfile,
  trends: LongitudinalTrend[],
  patterns: PatternInsight[]
): CoachAlertDraft[] {
  return [
    ...needsReviewAlerts(profile),
    ...[burnoutRiskAlert(patterns)].filter((a): a is CoachAlertDraft => a !== null),
    ...[assessmentOverdueAlert(profile)].filter((a): a is CoachAlertDraft => a !== null),
    ...[noCheckinAlert(profile)].filter((a): a is CoachAlertDraft => a !== null),
    ...symptomsWorseningAlerts(trends),
    ...rapidImprovementAlerts(trends),
    ...plateauAlerts(patterns),
    ...[recurringBarriersAlert(profile, patterns)].filter((a): a is CoachAlertDraft => a !== null),
    ...[repeatedSafetyFlagsAlert(profile)].filter((a): a is CoachAlertDraft => a !== null),
    ...medicalEvaluationRecommendedAlerts(profile, trends),
    ...buildRegistryCoachAlertDrafts(profile),
  ];
}
