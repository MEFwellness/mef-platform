/**
 * The nine questions, what shape each one's answer is, and the only rules
 * about what counts as answered.
 *
 * THIS IS THE FIRST TEMPLATE IN THE FAMILY THAT IS NOT ALL WRITING, and the
 * standing rule it follows is written at the top of
 * lib/happiness-deep-dive/interactive.ts: an interactive element always SETS
 * UP writing, never replaces it. Six of the nine are open writing. Two of
 * the remaining three (questions two and seven) are a commitment she makes
 * with her hands, and each of them is what the question directly after it
 * is about. The third (question five) is a commitment and a piece of
 * writing in one sitting: she places a mark on a line and is then asked why
 * she put it there.
 *
 * Depth of writing is still the soul of this. Nothing here collects a
 * choice INSTEAD of a sentence.
 *
 * ONE OF THEM QUOTES HER BACK TO HERSELF. Question three is about the card
 * she named at question two, and it names it by reproducing her own line
 * verbatim inside the prompt. That is why the prompt is built by a function
 * rather than being a constant: it is her sentence plus Root's, and the
 * half that is hers is never edited. See wypdPromptFor.
 *
 * THE QUESTIONS ARE THE INSTRUMENT, so they live here rather than in
 * ./copy.ts, exactly as the five Happiness templates beside it and the
 * Stress & Load Deep-Dive all split them.
 *
 * ONE VERSION STAMP. Every stored sitting carries the version of this list
 * that produced it, so a later edit to the wording leaves old answers
 * readable as answers to the questions actually asked.
 */

import {
  wypdCardText,
  wypdDistanceSet,
  wypdShelfLiftDone,
  wypdShelfPlacingDone,
  type WypdShelfState,
} from './shelf';

/** Bump when a prompt changes meaning. Stored on every sitting. */
export const WYPD_QUESTIONS_VERSION = 1;

export type WypdScreen = 1 | 2 | 3;

/**
 * What shape a question's answer is.
 *
 *   written      a writing box, and nothing else.
 *   shelf_place  every card onto the shelf, then the one that stings most.
 *   slider       a mark on a two-pole line, then a writing box about it.
 *   shelf_lift   one card back off the shelf.
 */
export type WypdQuestionKind = 'written' | 'shelf_place' | 'slider' | 'shelf_lift';

export type WypdQuestion = {
  key: string;
  screen: WypdScreen;
  prompt: string;
  kind: WypdQuestionKind;
  /** The second prompt on a question with two halves. Only questions two and five have one. */
  secondPrompt?: string;
  /** True when this question's prompt reproduces the card she named at question two. */
  quotesStingCard?: true;
};

export const WYPD_QUESTIONS: readonly WypdQuestion[] = [
  {
    key: 'used_to_be',
    screen: 1,
    kind: 'written',
    prompt:
      'Complete this sentence: I used to be someone who... Write every ending that comes to you, one per line. Do not filter.',
  },
  {
    key: 'the_shelf',
    screen: 1,
    kind: 'shelf_place',
    prompt: 'Here they are, in your own words. Put each one on the shelf.',
    secondPrompt: 'Tap the one that stings most to read back.',
  },
  {
    key: 'what_took_its_place',
    screen: 1,
    kind: 'written',
    quotesStingCard: true,
    prompt: 'When did you stop being that? What took its place?',
  },
  {
    key: 'the_reason_and_the_honest_one',
    screen: 2,
    kind: 'written',
    prompt:
      'What is the reason you would give someone for why that part of you ended? Write it. Then, underneath it, write the more honest reason.',
  },
  {
    key: 'why_there',
    screen: 2,
    kind: 'slider',
    prompt: 'How far away does she feel?',
    secondPrompt: 'Why there, and not further away?',
  },
  {
    key: 'what_you_would_tell_a_friend',
    screen: 2,
    kind: 'written',
    prompt:
      'If you watched a friend put down the exact same thing for the exact same reasons, what would you tell her?',
  },
  {
    key: 'still_has_a_pulse',
    screen: 3,
    kind: 'shelf_lift',
    prompt: 'Which one still has a pulse? Lift it off the shelf.',
  },
  {
    key: 'doorway',
    screen: 3,
    kind: 'written',
    prompt:
      'What is the smallest possible return to it? Not the old version at full scale. A doorway. Something within reach in the next two weeks.',
  },
  {
    key: 'to_the_one_who_put_it_down',
    screen: 3,
    kind: 'written',
    prompt:
      'Write a sentence to the version of you who put it down. What do you want her to know?',
  },
] as const;

/** Question one, whose lines become the cards on the shelf. */
export const WYPD_CARDS_KEY = 'used_to_be';

/**
 * The one answer the closing screen prints, in her own words.
 *
 * Question NINE, the sentence to the version of her who put it down. It
 * stands under the shelf, in the serif face, and it is the last thing she
 * reads before the one fixed line.
 */
export const WYPD_CLOSING_KEY = 'to_the_one_who_put_it_down';

/**
 * The question whose answer is stored in its own column
 * (member_happiness_deep_dive_sessions.doorway, migration 217).
 *
 * Question EIGHT, the smallest possible return. It is deliberately NOT
 * question nine: the doorway is the one thing here that names an act she
 * could actually take this fortnight, which is what makes it worth a column
 * a later feature can read.
 */
export const WYPD_COLUMN_KEY = 'doorway';

/**
 * The question the coach's card lifts to the top as the session opener.
 *
 * Question SEVEN, the card she lifted back off the shelf. It is the one
 * thing on this sitting a coach can open with, because it is the only part
 * of herself she said still has a pulse, and it is in her own words.
 */
export const WYPD_OPENER_KEY = 'still_has_a_pulse';

/** True for a question that stores prose. The two shelf questions store only a choice. */
export function wypdWritesProse(question: WypdQuestion): boolean {
  return question.kind === 'written' || question.kind === 'slider';
}

/** Every question key that carries a writing box, which is what a stored answer sheet holds. */
export const WYPD_WRITTEN_KEYS: readonly string[] = WYPD_QUESTIONS.filter(wypdWritesProse).map(
  (question) => question.key
);

export type WypdDraft = Record<string, string>;

/** A finished sheet: every written key, each one carrying real words. */
export type WypdAnswers = Record<string, string>;

/** Whitespace only is not an answer, and a stray tab is not words. */
export function isAnswered(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * The prompt this question actually asks, for this member, right now.
 *
 * ONLY QUESTION THREE IS DIFFERENT, and it is different because it is about
 * the card she named. Her own line goes into the prompt VERBATIM, inside
 * quotation marks, with "You wrote" in front of it so there is no doubt
 * whose sentence it is. Nothing about her line is edited: not its case, not
 * its punctuation, not its length.
 *
 * The stem is hers too. Question one asked her to complete "I used to be
 * someone who...", so the line she wrote is the end of that sentence and
 * this is Root reading it back rather than Root writing one.
 *
 * If she somehow reaches question three with no card named, the fixed half
 * stands on its own. That is the honest fallback: the prompt still makes
 * sense, and Root invents no quotation.
 */
export function wypdPromptFor(question: WypdQuestion, shelf: WypdShelfState): string {
  if (!question.quotesStingCard) return question.prompt;
  const sting = wypdCardText(shelf, shelf.stingCardId);
  if (!sting) return question.prompt;
  return `You wrote: "I used to be someone who ${sting}". ${question.prompt}`;
}

/**
 * Whether this question is finished, given everything she has done so far.
 *
 * ONE PLACE, and every surface reads it: the Continue button, save and
 * resume, and the server's own refusal to store half a sitting. A question
 * with two halves needs both.
 */
export function wypdQuestionDone(
  question: WypdQuestion,
  draft: WypdDraft,
  shelf: WypdShelfState
): boolean {
  switch (question.kind) {
    case 'written':
      return isAnswered(draft[question.key]);
    case 'shelf_place':
      return wypdShelfPlacingDone(shelf);
    case 'slider':
      return wypdDistanceSet(shelf) && isAnswered(draft[question.key]);
    case 'shelf_lift':
      return wypdShelfLiftDone(shelf);
  }
}

/**
 * The sentence shown above a disabled Continue.
 *
 * Every question is required, and a Continue that is dead always says why
 * out loud. A question with two halves says which half is missing, because
 * "answer this question" is useless advice to somebody who has answered one
 * half of it.
 */
export function wypdBlockedReasonFor(
  question: WypdQuestion,
  draft: WypdDraft,
  shelf: WypdShelfState
): string | null {
  if (wypdQuestionDone(question, draft, shelf)) return null;
  switch (question.kind) {
    case 'written':
      return 'Write something here first. There is no wrong answer.';
    case 'shelf_place':
      return wypdAllPlacedFor(shelf)
        ? 'Tap one of them to choose it.'
        : 'Put every card on the shelf first.';
    case 'slider':
      return wypdDistanceSet(shelf)
        ? 'Write something here first. There is no wrong answer.'
        : 'Place her on the line first.';
    case 'shelf_lift':
      return 'Lift one of them off the shelf.';
  }
}

function wypdAllPlacedFor(shelf: WypdShelfState): boolean {
  return shelf.cards.length > 0 && shelf.placed.length === shelf.cards.length;
}

/**
 * A draft that is safe to store mid-sitting.
 *
 * Accepts a partial sheet: it is what the save-and-resume write posts.
 * Unknown keys are dropped, and every value is coerced to a string, so
 * nothing a hand-built request invents reaches the column. That includes
 * the OTHER five templates' keys, which share this table, and this
 * template's own two shelf keys, which are not prose and never belong in
 * the answer sheet.
 */
export function sanitizeWypdDraft(input: unknown): WypdDraft | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const source = input as Record<string, unknown>;
  const clean: WypdDraft = {};
  for (const question of WYPD_QUESTIONS) {
    if (!wypdWritesProse(question)) continue;
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
 * questions". Half an answer sheet is never stored as a completion. The two
 * shelf questions are checked separately, against the shelf, because their
 * answers do not live here.
 */
export function sanitizeWypdAnswers(input: unknown): WypdAnswers | null {
  const draft = sanitizeWypdDraft(input);
  if (!draft) return null;
  for (const key of WYPD_WRITTEN_KEYS) {
    if (!isAnswered(draft[key])) return null;
  }
  return draft;
}

/** The stored answers on a row, or null when they are not a complete set. */
export function readWypdAnswers(input: unknown): WypdAnswers | null {
  return sanitizeWypdAnswers(input);
}

/** True when every one of the nine, writing and shelf alike, is finished. */
export function wypdSittingComplete(draft: WypdDraft, shelf: WypdShelfState): boolean {
  return WYPD_QUESTIONS.every((question) => wypdQuestionDone(question, draft, shelf));
}

/** The questions on one screen, in order. */
export function questionsForScreen(screen: WypdScreen): WypdQuestion[] {
  return WYPD_QUESTIONS.filter((question) => question.screen === screen);
}

/** One question by its key, for the closing sentence, the column and the coach's opener. */
export function questionFor(key: string): WypdQuestion | null {
  return WYPD_QUESTIONS.find((question) => question.key === key) ?? null;
}

/**
 * The first question she has not finished yet, for save and resume.
 *
 * Returns 0 for a sitting she has not started and the length of the list
 * for a finished one, so a caller can use it directly as a step index
 * without a second rule. It reads the shelf as well as the writing, because
 * two of the nine are not writing and a member who placed every card and
 * closed the app must come back to question three rather than to question
 * two.
 */
export function firstUnfinishedIndex(draft: WypdDraft, shelf: WypdShelfState): number {
  const index = WYPD_QUESTIONS.findIndex((question) => !wypdQuestionDone(question, draft, shelf));
  return index === -1 ? WYPD_QUESTIONS.length : index;
}
