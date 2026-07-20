/**
 * Status calculation — the framework's "Status" concept (section 3).
 * Nothing here is ever stored; every status is computed fresh from
 * already-stored facts (membership tier, program enrollment/phase,
 * completion history, a pending coach assignment, a pending reassessment
 * schedule). Two calls with the same facts always return the same status.
 *
 * 'recommended' is deliberately not decided here — see recommendation.ts.
 * This file only ever returns 'available' for an assessment with nothing
 * else going on; the recommendation service then upgrades at most one
 * of a member's 'available' (or due-reassessment) assessments to
 * 'recommended' for the "Recommended Next" section.
 */

import type { AssessmentDefinition, AssessmentKey, MembershipKey } from './types';
import { membershipMeetsMinimum } from './membership';

export type AssessmentStatus =
  | 'coming_soon'
  | 'locked'
  | 'coach_assigned'
  | 'in_progress'
  | 'scheduled'
  | 'completed'
  | 'recommended'
  | 'available';

export type LockReason =
  | { kind: 'membership'; requiredLevel: MembershipKey }
  | { kind: 'program_enrollment' }
  | { kind: 'program_phase'; requiredPhaseKey: string }
  | { kind: 'prerequisite'; missingKeys: AssessmentKey[] };

export type PendingAssignment = {
  id: string;
  isRequired: boolean;
  reason: string | null;
  dueAt: string | null;
  availableAt: string;
  stage: string;
};

export type PendingReassessmentSchedule = {
  id: string;
  stage: string;
  dueAt: string;
};

export type ProgramEnrollmentFacts = {
  programKey: string;
  status: 'active' | 'completed' | 'withdrawn';
  currentPhaseKey: string | null;
  enrolledAt: string;
};

export type MemberAssessmentFacts = {
  membershipKey: MembershipKey;
  enrollment: ProgramEnrollmentFacts | null;
  completionStatus: 'not_started' | 'in_progress' | 'completed';
  latestCompletedAt: string | null;
  latestCompletedAttemptId: string | null;
  pendingAssignment: PendingAssignment | null;
  pendingReassessmentSchedule: PendingReassessmentSchedule | null;
};

export function calculateLockReason(
  definition: AssessmentDefinition,
  facts: MemberAssessmentFacts,
  completedPrerequisiteKeys: ReadonlySet<AssessmentKey>
): LockReason | null {
  if (!membershipMeetsMinimum(facts.membershipKey, definition.membership.minLevel)) {
    return { kind: 'membership', requiredLevel: definition.membership.minLevel };
  }

  if (definition.program.programOnly) {
    if (!facts.enrollment || facts.enrollment.programKey !== definition.program.programKey) {
      return { kind: 'program_enrollment' };
    }
    if (
      definition.program.programPhase &&
      facts.enrollment.currentPhaseKey !== definition.program.programPhase
    ) {
      return { kind: 'program_phase', requiredPhaseKey: definition.program.programPhase };
    }
  }

  const missingKeys = definition.prerequisites.prerequisiteKeys.filter(
    (key) => !completedPrerequisiteKeys.has(key)
  );
  if (missingKeys.length > 0) {
    return { kind: 'prerequisite', missingKeys };
  }

  return null;
}

/** Safe, simple, member-facing copy for a lock reason. Never diagnostic, never CHEK/HLC1, no em dashes. */
export function describeLockReason(reason: LockReason, prerequisiteNames: string[] = []): string {
  switch (reason.kind) {
    case 'membership':
      return reason.requiredLevel === 'holistic_reset'
        ? 'Available as part of the Holistic Reset program.'
        : 'Available with a Membership plan.';
    case 'program_enrollment':
      return 'Available once you are enrolled in the Holistic Reset program.';
    case 'program_phase':
      return 'Unlocks at your next program phase.';
    case 'prerequisite':
      return prerequisiteNames.length > 0
        ? `Complete ${prerequisiteNames.join(', ')} first to unlock this.`
        : 'Complete a prior step first to unlock this.';
    default:
      return 'Not available yet.';
  }
}

export function calculateAssessmentStatus(
  definition: AssessmentDefinition,
  facts: MemberAssessmentFacts,
  completedPrerequisiteKeys: ReadonlySet<AssessmentKey> = new Set()
): { status: AssessmentStatus; lockReason: LockReason | null } {
  if (
    definition.isComingSoon ||
    definition.implementationStatus !== 'live' ||
    !definition.isActive
  ) {
    return { status: 'coming_soon', lockReason: null };
  }

  const lockReason = calculateLockReason(definition, facts, completedPrerequisiteKeys);

  // A pending coach assignment is an explicit coach override — it always
  // surfaces as its own actionable status, regardless of what a tier/
  // program/prerequisite lock would otherwise say. Actual access is still
  // enforced server-side (see lib/assessment-registry/access.ts) against
  // this same assignment row, never against the UI label alone.
  if (facts.pendingAssignment) {
    return { status: 'coach_assigned', lockReason: null };
  }

  if (lockReason) {
    return { status: 'locked', lockReason };
  }

  if (facts.completionStatus === 'in_progress') {
    return { status: 'in_progress', lockReason: null };
  }

  if (facts.pendingReassessmentSchedule) {
    return { status: 'scheduled', lockReason: null };
  }

  if (facts.completionStatus === 'completed') {
    return { status: 'completed', lockReason: null };
  }

  return { status: 'available', lockReason: null };
}
