/**
 * The nine questions, what shape each one's answer is, and the only rules
 * about what counts as answered.
 *
 * THE FORMAT ROTATES, AND THIS TEMPLATE'S SIGNATURE IS THE INSTINCT PICK.
 * The standing rule is at the top of lib/happiness-deep-dive/interactive.ts:
 * no two consecutive templates feel alike. What You Put Down's signature is
 * the shelf, the drag and the two-pole line, and NONE of those appears
 * here. This one asks for a first instinct: a this-or-that answered from
 * the gut, in half a second, with no scale and no third option, and then
 * the written half that slows her down to look at what the gut just said.
 *
 * EVERY ONE OF THE NINE IS WRITING. That is the difference between a
 * rotation and a dilution: five of them OPEN with a pick, and every one of
 * those picks is immediately followed by a writing box. Nothing here
 * collects a choice INSTEAD of a sentence, which is the other standing rule
 * in that same file.
 *
 * ONE OF THEM QUOTES HER BACK TO HERSELF. Question eight is about the line
 * she named at question three, and it names it by reproducing her own
 * sentence verbatim inside the prompt. That is why the prompt is built by a
 * function rather than being a constant: it is her sentence plus Root's,
 * and the half that is hers is never edited. See yocPromptFor.
 *
 * THE QUESTIONS ARE THE INSTRUMENT, so they live here rather than in
 * ./copy.ts, exactly as the six Happiness templates beside it and the
 * Stress & Load Deep-Dive all split them. The two cards of a pair and the
 * five phrases of the round are questions too, and they are here for the
 * same reason.
 *
 * ONE VERSION STAMP. Every stored sitting carries the version of this list
 * that produced it, so a later edit to the wording leaves old answers
 * readable as answers to the questions actually asked.
 */

import type { HddInstinctSide } from '../happiness-deep-dive/interactive';
import {
  sanitizeYocInstinct,
  yocDeepestCutChosen,
  yocLineText,
  yocPickMade,
  yocRapidAnswered,
  yocRapidDone,
  yocRapidTallySentence,
  type YocInstinctState,
} from './instinct';

/** Bump when a prompt changes meaning. Stored on every sitting. */
export const YOC_QUESTIONS_VERSION = 1;

export type YocScreen = 1 | 2 | 3;

/**
 * What shape a question's answer is.
 *
 *   written   a writing box, and nothing else.
 *   instinct  one this-or-that pair, then a writing box about the pick.
 *   rapid     five pairs in a row, her own count, then a writing box.
 *   choose    her own question three lines as cards, one tapped, then a
 *             writing box that quotes the one she tapped.
 */
export type YocQuestionKind = 'written' | 'instinct' | 'rapid' | 'choose';

/** The two cards of one this-or-that. Neither is the right one. */
export type YocPair = { a: string; b: string };

export type YocQuestion = {
  key: string;
  screen: YocScreen;
  kind: YocQuestionKind;
  /** The written half. Every one of the nine has one. */
  prompt: string;
  /**
   * What Root asks FIRST, above the interactive half.
   *
   * Every question that is not plain writing has one: the statement the two
   * cards complete, the standing question of the round, or the instruction
   * to tap one of her own lines. A plain written question has none, and
   * `prompt` is the whole of what it asks.
   */
  leadPrompt?: string;
  /** The two cards. Only the three this-or-that questions have them. */
  pair?: YocPair;
  /** True when this question's written prompt reproduces the line she named at question eight. */
  quotesDeepestCut?: true;
};

/**
 * The five phrases of the rapid round, in the order they are asked.
 *
 * FIXED, AND NOT ABOUT HER. They are ordinary sentences an inner voice
 * says, written for this question and approved as written. Root does not
 * choose them from her answers, does not reorder them and does not add one:
 * a round whose contents depended on what she had already written would be
 * Root deciding what her voice says.
 *
 * An id per phrase, so a stored answer stays attached to the phrase it
 * answered even if the wording is later corrected.
 */
export const YOC_RAPID_PHRASES = [
  { id: 'known_better', text: 'You should have known better' },
  { id: 'always_do_this', text: 'You always do this' },
  { id: 'everyone_else_manages', text: 'Everyone else manages' },
  { id: 'rest_when_done', text: 'You can rest when it is done' },
  { id: 'put_up_with_you', text: 'Who else would put up with you' },
] as const;

/** The standing question every phrase in the round is answered against. */
export const YOC_RAPID_QUESTION = 'Would you say this to a friend?';

/** The two cards of the round. The same two for all five phrases. */
export const YOC_RAPID_PAIR: YocPair = { a: 'Yes', b: 'Never' };

export const YOC_QUESTIONS: readonly YocQuestion[] = [
  {
    key: 'first_inner_sentence',
    screen: 1,
    kind: 'instinct',
    leadPrompt: 'When I make a mistake, my first inner sentence starts with...',
    pair: { a: 'What is wrong with you', b: 'Okay, what happened?' },
    prompt:
      'Write the actual sentence your inner voice said the last time you dropped something you were carrying.',
  },
  {
    key: 'whose_standards',
    screen: 1,
    kind: 'instinct',
    leadPrompt: 'The voice sounds most like...',
    pair: { a: 'Someone I know', b: 'No one but me' },
    prompt: 'Whose standards is it enforcing? Where did it learn them?',
  },
  {
    key: 'greatest_hits',
    screen: 1,
    kind: 'written',
    prompt:
      'Write down three things the voice says on repeat. The greatest hits. Word for word, however ugly. One per line.',
  },
  {
    key: 'same_mistake_two_sentences',
    screen: 2,
    kind: 'instinct',
    leadPrompt: 'If my closest friend made my most recent mistake, I would say...',
    pair: { a: 'It happens, you are okay', b: 'Let us figure it out' },
    prompt:
      'Now write what you said to yourself for the same mistake. Look at the two sentences together.',
  },
  {
    key: 'what_the_harshness_protects',
    screen: 2,
    kind: 'written',
    prompt:
      'What do you believe the harshness protects you from? What are you afraid happens if you go easy on yourself?',
  },
  {
    key: 'the_roommate',
    screen: 2,
    kind: 'rapid',
    leadPrompt: YOC_RAPID_QUESTION,
    prompt: 'Write about living with a roommate who talks to you like that.',
  },
  {
    key: 'the_kindest_voice',
    screen: 3,
    kind: 'written',
    prompt:
      'Think of the kindest voice that has ever spoken to you. Anyone, any age. What did they sound like? What made you believe them?',
  },
  {
    key: 'the_rewrite',
    screen: 3,
    kind: 'choose',
    leadPrompt: 'Which one cuts deepest? Tap it.',
    quotesDeepestCut: true,
    prompt: 'Rewrite it the way that kind voice would say it. Keep the true part. Drop the cruelty.',
  },
  {
    key: 'the_company_you_are_building',
    screen: 3,
    kind: 'written',
    prompt:
      'What kind of company do you want to be for yourself a year from now? Describe the voice you are building.',
  },
] as const;

/** Question three, whose lines become the cards she chooses between at question eight. */
export const YOC_LINES_KEY = 'greatest_hits';

/**
 * The question whose answer is stored in its own column
 * (member_happiness_deep_dive_sessions.rewritten_line, migration 218).
 *
 * Question EIGHT, the rewrite. It is also the second half of what the
 * closing prints, and on this template those are deliberately the same
 * answer: the whole shape of the sitting is one sentence being replaced by
 * another, so there is nothing else it could reasonably be. Where the six
 * templates before it kept the stored column and the closing sentence
 * apart, they had two different jobs to do. Here there is one.
 */
export const YOC_COLUMN_KEY = 'the_rewrite';

/** The answer the closing prints beneath her original line. Question eight, for the reason above. */
export const YOC_CLOSING_KEY = 'the_rewrite';

/** Every question key, in order, for a caller that needs the whole list. */
export const YOC_WRITTEN_KEYS: readonly string[] = YOC_QUESTIONS.map((question) => question.key);

/** The keys a pick may be filed under: the three this-or-that questions and nothing else. */
export const YOC_PICK_KEYS: readonly string[] = YOC_QUESTIONS.filter(
  (question) => question.kind === 'instinct'
).map((question) => question.key);

/** The ids the rapid round's answers may be filed under. */
export const YOC_RAPID_IDS: readonly string[] = YOC_RAPID_PHRASES.map((phrase) => phrase.id);

/** What a pick may be stored against, in the one shape ./instinct.ts asks for. */
export const YOC_ALLOWED = { pickKeys: YOC_PICK_KEYS, rapidIds: YOC_RAPID_IDS } as const;

export type YocDraft = Record<string, string>;

/** A finished sheet: every question, each one carrying real words. */
export type YocAnswers = Record<string, string>;

/** Whitespace only is not an answer, and a stray tab is not words. */
export function isAnswered(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * What Root asks first on this question.
 *
 * A plain written question asks its one prompt. Every other kind asks its
 * lead prompt above the thing she does, and the written half arrives after
 * she has done it (yocPromptFor). One function, so the screen and the
 * coach's card can never disagree about which half is which.
 */
export function yocLeadPromptFor(question: YocQuestion): string {
  return question.leadPrompt ?? question.prompt;
}

/**
 * The written prompt this question actually asks, for this member, right
 * now.
 *
 * ONLY QUESTION EIGHT IS DIFFERENT, and it is different because it is about
 * the line she named. Her own sentence goes into the prompt VERBATIM,
 * inside quotation marks, with "You wrote" in front of it so there is no
 * doubt whose sentence it is. Nothing about her line is edited: not its
 * case, not its punctuation, not its length.
 *
 * If she somehow reaches question eight with no line named, the fixed half
 * stands on its own. That is the honest fallback: the prompt still makes
 * sense, and Root invents no quotation.
 */
export function yocPromptFor(question: YocQuestion, state: YocInstinctState): string {
  if (!question.quotesDeepestCut) return question.prompt;
  const line = yocLineText(state, state.deepestCutLineId);
  if (!line) return question.prompt;
  return `You wrote: "${line}". ${question.prompt}`;
}

/**
 * Whether this question's interactive half is finished.
 *
 * Separate from the writing, because on four of these the writing box does
 * not exist until this is true.
 */
export function yocInteractionDone(question: YocQuestion, state: YocInstinctState): boolean {
  switch (question.kind) {
    case 'written':
      return true;
    case 'instinct':
      return yocPickMade(state, question.key);
    case 'rapid':
      return yocRapidDone(state, YOC_RAPID_IDS);
    case 'choose':
      return yocDeepestCutChosen(state);
  }
}

/**
 * Whether this question is finished, given everything she has done so far.
 *
 * ONE PLACE, and every surface reads it: the Continue button, save and
 * resume, and the server's own refusal to store half a sitting. A question
 * with two halves needs both.
 */
export function yocQuestionDone(
  question: YocQuestion,
  draft: YocDraft,
  state: YocInstinctState
): boolean {
  return yocInteractionDone(question, state) && isAnswered(draft[question.key]);
}

/**
 * The sentence shown above a disabled Continue.
 *
 * Every question is required, and a Continue that is dead always says why
 * out loud. A question with two halves says which half is missing, because
 * "answer this question" is useless advice to somebody who has answered one
 * half of it. The rapid round says how far through it she is, because
 * "finish the round" is the same useless advice on the fourth phrase.
 */
export function yocBlockedReasonFor(
  question: YocQuestion,
  draft: YocDraft,
  state: YocInstinctState
): string | null {
  if (yocQuestionDone(question, draft, state)) return null;
  if (yocInteractionDone(question, state)) {
    return 'Write something here first. There is no wrong answer.';
  }
  switch (question.kind) {
    case 'instinct':
      return 'Tap the one that feels true first. You can change it.';
    case 'rapid': {
      const answered = yocRapidAnswered(state, YOC_RAPID_IDS);
      return `Answer all five first. You have done ${answered} of ${YOC_RAPID_IDS.length}.`;
    }
    case 'choose':
      return 'Tap the one that cuts deepest first.';
    case 'written':
      return 'Write something here first. There is no wrong answer.';
  }
}

/**
 * A draft that is safe to store mid-sitting.
 *
 * Accepts a partial sheet: it is what the save-and-resume write posts.
 * Unknown keys are dropped, and every value is coerced to a string, so
 * nothing a hand-built request invents reaches the column. That includes
 * the OTHER six templates' keys, which share this table.
 */
export function sanitizeYocDraft(input: unknown): YocDraft | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const source = input as Record<string, unknown>;
  const clean: YocDraft = {};
  for (const question of YOC_QUESTIONS) {
    const value = source[question.key];
    if (typeof value !== 'string') continue;
    if (!isAnswered(value)) continue;
    clean[question.key] = value;
  }
  return clean;
}

/**
 * A complete sheet of writing, or null.
 *
 * Null is what the submit action turns into "please finish all nine
 * questions". Half an answer sheet is never stored as a completion. The
 * five interactive halves are checked separately, against the stored picks,
 * because their answers do not live here.
 */
export function sanitizeYocAnswers(input: unknown): YocAnswers | null {
  const draft = sanitizeYocDraft(input);
  if (!draft) return null;
  for (const key of YOC_WRITTEN_KEYS) {
    if (!isAnswered(draft[key])) return null;
  }
  return draft;
}

/** The stored answers on a row, or null when they are not a complete set. */
export function readYocAnswers(input: unknown): YocAnswers | null {
  return sanitizeYocAnswers(input);
}

/** A stored or posted state, rebuilt from her own question three lines and this template's own question list. */
export function sanitizeYocInstinctState(input: unknown, linesText: string): YocInstinctState {
  return sanitizeYocInstinct(input, linesText, YOC_ALLOWED);
}

/** Her own count of her own taps in the round, in one sentence, read by her screen and her coach's card alike. */
export function yocTallySentence(state: YocInstinctState): string {
  return yocRapidTallySentence(state, YOC_RAPID_IDS, YOC_RAPID_PAIR);
}

/** The words on the card she tapped for a pick question, for the coach's card. Null when she made no pick. */
export function yocPickText(state: YocInstinctState, question: YocQuestion): string | null {
  const side: HddInstinctSide | undefined = state.picks[question.key];
  if (!side || !question.pair) return null;
  return question.pair[side];
}

/** True when every one of the nine, writing and pick alike, is finished. */
export function yocSittingComplete(draft: YocDraft, state: YocInstinctState): boolean {
  return YOC_QUESTIONS.every((question) => yocQuestionDone(question, draft, state));
}

/** The questions on one screen, in order. */
export function questionsForScreen(screen: YocScreen): YocQuestion[] {
  return YOC_QUESTIONS.filter((question) => question.screen === screen);
}

/** One question by its key, for the closing sentence, the column and the coach's card. */
export function questionFor(key: string): YocQuestion | null {
  return YOC_QUESTIONS.find((question) => question.key === key) ?? null;
}

/**
 * The first question she has not finished yet, for save and resume.
 *
 * Returns 0 for a sitting she has not started and the length of the list
 * for a finished one, so a caller can use it directly as a step index
 * without a second rule. It reads the picks as well as the writing, because
 * five of the nine have a half that leaves no prose at all.
 */
export function firstUnfinishedIndex(draft: YocDraft, state: YocInstinctState): number {
  const index = YOC_QUESTIONS.findIndex((question) => !yocQuestionDone(question, draft, state));
  return index === -1 ? YOC_QUESTIONS.length : index;
}
