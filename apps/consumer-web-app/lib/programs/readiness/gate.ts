/**
 * "WHEN NOT TO PRESCRIBE." A red flag, a blocking constraint, a missing
 * baseline, or truly no usable signal means nobody decides a next step from
 * data alone; a specific alternative is recommended instead.
 *
 * Harvested from the retired Prescription Intelligence Engine (migration
 * 178's cleanup) along with ./constraints.ts and ./facts.ts. Two live
 * callers now:
 *
 *   lib/programs/feedback/safety.ts    asks hasBlockingConstraint about a
 *                                      single pain report.
 *   lib/programs/review/recommend.ts   asks evaluateReadinessGate about the
 *                                      whole member, and maps its
 *                                      `recovery_session` answer onto the
 *                                      review's own "Schedule a recovery
 *                                      week" outcome. The vocabulary lined
 *                                      up because it was the same question
 *                                      all along.
 *
 * Pure function, fully unit testable.
 */

import type {
  PrescriptionBlockReason,
  PrescriptionRecommendedAlternative,
} from '@mef/shared-types-contracts';
import type { ReadinessFacts } from './facts';
import type { ReadinessConstraintDraft } from './constraints';

export type ReadinessGateResult =
  | { blocked: false }
  | {
      blocked: true;
      blockReason: PrescriptionBlockReason;
      recommendedAlternative: PrescriptionRecommendedAlternative;
    };

/**
 * "Is there anything here that means we do not prescribe at all." The two
 * rules the gate opens with, as one predicate, so a caller outside this
 * engine can ask the question without reconstructing a ReadinessFacts
 * it does not have.
 *
 * lib/programs/feedback/safety.ts is that caller: a member reporting pain
 * on an exercise is the same class of fact as a blocking pain constraint,
 * and the answer to it is the same answer this file has always given, so
 * it asks this rather than writing a second pain rule beside it.
 */
export function hasBlockingConstraint(constraints: ReadinessConstraintDraft[]): boolean {
  return constraints.some(
    (c) => c.constraintType === 'red_flag' || c.severity === 'blocking'
  );
}

export function evaluateReadinessGate(
  facts: ReadinessFacts,
  constraints: ReadinessConstraintDraft[]
): ReadinessGateResult {
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
