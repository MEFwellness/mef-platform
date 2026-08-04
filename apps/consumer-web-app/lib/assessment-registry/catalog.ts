/**
 * Catalog categorization — the Questionnaires destination's one grouping
 * function (Available / Premium / Assigned / Completed). Separate from
 * calculateAssessmentStatus (status.ts), which still computes the
 * lock/coach/in-progress facts this reads — this file only decides which
 * of the four sections an assessment belongs in, and which flags (locked,
 * scheduled, reassessment-due, coming-soon, in-progress) decorate it there.
 *
 * Locked and scheduled are deliberately flags, not sections: a locked
 * Premium item still renders in Premium (with an upgrade prompt) rather
 * than a dead-end "Locked" bucket, and an overdue reassessment moves out
 * of Completed into Available/Premium (flagged "Reassessment due") instead
 * of sitting inert in a "Scheduled" bucket forever.
 *
 * Coach-Assign-Only Gating task (2026-08-04): a `requiresAssignment`
 * assessment nobody has assigned yet used to categorize into its own
 * invisible `hidden` section (a member saw nothing at all). It's now the
 * same pattern as every other lock reason above — a real, visible, locked
 * card in Available/Premium (`flags.locked = true`,
 * `flags.lockReasonKind = 'not_assigned'`) — per the explicit product
 * requirement that gating be visible, not invisible. `CatalogSection` no
 * longer has a `hidden` member at all.
 *
 * Reads the exact same facts (facts.ts) and definitions (registry.ts) that
 * calculateAssessmentStatus does — no new tables, no new query shape, just
 * a different grouping of the same data. Both the Home summary card and
 * the Questionnaires destination call this (via
 * app/actions/questionnaireCatalog.ts), so there is exactly one rendering
 * path for questionnaire status.
 */

import type { AssessmentDefinition, AssessmentKey } from './types';
import { calculateLockReason, describeLockReason, type LockReason, type MemberAssessmentFacts } from './status';

export type CatalogSection = 'assigned' | 'completed' | 'premium' | 'available';

export type CatalogFlags = {
  locked: boolean;
  lockMessage: string | null;
  /** Which kind of lock this is, when locked (see LockReason). Coach-Assign-Only Gating task (2026-08-04): a card's UI needs to tell "not assigned by a coach yet" apart from a membership-tier/program/prerequisite lock, since only the former gets the dimmed/gold-marker/tap-to-reveal treatment — the others keep their existing "Locked" pill + upgrade prompt. */
  lockReasonKind: LockReason['kind'] | null;
  comingSoon: boolean;
  inProgress: boolean;
  /** Set only once a pending reassessment schedule's due date has arrived — an actionable, not just informational, flag. */
  reassessmentDueAt: string | null;
  /** Set only while a pending reassessment schedule's due date is still in the future. */
  scheduledAt: string | null;
  retakeAvailable: boolean;
};

export type CatalogEntry = {
  section: CatalogSection;
  flags: CatalogFlags;
};

function isReassessmentDue(facts: MemberAssessmentFacts, now: Date): boolean {
  return Boolean(
    facts.pendingReassessmentSchedule && new Date(facts.pendingReassessmentSchedule.dueAt) <= now
  );
}

export function categorizeForCatalog(
  definition: AssessmentDefinition,
  facts: MemberAssessmentFacts,
  now: Date = new Date(),
  completedPrerequisiteKeys: ReadonlySet<AssessmentKey> = new Set()
): CatalogEntry {
  const isPremium = definition.membership.minLevel !== 'free_trial';
  const comingSoon =
    definition.isComingSoon || definition.implementationStatus !== 'live' || !definition.isActive;

  if (comingSoon) {
    return {
      section: isPremium ? 'premium' : 'available',
      flags: {
        locked: false,
        lockMessage: null,
        lockReasonKind: null,
        comingSoon: true,
        inProgress: false,
        reassessmentDueAt: null,
        scheduledAt: null,
        retakeAvailable: false,
      },
    };
  }

  // A pending coach assignment is an explicit override, same as
  // calculateAssessmentStatus — it always wins the section, and no lock
  // reason is even computed against it (real access is still enforced
  // server-side in access.ts against this same assignment row).
  if (facts.pendingAssignment) {
    return {
      section: 'assigned',
      flags: {
        locked: false,
        lockMessage: null,
        lockReasonKind: null,
        comingSoon: false,
        inProgress: facts.completionStatus === 'in_progress',
        reassessmentDueAt: null,
        scheduledAt: null,
        retakeAvailable: false,
      },
    };
  }

  // Coach-Assign-Only Gating task (2026-08-04): a `requiresAssignment`
  // assessment nobody has assigned yet is now a *visible, locked* card,
  // not an invisible one (see CatalogQuestionnaireCard for the dimmed/
  // gold-marker/tap-to-reveal rendering) — calculateLockReason already
  // returns `{ kind: 'not_assigned' }` for exactly this condition, so it
  // falls straight through into the same locked-card path every other
  // lock reason (membership/program/prerequisite) already used below.
  // Never hides a member's own in-progress draft or completed history —
  // pendingAssignment/completionStatus are checked first, same as before.
  const lockReason = calculateLockReason(definition, facts, completedPrerequisiteKeys);
  const reassessmentDue = isReassessmentDue(facts, now);
  const isCompleted = facts.completionStatus === 'completed' && !reassessmentDue;

  const section: CatalogSection = isCompleted ? 'completed' : isPremium ? 'premium' : 'available';

  return {
    section,
    flags: {
      locked: Boolean(lockReason),
      lockMessage: lockReason ? describeLockReason(lockReason) : null,
      lockReasonKind: lockReason?.kind ?? null,
      comingSoon: false,
      inProgress: facts.completionStatus === 'in_progress',
      reassessmentDueAt: reassessmentDue ? facts.pendingReassessmentSchedule!.dueAt : null,
      scheduledAt:
        facts.pendingReassessmentSchedule && !reassessmentDue
          ? facts.pendingReassessmentSchedule.dueAt
          : null,
      retakeAvailable: isCompleted && definition.retake.retakeAllowed,
    },
  };
}
