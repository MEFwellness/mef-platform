/**
 * The note a member reads when she taps a locked questionnaire card.
 *
 * ONE ANSWER PER CARD (2026-08-27). This used to be a single constant that
 * said "This one opens once your coach assigns it to you", shown on every
 * locked card, while the card underneath it and the section header above
 * it said the questionnaire unlocked with a Membership plan. Two sentences
 * about the same lock, disagreeing, on one screen. The lock reason now
 * chooses the sentence, and a plan lock names the plan, in the same words
 * /admin/access uses for it.
 *
 * Root's own first-person voice (see docs/motion-experience-bible.md §15's
 * voice audit), short, warm, no em dash, no upsell or pressure language,
 * and no promise the app cannot keep: nothing here says she will be
 * notified, because nothing notifies her.
 */

import type { LockReason } from '@/lib/assessment-registry/status';

export const COACH_LOCK_NOTE_TITLE = 'A note from Root';

/**
 * Kept as a named export because it is the coach-assignment note, which is
 * still one of the answers below and is asserted directly by
 * tests/coach-assign-only-gating.test.ts.
 */
export const COACH_LOCK_NOTE_MESSAGE =
  'Your coach opens this one for you when the timing is right. It will be waiting here when they do.';

export const MONTHLY_PLAN_LOCK_MESSAGE =
  'This one comes with a Monthly plan. It will be waiting here for you when you are on it.';

export const PROGRAM_PLAN_LOCK_MESSAGE =
  'This one is part of the 24 week program. It will be waiting here for you when you start.';

export const PROGRAM_ENROLLMENT_LOCK_MESSAGE =
  'This one opens once you are enrolled in the 24 week program. It will be waiting here for you.';

export const PROGRAM_PHASE_LOCK_MESSAGE =
  'This one opens at your next phase of the program. There is nothing you need to do to get to it.';

export const PREREQUISITE_LOCK_MESSAGE =
  'There is a step before this one. Finish that first and I will open this for you here.';

/** The one message for one lock. Every locked card asks this, so no two screens can describe the same lock differently. */
export function lockNoteMessage(reason: LockReason): string {
  switch (reason.kind) {
    case 'not_assigned':
      return COACH_LOCK_NOTE_MESSAGE;
    case 'membership':
      return reason.requiredLevel === 'holistic_reset'
        ? PROGRAM_PLAN_LOCK_MESSAGE
        : MONTHLY_PLAN_LOCK_MESSAGE;
    case 'program_enrollment':
      return PROGRAM_ENROLLMENT_LOCK_MESSAGE;
    case 'program_phase':
      return PROGRAM_PHASE_LOCK_MESSAGE;
    case 'prerequisite':
      return PREREQUISITE_LOCK_MESSAGE;
    default:
      return COACH_LOCK_NOTE_MESSAGE;
  }
}

/** Whether this lock is one a member can act on herself, which is the only case the sheet offers her a link. */
export function lockOffersPlanLink(reason: LockReason): boolean {
  return reason.kind === 'membership';
}
