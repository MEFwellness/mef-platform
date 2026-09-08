/**
 * Every sentence The Life You're Building says in its own voice.
 *
 * WHAT IS AND IS NOT AUTHORED HERE. The nine prompts and the three pairs of
 * pole words live in ./questions.ts, because they are the instrument. What
 * is here is the frame around them: the invitation, the three screen
 * titles, the words the lines need to be usable without sight or a mouse,
 * the closing, the experiment and the piece of reading.
 *
 * ROOT SAYS NOTHING ABOUT HER. This experience produces no score, no
 * pattern and no observation, so there is no sentence anywhere in this file
 * that describes the member, ranks her answers or draws a conclusion from
 * them. Neither end of any line is the right end, no position means
 * anything, and the three of them are never combined into a fourth number.
 *
 * THE CLOSING COMPOSITION PRINTS HER OWN MARKS AND NOTHING ELSE. Each line
 * is labelled with the question it answers, in the same words she was
 * asked, and the position is put back into HER words by the shared
 * hddPolePositionInWords, which the coach's card reads too, so the two can
 * never disagree about a sentence she was shown.
 *
 * NOTHING A MEMBER READS NAMES ANOTHER EXPERIENCE IN STANDALONE MODE. This
 * template can follow on from Owning Your Value, and when it does, exactly
 * three things change: one extra typed line on the intro, the wording of
 * question nine, and the shape of the closing. When it does not, the
 * earlier template is not named, gestured at, or left a gap for anywhere a
 * member can read. Both of the strings that carry the follow-up are held
 * apart below, and only ever handed to a screen that has actually been told
 * the follow-up is running.
 *
 * THE TWO FIXED CLOSING LINES ARE TRUE BY CONSTRUCTION, and it is worth
 * being precise about why.
 *
 *   "You wrote the first one too. Look how far the writer has come."
 *   prints under two sentences she wrote, both of which are directly above
 *   it. The first one is her own stored held_sentence from Owning Your
 *   Value, which is the sitting this one is following, so "you wrote the
 *   first one too" is a statement of record. The second half is an
 *   invitation to look, not a claim about a distance travelled: it names no
 *   attribute of hers and measures nothing.
 *
 *   "This one Root will hold onto too." prints under the sentence she just
 *   wrote, in a sitting where she was asked for the sentence she would want
 *   Root to hold onto. Root stores it
 *   (member_happiness_deep_dive_sessions.forward_sentence, migration 219),
 *   so "hold onto" is literally true rather than a promise. "Too" is true
 *   because everything else she wrote in this sitting is stored beside it.
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
export const TLYB_LABEL = "The Life You're Building";

/** The area it belongs to. */
export const TLYB_AREA = 'Happiness';

/** The three screens and their titles. Approved copy. */
export const TLYB_SECTIONS = [
  { screen: 1 as const, title: 'Where You Stand' },
  { screen: 2 as const, title: 'The Materials' },
  { screen: 3 as const, title: 'The First Stone' },
] as const;

export function sectionFor(screen: 1 | 2 | 3): (typeof TLYB_SECTIONS)[number] {
  return TLYB_SECTIONS.find((section) => section.screen === screen) ?? TLYB_SECTIONS[0];
}

/**
 * The intro, split into the lines the shared IntroReveal typewriter flows
 * in one at a time. Joined with single spaces they are the approved body
 * paragraph exactly, which tests/the-life-youre-building-copy.test.ts
 * asserts, so the split is a pacing decision and never an edit.
 */
export const TLYB_INTRO_BODY_LINES = [
  'No scores, no right answers.',
  'Root has nine questions, and this time they all face forward.',
  'Fifteen to twenty minutes, somewhere quiet.',
] as const;

/**
 * The one extra line the intro carries when this sitting is running as a
 * follow-up, as its own typed beat after the standard body.
 *
 * HELD APART from TLYB_INTRO_BODY_LINES on purpose, because a member in
 * standalone mode must never be handed it. The screen appends it only when
 * it has actually been told the follow-up is running, so the standalone
 * intro is not this line hidden, it is this line absent.
 *
 * It NAMES NO EXPERIENCE. "A while back, you wrote a sentence" is true of
 * her own history and says nothing about which template she wrote it in.
 */
export const TLYB_INTRO_FOLLOW_UP_LINE =
  'A while back, you wrote a sentence and asked Root to hold onto it. Root kept it. You will see it again at the end.';

/**
 * The one sentence Root writes under her own sentence on the closing
 * screen, standalone version, verbatim and fixed.
 *
 * On its own constant because three things read it: the screen, the copy
 * test, and anyone reading this file to check what Root is allowed to say
 * at the end.
 */
export const TLYB_CLOSING_STANDALONE_LINE = 'This one Root will hold onto too.';

/** The same, for a sitting that ran as a follow-up and printed two sentences. */
export const TLYB_CLOSING_FOLLOW_UP_LINE =
  'You wrote the first one too. Look how far the writer has come.';

/**
 * The two labels on the follow-up closing, one above each sentence.
 *
 * Each one names what the sentence under it is and does nothing else:
 * neither is a summary, neither is a heading Root wrote about her, and
 * neither ever appears without her own sentence directly under it.
 */
export const TLYB_CLOSING_THEN_LABEL = 'Then';
export const TLYB_CLOSING_NOW_LABEL = 'Now';

/**
 * Everything the three lines say out loud.
 *
 * KEPT TOGETHER, because these are the sentences that make a slider usable
 * without a mouse: the caption before she has placed her mark, and the
 * heading over the composition on the closing. A missing one of these is an
 * accessibility defect rather than a wording preference.
 */
export const TLYB_SLIDER_COPY = {
  /** The caption under a line she has not placed her mark on yet. */
  unset: 'Put your mark somewhere on the line.',
  /** Said above a line she has not answered yet. */
  hint: 'There is no right place. Put yourself where you actually are.',
  /** The heading over the three lines on the closing screen. */
  mapHeading: 'Where you put yourself',
  /** The accessible name of the composition itself. */
  mapLabel: 'The three lines you placed yourself on',
} as const;

export const TLYB_COPY = {
  /** The pop-up. */
  popupEyebrow: 'From Root',
  popupTitle: TLYB_LABEL,
  popupBody:
    "Your coach asked Root to sit down with you on this one. It is called The Life You're Building. Nine questions, all facing forward.",
  popupCta: 'Start now',

  /** The persistent card on Home, for as long as it is assigned and unfinished. */
  cardTitle: `From your coach: ${TLYB_LABEL}`,
  cardBody:
    'Nine questions, all facing forward, about the life you are building and the first thing that belongs to it. No scores. Your coach reads what you write.',
  cardCta: `Start ${TLYB_LABEL}`,
  cardResumeCta: 'Pick up where you left off',

  /** The intro screen. */
  introEyebrow: TLYB_AREA,
  introTitle: TLYB_LABEL,
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
 * Summary first, the full piece expanded in place, the same shape the seven
 * Happiness templates beside it and the free arc's resource section already
 * use. Observational, never prescriptive: it describes a thing that happens
 * to people and stops there. It tells the member to do nothing, because the
 * experiment on the screen beside it is the only thing being asked of her.
 */
export const TLYB_RESOURCE = {
  title: 'You Are Already Building It',
  label: 'The short version, from Root:',
  body: 'A future is not a different life that arrives one day. It is an ordinary week, lived slightly differently, repeated until it is simply the week. Which means the evidence for the life somebody wants is rarely missing. It is usually already present, in a smaller form, inside a week that looks unremarkable from the outside.',
  full: `People describe the life they want in scenes. A kitchen with the light coming in. Work that is finally the right work. A body that carries them up a hill without negotiating. Scenes are useful, because they are specific, and they are also slightly misleading, because nobody actually lives in a scene. What gets lived is a Tuesday. The scene is what a few thousand Tuesdays add up to when they are pointed the same way.

That has a practical consequence, and it is the reason this sitting asked for one ordinary day rather than a five year plan. A day can be checked against the present. A plan cannot. Somebody who can describe a Tuesday three years out in enough detail to include what is for breakfast has said something testable about what she is aiming at, and the test is simply this: is any part of that Tuesday already happening, anywhere, in any size at all.

Usually some of it is. The half hour that already belongs to her, on the one morning a week nobody needs anything. The work she does for free because it does not feel like work. The friendship that already runs the way she wants all of them to run. These are easy to miss, because they are small and because they are not labelled as the future. They look like the ordinary bits of an ordinary week. But a thing that exists at any size is a different problem from a thing that does not exist at all, and the two get confused constantly.

The other thing worth saying plainly is what usually stands between a person and the life she describes. It is very rarely a missing resource. It is more often a small number of ordinary constraints, some of them outside her and genuinely fixed for now, some of them inside her and much older than the current situation. Both are real. They are not the same problem, and telling them apart tends to change what the next month looks like more than any amount of additional planning does.

Nobody builds a life in a sitting. What can happen in a sitting is noticing that some of the material is already in the room.

Root`,
} as const;

// ---------------------------------------------------------------------
// The coach's card, and only the coach's card.
// ---------------------------------------------------------------------

/**
 * KEPT APART FROM EVERYTHING ABOVE, exactly as the templates beside it keep
 * their own coach strings apart: these are headings on a screen a member
 * never opens, and nothing here is written to be read by her. The follow-up
 * band's heading names the earlier template, and it is the only string in
 * this feature that does. The standalone-mode proof
 * (tests/the-life-youre-building-follow-up.test.ts) reads the member half
 * of this file and stops here.
 */
export const TLYB_COACH_COPY = {
  /** The heading over her three positions at the top of the coach's card. */
  slidersHeading: 'Where they placed themselves',
  /** The heading over question eight, the session opener. */
  openerHeading: 'The first stone',
  /** The one line under that heading, saying what it is for. */
  openerNote: 'The one concrete commitment in this sitting, in the next seven days.',
  /** The heading over the nine written answers. */
  answersHeading: 'What they wrote',
  /** The band at the top of a sitting that ran as a follow-up. */
  followUpHeading: 'Follow-up from Owning Your Value',
  followUpThenLabel: 'The sentence they left then',
  followUpNowLabel: 'What they say now',
  followUpMissingThen:
    'Their earlier sentence could not be read. What they wrote here still stands on its own.',
  /** Said on a sitting that ran standalone, so a coach is never left guessing which version ran. */
  standaloneNote: 'This sitting ran on its own, with the standalone last question.',
  /** When they never placed a mark on one of the three lines. */
  noPosition: 'No mark was placed.',
  /** When a finished sitting somehow carries no first stone. */
  noStone: 'No first stone was stored for this sitting.',
} as const;
