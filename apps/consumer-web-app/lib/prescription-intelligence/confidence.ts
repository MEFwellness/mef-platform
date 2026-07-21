/**
 * Prescription Confidence — an internal score for coaches only (never
 * rendered to a member, per this feature's own "Member Experience"
 * requirement and prescription_snapshots' RLS, which has no member SELECT
 * policy at all). High confidence means enough Movement Profile,
 * readiness, assessment, and history signal exists; low confidence means
 * the engine is filling real gaps rather than working from real data.
 * Every reason traces to a real fact on PrescriptionFacts. Pure function,
 * fully unit testable.
 */

import type {
  PrescriptionConfidenceLevel,
  PrescriptionConfidenceReason,
} from '@mef/shared-types-contracts';
import type { PrescriptionFacts } from './facts';

export type PrescriptionConfidenceResult = {
  confidence: number;
  confidenceLevel: PrescriptionConfidenceLevel;
  confidenceReasons: PrescriptionConfidenceReason[];
};

export function computeConfidence(facts: PrescriptionFacts): PrescriptionConfidenceResult {
  const reasons: PrescriptionConfidenceReason[] = [];
  let score = 0;

  if (facts.movementProfile) {
    score += 0.25;
    reasons.push({
      label: 'Movement Profile on file',
      detail: 'Goals, equipment access, and coach-set priorities are known.',
    });
  } else {
    reasons.push({
      label: 'No Movement Profile yet',
      detail: 'Long-term goals, restrictions, and corrective priorities are unknown.',
    });
  }

  if (facts.latestCheckin) {
    score += 0.25;
    reasons.push({
      label: "Today's readiness check-in on file",
      detail: `Recorded ${facts.latestCheckin.localDate}.`,
    });
  } else {
    reasons.push({
      label: 'No readiness check-in today',
      detail:
        'How this member feels today is unknown; strategy defaults to a conservative baseline.',
    });
  }

  if (facts.hasMovementAssessment) {
    score += 0.25;
    reasons.push({
      label: 'Assessment findings or corrective priorities on file',
      detail: 'Corrective priorities can be confirmed from real assessment data.',
    });
  } else {
    reasons.push({
      label: 'No assessment findings yet',
      detail: 'Corrective priorities cannot be confirmed from real data — recommend an assessment.',
    });
  }

  if (facts.recentCompletions.length > 0) {
    score += 0.25;
    reasons.push({
      label: `${facts.recentCompletions.length} recent exercise completion(s) on file`,
      detail: 'Progression, regression, and variety decisions can draw on real history.',
    });
  } else {
    reasons.push({
      label: 'No exercise history yet',
      detail: 'Progression decisions default to a conservative starting point.',
    });
  }

  const confidence = Math.round(score * 100) / 100;
  const confidenceLevel: PrescriptionConfidenceLevel =
    confidence < 0.3
      ? 'building'
      : confidence < 0.55
        ? 'low'
        : confidence < 0.8
          ? 'moderate'
          : 'high';

  return { confidence, confidenceLevel, confidenceReasons: reasons };
}
