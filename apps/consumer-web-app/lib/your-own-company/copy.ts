/**
 * Every sentence Your Own Company says in its own voice.
 *
 * WHAT IS AND IS NOT AUTHORED HERE. The nine prompts, the three this-or-that
 * pairs and the five phrases of the rapid round live in ./questions.ts,
 * because they are the instrument. What is here is the frame around them:
 * the invitation, the three screen titles, the words the picks need to be
 * usable without sight or a mouse, the closing, the experiment and the
 * piece of reading.
 *
 * ROOT SAYS NOTHING ABOUT HER. This experience produces no score, no
 * pattern and no observation, so there is no sentence anywhere in this file
 * that describes the member, ranks her answers or draws a conclusion from
 * them. Neither card of any pair is the right one, no combination of picks
 * means anything, and the round is not graded.
 *
 * THE ONE NUMBER IS HERS. Root reads her rapid round back to her as a
 * count of her own taps ("You said Never 4 times out of 5."), which is not
 * a score and is not stored as one: it is computed in one place from the
 * five answers she gave (lib/happiness-deep-dive/interactive.ts), and her
 * coach's card reads that same function so the two can never disagree.
 *
 * NOTHING A MEMBER READS NAMES ANOTHER EXPERIENCE. This template has no
 * follow-up arm at all: it never reads another template's rows and never
 * quotes one, so there is no earlier sitting to name and no gap where one
 * would be.
 *
 * THE ONE LINE ON THE CLOSING SCREEN IS FIXED COPY, and it is worth being
 * precise about what it is allowed to mean. "You wrote both. Only one of
 * them is true." is a statement about TWO SENTENCES, both of which she
 * wrote in this sitting and both of which are printed directly above it,
 * and both of which her coach's card also prints. It names no attribute of
 * hers, predicts nothing, and does not say which of the two it means. That
 * is deliberate: the whole point of the last screen is that she is the one
 * who decides.
 *
 * NO EM DASHES. Commas, periods, colons or parentheses.
 *
 * THE MEDICAL-TITLE RULE IS ASSERTED, NOT ASSUMED. The copy test scans
 * every file this feature owns, the migration included, for the two forms
 * of that title, and neither appears anywhere in this experience.
 *
 * SAY ONLY WHAT IS TRUE TODAY. The closing says her coach can read what she
 * wrote, and that is true the moment she finishes: it lands on the coach's
 * own client screen. It promises no reply, no date and no analysis back,
 * because none of those exist.
 */

/** The name of this experience, everywhere a member or coach reads it. One name per thing. */
export const YOC_LABEL = 'Your Own Company';

/** The area it belongs to. */
export const YOC_AREA = 'Happiness';

/** The three screens and their titles. Approved copy. */
export const YOC_SECTIONS = [
  { screen: 1 as const, title: 'The Voice' },
  { screen: 2 as const, title: 'The Double Standard' },
  { screen: 3 as const, title: 'Better Company' },
] as const;

export function sectionFor(screen: 1 | 2 | 3): (typeof YOC_SECTIONS)[number] {
  return YOC_SECTIONS.find((section) => section.screen === screen) ?? YOC_SECTIONS[0];
}

/**
 * The intro, split into the lines the shared IntroReveal typewriter flows
 * in one at a time. Joined with single spaces they are the approved body
 * paragraph exactly, which tests/your-own-company-copy.test.ts asserts, so
 * the split is a pacing decision and never an edit.
 */
export const YOC_INTRO_BODY_LINES = [
  'No scores, no right answers.',
  'Root has nine questions about the voice you live with: how you speak to yourself when no one else is around.',
  'Some questions ask for your first instinct. Give it honestly.',
  'Fifteen to twenty minutes, somewhere quiet.',
] as const;

/**
 * The one sentence Root writes on the closing screen, verbatim and fixed.
 *
 * On its own constant because three things read it: the screen, the copy
 * test, and anyone reading this file to check what Root is allowed to say
 * at the end. It is the whole of what Root says there.
 */
export const YOC_CLOSING_LINE = 'You wrote both. Only one of them is true.';

/**
 * The two labels on the closing figure, one above each sentence.
 *
 * Joined with a space they are the approved label for the pair exactly,
 * which the copy test asserts, so splitting them across the two sentences
 * they belong to is a layout decision and never an edit. Each one names
 * what the sentence under it is and does nothing else: neither is a summary,
 * neither is a heading Root wrote about her, and neither ever appears
 * without her own sentence directly under it.
 */
export const YOC_CLOSING_FIRST_LABEL = 'The voice you had.';
export const YOC_CLOSING_SECOND_LABEL = 'The voice you are building.';

/**
 * Everything the instinct picks say out loud.
 *
 * KEPT TOGETHER, because these are the sentences that make a pair and a
 * round usable without a mouse: the counter that says where she is, the
 * note on the card she chose, the sentence under an unanswered pair. A
 * missing one of these is an accessibility defect rather than a wording
 * preference.
 */
export const YOC_PICK_COPY = {
  /** Said above a pair she has not answered yet. */
  pickHint: 'First instinct. There is no right one.',
  /** Said once she has picked, above the written half. */
  picked: 'Noted.',
  /** The gold note on the line she said cuts deepest. */
  deepestNote: 'Cuts deepest',
  /** The verb a screen reader hears before her words when she is choosing that line. */
  chooseDeepest: 'Choose',
  /** The accessible name of the list of her own lines at question eight. */
  linesLabel: 'What the voice says on repeat',
  /** What that list says when her question three answer produced no lines. */
  linesEmpty: 'Nothing written yet.',
  /** Above the rapid round, naming what she is about to do. */
  roundIntro: 'Five in a row. Answer each one without thinking about it.',
} as const;

export const YOC_COPY = {
  /** The pop-up. */
  popupEyebrow: 'From Root',
  popupTitle: YOC_LABEL,
  popupBody:
    'Your coach asked Root to sit down with you on this one. It is called Your Own Company. Nine questions about the voice you live with.',
  popupCta: 'Start now',

  /** The persistent card on Home, for as long as it is assigned and unfinished. */
  cardTitle: `From your coach: ${YOC_LABEL}`,
  cardBody:
    'Nine questions about the voice you live with, and how you speak to yourself when no one else is around. No scores. Your coach reads what you write.',
  cardCta: `Start ${YOC_LABEL}`,
  cardResumeCta: 'Pick up where you left off',

  /** The intro screen. */
  introEyebrow: YOC_AREA,
  introTitle: YOC_LABEL,
  introButton: 'Begin',

  /** The questions. */
  questionContinue: 'Continue',
  questionSubmit: 'Finish',
  questionBack: 'Back',
  exitLabel: 'Close',
  saveNote: 'Saved. You can close this and come back to it.',
  saveFailedNote: 'That did not save. Your words are still on this screen, so try Continue again.',
  writingPlaceholder: 'Take as long as you like.',
  /** The one placeholder that is different, because question three asks for a list. */
  listPlaceholder: 'One per line.',

  /** The closing screen. */
  closingEyebrow: 'What you wrote',
  closingHeading: 'Nothing here was graded.',
  closingBody:
    'Root scored none of this and interpreted none of it. It is saved, your coach can read what you wrote, and it will still be here when you come back for it.',
  closingContinue: 'Continue',
  closingDone: 'Back to home',

  /** The experiment offer. */
  experimentEyebrow: 'One small thing',
  experimentIntro: 'Seven days, one question a day, in the evening.',
  experimentAccept: "I'm in: start the 7 days",
  experimentDecline: 'Not right now',
  experimentStarted: 'It is on your dashboard now. Root will keep it there for the seven days.',
  experimentCapped:
    "You're already working on 2 experiments. Close one out and this one will be waiting.",
  experimentDeclined: 'No problem. Nothing is lost, and your answers are already saved.',
  experimentHardDayLabel: 'On a difficult day',

  /** The resource. */
  resourceEyebrow: 'Worth reading',
  resourceReadLabel: 'Read the full piece (90 sec)',

  /** Opening it again after it is finished. */
  alreadyDoneHeading: 'This one is done',
  alreadyDoneBody:
    'You have already finished this one and your coach can read it. If they want another sitting, they will send you a fresh one.',

  /** The two things that can go wrong. */
  submitError: 'We could not save that. Please try again.',
  incompleteError: 'Please finish all nine questions.',
} as const;

/**
 * The one piece of reading this experience offers.
 *
 * Summary first, the full piece expanded in place, the same shape the six
 * Happiness templates beside it and the free arc's resource section already
 * use. Observational, never prescriptive: it describes a thing that happens
 * to people and stops there. It tells the member to do nothing, because the
 * experiment on the screen beside it is the only thing being asked of her.
 */
export const YOC_RESOURCE = {
  title: 'You Live With Your Voice',
  label: 'The short version, from Root:',
  body: 'How you speak to yourself is a habit, not a character trait. It was learned somewhere, it runs on repetition, and it changes the way habits change: slowly, unevenly, and only once you can hear it happening. The opposite of a cruel inner voice is not a cheerful one. It is an accurate one.',
  full: `The phrase "inner critic" makes it sound like a passenger. It is closer to an accent. Nobody chooses one, everybody has one, and it was picked up from the people who were around while the sentences were forming. That is why the voice so often sounds like somebody specific, and why the moment of recognising whose it is tends to land harder than anything else in the room.

A habit is the useful frame here, because habits have properties. They fire fastest under load, which is why the voice is loudest on the day everything is already going wrong. They are keyed to situations rather than to facts, so a person can be genuinely accomplished and still hear the same sentence at forty that she heard at nine. And they run without being noticed, which is the whole difficulty: a sentence you did not hear yourself say is a sentence you experience as a fact about yourself rather than as something spoken.

What tends to surprise people is the double standard, once it is put side by side. The sentence said to a friend who made the identical mistake is not a softer version of the sentence said to oneself. It is usually a completely different sentence, addressing a completely different question. To the friend: what happened, and what now. To oneself: what is wrong with you. Those are not two levels of kindness. They are two different subjects, and only one of them is about the mistake.

The other thing worth saying plainly is that the fix is not positivity. Telling yourself something you do not believe is a bad habit replacing a bad habit, and it fails the same way affirmations fail: the voice simply gets a new sentence to argue with. Honest kindness is a narrower thing. It keeps the true part, drops the cruelty, and it is recognisable because it can be said out loud to another person without embarrassment. "That went badly and I know why" survives being spoken. "You always do this" does not.

Nobody talks their way out of a voice in one sitting. What can happen in one sitting is hearing it as a voice.

Root`,
} as const;

// ---------------------------------------------------------------------
// The coach's card, and only the coach's card.
// ---------------------------------------------------------------------

/**
 * KEPT APART FROM EVERYTHING ABOVE, exactly as the templates beside it keep
 * their own coach strings apart: these are headings on a screen a member
 * never opens, and nothing here is written to be read by her.
 */
export const YOC_COACH_COPY = {
  /** The heading over her question three lines at the top of the coach's card. */
  linesHeading: 'What the voice says on repeat',
  /** The heading over the original and the rewrite, side by side. */
  rewriteHeading: 'The line, and the rewrite',
  /** The heading over the picks and the round. */
  picksHeading: 'First instincts',
  /** The heading over the nine written answers. */
  answersHeading: 'What they wrote',
  /** On the line they said cuts deepest. */
  deepestLabel: 'Cuts deepest',
  /** Above the original sentence in the pair. */
  originalLabel: 'Original',
  /** Above the rewrite in the pair. */
  rewriteLabel: 'Rewritten',
  /** In front of the round's standing question. */
  roundLabel: 'Would you say this to a friend?',
  /** When a finished sitting somehow carries no lines. */
  noLines: 'No lines were stored for this sitting.',
  /** When they never named the line that cuts deepest. */
  noDeepest: 'No line was named.',
  /** When they made no pick on one of the this-or-that questions. */
  noPick: 'No pick.',
} as const;
