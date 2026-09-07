/**
 * Every sentence The Weight of Yes says in its own voice.
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
 * NOTHING A MEMBER READS NAMES ANOTHER EXPERIENCE. This is the one template
 * that can follow another, and the follow-up shows up as one question that
 * quotes her own earlier words back to her. It never names where those
 * words came from, and a member who never sat down with that earlier
 * template sees no trace of it anywhere: not here, not in the questions,
 * not on the closing screen. The only place it is named is the COACH's
 * card, which is why those strings are kept apart at the bottom of this
 * file.
 *
 * THE ONE LINE ON THE CLOSING SCREEN IS FIXED COPY, and it is worth being
 * precise about why it is allowed to stand beneath her own sentence. It
 * makes no claim that is particular to this member: it says what a no is
 * for, and that she has already written one, both of which are true of
 * anyone who reached this screen. It does not tell her what her no means,
 * because the line directly above it is her own no saying exactly that, in
 * her words.
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
export const TWOY_LABEL = 'The Weight of Yes';

/** The area it belongs to. */
export const TWOY_AREA = 'Happiness';

/** The three screens and their titles. Approved copy. */
export const TWOY_SECTIONS = [
  { screen: 1 as const, title: 'The Automatic Yes' },
  { screen: 2 as const, title: 'The Cost' },
  { screen: 3 as const, title: 'The No' },
] as const;

export function sectionFor(screen: 1 | 2 | 3): (typeof TWOY_SECTIONS)[number] {
  return TWOY_SECTIONS.find((section) => section.screen === screen) ?? TWOY_SECTIONS[0];
}

/**
 * The intro, split into the lines the shared IntroReveal typewriter flows
 * in one at a time. Joined with single spaces they are the approved body
 * paragraph exactly, which tests/the-weight-of-yes-copy.test.ts asserts, so
 * the split is a pacing decision and never an edit.
 */
export const TWOY_INTRO_BODY_LINES = [
  'No scores, no right answers.',
  'Root has nine questions about the yeses you give away and what each one weighs.',
  'Fifteen to twenty minutes, somewhere quiet.',
] as const;

/**
 * The one sentence Root writes on the closing screen, verbatim and fixed.
 *
 * On its own constant because three things read it: the screen, the copy
 * test, and anyone reading this file to check what Root is allowed to say
 * at the end. It is the whole of what Root says there.
 */
export const TWOY_CLOSING_LINE = 'A no to them is a yes to you. You already wrote it.';

/**
 * The label above her own sentence on the closing screen.
 *
 * It names whose words those are and does nothing else. It is not a
 * summary, not a heading Root wrote about her, and it never appears without
 * her sentence directly under it.
 */
export const TWOY_CLOSING_LABEL = 'Your no, in your own words';

export const TWOY_COPY = {
  /** The pop-up. */
  popupEyebrow: 'From Root',
  popupTitle: TWOY_LABEL,
  popupBody:
    'Your coach asked Root to sit down with you on this one. It is called The Weight of Yes. Nine questions about the yeses you give away.',
  popupCta: 'Start now',

  /** The persistent card on Home, for as long as it is assigned and unfinished. */
  cardTitle: `From your coach: ${TWOY_LABEL}`,
  cardBody:
    'Nine written questions about the yeses you give away and what each one weighs. No scores. Your coach reads what you write.',
  cardCta: `Start ${TWOY_LABEL}`,
  cardResumeCta: 'Pick up where you left off',

  /** The intro screen. */
  introEyebrow: TWOY_AREA,
  introTitle: TWOY_LABEL,
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
  incompleteError: 'Please answer all nine questions.',
} as const;

/**
 * The one piece of reading this experience offers.
 *
 * Summary first, the full piece expanded in place, the same shape the three
 * Happiness templates beside it and the free arc's resource section already
 * use. Observational, never prescriptive: it describes a thing that happens
 * to people and stops there. It tells the member to do nothing, because the
 * experiment on the screen beside it is the only thing being asked of her.
 */
export const TWOY_RESOURCE = {
  title: 'No Is a Complete Sentence',
  label: 'The short version, from Root:',
  body: 'Every yes is spent out of the same finite account. Saying yes to a Tuesday evening is saying no to whatever that Tuesday evening was otherwise going to hold, and the second half of that sentence is the part nobody says out loud. The choice was never between yes and no. It was between one yes and a different one.',
  full: `There is no such thing as a free yes.

An hour given to one thing is an hour that was going to be something else. Most of the time the something else has no name and no advocate. It is the walk that does not get taken, the call to the person who never asks, the evening that would have been unclaimed. None of those files a complaint, so the trade looks free right up to the point where somebody notices they have not had an unclaimed evening since spring.

What makes it hard to see is that a yes is specific and a no is diffuse. The yes has a name, a face and a date on it. The thing it displaced has none of that. So one side of the account reads as generous and the other reads as empty, and the emptiness gets taken for availability rather than for a price already paid.

The second thing worth noticing is what happens to a no that never gets said.

It does not evaporate. It goes underground and comes back out sideways: as lateness, as a shorter temper than the situation deserved, as a job done at eighty percent by somebody who does excellent work. Resentment is not a character flaw. It is what an unsaid no turns into after it has been sitting somewhere warm for long enough.

The version people reach for instead is softness. Maybe. I will see. Let me check and come back to you. It feels kinder because nothing lands, and it is usually the least kind option in the room, because the other person now has to plan around an answer they never got, and the one who softened it carries the question for another week.

Kind and clear is a different thing from soft. Clear means the other person knows where they stand today and can go and ask somebody else. Kind means the no is about the thing and not about them, and that it arrives without a case for the defence attached. No, I am not able to take that on. Almost nobody who hears that sentence is still thinking about it a month later.

The people who are easiest to be around are rarely the ones who refuse nothing. They are the ones whose yes is worth something, because it was never automatic.

Root`,
} as const;

// ---------------------------------------------------------------------
// The coach's card, and only the coach's card.
// ---------------------------------------------------------------------

/**
 * KEPT APART FROM EVERYTHING ABOVE ON PURPOSE.
 *
 * These strings name the earlier experience this sitting followed. That is
 * exactly right on a coach's screen, where the whole point of the band is
 * to put what she said then beside what she says now, and it is exactly
 * wrong anywhere a member reads, where an experience she was never given
 * must leave no trace.
 *
 * The separation is asserted:
 * tests/the-weight-of-yes-follow-up.test.ts checks that no member-facing
 * string and no member-facing component in this feature mentions the
 * earlier template at all.
 */
export const TWOY_COACH_COPY = {
  /** The heading over question seven on the coach's card. */
  openerHeading: 'Open the session with this',
  /** The heading over the nine raw answers on the coach's card. */
  answersHeading: 'What they wrote',
  /** The band at the top of a sitting that ran as a follow-up. */
  followUpHeading: 'Follow-up from The Giving Ledger',
  followUpThenLabel: 'The deposit they named then',
  followUpNowLabel: 'What they say now',
  followUpMissingThen:
    'Their earlier answer could not be read. What they wrote here still stands on its own.',
  /** Said on a sitting that ran standalone, so a coach is never left guessing which version ran. */
  standaloneNote: 'This sitting ran on its own, with the standalone first question.',
} as const;
