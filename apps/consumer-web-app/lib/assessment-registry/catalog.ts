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
 * THE PLAN CHOOSES THE SECTION (Build 2, 2026-08-27). `isPremium` below
 * is exactly "her plan does not include this at trial level", which is
 * also exactly what locks the card, so a card can no longer sit in a
 * section that contradicts the sentence printed on it. Gating is visible,
 * never invisible: a locked item is a real, dimmed, tappable card in
 * Premium, and `CatalogSection` has no `hidden` member at all.
 *
 * Reads the exact same facts (facts.ts) and definitions (registry.ts) that
 * calculateAssessmentStatus does — no new tables, no new query shape, just
 * a different grouping of the same data. Both the Home summary card and
 * the Questionnaires destination call this (via
 * app/actions/questionnaireCatalog.ts), so there is exactly one rendering
 * path for questionnaire status.
 */

import { lockNoteMessage } from '@/lib/locked-content/copy';
import type { AssessmentDefinition, AssessmentKey, MembershipKey } from './types';
import {
  calculateLockReason,
  describeLockReason,
  hasEverCompleted,
  hasRetakeInProgress,
  type LockReason,
  type MemberAssessmentFacts,
} from './status';

export type CatalogSection = 'assigned' | 'completed' | 'premium' | 'available';

export type CatalogFlags = {
  locked: boolean;
  lockMessage: string | null;
  /** Which kind of lock this is, when locked (see LockReason). Carried for the paywall analytics event and for deciding whether the sheet offers a plan link, never for choosing the sentence: that is `lockNote`. */
  lockReasonKind: LockReason['kind'] | null;
  /** Which plan level a membership lock is waiting on, so the card's note can name the plan without parsing a sentence. Null for every other lock kind. */
  lockRequiredLevel: MembershipKey | null;
  /** Root's note for this exact lock, from lib/locked-content/copy.ts, computed here so the card that shows it and the sheet that explains it cannot drift into two different sentences. Null whenever the card is not locked. */
  lockNote: string | null;
  comingSoon: boolean;
  /** She has an open draft and has NEVER finished this one. A draft sitting on top of a completed assessment is `retakeInProgress` instead, so a card can never lose its completed state to a stray draft. */
  inProgress: boolean;
  /** She has finished this before AND has an open draft of it now: a retake she has started, labelled as one. */
  retakeInProgress: boolean;
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

/**
 * A REASSESSMENT IS A SECOND LOOK (2026-08-27). `hasEverCompleted` is the
 * whole point of this guard: the daily scan wrote pending schedules for
 * questionnaires members had never opened, and this function badged them
 * "Reassessment due" with a "Start Reassessment" button under it. There is
 * no reassessing something that was never assessed.
 */
function isReassessmentDue(facts: MemberAssessmentFacts, now: Date): boolean {
  return Boolean(
    hasEverCompleted(facts) &&
    facts.pendingReassessmentSchedule &&
    new Date(facts.pendingReassessmentSchedule.dueAt) <= now
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
        lockRequiredLevel: null,
        lockNote: null,
        comingSoon: true,
        inProgress: false,
        retakeInProgress: false,
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
        lockRequiredLevel: null,
        lockNote: null,
        comingSoon: false,
        inProgress: facts.completionStatus === 'in_progress' && !hasEverCompleted(facts),
        retakeInProgress: hasRetakeInProgress(facts),
        reassessmentDueAt: null,
        scheduledAt: null,
        retakeAvailable: false,
      },
    };
  }

  const lockReason = calculateLockReason(definition, facts, completedPrerequisiteKeys);
  const reassessmentDue = isReassessmentDue(facts, now);
  // COMPLETION IS PERMANENT (2026-08-27). Reading `completionStatus` alone
  // here is what sent a finished free experience back to the Available
  // section: the empty draft the take page created on completion made the
  // status view answer 'in_progress', the card lost its completed state,
  // and pickNextFreeArcCard offered the conversation again the next
  // morning. hasEverCompleted asks the question this line actually means.
  const isCompleted = hasEverCompleted(facts) && !reassessmentDue;

  const section: CatalogSection = isCompleted ? 'completed' : isPremium ? 'premium' : 'available';

  // Locked means "she cannot start this and has nothing of her own here".
  // A questionnaire she HAS finished never renders as a locked card even
  // when her plan no longer includes starting a new attempt, because the
  // card is how she reaches her own results. What she may not do is begin
  // again: that is `retakeAvailable` below, which reads the lock directly.
  const lockedForStarting = Boolean(lockReason);
  /** Locked by something she cannot resolve today: her plan, or her program enrolment. A prerequisite is not one of these. */
  const outsideHerPlan = Boolean(lockReason) && lockReason!.kind !== 'prerequisite';
  const hasOwnHistory = hasEverCompleted(facts);

  return {
    section,
    flags: {
      locked: lockedForStarting && !hasOwnHistory,
      lockMessage: lockedForStarting && !hasOwnHistory ? describeLockReason(lockReason!) : null,
      lockReasonKind: lockedForStarting && !hasOwnHistory ? lockReason!.kind : null,
      lockRequiredLevel:
        lockedForStarting && !hasOwnHistory && lockReason!.kind === 'membership'
          ? lockReason!.requiredLevel
          : null,
      lockNote: lockedForStarting && !hasOwnHistory ? lockNoteMessage(lockReason!) : null,
      comingSoon: false,
      // A CARD HER PLAN DOES NOT REACH IS NOT "IN PROGRESS" (Build 2,
      // 2026-08-27). The card was still reporting inProgress for a draft
      // on a questionnaire she cannot start, which put "0 of 91 questions
      // answered" inside the dimmed card and told the free-arc and
      // priority cards to say "Continue". The real production case is one
      // member's abandoned, zero-answer Whole-Body Check-In on a plan that
      // does not include it. The draft is not deleted, the overview screen
      // still lets her reach anything of her own (access.ts's 'view'
      // intent), and nothing of hers is lost. It simply stops being an
      // invitation to something she does not have.
      //
      // A PREREQUISITE lock is deliberately excluded: that is a step she
      // can finish today, not a plan she is outside of, and her draft of
      // the step after it is genuinely hers to pick up once she has.
      inProgress:
        !outsideHerPlan && facts.completionStatus === 'in_progress' && !hasEverCompleted(facts),
      retakeInProgress: hasRetakeInProgress(facts),
      reassessmentDueAt: reassessmentDue ? facts.pendingReassessmentSchedule!.dueAt : null,
      scheduledAt:
        facts.pendingReassessmentSchedule && hasOwnHistory && !reassessmentDue
          ? facts.pendingReassessmentSchedule.dueAt
          : null,
      retakeAvailable: isCompleted && definition.retake.retakeAllowed && !lockedForStarting,
    },
  };
}
