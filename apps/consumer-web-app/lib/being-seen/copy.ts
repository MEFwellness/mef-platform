/**
 * Every sentence Being Seen says in its own voice.
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
 * NOTHING A MEMBER READS NAMES ANOTHER EXPERIENCE. This template has no
 * follow-up arm at all: it never reads another template's rows and never
 * quotes one, so there is no earlier sitting to name and no gap where one
 * would be.
 *
 * THE ONE LINE ON THE CLOSING SCREEN IS FIXED COPY, and it is worth being
 * precise about why it is allowed to stand beneath her own answer. "Now two
 * people know" is true by construction rather than by hope: she wrote it,
 * and her coach reads it on their own client screen the moment she
 * finishes. It makes no claim about what her answer means, because the line
 * directly above it is her answer saying exactly that.
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
export const BSN_LABEL = 'Being Seen';

/** The area it belongs to. */
export const BSN_AREA = 'Happiness';

/** The three screens and their titles. Approved copy. */
export const BSN_SECTIONS = [
  { screen: 1 as const, title: 'Invisible' },
  { screen: 2 as const, title: 'Seen' },
  { screen: 3 as const, title: 'Showing Yourself' },
] as const;

export function sectionFor(screen: 1 | 2 | 3): (typeof BSN_SECTIONS)[number] {
  return BSN_SECTIONS.find((section) => section.screen === screen) ?? BSN_SECTIONS[0];
}

/**
 * The intro, split into the lines the shared IntroReveal typewriter flows
 * in one at a time. Joined with single spaces they are the approved body
 * paragraph exactly, which tests/being-seen-copy.test.ts asserts, so the
 * split is a pacing decision and never an edit.
 */
export const BSN_INTRO_BODY_LINES = [
  'No scores, no right answers.',
  'Root has nine questions about the difference between being useful and being known.',
  'Fifteen to twenty minutes, somewhere quiet.',
] as const;

/**
 * The one sentence Root writes on the closing screen, verbatim and fixed.
 *
 * On its own constant because three things read it: the screen, the copy
 * test, and anyone reading this file to check what Root is allowed to say
 * at the end. It is the whole of what Root says there.
 *
 * IT IS TRUE BY CONSTRUCTION. Two people know because she is one of them
 * and her coach, who reads this sitting on their own client screen, is the
 * other. It claims nothing about what she wrote or about who she is.
 */
export const BSN_CLOSING_LINE = 'Now two people know. That is how being seen starts.';

/**
 * The label above her own answer on the closing screen.
 *
 * It names whose words those are and does nothing else. It is not a
 * summary, not a heading Root wrote about her, and it never appears without
 * her answer directly under it.
 */
export const BSN_CLOSING_LABEL = 'What you wish someone would see';

/**
 * What the ring on question six says while it fills, and while it stands
 * still under reduced motion.
 *
 * ONE SENTENCE THAT IS TRUE IN BOTH STATES. It names the length and what
 * that length is, and it asks for nothing, so it reads correctly whether
 * she is sitting through the five seconds or looking at a still mark with
 * the writing box already open beside it.
 */
export const BSN_HOLD_LABEL = 'Five seconds, the length of the moment you are about to describe.';

export const BSN_COPY = {
  /** The pop-up. */
  popupEyebrow: 'From Root',
  popupTitle: BSN_LABEL,
  popupBody:
    'Your coach asked Root to sit down with you on this one. It is called Being Seen. Nine questions about the difference between being useful and being known.',
  popupCta: 'Start now',

  /** The persistent card on Home, for as long as it is assigned and unfinished. */
  cardTitle: `From your coach: ${BSN_LABEL}`,
  cardBody:
    'Nine written questions about the difference between being useful and being known. No scores. Your coach reads what you write.',
  cardCta: `Start ${BSN_LABEL}`,
  cardResumeCta: 'Pick up where you left off',

  /** The intro screen. */
  introEyebrow: BSN_AREA,
  introTitle: BSN_LABEL,
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
   * The heading and the body under her own answer. Both are about the app
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
 * Summary first, the full piece expanded in place, the same shape the four
 * Happiness templates beside it and the free arc's resource section already
 * use. Observational, never prescriptive: it describes a thing that happens
 * to people and stops there. It tells the member to do nothing, because the
 * experiment on the screen beside it is the only thing being asked of her.
 */
export const BSN_RESOURCE = {
  title: 'Useful Is Not the Same as Known',
  label: 'The short version, from Root:',
  body: 'Competence is the easiest thing in the world to be appreciated for and the hardest thing to be known for. People thank you for what you handled. They cannot thank you for what you are, because you never put it on the table. Being useful and being known are two different transactions, and doing more of the first one has never once produced the second.',
  full: `Appreciation and intimacy come from different places, and it is easy to spend years mistaking one for the other.

Appreciation follows output. It is earned by the thing you did, it arrives with the thing you did, and it leaves when the thing is finished. Intimacy follows disclosure. It is not earned at all. It arrives when somebody knows something about you that was not required for the job.

That is why the most reliable person in a room is so often the least known one. Reliability is a full time position. It fills every conversation with logistics, and logistics are genuinely interesting to nobody, including the person providing them. The reward for handling everything is being the person who handles everything, and that is a role rather than a relationship.

The second thing worth noticing is what invisibility feels like from the inside. Rarely like loneliness. Usually like being busy. There is no obvious moment where somebody fails to ask about you, because a question that never gets asked leaves no mark. So the account draws down quietly, and it can be years before anyone notices it is empty, and the person who notices first is usually the one it belonged to.

Visibility gets talked about as a personality trait, as though people arrive open or closed and stay that way. It behaves much more like a skill. It has a unit, and the unit is small: one offered opinion, one preference stated without being asked, one story that was not required by the conversation. None of those is a confession. Each one is a piece of information about a person, given away for free, which is the only way anybody ever learns anything about anybody.

The reason it feels risky is that it is genuinely unprotected. A yes to a task is safe because the task can be judged instead of you. Offering a preference has no such cover.

What tends to surprise people who try it is how little happens. The room does not change. One person now knows one more thing. That is the whole mechanism, and it does not work in any larger unit than that.

Root`,
} as const;

// ---------------------------------------------------------------------
// The coach's card, and only the coach's card.
// ---------------------------------------------------------------------

/**
 * KEPT APART FROM EVERYTHING ABOVE, exactly as the template beside it keeps
 * its own coach strings apart: these are headings on a screen a member
 * never opens, and nothing here is written to be read by her.
 */
export const BSN_COACH_COPY = {
  /** The heading over question nine on the coach's card. */
  openerHeading: 'Open the session with this',
  /** The heading over the nine raw answers on the coach's card. */
  answersHeading: 'What they wrote',
} as const;
