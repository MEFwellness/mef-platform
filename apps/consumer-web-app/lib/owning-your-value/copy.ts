/**
 * Every sentence Owning Your Value says in its own voice.
 *
 * WHAT IS AND IS NOT AUTHORED HERE. The nine prompts live in
 * ./questions.ts, because they are the instrument. What is here is the
 * frame around them: the invitation, the three screen titles, the closing,
 * the experiment and the piece of reading.
 *
 * ROOT SAYS NOTHING ABOUT HER. This experience produces no score, no
 * pattern and no observation, so there is no sentence anywhere in this file
 * that describes the member, ranks her answers or draws a conclusion from
 * them. The closing screen shows her own sentence and then says what
 * happened, which is all that is true. Anything more would be Root claiming
 * something the rows do not support.
 *
 * NO EM DASHES. Commas, periods, colons or parentheses.
 *
 * SAY ONLY WHAT IS TRUE TODAY. The closing says her coach can read what she
 * wrote, and that is true the moment she finishes: it lands on the coach's
 * own client screen. It promises no reply, no date and no analysis back,
 * because none of those exist.
 */

/** The name of this experience, everywhere a member or coach reads it. One name per thing. */
export const OYV_LABEL = 'Owning Your Value';

/** The area it belongs to. */
export const OYV_AREA = 'Happiness';

/** The three screens and their titles. Approved copy. */
export const OYV_SECTIONS = [
  { screen: 1 as const, title: 'The Doing' },
  { screen: 2 as const, title: 'The Worth' },
  { screen: 3 as const, title: 'The Claim' },
] as const;

export function sectionFor(screen: 1 | 2 | 3): (typeof OYV_SECTIONS)[number] {
  return OYV_SECTIONS.find((section) => section.screen === screen) ?? OYV_SECTIONS[0];
}

/**
 * The intro, split into the lines the shared IntroReveal typewriter flows
 * in one at a time. Joined with single spaces they are the approved body
 * paragraph exactly, which tests/owning-your-value-copy.test.ts asserts, so
 * the split is a pacing decision and never an edit.
 */
export const OYV_INTRO_BODY_LINES = [
  'This one is not a quiz. There are no scores and no right answers.',
  'Root is going to ask you nine questions worth sitting with.',
  'Take your time. Fifteen to twenty minutes, somewhere quiet.',
] as const;

export const OYV_COPY = {
  /** The pop-up. */
  popupEyebrow: 'From Root',
  popupTitle: OYV_LABEL,
  popupBody:
    'Your coach asked Root to sit down with you on this one. It is called Owning Your Value. No scores, just nine questions worth your time.',
  popupCta: 'Start now',

  /** The persistent card on Home, for as long as it is assigned and unfinished. */
  cardTitle: `From your coach: ${OYV_LABEL}`,
  cardBody:
    'Nine written questions about what you do for everyone else, and what you are worth apart from it. No scores. Your coach reads what you write.',
  cardCta: 'Start Owning Your Value',
  cardResumeCta: 'Pick up where you left off',

  /** The intro screen. */
  introEyebrow: OYV_AREA,
  introTitle: OYV_LABEL,
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
  closingEyebrow: 'Your sentence',
  closingHeading: 'Root will hold onto this.',
  /**
   * The whole of what Root says at the end. It reports what happened and
   * nothing else: no reading of her answers, no encouragement about her,
   * no claim she cannot check.
   */
  closingBody:
    'That is your sentence, in your own words. Nothing here was scored and nothing was interpreted. It is saved, your coach can read what you wrote, and this sentence will be here when you come back for it.',
  closingContinue: 'Continue',
  closingDone: 'Back to home',

  /** The experiment offer. */
  experimentEyebrow: 'One small thing',
  experimentIntro: 'Seven days, one line a day, in the evening.',
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
  alreadyDoneSentenceLabel: 'The sentence Root is holding',

  /** The two things that can go wrong. */
  submitError: 'We could not save that. Please try again.',
  incompleteError: 'Please answer all nine questions.',
} as const;

/** The heading over the held sentence on the coach's card. */
export const OYV_OPENER_HEADING = 'Open the session with this';

/** The heading over the nine raw answers on the coach's card. */
export const OYV_ANSWERS_HEADING = 'What they wrote';

/**
 * The one piece of reading this experience offers.
 *
 * Summary first, the full piece expanded in place, the same shape the
 * Stress & Load Deep-Dive's own resource and the free arc's resource
 * section already use. Observational, never prescriptive: it describes a
 * thing that happens to people and stops there. It tells the member to do
 * nothing, because the experiment on the screen beside it is the only thing
 * being asked of her.
 */
export const OYV_RESOURCE = {
  title: 'Your Worth Is Not a To-Do List',
  label: 'The short version, from Root:',
  body: 'Most people can tell you what they are useful for in about four seconds, and cannot tell you what they are worth without mentioning somebody else. Those are two different questions. Only one of them has an answer that survives a bad week.',
  full: `Here is something that shows up again and again, and almost never gets named.

Ask somebody what they bring to the people around them and the answer arrives immediately. She is the one who remembers the appointments. He is the one everybody calls. She keeps the whole thing running. Fast, specific, confident. Then ask what they would still be worth if none of that got done for a month, and the sentence stops halfway.

That pause is not a character flaw and it is not a sign anything is broken. It is what happens when worth gets measured the only way it is ever measured out loud. Nobody thanks you for who you are. They thank you for what landed on their plate, on time, again. So that is the ledger you learn to read, because it is the only one anybody reads back to you.

The trouble is what that ledger does on the days you cannot add to it. A person whose value is entirely a record of output has no answer for a week of illness, a stretch of grief, a season where the doing simply is not available. The account does not just pause. It reads as a debt. That is why rest so often arrives with a bill attached, and why the people who give the most are frequently the ones who can least explain why they should be allowed to stop.

There is a second thing worth noticing. A list of what you do for others is also a list of what other people have noticed. It is somebody else's record, kept in somebody else's handwriting, and it only ever contains the parts that were visible. The morning you talked yourself out of bed and went anyway is not on it. Neither is most of what it actually cost.

None of this is an argument for doing less. The doing is often real, and often love, and often the thing you would choose again.

It is only worth knowing that it is not the whole account, and that the rest of it was never going to show up on its own. Somebody has to say it, and the only person present for all of it is you.

Root`,
} as const;
