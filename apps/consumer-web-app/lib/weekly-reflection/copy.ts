/**
 * Every sentence the Weekly Reflection says in its own voice.
 *
 * Part 1's sentences are NOT here: those are rendered from descriptors by
 * ./recap.ts through the three-tier language module, which is the whole
 * point of that design. What is here is the frame around them, and the
 * closing screen.
 *
 * NO EM DASHES. Commas, periods, colons or parentheses.
 *
 * SAY ONLY WHAT IS TRUE TODAY. The closing screen says her coach will read
 * this with her, and that is true: it lands on the coach's own client
 * screen the moment she submits, beside the identical recap. It promises
 * no date, no reply and no analysis back, because none of those exist.
 */

/** The name of this experience, everywhere a member or coach reads it. One name per thing. */
export const WEEKLY_REFLECTION_LABEL = 'Weekly Reflection';

export const WEEKLY_REFLECTION_COPY = {
  /** The pop-up. */
  popupEyebrow: 'From Root',
  popupTitle: 'Your Weekly Reflection is ready',
  popupBody:
    'A few minutes to look back at your week. Root will read the week back to you first, then ask you five questions. Your coach reads it with you.',
  popupCta: 'Start now',

  /** The persistent card on Home, once the pop-up has had its turn. */
  cardTitle: 'Look back at your week',
  cardBody: 'Open when you have a few quiet minutes. Available through Sunday night.',
  /**
   * The same card for a member whose coach sent her this one (migration
   * 193). It names no deadline, because the automatic window's Sunday
   * night is not hers: an assigned week runs from its Friday to the
   * following Thursday, and promising a night that is not the right one
   * would be an undated promise dressed up as a dated one.
   */
  cardBodyAssigned: 'Your coach opened this one for you. Open it when you have a few quiet minutes.',
  cardCta: 'Start your reflection',

  /** Part 1. */
  recapEyebrow: 'Part 1 of 3',
  recapHeading: 'Your week, according to Root',
  recapContinue: 'Continue',

  /** Part 2. */
  questionsEyebrow: 'Part 2 of 3',
  questionsHeading: 'Your reflection',
  questionContinue: 'Continue',
  questionSubmit: 'Finish',
  questionBack: 'Back',

  /** Part 3. */
  closingEyebrow: 'Part 3 of 3',
  closingHeading: 'Thank you for taking the time',
  closingBody:
    'Your reflection is saved. Your coach will read this with you, alongside the same week Root just showed you.',
  closingDone: 'Back to home',

  /** Said when she opens the experience again in a week she has already finished. */
  alreadyDoneHeading: 'This week is done',
  alreadyDoneBody:
    "You have already finished this week's reflection. Your coach can see it. The next one opens on Friday.",
  /**
   * The same screen for a member whose coach sent her this one. It stops
   * at what is true: she finished it and her coach can read it. "The next
   * one opens on Friday" is the program tier's promise and is simply false
   * for a member who is not on it, so it is not made.
   */
  alreadyDoneBodyAssigned:
    "You have already finished this one. Your coach can see it.",

  /** The one thing that can go wrong on submit. */
  submitError: 'We could not save that. Please try again.',

  /** Leaving early. */
  exitLabel: 'Close',
} as const;

/** The heading over the five answers on the coach's screen. The member's own screen never shows them back to her: Part 3 is a warm confirmation, not a summary (the brief, and the reason there is no second heading here). */
export const REFLECTION_ANSWERS_HEADING = 'In their own words';
