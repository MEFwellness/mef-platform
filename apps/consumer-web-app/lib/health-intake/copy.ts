/**
 * Every sentence the Health & Lifestyle Intake says in its own voice.
 *
 * WHAT IS AND IS NOT AUTHORED HERE. The eleven chapters and every question
 * inside them live in ./questions.ts, because they are the instrument.
 * What is here is the frame around them: the invitation, the pop-up, the
 * Home card, the resume, the completion and the one calm sentence that
 * appears when an answer she gave is better discussed with a clinician.
 *
 * ROOT SAYS NOTHING ABOUT HER. This experience produces no score, no band,
 * no pattern and no observation, so there is no sentence anywhere in this
 * file that describes the member, ranks her answers or draws a conclusion
 * from them.
 *
 * THE SAFETY SENTENCE NEVER DIAGNOSES, AND ITS SHAPE IS THE POINT. It
 * names no condition, no cause and no likelihood. It says that some things
 * are better discussed with a clinician and suggests she do that. The four
 * forbidden openings ("You have", "This means", "This is caused by", "This
 * is likely") are asserted against this file by
 * tests/health-intake-safety.test.ts, so a later edit cannot quietly turn
 * it into an explanation.
 *
 * SAY ONLY WHAT IS TRUE TODAY. The completion says her coach will use this
 * alongside her other Rooted Reset assessments, which is true the moment
 * she finishes: it lands on the coach's own client screen. It promises no
 * reply, no date and no analysis back, because none of those exist.
 *
 * NO EM DASHES. Commas, periods, colons or parentheses.
 */

export const HLI_COPY = {
  // The pop-up Root knocks with, and the Home card that stands until she
  // finishes.
  popupEyebrow: 'From Root',
  popupTitle: 'Health & Lifestyle Intake',
  popupBody:
    'Your coach has asked for the bigger picture: your history, your rhythms, and what you have already tried.',
  popupCta: 'Start the intake',

  cardTitle: 'From your coach',
  cardBody: 'Health & Lifestyle Intake',
  cardDuration: 'About 8 to 10 minutes',
  cardCta: 'Begin my intake',
  cardResumeCta: 'Pick up where you left off',
  cardFootnote: 'You can leave and come back. Your answers save as you go.',

  // The opening screen.
  introTitle: 'Health & Lifestyle Intake',
  introBody:
    "Before we build your plan, let's understand the bigger picture. Your health history, daily rhythms, what you've been experiencing, and what you've already tried help your coach understand the context behind how you're feeling.",
  reassuranceOne: 'About 8 to 10 minutes',
  reassuranceTwo: 'Your answers are private',
  reassuranceThree: 'You can leave and come back',
  introButton: 'Begin My Intake',

  // Coming back to one she started.
  resumeTitle: 'Welcome back.',
  resumeBody: 'Your answers are where you left them. Pick up from here.',
  resumeCta: 'Continue my intake',

  // The chrome.
  continueLabel: 'Continue',
  backLabel: 'Back',
  homeLabel: 'Close and come back later',
  skipLabel: 'Skip this one',
  optionalHint: 'Optional',
  addAnotherHint: 'You can add as many as you need.',
  editLabel: 'Edit',
  removeLabel: 'Remove',
  saveEntryLabel: 'Save',
  cancelLabel: 'Cancel',
  entryEmptyHint: 'Nothing added yet.',

  // Changing an answer that closes a branch.
  confirmTitle: 'Just checking.',
  confirmKeep: 'Keep what I had',
  confirmRemove: 'Yes, remove it',

  // The completion.
  completionTitle: "You're all set.",
  completionBody: "We've got a clearer picture of where you're starting from.",
  completionCardOneTitle: 'What you want help with',
  completionCardTwoTitle: 'Areas you told us about',
  completionCardThreeTitle: 'Next step',
  completionCardThreeBody:
    'Your coach will use this alongside your other Rooted Reset assessments to personalize what comes next.',
  completionCta: 'Done',
  completionSubmitCta: 'Finish my intake',

  // Already finished, opened again from a link.
  alreadyDoneTitle: 'This one is already done.',
  alreadyDoneBody: 'Your coach has what you sent. There is nothing else to fill in here.',

  saveError: 'That did not save. Check your connection and try again.',

  /**
   * THE ONE MEMBER FACING SAFETY SENTENCE.
   *
   * Calm, neutral, and about what to do rather than about what is wrong.
   * It appears once, on the completion screen, for a member whose answers
   * matched a rule in ./safety.ts. It is never attached to the question
   * that triggered it, because a line appearing under one answer tells her
   * which answer alarmed the app, which is the closest thing to a
   * diagnosis a wellness product can do by accident.
   */
  safetyTitle: 'One thing worth mentioning.',
  safetyBody:
    'Some symptoms are best discussed directly with a qualified healthcare professional. Consider checking in with your healthcare provider, particularly if this is new, severe, or worsening.',
} as const;

/** The three reassurance points, in the order the opening screen prints them. */
export const HLI_REASSURANCE: readonly string[] = [
  HLI_COPY.reassuranceOne,
  HLI_COPY.reassuranceTwo,
  HLI_COPY.reassuranceThree,
];

/**
 * The four openings no sentence a member reads may ever start with.
 *
 * Held as data so the copy test can scan this whole feature for them
 * rather than trusting a reviewer to notice.
 */
export const FORBIDDEN_DIAGNOSIS_OPENINGS: readonly string[] = [
  'You have',
  'This means',
  'This is caused by',
  'This is likely',
];
