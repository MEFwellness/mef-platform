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
  | { kind: 'not_assigned' }
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

/**
 * COMPLETION IS PERMANENT (2026-08-27). The one question every surface has
 * to agree on: has this member ever finished this assessment?
 *
 * `assessment_status_by_member` deliberately lets a current draft outrank a
 * past completion, because that is what a *resume* affordance needs. It is
 * the wrong answer for "is she done", and reading `completionStatus` alone
 * for that question is what let a finished free experience come back the
 * next morning asking to be filled in again: one empty draft, and the Home
 * card, the Questionnaires page, the Priority Card, the free-arc pop-up and
 * the prerequisite chain all forgot she had ever completed it.
 *
 * `latestCompletedAt` is populated by the same view even while a draft is
 * open (it full-outer-joins drafts against latest_completed and returns
 * both columns), so this needs no extra query anywhere it is used.
 *
 * Every caller that means "finished" uses this. Callers that genuinely mean
 * "there is an open draft right now" keep reading `completionStatus`.
 */
export function hasEverCompleted(facts: MemberAssessmentFacts): boolean {
  return facts.completionStatus === 'completed' || facts.latestCompletedAt !== null;
}

/** An open draft on an assessment she has ALREADY finished: a retake in progress, never a reason to un-complete the original. */
export function hasRetakeInProgress(facts: MemberAssessmentFacts): boolean {
  return facts.completionStatus === 'in_progress' && facts.latestCompletedAt !== null;
}

export function calculateLockReason(
  definition: AssessmentDefinition,
  facts: MemberAssessmentFacts,
  completedPrerequisiteKeys: ReadonlySet<AssessmentKey>
): LockReason | null {
  // Assignment-gated visibility (Assignment-Gated Questionnaires task):
  // checked before every other rule below, and only while the member has
  // never started it — a coach assignment, a pending reassessment schedule
  // (which only ever exists for an assessment the member already has real
  // history with), or the member's own completed history always lets them
  // through, same "never hide existing progress" protection the rest of
  // this function already gives every other lock reason.
  if (
    definition.requiresAssignment &&
    facts.completionStatus === 'not_started' &&
    !facts.pendingAssignment &&
    !facts.pendingReassessmentSchedule
  ) {
    return { kind: 'not_assigned' };
  }

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
    case 'not_assigned':
      return 'Not assigned yet. Your coach will assign this when the time is right.';
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

  // An open draft only reads as 'in_progress' while she has never finished
  // this assessment. A draft on top of a completed one is a retake, and
  // calling that 'in_progress' told every reader she had never finished it
  // at all. The 'scheduled' branch below keeps its previous precedence over
  // 'completed' exactly as it had it.
  if (facts.completionStatus === 'in_progress' && !hasEverCompleted(facts)) {
    return { status: 'in_progress', lockReason: null };
  }

  if (facts.pendingReassessmentSchedule) {
    return { status: 'scheduled', lockReason: null };
  }

  if (hasEverCompleted(facts)) {
    return { status: 'completed', lockReason: null };
  }

  return { status: 'available', lockReason: null };
}
