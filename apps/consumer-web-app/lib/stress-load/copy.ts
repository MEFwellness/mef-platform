/**
 * Every sentence the Stress & Load Deep-Dive says in its own voice.
 *
 * WHAT IS AND IS NOT AUTHORED HERE. The eleven question prompts, their
 * hints and their option labels live in ./questions.ts, because they are
 * the instrument. The check-in cross-reference line lives in
 * ./crossReference.ts, because it is rendered from an already-tiered
 * descriptor through the shared three-tier language module and must not be
 * writable by hand. What is here is the frame around them and the reading
 * at the end.
 *
 * THE READING IS BUILT FROM DESCRIPTORS AND HER OWN WORDS, NEVER STORED AS
 * PROSE. Every function below takes a StressLoadReading (slugs and numbers)
 * plus her answers, and returns sentences at read time. She and her coach
 * therefore read one identical reading with nothing to keep in sync, and a
 * wording fix reaches every past sitting at once. Same discipline as
 * lib/weekly-reflection/recap.ts and lib/weekly-review/plan.ts.
 *
 * THE TWO SIDES ARE NEVER BLENDED IN THE WORDS EITHER. There is no sentence
 * in this file that adds a load number to a recovery number, and the two
 * sides have separate labels, separate summary lines and separate headings
 * on both the member's screen and the coach's card.
 *
 * NO EM DASHES. Commas, periods, colons or parentheses.
 *
 * SAY ONLY WHAT IS TRUE TODAY. The closing screen says her coach will read
 * this with her, and that is true: it lands on the coach's own client
 * screen the moment she submits. It promises no date, no reply and no
 * analysis back, because none of those exist.
 */

import {
  OTHER_VALUE,
  LOAD_SOURCE_OPTIONS,
  LOAD_WEIGHT_OPTIONS,
  RECOVERY_AMOUNT_OPTIONS,
  RECOVERY_SOURCE_OPTIONS,
  BODY_LOUDEST_OPTIONS,
  LEAN_ON_OPTIONS,
  labelForOption,
  type StressLoadAnswers,
} from './questions';
import type { LoadBand, RecoveryBand, StressLoadPatternKey, StressLoadReading } from './patterns';

/** The name of this experience, everywhere a member or coach reads it. One name per thing. */
export const STRESS_LOAD_LABEL = 'Stress & Load Deep-Dive';

/** The three sections, their names and the line that opens each one. Approved copy. */
export const STRESS_LOAD_SECTIONS = [
  { screen: 1 as const, name: 'The Load', heading: "Let's look at what you're carrying." },
  {
    screen: 2 as const,
    name: "The Body's Answer",
    heading: "Your body always answers the load. Let's hear it.",
  },
  { screen: 3 as const, name: 'The Recovery Side', heading: 'Now the other side of the scale.' },
] as const;

export function sectionFor(screen: 1 | 2 | 3): (typeof STRESS_LOAD_SECTIONS)[number] {
  return STRESS_LOAD_SECTIONS.find((section) => section.screen === screen) ?? STRESS_LOAD_SECTIONS[0];
}

export const STRESS_LOAD_COPY = {
  /** The pop-up. */
  popupEyebrow: 'From Root',
  popupTitle: STRESS_LOAD_LABEL,
  popupBody: 'Your coach asked Root to sit down with you on this one.',
  popupCta: 'Start now',

  /** The persistent card on Home, for as long as it is assigned and unfinished. */
  cardTitle: `From your coach: ${STRESS_LOAD_LABEL}`,
  cardBody:
    'One sitting, eleven questions, about what you are carrying and what is actually giving back. Your coach reads it with you.',
  cardCta: 'Start the deep-dive',

  /** The questions. */
  questionContinue: 'Continue',
  questionSubmit: 'See what Root found',
  questionBack: 'Back',
  exitLabel: 'Close',
  otherPlaceholder: 'A few words',

  /** The reading. */
  readingEyebrow: 'What Root found',
  loadSideHeading: 'The load side',
  recoverySideHeading: 'The recovery side',
  sidesNote: 'These two are kept apart on purpose. One of them does not cancel the other.',

  /** The experiment offer. */
  experimentEyebrow: 'One small thing',
  experimentIntro: 'Built from what you said restores you, not from a technique.',
  experimentAccept: "I'm in: start the 7 days",
  experimentDecline: 'Not right now',
  experimentStarted: 'It is on your dashboard now. Root will keep it there for the seven days.',
  experimentCapped:
    "You're already working on 2 experiments. Close one out and this one will be waiting.",
  experimentDeclined: 'No problem. Nothing is lost, and your answers are already saved.',
  experimentHardDayLabel: 'On a difficult day',

  /** The resource. */
  resourceEyebrow: 'Worth reading',
  resourceReadLabel: 'Read the full piece (60 sec)',

  /** The closing screen. */
  closingEyebrow: 'Done',
  closingHeading: 'Thank you for sitting with that',
  closingBody:
    'Your answers are saved. Your coach will read this with you, both sides of the scale, in your own words.',
  closingDone: 'Back to home',

  /** Opening it again after it is finished. */
  alreadyDoneHeading: 'This one is done',
  alreadyDoneBody:
    'You have already finished this deep-dive and your coach can see it. If they want another look, they will send you a fresh one.',

  /** The one thing that can go wrong on submit. */
  submitError: 'We could not save that. Please try again.',
} as const;

/** The heading over her answers on the coach's card. */
export const STRESS_LOAD_ANSWERS_HEADING = 'In their own words';

/** The heading over the Q4 answer, which opens the session. */
export const STRESS_LOAD_OPENER_HEADING = 'What they would drop tomorrow';

// ---------------------------------------------------------------------
// The two sides, said separately.
// ---------------------------------------------------------------------

export const LOAD_BAND_LABEL: Record<LoadBand, string> = {
  light: 'Light',
  moderate: 'Moderate',
  high: 'High',
};

export const RECOVERY_BAND_LABEL: Record<RecoveryBand, string> = {
  thin: 'Thin',
  partial: 'Partial',
  solid: 'Solid',
};

const LOAD_BAND_PHRASE: Record<LoadBand, string> = {
  light: 'light',
  moderate: 'real but manageable',
  high: 'heavy',
};

const RECOVERY_BAND_PHRASE: Record<RecoveryBand, string> = {
  thin: 'thin',
  partial: 'partial',
  solid: 'solid',
};

/** "None of it", "a taste of it". Written per option so every sentence below reads naturally rather than being stitched from a raw label. */
const AMOUNT_PHRASE: Record<string, string> = {
  none: 'none of it',
  taste: 'a taste of it',
  not_enough: 'some of it, but not enough',
  fair_amount: 'a fair amount of it',
  plenty: 'plenty of it',
};

function weightLabel(answers: StressLoadAnswers): string {
  return (
    LOAD_WEIGHT_OPTIONS.find((option) => option.value === String(answers.load_weight))?.label ??
    `${answers.load_weight} of 5`
  );
}

function amountLabel(answers: StressLoadAnswers): string {
  return (
    RECOVERY_AMOUNT_OPTIONS.find((option) => option.value === answers.recovery_amount)?.label ??
    answers.recovery_amount
  );
}

function amountPhrase(answers: StressLoadAnswers): string {
  return AMOUNT_PHRASE[answers.recovery_amount] ?? 'some of it';
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/**
 * A label as it reads INSIDE a sentence.
 *
 * Only the first character is lowered, and only for one of our own option
 * labels. Her own words are returned exactly as she typed them, because
 * lowercasing "The Thursday Board Call" into "the thursday board call" is
 * the app editing a member's sentence back at her.
 */
export function phraseLabel(value: string, label: string): string {
  if (value === OTHER_VALUE) return label;
  return label.charAt(0).toLowerCase() + label.slice(1);
}

/** The one source she said follows her home, in her own words when she typed them. */
export function followsHomeLabel(answers: StressLoadAnswers): string {
  return labelForOption(
    LOAD_SOURCE_OPTIONS,
    answers.load_follows_home,
    answers.load_sources.otherText
  );
}

/** The same, as it reads inside a sentence. */
export function followsHomePhrase(answers: StressLoadAnswers): string {
  return phraseLabel(answers.load_follows_home, followsHomeLabel(answers));
}

/** Her recovery sources, in the order she picked them, in her own words. */
export function recoverySourceLabels(answers: StressLoadAnswers): string[] {
  return answers.recovery_sources.selected.map((value) =>
    labelForOption(RECOVERY_SOURCE_OPTIONS, value, answers.recovery_sources.otherText)
  );
}

/** The same, as they read inside a sentence. */
export function recoverySourcePhrases(answers: StressLoadAnswers): string[] {
  return answers.recovery_sources.selected.map((value) =>
    phraseLabel(value, labelForOption(RECOVERY_SOURCE_OPTIONS, value, answers.recovery_sources.otherText))
  );
}

/** Who and what she can lean on, in the order she picked them, in her own words. */
export function leanOnLabels(answers: StressLoadAnswers): string[] {
  return answers.lean_on.selected.map((value) =>
    labelForOption(LEAN_ON_OPTIONS, value, answers.lean_on.otherText)
  );
}

/** The same, as they read inside a sentence. */
export function leanOnPhrases(answers: StressLoadAnswers): string[] {
  return answers.lean_on.selected.map((value) =>
    phraseLabel(value, labelForOption(LEAN_ON_OPTIONS, value, answers.lean_on.otherText))
  );
}

/** A readable list: "sleep", "sleep and music", "sleep, music and laughing". */
export function listSentence(items: readonly string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0] as string;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** The load side, on its own line. Never mentions recovery. */
export function loadSideSummary(reading: StressLoadReading, answers: StressLoadAnswers): string {
  const sources = plural(reading.load.breadth, 'source', 'sources');
  return `${weightLabel(answers)} over the last two weeks, coming from ${reading.load.breadth} ${sources}.`;
}

/** The recovery side, on its own line. Never mentions load. */
export function recoverySideSummary(
  reading: StressLoadReading,
  answers: StressLoadAnswers
): string {
  const support = reading.recovery.namesSupport
    ? `Named to lean on: ${listSentence(leanOnLabels(answers))}.`
    : 'No one named to lean on.';
  return `${amountLabel(answers)} of what restores you last week. ${support}`;
}

/** How her body answered, on its own line. */
export function bodySideSummary(reading: StressLoadReading, answers: StressLoadAnswers): string {
  const ways = plural(reading.body.signalCount, 'way', 'ways');
  const loudest =
    BODY_LOUDEST_OPTIONS.find((option) => option.value === answers.body_loudest_when)?.label ??
    answers.body_loudest_when;
  return `${reading.body.signalCount} ${ways} your body tells you, loudest ${loudest.toLowerCase()}.`;
}

// ---------------------------------------------------------------------
// The key insight.
// ---------------------------------------------------------------------

/** The five named patterns. The sixth state has no name, deliberately, because there is nothing dramatic to name. */
export const PATTERN_NAME: Record<StressLoadPatternKey, string | null> = {
  carrying_it_alone: 'Carrying It Alone',
  body_speaking_first: 'Body Speaking First',
  heavy_load_thin_recovery: 'Heavy Load, Thin Recovery',
  recovery_running_behind: 'Recovery Running Behind',
  loaded_but_buffered: 'Loaded but Buffered',
  balance_as_it_is: null,
};

export type KeyInsight = { patternName: string | null; headline: string; body: string };

/**
 * The reading, in words.
 *
 * The framing is the same in every branch and it is the point of the whole
 * experience: the GAP between what a life is asking and what is giving back
 * is the finding, not the size of the load. Nothing here tells her the load
 * is too big, because that is not something an eleven question sitting can
 * know, and nothing here congratulates her for a light one.
 *
 * Every sentence is built from her own answers, so two members with the
 * same pattern still read about their own week.
 */
export function buildKeyInsight(
  reading: StressLoadReading,
  answers: StressLoadAnswers
): KeyInsight {
  const name = PATTERN_NAME[reading.patternKey];
  const sources = plural(reading.load.breadth, 'source', 'sources');
  const restores = listSentence(recoverySourcePhrases(answers));

  switch (reading.patternKey) {
    case 'carrying_it_alone':
      return {
        patternName: name,
        headline: 'The load is heavy, and there is no one on the other side of it right now.',
        body: `You put the weight at ${weightLabel(answers).toLowerCase()}, across ${reading.load.breadth} ${sources}, and you said ${followsHomePhrase(answers)} is the one that follows you home. When it came to who you can lean on, you said no one right now. That is the finding here, and it is not a failing. It is the first thing worth changing, ahead of the load itself.`,
      };
    case 'body_speaking_first':
      return {
        patternName: name,
        headline: 'Your body is saying more about this than your own account of it is.',
        body: `You put the load at ${weightLabel(answers).toLowerCase()}, which is not the account of someone in trouble. Then you named ${reading.body.signalCount} different ways your body tells you it is too much. When those two disagree, the second one is worth taking as seriously as the first, and it is worth bringing to your coach exactly that way round.`,
      };
    case 'heavy_load_thin_recovery':
      return {
        patternName: name,
        headline:
          'It is not that your load is unusual. It is that almost nothing on your recovery side belongs to you.',
        body: `You are carrying ${reading.load.breadth} ${sources} of weight, and ${followsHomePhrase(answers)} follows you home. You know exactly what restores you: you named ${restores}. Last week you got ${amountPhrase(answers)}. The gap between those two is the finding, not the load.`,
      };
    case 'recovery_running_behind':
      // Approved copy, held verbatim. This is the one branch whose two
      // sentences are fixed rather than built from her answers, because
      // the wording was signed off as written. Her own words are still
      // right below it: the two side summaries, the body line and, on the
      // coach card, every answer she gave.
      return {
        patternName: name,
        headline: 'You are recovering, just not at the pace you are spending.',
        body: 'There are things in your week that genuinely help you recover, and they are working. The issue is that your current load is asking for more recovery than you are getting. Over time, that gap can slowly wear you down. The goal is not necessarily to add something new. It is to give more room to what you already know helps you recover.',
      };
    case 'loaded_but_buffered':
      return {
        patternName: name,
        headline: 'The load is real, and so is what is holding you up.',
        body: `You put the weight at ${weightLabel(answers).toLowerCase()}, across ${reading.load.breadth} ${sources}. You also named what restores you, you got ${amountPhrase(answers)} last week, and you named ${listSentence(leanOnPhrases(answers))} to lean on. That is why a fortnight like this one has not turned into something heavier. It is worth protecting on purpose rather than by luck.`,
      };
    case 'balance_as_it_is':
      return {
        patternName: null,
        headline: 'Here is where the two sides sit.',
        body: `Your load side reads ${LOAD_BAND_PHRASE[reading.load.band]} and your recovery side reads ${RECOVERY_BAND_PHRASE[reading.recovery.band]}. There is no dramatic pattern to name here, and that is a real answer rather than a missing one. Both sides are below, kept separate, because that is what your coach will actually work with.`,
      };
  }
}

// ---------------------------------------------------------------------
// The resource.
// ---------------------------------------------------------------------

export const STRESS_LOAD_RESOURCE = {
  title: 'Load Is Not the Enemy. Unpaid Recovery Is.',
  label: 'The short version, from Root:',
  body: 'A heavy season is not a diagnosis and it is not a sign you are doing it wrong. Load is what a full life produces. What decides how it lands on you is whether any of it ever gets paid back. That is the part almost nobody schedules.',
  full: `Almost everyone who feels flattened by their life assumes the answer is to carry less. Sometimes it is. Usually it is not available, and telling you to drop things you cannot drop is not coaching, it is a wish.\n\nHere is the other half, and it is the half that is actually yours. Load and recovery are two separate accounts. You can be carrying a great deal and be fine, if enough is coming back in. You can be carrying an ordinary amount and be flattened, if nothing is. The trouble almost never announces itself as too much load. It announces itself as recovery that has quietly stopped happening: the walk that got cut, the evening that got filled, the friend you have not called since spring.\n\nSo the question this sitting asked was not how much you are carrying. It was what is on the other side of the scale, and how much of it you actually got. Not what should restore you. What does. Those are different lists, and only one of them works.\n\nRecovery that never gets scheduled does not happen by itself, and it is the only side of this you can move today.\n\nRoot`,
} as const;
