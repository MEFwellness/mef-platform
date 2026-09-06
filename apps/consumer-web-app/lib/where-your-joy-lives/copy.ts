/**
 * Every sentence Where Your Joy Lives says in its own voice.
 *
 * WHAT IS AND IS NOT AUTHORED HERE. The nine prompts live in
 * ./questions.ts, because they are the instrument. What is here is the
 * frame around them: the invitation, the three screen titles, the closing,
 * the experiment and the piece of reading.
 *
 * ROOT SAYS NOTHING ABOUT HER. This experience produces no score, no
 * pattern and no observation, so there is no sentence anywhere in this file
 * that describes the member, ranks her answers or draws a conclusion from
 * them.
 *
 * THE ONE LINE ON THE CLOSING SCREEN IS FIXED COPY, and it is worth being
 * precise about why it is allowed to stand beside her own words. It names
 * no answer, points at neither of the two, and asserts nothing that is
 * particular to this member: it is a sentence about the pair of questions,
 * true of anyone who answered them, printed under her verbatim writing.
 * Root does not say which of the two empties and which fills, because Root
 * does not know, and guessing would be the interpretation this experience
 * exists without.
 *
 * NO EM DASHES. Commas, periods, colons or parentheses.
 *
 * SAY ONLY WHAT IS TRUE TODAY. The closing says her coach can read what she
 * wrote, and that is true the moment she finishes: it lands on the coach's
 * own client screen. It promises no reply, no date and no analysis back,
 * because none of those exist.
 */

/** The name of this experience, everywhere a member or coach reads it. One name per thing. */
export const WYJL_LABEL = 'Where Your Joy Lives';

/** The area it belongs to. */
export const WYJL_AREA = 'Happiness';

/** The three screens and their titles. Approved copy. */
export const WYJL_SECTIONS = [
  { screen: 1 as const, title: 'Remembering' },
  { screen: 2 as const, title: 'Noticing' },
  { screen: 3 as const, title: 'Making Room' },
] as const;

export function sectionFor(screen: 1 | 2 | 3): (typeof WYJL_SECTIONS)[number] {
  return WYJL_SECTIONS.find((section) => section.screen === screen) ?? WYJL_SECTIONS[0];
}

/**
 * The intro, split into the lines the shared IntroReveal typewriter flows
 * in one at a time. Joined with single spaces they are the approved body
 * paragraph exactly, which tests/where-your-joy-lives-copy.test.ts asserts,
 * so the split is a pacing decision and never an edit.
 */
export const WYJL_INTRO_BODY_LINES = [
  'No scores and no right answers here either.',
  'Root has nine questions about what actually fills you.',
  'Most people have not been asked these in years.',
  'Fifteen to twenty minutes, somewhere quiet.',
] as const;

/**
 * The one sentence Root writes on the closing screen, verbatim and fixed.
 *
 * On its own constant because three things read it: the screen, the copy
 * test, and anyone reading this file to check what Root is allowed to say
 * at the end.
 */
export const WYJL_CLOSING_LINE =
  'One of these empties slower. One of these fills. You wrote both.';

export const WYJL_COPY = {
  /** The pop-up. */
  popupEyebrow: 'From Root',
  popupTitle: WYJL_LABEL,
  popupBody:
    'Your coach asked Root to sit down with you again. This one is called Where Your Joy Lives. Nine questions, no scores, worth your time.',
  popupCta: 'Start now',

  /** The persistent card on Home, for as long as it is assigned and unfinished. */
  cardTitle: `From your coach: ${WYJL_LABEL}`,
  cardBody:
    'Nine written questions about what actually fills you, and what you reach for instead. No scores. Your coach reads what you write.',
  cardCta: 'Start Where Your Joy Lives',
  cardResumeCta: 'Pick up where you left off',

  /** The intro screen. */
  introEyebrow: WYJL_AREA,
  introTitle: WYJL_LABEL,
  introButton: 'Begin',

  /** The questions. */
  questionContinue: 'Continue',
  questionSubmit: 'Finish',
  questionBack: 'Back',
  exitLabel: 'Close',
  saveNote: 'Saved. You can close this and come back to it.',
  saveFailedNote: 'That did not save. Your words are still on this screen, so try Continue again.',
  writingPlaceholder: 'Take as long as you like.',

  /** The closing screen. */
  closingEyebrow: 'What you wrote',
  /**
   * The heading and the body under her two answers. Both are about the app
   * and the rows, never about her: what was not done to her writing, and
   * where it now lives.
   */
  closingHeading: 'Nothing here was scored.',
  closingBody:
    'Not one word of this was interpreted. It is saved, your coach can read what you wrote, and it will still be here when you come back for it.',
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
  incompleteError: 'Please answer all nine questions.',
} as const;

/** The heading over question seven on the coach's card. */
export const WYJL_OPENER_HEADING = 'Open the session with this';

/** The heading over the nine raw answers on the coach's card. */
export const WYJL_ANSWERS_HEADING = 'What they wrote';

/**
 * The one piece of reading this experience offers.
 *
 * Summary first, the full piece expanded in place, the same shape Owning
 * Your Value's own resource and the free arc's resource section already
 * use. Observational, never prescriptive: it describes a thing that happens
 * to people and stops there. It tells the member to do nothing, because the
 * experiment on the screen beside it is the only thing being asked of her.
 */
export const WYJL_RESOURCE = {
  title: 'Relief Is Not Joy',
  label: 'The short version, from Root:',
  body: 'Numbing and joy both arrive wearing the same coat, and the body files them in the same drawer. The difference does not show up while it is happening. It shows up about twenty minutes afterward, in whether you feel added to or just quieter.',
  full: `Here is something worth noticing about the end of a long day.

Two very different things arrive wearing that same coat. One of them stops a feeling. The other adds one. In the moment they are almost impossible to tell apart, because both register as relief, and relief is what a tired person is looking for.

So the scroll counts as rest. So does the second glass, and the fourth episode, and the forty minutes spent standing in front of an open fridge. Every one of them works. That is the confusing part. They genuinely do lower the noise, which is why they get chosen again tomorrow, and why nobody feels foolish for choosing them.

What they do not do is put anything back. Numbing is subtraction that feels like addition. It takes the edge down and leaves the level exactly where it was, so the evening passes and the next morning arrives with the tank reading the same as the night before. A week of that reads as a week of rest and performs like a week of nothing.

The tell is not in the moment. It is about twenty minutes afterward, and it is physical rather than moral.

After something that filled you there is usually a small forward lean. A little more capacity than before, a slightly louder wish to tell somebody about it, a body that is easier to be inside. After something that numbed you there is flatness, and often a low note of time having gone somewhere. Not guilt exactly. More like a receipt for an hour with nothing purchased on it.

There is a second tell, at the front end. The filling thing almost always sounds like too much effort beforehand. The numbing thing never does. Whatever asks nothing of you at eight in the evening is very rarely the thing that hands anything back by nine.

None of this makes numbing a failure. A hard day sometimes needs the volume turned down, and turning it down is a real thing to want.

It is only worth knowing that the volume going down is not the same event as the tank going up, and that the body keeps two separate records even on the days the mind keeps one.

Root`,
} as const;
