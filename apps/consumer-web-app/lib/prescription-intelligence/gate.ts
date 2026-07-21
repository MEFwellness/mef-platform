/**
 * "When Not To Prescribe" — the gate the engine checks before building any
 * strategy block. A red flag, a blocking constraint, a missing baseline, or
 * truly no usable signal means the engine declines to prescribe at all and
 * instead recommends a specific alternative, rather than guessing at a
 * workout with unsafe or insufficient information. Pure function, fully
 * unit testable.
 */

import type {
  PrescriptionBlockReason,
  PrescriptionRecommendedAlternative,
} from '@mef/shared-types-contracts';
import type { PrescriptionFacts } from './facts';
import type { PrescriptionConstraintDraft } from './constraints';

export type PrescriptionGateResult =
  | { blocked: false }
  | {
      blocked: true;
      blockReason: PrescriptionBlockReason;
      recommendedAlternative: PrescriptionRecommendedAlternative;
    };

export function evaluatePrescriptionGate(
  facts: PrescriptionFacts,
  constraints: PrescriptionConstraintDraft[]
): PrescriptionGateResult {
  if (constraints.some((c) => c.constraintType === 'red_flag')) {
    return { blocked: true, blockReason: 'red_flag', recommendedAlternative: 'coach_review' };
  }

  if (constraints.some((c) => c.severity === 'blocking')) {
    return {
      blocked: true,
      blockReason: 'extremely_poor_readiness',
      recommendedAlternative: 'recovery_session',
    };
  }

  if (!facts.movementProfile) {
    return {
      blocked: true,
      blockReason: 'missing_baseline_assessment',
      recommendedAlternative: 'coach_review',
    };
  }

  const noSignalAtAll =
    !facts.hasMovementAssessment &&
    !facts.latestCheckin &&
    facts.recentCompletions.length === 0 &&
    facts.movementProfile.goals.length === 0;
  if (noSignalAtAll) {
    return {
      blocked: true,
      blockReason: 'insufficient_data',
      recommendedAlternative: 'coach_review',
    };
  }

  const stressLevel = facts.latestCheckin?.stressLevel ?? null;
  const sleepQuality = facts.latestCheckin?.sleepQuality ?? null;
  const energyLevel = facts.latestCheckin?.energyLevel ?? null;
  if (
    stressLevel != null &&
    sleepQuality != null &&
    energyLevel != null &&
    stressLevel >= 5 &&
    sleepQuality <= 1 &&
    energyLevel <= 1
  ) {
    return {
      blocked: true,
      blockReason: 'extremely_poor_readiness',
      recommendedAlternative: 'breathing_session',
    };
  }

  return { blocked: false };
}
