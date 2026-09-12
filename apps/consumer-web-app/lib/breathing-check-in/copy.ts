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
 * SHE IS SHOWN NO NUMBER WHILE SHE IS ANSWERING, AND HER SCORE
 * AFTERWARDS. No sentence in THIS file carries a total, a maximum, a
 * percentage or the reference threshold: every number on her results
 * screen is formatted from the stored result at render time, so the words
 * here and the arithmetic there can never drift into disagreeing. A test
 * still scans this file for digits and allows only "16 questions" and the
 * two minute estimate, which are facts about the task in front of her.
 *
 * IT NAMES NO CONDITION. No sentence in this file diagnoses, and none
 * mentions dysfunctional breathing, hyperventilation, anxiety disorder or
 * any respiratory disease. A test asserts that too. There is exactly ONE
 * allowed exception and it is named in the guard by constant:
 * resultsScoreDisclaimer, the sentence whose whole job is to say what her
 * score is NOT.
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

  // ------------------------------------------------------------------
  // Her results.
  //
  // THE ORDER ON THE SCREEN IS: the score, the scale it sits on, what the
  // score means, the answers that came back highest, then the three named
  // areas, then the disclaimer and the two buttons. Every sentence below
  // is authored for exactly one of those, and the component draws them in
  // that order.
  // ------------------------------------------------------------------

  /** The small label above the number. Drawn in upper case by the screen. */
  resultsTitle: 'Your Breathing Pattern',

  /**
   * The one line under the number.
   *
   * AT the reference figure counts as above it, which is how the figure is
   * published and how the coach's own card reads it. One rule
   * (bpcAtOrAboveReferenceThreshold), two screens.
   */
  resultsAboveThresholdLine: 'Above the traditional reference threshold',
  resultsBelowThresholdLine: 'Below the traditional reference threshold',

  // The scale. Its three landmarks are the two ends and the reference
  // figure, and it deliberately draws no bands: an instrument that
  // publishes one reference point does not license four coloured zones.
  resultsScaleThresholdLabel: 'Traditional reference threshold',
  resultsScaleYourScoreLabel: 'Your score',
  /** Read out to a screen reader in place of the bar itself. */
  resultsScaleAriaPrefix: 'Your score on a scale from',

  resultsMeaningHeading: 'What your score means',
  resultsMeaningAbove:
    'Your score suggests that several breathing related signals are occurring frequently enough to be worth exploring further with your coach.',
  resultsMeaningBelow:
    'Your score suggests breathing related signals are showing up less frequently. It is still worth reviewing what stood out with your coach.',

  /**
   * THE ONE SENTENCE ALLOWED TO NAME WHAT THIS IS NOT.
   *
   * The guard in tests/breathing-check-in-layers.test.tsx names this
   * constant explicitly, so the exception is one reviewed sentence rather
   * than a hole in the scan.
   */
  resultsScoreDisclaimer:
    'This is not a diagnosis of a breathing disorder. Your score is one part of understanding your breathing pattern, stress load, and overall health.',

  resultsStrongestHeading: 'Your strongest signals',
  /** Three or four of them. */
  resultsStrongestIntro: 'These came back most often in your answers.',
  /** Exactly two. */
  resultsStrongestIntroTwo: 'Two came back at the higher end of the scale.',
  /** Exactly one. */
  resultsStrongestIntroOne: 'One came back at the higher end of the scale.',
  /** None did. The section still stands, and says so plainly. */
  resultsStrongestEmpty:
    'Nothing came back at the higher end of the scale this time. What you did notice is below.',

  resultsSignalsHeading: 'What stood out in your responses',
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
 * WHY THE PRIMARY BUTTON IS "Review With My Coach", AND WHERE IT NOW GOES.
 *
 * A button never claims what the rows cannot support. The Breathing Reset
 * experience still does not exist, so a primary action offering to open it
 * would be a promise with no destination. "Review With My Coach" is true
 * today, and as of this change it is true IMMEDIATELY: it opens a Root
 * conversation rather than only sending the sitting to a coach's screen,
 * so the review starts the moment she taps rather than whenever he next
 * logs in. Her coach still receives the sitting exactly as before.
 *
 * THE ENTRY POINT IS WHAT CARRIES THE CONTEXT. /conversation reads
 * `entry`, and for this one it builds Root's opening line and the context
 * string from her OWN stored sitting, server side. The href carries no
 * score, so a pasted or edited link cannot describe a sitting that is not
 * hers.
 *
 * NEITHER BUTTON WRITES A COMPLETION. Both are navigation, so neither can
 * record an act she has not performed.
 */
export const BPC_CONVERSATION_ENTRY = 'breathing_check_in' as const;
export const BPC_RESULTS_PRIMARY_HREF = `/conversation?entry=${BPC_CONVERSATION_ENTRY}`;

/**
 * What Root opens with when she arrives from her results.
 *
 * IT IS DRAWN, NOT STORED. The conversation page prints it in place of the
 * generic empty state prompt, and writes no message row: a render that
 * inserted a message would insert one again on every re-render of that
 * route, and a Server Action on that page re-renders it. Her first real
 * message is the first row in the thread, exactly as on every other entry
 * point.
 */
export const BPC_CONVERSATION_OPENER =
  'You just finished your Breathing Pattern Check-In. Want to walk through what stood out?';

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
