/**
 * =====================================================================
 * LAYER 2. THE ROOTED RESET EXPERIENCE. Every sentence a member reads.
 * =====================================================================
 *
 * WHAT IS AND IS NOT AUTHORED HERE. The sixteen questions and the five
 * response labels are the INSTRUMENT and live in ./instrument.ts, frozen.
 * What is here is the frame around them: the invitation, the pop-up, the
 * Home card, the opening screen, the pauses, the completion moment and the
 * words around her result. Rewriting anything in this file changes what
 * she reads and changes no answer, no point and no total, which is the
 * whole reason the two files are separate.
 *
 * THIS FILE IMPORTS THE INSTRUMENT FOR NOTHING. Not a prompt, not a label,
 * not a number. The import direction is one way and
 * tests/breathing-check-in-layers.test.ts asserts it, so an edit here can
 * never reach the validated layer by accident.
 *
 * SHE IS NEVER SHOWN A NUMBER FROM THE SCORING MODEL. Not while she is
 * answering and not afterwards. There is no sentence in this file carrying
 * her total, the maximum, a percentage or the reference threshold, and a
 * test scans it for digits to keep it that way. "16 questions" and the two
 * minute estimate are facts about the task in front of her, not about her
 * result, and they are named separately below so the scan can allow
 * exactly those.
 *
 * IT NAMES NO CONDITION. No sentence in this file diagnoses, and none
 * mentions dysfunctional breathing, hyperventilation, anxiety disorder or
 * any respiratory disease. A test asserts that too.
 *
 * NO EM DASHES. Commas, periods, colons or parentheses.
 */

/** The two facts about the TASK she is shown up front. Not facts about her result. */
export const BPC_QUESTION_COUNT_LABEL = '16 questions';
export const BPC_DURATION_LABEL = 'About 2 minutes';

export const BPC_COPY = {
  // The pop-up Root knocks with, and the Home card that stands until she
  // finishes.
  popupEyebrow: 'From Root',
  popupTitle: 'Breathing Pattern Check-In',
  popupBody:
    'Your coach has asked for a short read on your breathing and the sensations that travel with it.',
  popupCta: 'Start the check-in',

  cardTitle: 'From your coach',
  cardBody: 'Breathing Pattern Check-In',
  cardDuration: `${BPC_QUESTION_COUNT_LABEL} · ${BPC_DURATION_LABEL}`,
  cardCta: 'Begin Check-In',
  cardResumeCta: 'Pick up where you left off',
  cardFootnote: 'You can leave and come back. Your answers save as you go.',

  // The opening screen. Deliberately spare: one heading, two sentences, one
  // line of facts, one button.
  introTitle: 'Breathing Pattern Check-In',
  introLineOne:
    'Breathing patterns can influence tension, energy, focus, sleep, and how your body responds to stress.',
  introLineTwo:
    'This short check-in helps us understand what your body may be communicating through your breathing and related sensations.',
  introMeta: `${BPC_QUESTION_COUNT_LABEL} · ${BPC_DURATION_LABEL}`,
  introCta: 'Begin Check-In',

  // Coming back to one she started.
  resumeTitle: 'Welcome back.',
  resumeBody: 'Your answers are where you left them. Pick up from here.',
  resumeCta: 'Continue my check-in',

  // The chrome above every question.
  progressLabel: 'Breathing Pattern Check-In',
  backLabel: 'Back',
  homeLabel: 'Close and come back later',
  continueLabel: 'Continue',

  /**
   * The one small line above every question.
   *
   * IT IS THE SAME ON ALL SIXTEEN SCREENS, on purpose. It is the window
   * the instrument asks about, and a window that changed wording partway
   * through would be a different question.
   */
  questionContextLine: 'Over the past few weeks, how often have you experienced',

  // The completion moment.
  completionTitle: 'Your breathing pattern is ready.',

  // Something went wrong.
  saveError: 'That did not save. Please check your connection and try again.',

  // Her results.
  resultsTitle: 'Your Breathing Pattern',
  resultsSignalsHeading: 'What is showing up',
  /**
   * THE DISCLAIMER, AND IT IS NOT OPTIONAL FURNITURE. It is drawn on every
   * results screen, under the reading, in the same component, so there is
   * no path through this experience that shows her a result without it.
   */
  resultsDisclaimer:
    'This check-in is not a diagnosis. It gives you and your coach a starting point for understanding patterns that may be worth exploring.',
  resultsPrimaryCta: 'Review With My Coach',
  resultsSecondaryCta: 'Return Home',
  resultsCoachNote: 'Your coach can see this alongside your other Rooted Reset assessments.',

  // Opening a route she has already finished.
  alreadyDoneTitle: 'You have already finished this one.',
  alreadyDoneBody: 'Here is what you told us last time.',
} as const;

/**
 * WHY THE PRIMARY BUTTON IS "Review With My Coach" AND NOT
 * "See My Breathing Reset".
 *
 * A button never claims what the rows cannot support. The Breathing Reset
 * experience does not exist yet, so a primary action offering to open it
 * would be a promise with no destination, and the standing rule is that an
 * offer's primary action OPENS the thing. "Review With My Coach" is true
 * today: her coach genuinely receives this and it genuinely lands on his
 * client screen. When the Breathing Reset ships, this constant and the
 * href beside it are the one place that changes.
 *
 * NEITHER BUTTON WRITES A COMPLETION. Both are navigation, so neither can
 * record an act she has not performed.
 */
export const BPC_RESULTS_PRIMARY_HREF = '/conversation';

/**
 * The three pauses, at questions four, eight and twelve.
 *
 * THEY SAY NOTHING ABOUT HER ANSWERS. No score, no category, no
 * observation, no "you seem". Anything about what she has said so far
 * would change what she says next, which is the exact thing a validated
 * instrument cannot tolerate. Each one is an encouragement and a statement
 * about the process, and a test asserts none of them contains a second
 * person judgement.
 *
 * THEY ARE THREE DIFFERENT SCREENS rather than one shown three times,
 * because sixteen identical screens is the problem these exist to solve
 * and three identical pauses would be the same problem in miniature.
 *
 * afterPosition is the question number the pause follows, which is what
 * ./steps.ts reads. Nothing else decides where they land.
 */
export type BpcMilestone = {
  afterPosition: number;
  heading: string;
  line: string;
};

export const BPC_MILESTONES: readonly BpcMilestone[] = [
  {
    afterPosition: 4,
    heading: "You're doing well.",
    line: 'Each answer is helping us build a clearer picture of how your breathing and body have been responding lately.',
  },
  {
    afterPosition: 8,
    heading: 'Halfway.',
    line: 'There are no right answers here. Whatever comes to mind first is usually the most useful one.',
  },
  {
    afterPosition: 12,
    heading: 'Almost there.',
    line: 'Just a few more, and then we will show you what your answers describe.',
  },
] as const;
