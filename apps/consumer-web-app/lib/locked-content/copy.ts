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
 * THE COACH SENTENCE IS GONE (Build 2, 2026-08-27). There used to be a
 * note reading "Your coach opens this one for you when the timing is
 * right", shown whenever a questionnaire was held shut by the
 * coach-assign-only flag. That flag is deleted and a missing assignment
 * locks nothing, so there is no state left in the app where that sentence
 * would be true. A coach assignment now only ever OPENS a card, and an
 * open card has no note. The sentence is removed rather than kept for a
 * state that no longer exists.
 */

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

/** The one message for one lock. Every locked card asks this, so no two screens can describe the same lock differently. Deliberately has no default branch: adding a lock reason without giving it a sentence is a type error, not a silent fallback. */
export function lockNoteMessage(reason: LockReason): string {
  switch (reason.kind) {
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
  }
}

/** Whether this lock is one a member can act on herself, which is the only case the sheet offers her a link. */
export function lockOffersPlanLink(reason: LockReason): boolean {
  return reason.kind === 'membership';
}
