/**
 * The nine questions, what shape each one's answer is, and the only rules
 * about what counts as answered.
 *
 * THE FORMAT ROTATES, AND THIS TEMPLATE'S SIGNATURE IS THE PLACE-YOURSELF
 * SLIDER. The standing rule is at the top of
 * lib/happiness-deep-dive/interactive.ts: no two consecutive templates feel
 * alike. Your Own Company's signature is the instinct pick, the rapid round
 * and the sentence that replaces another, and NONE of those appears here.
 * There is no shelf here either and nothing is dragged. This one asks her
 * to stand somewhere: a line with a word at each end, her mark placed
 * between them, and only then the writing that asks why she put it there.
 *
 * EVERY ONE OF THE NINE IS WRITING. That is the difference between a
 * rotation and a dilution: three of them OPEN with a position, and every
 * one of those positions is immediately followed by a writing box. Nothing
 * here collects a mark INSTEAD of a sentence, which is the other standing
 * rule in that same file.
 *
 * ONE OF THEM CAN QUOTE HER BACK TO HERSELF. Question nine has two
 * versions. In follow-up mode it reproduces, verbatim, the sentence she
 * asked Root to hold onto in Owning Your Value, and asks what she wants to
 * say back to it. In standalone mode it asks for the sentence she would
 * want Root to hold onto from today. That is why its prompt is built by a
 * function rather than being a constant: the follow-up version is her
 * sentence plus Root's, and the half that is hers is never edited. See
 * tlybPromptFor and ./followUp.ts.
 *
 * ALL NINE FACE FORWARD. Not one of them asks her to account for the past
 * for its own sake. Where the past appears at all (question one's "what
 * came with the territory", question six's "the woman from three years
 * ago") it is there to describe the ground she is building on.
 *
 * THE QUESTIONS ARE THE INSTRUMENT, so they live here rather than in
 * ./copy.ts, exactly as the seven Happiness templates beside it and the
 * Stress & Load Deep-Dive all split them. The two words at the ends of a
 * line are questions too, and they are here for the same reason.
 *
 * ONE VERSION STAMP. Every stored sitting carries the version of this list
 * that produced it, so a later edit to the wording leaves old answers
 * readable as answers to the questions actually asked.
 */

import type { TlybPoles, TlybSliderState } from './sliders';
import { tlybPositionSet } from './sliders';
import type { TlybFollowUp } from './followUp';

/** Bump when a prompt changes meaning. Stored on every sitting. */
export const TLYB_QUESTIONS_VERSION = 1;

export type TlybScreen = 1 | 2 | 3;

/**
 * What shape a question's answer is.
 *
 *   written  a writing box, and nothing else.
 *   slider   one two-pole line she places a mark on, then a writing box
 *            about where she put it.
 */
export type TlybQuestionKind = 'written' | 'slider';

export type TlybQuestion = {
  key: string;
  screen: TlybScreen;
  kind: TlybQuestionKind;
  /** The written half. Every one of the nine has one. */
  prompt: string;
  /**
   * What Root says FIRST, above the line.
   *
   * Every slider question has one: the half-finished statement her mark
   * completes. A plain written question has none, and `prompt` is the whole
   * of what it asks.
   */
  leadPrompt?: string;
  /** The two words at the ends of the line. Only the three slider questions have them. */
  poles?: TlybPoles;
  /** True when this question's written prompt has a follow-up version. */
  followsUp?: true;
};

export const TLYB_QUESTIONS: readonly TlybQuestion[] = [
  {
    key: 'built_or_handed',
    screen: 1,
    kind: 'slider',
    leadPrompt: 'The life I am living is...',
    poles: { near: 'Built by me', far: 'Handed to me' },
    prompt: 'What parts did you actually choose? What came with the territory?',
  },
  {
    key: 'beginning_or_almost',
    screen: 1,
    kind: 'slider',
    leadPrompt: 'Right now I feel...',
    poles: { near: 'At the beginning', far: 'Almost there' },
    prompt:
      'At the beginning of what, or almost where? Name what you are building toward, as specifically as you can.',
  },
  {
    key: 'ordinary_day',
    screen: 1,
    kind: 'written',
    prompt:
      'Describe one ordinary day in your life three years from now, if everything you have been working on takes root. Walk through it morning to night. Small details count.',
  },
  {
    key: 'already_in_hand',
    screen: 2,
    kind: 'written',
    prompt:
      'What do you already have that this future is built from? Name what is already in your hands: strengths, people, ground you have gained.',
  },
  {
    key: 'what_is_between',
    screen: 2,
    kind: 'slider',
    leadPrompt: 'The main thing between me and that life is...',
    poles: { near: 'Outside me', far: 'Inside me' },
    prompt: 'Name it. What is the thing?',
  },
  {
    key: 'what_she_did_not_know',
    screen: 2,
    kind: 'written',
    prompt:
      'What have you learned about yourself lately that the woman from three years ago did not know? What would surprise her most?',
  },
  {
    key: 'the_piece_that_matters',
    screen: 3,
    kind: 'written',
    prompt:
      'Of everything in your three-years-from-now day, which single piece matters most? The one that, if it existed, would make the rest feel possible.',
  },
  {
    key: 'the_first_stone',
    screen: 3,
    kind: 'written',
    prompt:
      'What is the first stone? One act in the next seven days that belongs to that life, not this one.',
  },
  {
    key: 'the_sentence_forward',
    screen: 3,
    kind: 'written',
    followsUp: true,
    prompt:
      'Write the sentence you would want Root to hold onto from today. The one that tells the truth about who you are becoming.',
  },
] as const;

/**
 * The question whose answer is stored in its own column
 * (member_happiness_deep_dive_sessions.first_stone, migration 219).
 *
 * Question EIGHT, the first stone. It is the one concrete commitment in the
 * sitting and the thing a coach holds her to, which is why it is the coach
 * card's session opener and why it is stored beside the answers rather than
 * only inside them.
 */
export const TLYB_STONE_KEY = 'the_first_stone';

/**
 * The question whose answer is stored in its own column
 * (member_happiness_deep_dive_sessions.forward_sentence, migration 219),
 * IN BOTH MODES.
 *
 * Question NINE. It is also what the closing prints. A future arc that
 * brings this sentence back must be able to find it without knowing which
 * version of question nine ran, so it is stored the same way either way and
 * the mode is recorded separately.
 */
export const TLYB_SENTENCE_KEY = 'the_sentence_forward';

/** The answer the closing prints. Question nine, for the reason above. */
export const TLYB_CLOSING_KEY = TLYB_SENTENCE_KEY;

/** The question that adapts. Named once, here, so no surface can disagree about which of the nine it is. */
export const TLYB_FOLLOW_UP_KEY = TLYB_SENTENCE_KEY;

/**
 * The two halves of the follow-up wording, with her own sentence dropped
 * between them.
 *
 * Kept as two constants rather than one template string so the copy test
 * can assert the approved sentence without also asserting a particular
 * member's answer, and so nothing in this file can quietly edit what she
 * wrote.
 */
export const TLYB_FOLLOW_UP_PREFIX = 'You once asked Root to hold onto this: ';
export const TLYB_FOLLOW_UP_SUFFIX =
  'Read it now, from where you are standing today. What do you want to say back to it?';

/**
 * Question nine's follow-up wording, for one member's own sentence.
 *
 * HER WORDS ARE NOT EDITED. The only thing done to the quoted sentence is
 * trimming the whitespace around it, and adding a period after it when she
 * did not end on sentence punctuation herself, so the sentence that follows
 * does not run into hers. Nothing inside her sentence is touched, nothing
 * is shortened and nothing is capitalised.
 */
export function followUpPromptFor(heldSentence: string): string {
  const quoted = heldSentence.trim();
  const closed = /[.!?]$/.test(quoted) ? quoted : `${quoted}.`;
  return `${TLYB_FOLLOW_UP_PREFIX}${closed} ${TLYB_FOLLOW_UP_SUFFIX}`;
}

/** Every question key, in order, for a caller that needs the whole list. */
export const TLYB_WRITTEN_KEYS: readonly string[] = TLYB_QUESTIONS.map(
  (question) => question.key
);

/** The keys a position may be filed under: the three slider questions and nothing else. */
export const TLYB_SLIDER_KEYS: readonly string[] = TLYB_QUESTIONS.filter(
  (question) => question.kind === 'slider'
).map((question) => question.key);

export type TlybDraft = Record<string, string>;

/** A finished sheet: every question, each one carrying real words. */
export type TlybAnswers = Record<string, string>;

/** Whitespace only is not an answer, and a stray tab is not words. */
export function isAnswered(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * What Root says first on this question.
 *
 * A slider question says its half-finished statement above the line, and
 * the written half arrives after she has placed her mark (tlybPromptFor). A
 * plain written question has no first half: what Root says first IS its
 * question, which is why this falls through to tlybPromptFor rather than to
 * `question.prompt`.
 *
 * THAT FALL-THROUGH IS LOAD BEARING, and it was found the hard way on the
 * live site. Question nine is a plain written question AND the one that
 * adapts, so a version of this that returned the raw `question.prompt`
 * showed a member in follow-up mode the standalone question while her
 * closing, her stored flag and her coach's card all said follow-up. The
 * follow-up therefore has to reach this function, and every caller that
 * renders a question to a member passes it.
 *
 * A caller that only ever asks about SLIDER questions (the coach card's
 * list of her three positions) may omit it: a slider question has its own
 * lead prompt and never adapts.
 */
export function tlybLeadPromptFor(
  question: TlybQuestion,
  followUp: TlybFollowUp | null = null
): string {
  return question.leadPrompt ?? tlybPromptFor(question, followUp);
}

/**
 * The written prompt this question actually asks, for this member, right
 * now.
 *
 * ONLY QUESTION NINE IS DIFFERENT, and only when this sitting is running as
 * a follow-up. Every other question ignores the follow-up entirely, and
 * question nine ignores it too when there is none. This is the ONE place
 * the choice is made, so the member's screen and the coach's card can never
 * show two different question nines for one stored answer.
 */
export function tlybPromptFor(
  question: TlybQuestion,
  followUp: TlybFollowUp | null
): string {
  if (question.key !== TLYB_FOLLOW_UP_KEY || !followUp) return question.prompt;
  return followUpPromptFor(followUp.heldSentence);
}

/**
 * Whether this question's interactive half is finished.
 *
 * Separate from the writing, because on the three slider questions the
 * writing box does not exist until this is true.
 */
export function tlybInteractionDone(
  question: TlybQuestion,
  sliders: TlybSliderState
): boolean {
  if (question.kind === 'written') return true;
  return tlybPositionSet(sliders, question.key);
}

/**
 * Whether this question is finished, given everything she has done so far.
 *
 * ONE PLACE, and every surface reads it: the Continue button, save and
 * resume, and the server's own refusal to store half a sitting. A question
 * with two halves needs both.
 */
export function tlybQuestionDone(
  question: TlybQuestion,
  draft: TlybDraft,
  sliders: TlybSliderState
): boolean {
  return tlybInteractionDone(question, sliders) && isAnswered(draft[question.key]);
}

/**
 * The sentence shown above a disabled Continue.
 *
 * Every question is required, and a Continue that is dead always says why
 * out loud. A question with two halves says which half is missing, because
 * "answer this question" is useless advice to somebody who has answered one
 * half of it.
 */
export function tlybBlockedReasonFor(
  question: TlybQuestion,
  draft: TlybDraft,
  sliders: TlybSliderState
): string | null {
  if (tlybQuestionDone(question, draft, sliders)) return null;
  if (!tlybInteractionDone(question, sliders)) {
    return 'Put your mark somewhere on the line first. You can move it.';
  }
  return 'Write something here first. There is no wrong answer.';
}

/**
 * A draft that is safe to store mid-sitting.
 *
 * Accepts a partial sheet: it is what the save-and-resume write posts.
 * Unknown keys are dropped, and every value is coerced to a string, so
 * nothing a hand-built request invents reaches the column. That includes
 * the OTHER seven templates' keys, which share this table.
 */
export function sanitizeTlybDraft(input: unknown): TlybDraft | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const source = input as Record<string, unknown>;
  const clean: TlybDraft = {};
  for (const question of TLYB_QUESTIONS) {
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
 * three positions are checked separately, against the stored marks, because
 * their answers do not live here.
 */
export function sanitizeTlybAnswers(input: unknown): TlybAnswers | null {
  const draft = sanitizeTlybDraft(input);
  if (!draft) return null;
  for (const key of TLYB_WRITTEN_KEYS) {
    if (!isAnswered(draft[key])) return null;
  }
  return draft;
}

/** The stored answers on a row, or null when they are not a complete set. */
export function readTlybAnswers(input: unknown): TlybAnswers | null {
  return sanitizeTlybAnswers(input);
}

/** True when every one of the nine, writing and mark alike, is finished. */
export function tlybSittingComplete(
  draft: TlybDraft,
  sliders: TlybSliderState
): boolean {
  return TLYB_QUESTIONS.every((question) => tlybQuestionDone(question, draft, sliders));
}

/** The questions on one screen, in order. */
export function questionsForScreen(screen: TlybScreen): TlybQuestion[] {
  return TLYB_QUESTIONS.filter((question) => question.screen === screen);
}

/** One question by its key, for the closing sentence, the columns and the coach's card. */
export function questionFor(key: string): TlybQuestion | null {
  return TLYB_QUESTIONS.find((question) => question.key === key) ?? null;
}

/**
 * The first question she has not finished yet, for save and resume.
 *
 * Returns 0 for a sitting she has not started and the length of the list
 * for a finished one, so a caller can use it directly as a step index
 * without a second rule. It reads the marks as well as the writing, because
 * three of the nine have a half that leaves no prose at all.
 */
export function firstUnfinishedIndex(
  draft: TlybDraft,
  sliders: TlybSliderState
): number {
  const index = TLYB_QUESTIONS.findIndex(
    (question) => !tlybQuestionDone(question, draft, sliders)
  );
  return index === -1 ? TLYB_QUESTIONS.length : index;
}
