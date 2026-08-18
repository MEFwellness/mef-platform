/**
 * The Constraint Engine — turns PrescriptionFacts into real, evidence-
 * traceable constraints that must be identified BEFORE any goal is
 * optimized for. Every constraint here traces to an actual fact on
 * PrescriptionFacts (a check-in field, an active Universal Registry
 * finding, a wearable metric, or the absence of an assessment); nothing is
 * invented. Pure function — no Supabase access — so it's fully unit
 * testable against a crafted PrescriptionFacts.
 */

import type {
  HealthTimelineEvidenceRef,
  PrescriptionConstraintSeverity,
  PrescriptionConstraintType,
} from '@mef/shared-types-contracts';
import type { PrescriptionFacts } from './facts';
import { displayName } from '../naming/displayNames';
import { findingDisplayName } from '../naming/findingNames';

export type PrescriptionConstraintDraft = {
  constraintType: PrescriptionConstraintType;
  description: string;
  severity: PrescriptionConstraintSeverity;
  evidenceRefs: HealthTimelineEvidenceRef[];
};

const MOBILITY_RELATED_CODES = new Set([
  'thoracic_kyphosis',
  'forward_head',
  'rounded_shoulders',
  'pelvic_tilt',
  'lumbar_posture',
]);

function severityFromFindingSeverity(severity: string | null): PrescriptionConstraintSeverity {
  if (severity === 'significant') return 'high';
  if (severity === 'moderate') return 'moderate';
  if (severity === 'mild') return 'low';
  return 'moderate';
}

/**
 * A member saying an exercise hurts, as a constraint of the same kind this
 * file has always produced from a check-in's pain score.
 *
 * WHY 'blocking'. The check-in ladder above grades pain 3 out of 5 as high
 * and 4 out of 5 as blocking, because a number on a scale is a report
 * about a day. A member stopping mid-session to say THIS MOVEMENT hurts is
 * not a number about a day, it is a report about one specific thing she
 * was asked to do, and there is no version of it that should be answered
 * by handing her a different exercise to try. So it enters at the top of
 * the ladder and lib/prescription-intelligence/gate.ts's own rule takes it
 * from there.
 *
 * The evidence ref points at the feedback row her coach will read, so the
 * constraint and her actual words are one click apart and neither is a
 * copy of the other.
 */
export function painConstraintFromExerciseReport(input: {
  exerciseName: string;
  feedbackId?: string | null;
}): PrescriptionConstraintDraft {
  return {
    constraintType: 'pain',
    description: `Member reported pain or discomfort on ${input.exerciseName} during an assigned session.`,
    severity: 'blocking',
    evidenceRefs: input.feedbackId
      ? [{ type: 'member_note', id: input.feedbackId, note: 'exercise_feedback' }]
      : [],
  };
}

export function deriveConstraints(facts: PrescriptionFacts): PrescriptionConstraintDraft[] {
  const constraints: PrescriptionConstraintDraft[] = [];
  const checkin = facts.latestCheckin;

  if (checkin?.newOrWorseningConcern) {
    constraints.push({
      constraintType: 'red_flag',
      description: `Today's check-in (${checkin.localDate}) flagged a new or worsening concern.`,
      severity: 'blocking',
      evidenceRefs: [
        { type: 'daily_checkin', id: checkin.localDate, note: 'new_or_worsening_concern' },
      ],
    });
  }

  if (checkin?.painLevel != null && checkin.painLevel >= 3) {
    constraints.push({
      constraintType: 'pain',
      description: `Pain reported at ${checkin.painLevel}/5 in the ${checkin.localDate} check-in.`,
      severity: checkin.painLevel >= 4 ? 'blocking' : 'high',
      evidenceRefs: [
        { type: 'daily_checkin', id: checkin.localDate, note: 'pain_discomfort_level' },
      ],
    });
  }

  const breathingFinding = facts.activeFindings.find((f) => f.domain === 'breathing');
  if (breathingFinding) {
    constraints.push({
      constraintType: 'poor_breathing',
      description: `Active breathing finding: ${breathingFinding.label.replace(/_/g, ' ')}.`,
      severity: severityFromFindingSeverity(breathingFinding.severity),
      evidenceRefs: [
        { type: 'registry_entry', id: breathingFinding.code, note: breathingFinding.domain },
      ],
    });
  }

  for (const finding of facts.activeFindings.filter(
    (f) => f.domain === 'posture' || f.domain === 'movement'
  )) {
    constraints.push({
      constraintType: MOBILITY_RELATED_CODES.has(finding.code)
        ? 'limited_mobility'
        : 'movement_dysfunction',
      description: `Active finding in ${displayName('registry_domain', finding.domain).toLowerCase()}: ${findingDisplayName(finding.domain, finding.code, finding.label)}.`,
      severity: severityFromFindingSeverity(finding.severity),
      evidenceRefs: [{ type: 'registry_entry', id: finding.code, note: finding.domain }],
    });
  }

  if (checkin?.stressLevel != null && checkin.stressLevel >= 4) {
    constraints.push({
      constraintType: 'high_stress',
      description: `Elevated stress reported at ${checkin.stressLevel}/5 in the ${checkin.localDate} check-in.`,
      severity: checkin.stressLevel >= 5 ? 'high' : 'moderate',
      evidenceRefs: [{ type: 'daily_checkin', id: checkin.localDate, note: 'stress_level' }],
    });
  }

  if (
    checkin &&
    ((checkin.sleepQuality != null && checkin.sleepQuality <= 2) || checkin.sleepDuration === '<5h')
  ) {
    constraints.push({
      constraintType: 'sleep_deprivation',
      description:
        checkin.sleepDuration === '<5h'
          ? `Under 5 hours of sleep reported in the ${checkin.localDate} check-in.`
          : `Below-average sleep quality (${checkin.sleepQuality}/5) reported in the ${checkin.localDate} check-in.`,
      severity: 'moderate',
      evidenceRefs: [{ type: 'daily_checkin', id: checkin.localDate, note: 'sleep' }],
    });
  }

  const recoveryScore = facts.wearableSnapshot?.recoveryScore ?? null;
  if (recoveryScore != null && recoveryScore < 34) {
    constraints.push({
      constraintType: 'poor_recovery',
      description: `Connected wearable reported a recovery score of ${recoveryScore}.`,
      severity: recoveryScore < 20 ? 'high' : 'moderate',
      evidenceRefs: [
        { type: 'wearable_metric', id: 'recovery_score', note: String(recoveryScore) },
      ],
    });
  }

  if (!facts.hasBaselineAssessment) {
    constraints.push({
      constraintType: 'missing_assessment',
      description: 'No Movement Profile exists yet for this member.',
      severity: 'high',
      evidenceRefs: [],
    });
  } else if (!facts.hasMovementAssessment) {
    constraints.push({
      constraintType: 'missing_assessment',
      description: 'No posture/movement assessment findings or corrective priorities exist yet.',
      severity: 'moderate',
      evidenceRefs: [],
    });
  }

  return constraints;
}
