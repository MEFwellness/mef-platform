/**
 * Every sentence What You Put Down says in its own voice.
 *
 * WHAT IS AND IS NOT AUTHORED HERE. The nine prompts live in
 * ./questions.ts, because they are the instrument. What is here is the
 * frame around them: the invitation, the three screen titles, the words on
 * the shelf and the line, the closing, the experiment and the piece of
 * reading.
 *
 * ROOT SAYS NOTHING ABOUT HER. This experience produces no score, no
 * pattern and no observation, so there is no sentence anywhere in this file
 * that describes the member, ranks her answers or draws a conclusion from
 * them. The shelf is not read for meaning, the position on the line is not
 * a measurement, and the card she lifts is not graded.
 *
 * NOTHING A MEMBER READS NAMES ANOTHER EXPERIENCE. This template has no
 * follow-up arm at all: it never reads another template's rows and never
 * quotes one, so there is no earlier sitting to name and no gap where one
 * would be.
 *
 * THE ONE LINE ON THE CLOSING SCREEN IS FIXED COPY, and it is worth being
 * precise about why it is allowed to stand beneath her own sentence. "She
 * is still in there. She just read this." is true BY CONSTRUCTION rather
 * than by hope: question nine asked her to write to the version of herself
 * who put it down, and the person reading that sentence on this screen is
 * her. It makes no claim about what she wrote, about whether she will go
 * back to anything, or about who she is.
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
export const WYPD_LABEL = 'What You Put Down';

/** The area it belongs to. */
export const WYPD_AREA = 'Happiness';

/** The three screens and their titles. Approved copy. */
export const WYPD_SECTIONS = [
  { screen: 1 as const, title: 'What Was Carried Away' },
  { screen: 2 as const, title: 'The Story Around It' },
  { screen: 3 as const, title: 'Picking It Back Up' },
] as const;

export function sectionFor(screen: 1 | 2 | 3): (typeof WYPD_SECTIONS)[number] {
  return WYPD_SECTIONS.find((section) => section.screen === screen) ?? WYPD_SECTIONS[0];
}

/**
 * The intro, split into the lines the shared IntroReveal typewriter flows
 * in one at a time. Joined with single spaces they are the approved body
 * paragraph exactly, which tests/what-you-put-down-copy.test.ts asserts, so
 * the split is a pacing decision and never an edit.
 */
export const WYPD_INTRO_BODY_LINES = [
  'No scores, no right answers.',
  'Root has nine questions about the versions of yourself you set aside to carry everything else.',
  'Fifteen to twenty minutes, somewhere quiet.',
] as const;

/**
 * The one sentence Root writes on the closing screen, verbatim and fixed.
 *
 * On its own constant because three things read it: the screen, the copy
 * test, and anyone reading this file to check what Root is allowed to say
 * at the end. It is the whole of what Root says there.
 */
export const WYPD_CLOSING_LINE = 'She is still in there. She just read this.';

/**
 * The label above her own sentence on the closing screen.
 *
 * It names who those words are addressed to and does nothing else. It is
 * not a summary, not a heading Root wrote about her, and it never appears
 * without her sentence directly under it.
 */
export const WYPD_CLOSING_LABEL = 'To the one who put it down';

/**
 * Everything the interactive pieces say out loud.
 *
 * KEPT TOGETHER, because these are the sentences that make a shelf and a
 * line usable without a mouse: the accessible name of a control, the verb
 * on a card, the caption under a mark she has not placed yet. A missing one
 * of these is an accessibility defect rather than a wording preference.
 */
export const WYPD_SHELF_COPY = {
  /** The accessible name of the shelf itself. */
  shelfLabel: 'Your shelf',
  /** What the shelf says while nothing is on it. */
  shelfEmpty: 'Nothing on it yet.',
  /** The verb on the card in her hand, and on its accessible name. */
  placeCard: 'Put it on the shelf',
  /** What the shelf itself says while a card is waiting to go on it. */
  placeHere: 'Place it here',
  /** The verb a screen reader hears before her words when she is choosing the one that stings. */
  chooseSting: 'Choose',
  /** The gold note on the card she named. */
  stingNote: 'Stings most',
  /** The verb a screen reader hears before her words when she is lifting one back off. */
  chooseLift: 'Lift',
  /** The gold note on the card she lifted. */
  liftedNote: 'Still has a pulse',
  /** The accessible name of the line on question five. */
  lineLabel: 'How far away she feels',
  /** The caption under the line before she has placed her mark. */
  lineUnset: 'Place her on the line.',
  /** Said once all her cards are on the shelf, above the choosing half of question two. */
  allPlaced: 'That is all of them.',
} as const;

export const WYPD_COPY = {
  /** The pop-up. */
  popupEyebrow: 'From Root',
  popupTitle: WYPD_LABEL,
  popupBody:
    'Your coach asked Root to sit down with you on this one. It is called What You Put Down. Nine questions about the versions of yourself you set aside.',
  popupCta: 'Start now',

  /** The persistent card on Home, for as long as it is assigned and unfinished. */
  cardTitle: `From your coach: ${WYPD_LABEL}`,
  cardBody:
    'Nine questions about the versions of yourself you set aside to carry everything else. No scores. Your coach reads what you write.',
  cardCta: `Start ${WYPD_LABEL}`,
  cardResumeCta: 'Pick up where you left off',

  /** The intro screen. */
  introEyebrow: WYPD_AREA,
  introTitle: WYPD_LABEL,
  introButton: 'Begin',

  /** The questions. */
  questionContinue: 'Continue',
  questionSubmit: 'Finish',
  questionBack: 'Back',
  exitLabel: 'Close',
  saveNote: 'Saved. You can close this and come back to it.',
  saveFailedNote: 'That did not save. Your words are still on this screen, so try Continue again.',
  writingPlaceholder: 'Take as long as you like.',
  /** The one placeholder that is different, because question one asks for a list. */
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
 * Summary first, the full piece expanded in place, the same shape the five
 * Happiness templates beside it and the free arc's resource section already
 * use. Observational, never prescriptive: it describes a thing that happens
 * to people and stops there. It tells the member to do nothing, because the
 * experiment on the screen beside it is the only thing being asked of her.
 */
export const WYPD_RESOURCE = {
  title: 'You Are Allowed to Come Back',
  label: 'The short version, from Root:',
  body: 'The things you set down did not expire while you were away. An abandoned version of a person is not a spoiled thing, it is a paused one, and going back to it feels like trespassing only because you have been gone long enough to feel like a visitor there. The size of the return is not what makes it one.',
  full: `Nobody puts a part of themselves down on purpose. It goes quietly, underneath something more urgent, and by the time anyone notices, the noticing arrives as a fact rather than as a decision.

What surprises people is that the thing itself is usually still intact. Skills fade, bodies change, and the specific version at the specific scale may genuinely be gone. The appetite is not. Appetite keeps no schedule and does not expire while it is unattended, which is why a person can be indifferent to a piano for eleven years and then be taken apart by hearing one in a hotel lobby.

Why coming back feels like trespassing is the more interesting half. It is rarely shame about the gap. It is that an identity is held in place by other people as much as by the person carrying it, and while you were gone everyone quietly updated their file. You became the one who does not do that any more, and stepping back in means contradicting a description a lot of people are now comfortable with, including you. It feels like walking into a room you used to live in and finding somebody else's things on the table. Nothing is stopping you. It simply does not feel like yours to enter.

The last part is the one worth arguing with. Returns get imagined at full scale, which is most of the reason they do not happen: the version in your head is the version you had at the end, with the hours and the standard and the whole identity attached, and nobody has that lying spare. A doorway is a different object. Fifteen minutes, once, done badly, is not a diminished version of coming back. It is the entire mechanism, and there is no other one. Every person who has ever returned to anything did it by doing a small amount of it on a day that was not special.

The scale you come back at says nothing about whether you have come back.

Root`,
} as const;

// ---------------------------------------------------------------------
// The coach's card, and only the coach's card.
// ---------------------------------------------------------------------

/**
 * KEPT APART FROM EVERYTHING ABOVE, exactly as the templates beside it keep
 * their own coach strings apart: these are headings on a screen a member
 * never opens, and nothing here is written to be read by her.
 *
 * `distanceLabel` reads as a label rather than a sentence on purpose. The
 * "her" in it is the version of herself the question was about, and putting
 * a subject in front of it would make it ambiguous which "she" the line
 * means.
 */
export const WYPD_COACH_COPY = {
  /** The heading over the shelf at the top of the coach's card. */
  shelfHeading: 'What went on the shelf',
  /** The heading over question seven's card, the session opener. */
  openerHeading: 'Open the session with this',
  /** The heading over the seven written answers. */
  answersHeading: 'What they wrote',
  /** In front of question five's position, put back into words. */
  distanceLabel: 'Placed her at',
  /** On the card they named at question two. */
  stingLabel: 'Stings most to read back',
  /** On the card they lifted at question seven. */
  liftedLabel: 'Still has a pulse',
  /** When a finished sitting somehow carries no shelf. */
  noShelf: 'No shelf was stored for this sitting.',
  /** When they never placed a mark on question five's line. */
  noDistance: 'No position was placed.',
} as const;
