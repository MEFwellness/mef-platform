/**
 * The nine questions, and the only rules about what counts as an answer.
 *
 * EVERY ONE IS OPEN WRITING. There is no scale here, no multiple choice
 * and no derived option list, because this experience is not measuring
 * anything: a coach reads what she actually wrote, and Root reads nothing
 * back to her except her own words. That is also why there is no maximum
 * length. A member listing every person who gets a piece of her week
 * should be able to write for as long as that takes.
 *
 * THE QUESTIONS ARE THE INSTRUMENT, so they live here rather than in
 * ./copy.ts, exactly as the two Happiness templates beside it and the
 * Stress & Load Deep-Dive all split them. The frame around them (the
 * invitation, the closing, the experiment, the reading) is copy and lives
 * there.
 *
 * ONE VERSION STAMP. Every stored sitting carries the version of this list
 * that produced it, so a later edit to the wording leaves old answers
 * readable as answers to the questions actually asked.
 */

/** Bump when a prompt changes meaning. Stored on every sitting. */
export const TGL_QUESTIONS_VERSION = 1;

export type TglScreen = 1 | 2 | 3;

export type TglQuestion = {
  key: string;
  screen: TglScreen;
  prompt: string;
};

export const TGL_QUESTIONS: readonly TglQuestion[] = [
  {
    key: 'energy_out_list',
    screen: 1,
    prompt:
      'List the people and things that get your energy in a typical week. Next to each one, write roughly how much of you it gets.',
  },
  {
    key: 'chosen_or_inherited',
    screen: 1,
    prompt:
      'Look at your list. Which of these did you choose, and which did you inherit or drift into without ever deciding?',
  },
  {
    key: 'takes_more_than_it_used_to',
    screen: 1,
    prompt:
      'Which one takes more than it used to? When did that change, and did anyone ever ask you if it could?',
  },
  {
    key: 'gives_energy_back',
    screen: 2,
    prompt:
      'Who or what reliably gives you energy back? What does that return actually feel like in your body?',
  },
  {
    key: 'giving_feels_light',
    screen: 2,
    prompt:
      'Think of one relationship where giving feels light. What makes it different from the ones that drain you?',
  },
  {
    key: 'giving_with_nothing_back',
    screen: 2,
    prompt:
      'Where do you keep giving even though nothing has come back for a long time? What keeps you giving there?',
  },
  {
    key: 'overpaying',
    screen: 3,
    prompt:
      'If your energy were money, where are you overpaying? What would a fair price look like?',
  },
  {
    key: 'deposit_to_ask_for',
    screen: 3,
    prompt:
      'Name one deposit you could ask for this week: something specific a person in your life could do that would put energy back into you.',
  },
  {
    key: 'ledger_sentence',
    screen: 3,
    prompt:
      'Read back over what you wrote tonight. Write one sentence about what your ledger is telling you.',
  },
] as const;

/**
 * The one answer the closing screen prints, in her own words.
 *
 * Named once, here, so the closing screen, the coach panel and the copy
 * test can never disagree about which of the nine it is. It is question
 * NINE, the sentence she wrote about her own ledger, and Root adds one
 * fixed line beneath it and nothing else.
 */
export const TGL_CLOSING_KEY = 'ledger_sentence';

/**
 * The question whose answer is stored in its own column
 * (member_happiness_deep_dive_sessions.deposit_request, migration 213), so
 * a later feature can read the deposit she named rather than digging it out
 * of the answers blob.
 *
 * Named once, here, so the screen, the column, the action and the panel can
 * never disagree about which of the nine it is. It is question EIGHT.
 */
export const TGL_DEPOSIT_KEY = 'deposit_to_ask_for';

/**
 * The question the coach's card lifts to the top as the session opener.
 *
 * Question SIX, "where do you keep giving even though nothing has come
 * back", because that is the one a conversation starts from. Deliberately
 * not the stored column and not the closing sentence: the column holds the
 * thing a later feature could act on, the closing sentence is hers to keep,
 * and the opener is the one that needs a person sitting across from her.
 * All three are named here so none of them is decided by a screen.
 */
export const TGL_OPENER_KEY = 'giving_with_nothing_back';

export type TglDraft = Record<string, string>;

/** A finished sheet: all nine keys, every one carrying real words. */
export type TglAnswers = Record<string, string>;

/** Whitespace only is not an answer, and a stray tab is not words. */
export function isAnswered(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * The sentence shown above a disabled Continue.
 *
 * Every question is required, so there is exactly one reason a Continue can
 * be dead here, and it is always said out loud. Same rule the check-in
 * wizard, the Stress & Load Deep-Dive and the two Happiness templates
 * beside this one all obey: a disabled button with no explanation is a
 * screen a member gets stuck on.
 */
export function blockedReasonFor(value: string | undefined): string | null {
  return isAnswered(value) ? null : 'Write something here first. There is no wrong answer.';
}

/**
 * A draft that is safe to store mid-sitting.
 *
 * Accepts a partial sheet: it is what the save-and-resume write posts, and
 * a member who has answered three of nine has a real, storable draft.
 * Unknown keys are dropped, and every value is coerced to a string, so
 * nothing a hand-built request invents reaches the column. That includes
 * the OTHER two templates' keys, which share this table.
 */
export function sanitizeTglDraft(input: unknown): TglDraft | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const source = input as Record<string, unknown>;
  const clean: TglDraft = {};
  for (const question of TGL_QUESTIONS) {
    const value = source[question.key];
    if (typeof value !== 'string') continue;
    if (!isAnswered(value)) continue;
    clean[question.key] = value;
  }
  return clean;
}

/**
 * A complete sheet, or null.
 *
 * Null is what the submit action turns into "please answer all nine
 * questions". Half an answer sheet is never stored as a completion, which
 * is what lets every reader downstream treat a completed row as complete
 * without re-checking.
 */
export function sanitizeTglAnswers(input: unknown): TglAnswers | null {
  const draft = sanitizeTglDraft(input);
  if (!draft) return null;
  for (const question of TGL_QUESTIONS) {
    if (!isAnswered(draft[question.key])) return null;
  }
  return draft;
}

/**
 * The stored answers on a row, or null when they are not a complete set.
 *
 * Never half an answer sheet: a closing screen that promised her own
 * sentence and printed a blank would be worse than one that says out loud
 * it could not read it.
 */
export function readTglAnswers(input: unknown): TglAnswers | null {
  return sanitizeTglAnswers(input);
}

/** The questions on one screen, in order. */
export function questionsForScreen(screen: TglScreen): TglQuestion[] {
  return TGL_QUESTIONS.filter((question) => question.screen === screen);
}

/** One question by its key, for the closing sentence and the coach's opener. */
export function questionFor(key: string): TglQuestion | null {
  return TGL_QUESTIONS.find((question) => question.key === key) ?? null;
}

/**
 * The first question she has not answered yet, for save and resume.
 *
 * Returns 0 for an empty draft and the length of the list for a full one,
 * so a caller can use it directly as a step index without a second rule.
 */
export function firstUnansweredIndex(draft: TglDraft): number {
  const index = TGL_QUESTIONS.findIndex((question) => !isAnswered(draft[question.key]));
  return index === -1 ? TGL_QUESTIONS.length : index;
}
