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
 * and no promise the app cannot keep. Exactly one sentence here says she
 * will be told when something opens, COACH_ASSIGNMENT_LOCK_MESSAGE, and it
 * says it because the four cards that show it really are announced: a Root
 * knock and a Home card, both written off the assignment row. No plan
 * sentence may say it, because no plan change announces itself.
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

/**
 * THE FOUR THAT ONLY A COACH OPENS (2026-09-12).
 *
 * The Health & Lifestyle Intake, the Rooted Reset Body Systems Survey, the
 * Rooted Reset Whole-Body Signal Assessment and the Breathing Pattern
 * Check-In are locked for every member on every plan until a coach hands
 * one over. A plan sentence on those four would be false, so they get
 * their own, and it is the only one in this file that mentions a coach.
 *
 * THE SECOND SENTENCE IS A PROMISE THE APP ACTUALLY KEEPS, which is why it
 * is allowed here at all. Every one of the four already has its own knock
 * in the Root pop-up chain (app/actions/rootPopupMessages.ts) and its own
 * persistent Home card, both driven by the assignment row itself, so a
 * member really is told the moment her coach sends one. Nothing else in
 * this file may say she will be told, because nothing else has that.
 */
export const COACH_ASSIGNMENT_LOCK_MESSAGE =
  "This one opens once your coach assigns it to you. I'll let you know the moment it's ready.";

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

/**
 * A retired assessment has no card on the shelf, so no member reads this
 * one from a locked card. It exists because the switch below deliberately
 * has no default branch, and because a direct URL to a retired
 * assessment's overview still needs a plain sentence rather than silence.
 */
export const RETIRED_LOCK_MESSAGE =
  'This one has been replaced by a newer assessment. Your past results are still here.';

/** The one message for one lock. Every locked card asks this, so no two screens can describe the same lock differently. Deliberately has no default branch: adding a lock reason without giving it a sentence is a type error, not a silent fallback. */
export function lockNoteMessage(reason: LockReason): string {
  switch (reason.kind) {
    case 'membership':
      return reason.requiredLevel === 'holistic_reset'
        ? PROGRAM_PLAN_LOCK_MESSAGE
        : MONTHLY_PLAN_LOCK_MESSAGE;
    case 'coach_assignment':
      return COACH_ASSIGNMENT_LOCK_MESSAGE;
    case 'retired':
      return RETIRED_LOCK_MESSAGE;
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
