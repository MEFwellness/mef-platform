/**
 * Every sentence The Giving Ledger says in its own voice.
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
 * precise about why it is allowed to stand beneath her own sentence. It
 * makes no claim that is particular to this member: it says who the ledger
 * belongs to and that it can be changed, which is true of anyone who
 * answered these nine questions. It does not tell her what her ledger says,
 * because the line directly above it is her own sentence saying exactly
 * that, in her words.
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
export const TGL_LABEL = 'The Giving Ledger';

/** The area it belongs to. */
export const TGL_AREA = 'Happiness';

/** The three screens and their titles. Approved copy. */
export const TGL_SECTIONS = [
  { screen: 1 as const, title: 'What Goes Out' },
  { screen: 2 as const, title: 'What Comes Back' },
  { screen: 3 as const, title: 'The Balance' },
] as const;

export function sectionFor(screen: 1 | 2 | 3): (typeof TGL_SECTIONS)[number] {
  return TGL_SECTIONS.find((section) => section.screen === screen) ?? TGL_SECTIONS[0];
}

/**
 * The intro, split into the lines the shared IntroReveal typewriter flows
 * in one at a time. Joined with single spaces they are the approved body
 * paragraph exactly, which tests/the-giving-ledger-copy.test.ts asserts, so
 * the split is a pacing decision and never an edit.
 */
export const TGL_INTRO_BODY_LINES = [
  'No scores, no right answers.',
  'Root has nine questions about where your energy goes and what actually comes back.',
  'Nobody keeps this ledger until someone asks them to.',
  'Fifteen to twenty minutes, somewhere quiet.',
] as const;

/**
 * The one sentence Root writes on the closing screen, verbatim and fixed.
 *
 * On its own constant because three things read it: the screen, the copy
 * test, and anyone reading this file to check what Root is allowed to say
 * at the end. It is the whole of what Root says there.
 */
export const TGL_CLOSING_LINE = 'You keep the ledger. You get to change it.';

/**
 * The label above her own sentence on the closing screen.
 *
 * It names whose words those are and does nothing else. It is not a
 * summary, not a heading Root wrote about her, and it never appears without
 * her sentence directly under it.
 */
export const TGL_CLOSING_LABEL = 'What your ledger says';

export const TGL_COPY = {
  /** The pop-up. */
  popupEyebrow: 'From Root',
  popupTitle: TGL_LABEL,
  popupBody:
    'Your coach asked Root to sit down with you on this one. It is called The Giving Ledger. Nine questions about where your energy goes and what comes back.',
  popupCta: 'Start now',

  /** The persistent card on Home, for as long as it is assigned and unfinished. */
  cardTitle: `From your coach: ${TGL_LABEL}`,
  cardBody:
    'Nine written questions about where your energy goes in a week, and what actually comes back. No scores. Your coach reads what you write.',
  cardCta: `Start ${TGL_LABEL}`,
  cardResumeCta: 'Pick up where you left off',

  /** The intro screen. */
  introEyebrow: TGL_AREA,
  introTitle: TGL_LABEL,
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
   * The heading and the body under her own sentence. Both are about the app
   * and the rows, never about her: what was not done to her writing, and
   * where it now lives.
   */
  closingHeading: 'Nothing here was added up.',
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
  incompleteError: 'Please answer all nine questions.',
} as const;

/** The heading over question six on the coach's card. */
export const TGL_OPENER_HEADING = 'Open the session with this';

/** The heading over the nine raw answers on the coach's card. */
export const TGL_ANSWERS_HEADING = 'What they wrote';

/**
 * The one piece of reading this experience offers.
 *
 * Summary first, the full piece expanded in place, the same shape the two
 * Happiness templates beside it and the free arc's resource section already
 * use. Observational, never prescriptive: it describes a thing that happens
 * to people and stops there. It tells the member to do nothing, because the
 * experiment on the screen beside it is the only thing being asked of her.
 */
export const TGL_RESOURCE = {
  title: 'Giving Is Not a Debt',
  label: 'The short version, from Root:',
  body: 'A need somebody else has is information. For some people it never arrives that way. It arrives already itemised, with an amount and a date on it, and the only question left is whether they can pay it on time. Nobody chose to hear the world like that. It was learned young, in a house where being needed was the safest thing to be.',
  full: `There is a particular way of hearing other people that nobody picks out for themselves.

Somebody mentions they are struggling. For most listeners that is a piece of information, and what happens next is a decision. For a certain kind of person it is not information at all. It arrives already itemised, with an amount and a date, and the decision was made before the sentence finished.

That is what makes chronic over-giving so hard to see from the inside. It does not feel like generosity, which would feel warm. It feels like solvency. There is a running balance somewhere behind the eyes, it never reads zero, and going to bed with it unpaid is the thing that keeps a person awake.

Where it comes from is usually unremarkable. A house where the adults were tired, or unwell, or in trouble with each other, and where the child who anticipated things was the child who was easiest to have around. Being needed was the safest available position. It was not a manipulation and it was not a mistake. It worked, and the things that work at nine are usually still running at forty five.

The real cost is not the giving. It is the accounting. Somebody keeping a ledger like that cannot receive anything either, because a gift lands as a debit: something is owed back now, with interest, and the pleasure of having been given to lasts about as long as it takes to start calculating.

Balanced exchange looks less impressive than most people expect. It is not scrupulously even, and it does not happen inside a single conversation. Across a season both people are sometimes the one being carried. Both can say the small unglamorous thing out loud: take this one, I am finished. Neither keeps score, because neither has to. The account settles itself over a long enough stretch and nobody is checking it.

The tell for whether an exchange is balanced is not how much moves in each direction. It is whether asking is survivable. Where giving feels light, a request costs the person making it almost nothing. Where it drains, the request is the expensive part, so it never gets made, and the giving carries on in one direction with the ledger open and unread.

Root`,
} as const;
