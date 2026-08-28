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

/**
 * NO 'not_assigned' (Build 2, 2026-08-27). There used to be a lock reason
 * meaning "your coach has not assigned this to you yet", produced by the
 * `requiresAssignment` flag. A missing assignment no longer locks
 * anything, so the reason is removed from the union rather than left
 * unreachable: an unreachable variant is a lock waiting to be switched
 * back on, and every copy path that spoke it has been removed with it.
 */
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

/**
 * THE PLAN DECIDES, AND NOTHING ELSE OPENS ONE (2026-08-27).
 *
 * Access to a questionnaire is decided by the member's plan and by the
 * registry's own program/prerequisite rules. A coach assignment may
 * additionally open one specific questionnaire for one specific member,
 * and that is the only thing that adds access on top of the plan.
 *
 * COACH ASSIGNMENT ONLY EVER ADDS (Build 2, 2026-08-27). The
 * `requiresAssignment` flag used to sit underneath the plan and subtract:
 * four questionnaires were mapped to trial minimum and then held shut by
 * a lock nobody could see in the map, which is why the printed map and
 * the real behaviour disagreed. The flag is deleted. An assignment row
 * still short-circuits every rule below, so a coach can hand one
 * questionnaire to one member even below the plan minimum, and its
 * ABSENCE now decides nothing at all.
 *
 * Four things used to open a questionnaire and no longer do:
 *
 *   * A PENDING REASSESSMENT SCHEDULE. The rule below used to accept one
 *     as proof of history, on the stated premise that a pending schedule
 *     "only ever exists for an assessment the member already has real
 *     history with". On production that premise was false: the daily
 *     coaching scan maps a worsening finding in a DOMAIN onto an
 *     assessment key without ever checking whether that assessment was
 *     assessed, and four of the six pending rows were for something the
 *     member had never completed. One of them was the camera Body
 *     Assessment. A schedule is a suggestion; it is not a key.
 *   * A WORSENING FINDING, for the same reason, one step upstream.
 *   * AN IN-PROGRESS DRAFT. A draft is evidence that something opened
 *     once, not authority for it to open again.
 *   * A PRIOR COMPLETION. Finishing a coach-assigned questionnaire used to
 *     make it permanently self-serve. Reading her own past results stays
 *     open forever, which is what the framework's "never hide her own
 *     progress" rule actually protects; that now lives in access.ts's
 *     'view' intent rather than here, so it can no longer be mistaken for
 *     permission to start a new attempt.
 */
export function calculateLockReason(
  definition: AssessmentDefinition,
  facts: MemberAssessmentFacts,
  completedPrerequisiteKeys: ReadonlySet<AssessmentKey>
): LockReason | null {
  // A coach assignment is the one thing that adds access on top of the
  // plan, so it short-circuits every rule below rather than being weighed
  // against them.
  if (facts.pendingAssignment) return null;

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

/**
 * Safe, simple, member-facing copy for a lock reason. Never diagnostic,
 * never CHEK/HLC1, no em dashes.
 *
 * A membership lock NAMES THE PLAN (2026-08-27). It used to say "Available
 * with a Membership plan" for both paid levels, which meant the card and
 * the sheet a member tapped to understand it could give her two different
 * answers, and neither matched what /admin/access calls her plan.
 */
export function describeLockReason(reason: LockReason, prerequisiteNames: string[] = []): string {
  switch (reason.kind) {
    case 'membership':
      return reason.requiredLevel === 'holistic_reset'
        ? 'Available with the 24 week program.'
        : 'Available with a Monthly plan.';
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

  // FINISHED OUTRANKS LOCKED (2026-08-27). A lock reason now answers "may
  // she START this", and her own completed history is deliberately not an
  // answer to that question any more. It is still the answer to "what is
  // this card", though: a questionnaire she finished reads as completed on
  // every screen, whatever her plan says today, so her results never
  // disappear behind a lock. The 'scheduled' branch keeps its previous
  // precedence over 'completed' exactly as it had it.
  if (hasEverCompleted(facts)) {
    // A REASSESSMENT IS A SECOND LOOK, NEVER A FIRST ONE (2026-08-27). A
    // pending schedule for something she has never finished is a scheduler
    // fault, not a status: it used to badge a questionnaire she had never
    // opened as "Reassessment due". See calculateLockReason's header.
    if (facts.pendingReassessmentSchedule) {
      return { status: 'scheduled', lockReason: null };
    }
    return { status: 'completed', lockReason: null };
  }

  if (lockReason) {
    return { status: 'locked', lockReason };
  }

  // An open draft only reads as 'in_progress' while she has never finished
  // this assessment. A draft on top of a completed one is a retake, and
  // calling that 'in_progress' told every reader she had never finished it
  // at all.
  if (facts.completionStatus === 'in_progress') {
    return { status: 'in_progress', lockReason: null };
  }

  return { status: 'available', lockReason: null };
}
