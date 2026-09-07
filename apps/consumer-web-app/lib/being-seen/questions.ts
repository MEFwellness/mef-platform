/**
 * The nine questions, and the only rules about what counts as an answer.
 *
 * EVERY ONE IS OPEN WRITING. There is no scale here, no multiple choice
 * and no derived option list, because this experience is not measuring
 * anything: a coach reads what she actually wrote, and Root reads nothing
 * back to her except her own words. That is also why there is no maximum
 * length.
 *
 * ONE OF THEM ASKS HER TO SIT INSIDE A LENGTH OF TIME. Question six asks
 * what happens in the first five seconds after a compliment, and five
 * seconds is a short thing to describe and a long thing to sit through.
 * `holdSeconds` is how that question says so, and the shared question stage
 * is what renders it: a ring that fills over exactly that many seconds
 * between the question finishing and the writing box arriving. It is a
 * pacing device and never a lock, it is declared here beside the question
 * it belongs to rather than hard coded into a screen, and reduced motion
 * turns it into a still mark with no wait at all.
 *
 * THE QUESTIONS ARE THE INSTRUMENT, so they live here rather than in
 * ./copy.ts, exactly as the four Happiness templates beside it and the
 * Stress & Load Deep-Dive all split them.
 *
 * ONE VERSION STAMP. Every stored sitting carries the version of this list
 * that produced it, so a later edit to the wording leaves old answers
 * readable as answers to the questions actually asked.
 */

/** Bump when a prompt changes meaning. Stored on every sitting. */
export const BSN_QUESTIONS_VERSION = 1;

export type BsnScreen = 1 | 2 | 3;

export type BsnQuestion = {
  key: string;
  screen: BsnScreen;
  prompt: string;
  /** Seconds she sits with the question before the writing box arrives. Only question six has one. */
  holdSeconds?: number;
};

export const BSN_QUESTIONS: readonly BsnQuestion[] = [
  {
    key: 'unnoticed_until_it_stops',
    screen: 1,
    prompt:
      'What is something you do regularly that nobody notices unless it stops? How long has it been invisible?',
  },
  {
    key: 'never_asked_about',
    screen: 1,
    prompt:
      'When you are in a room with the people closest to you, what part of you is present but never gets asked about?',
  },
  {
    key: 'praised_for_what',
    screen: 1,
    prompt:
      'Think of a time recently you were praised. Was it for what you did, or for who you are? How could you tell the difference?',
  },
  {
    key: 'who_could_describe_you',
    screen: 2,
    prompt:
      'Who in your life could describe you accurately? Not your roles, not your responsibilities, you. What would they say?',
  },
  {
    key: 'completely_seen',
    screen: 2,
    prompt:
      'Describe a moment, from any point in your life, when you felt completely seen. Who was it, and what did they do that made it different?',
  },
  {
    key: 'first_five_seconds',
    screen: 2,
    prompt:
      'When someone gives you a genuine compliment, what do you do with it? Trace what happens in the first five seconds.',
    holdSeconds: 5,
  },
  {
    key: 'never_offered',
    screen: 3,
    prompt:
      'What is something true about you that the people around you do not know? Not because it is a secret, but because you have never offered it.',
  },
  {
    key: 'risk_of_visible',
    screen: 3,
    prompt:
      'What do you think would happen if you let yourself be more visible? Opinions, needs, all of it. What is the risk you are avoiding?',
  },
  {
    key: 'wish_noticed',
    screen: 3,
    prompt:
      'Write down one thing you wish someone would notice about you without being told. Root will keep it between you and your coach.',
  },
] as const;

/**
 * The one answer the closing screen prints, in her own words.
 *
 * Question NINE, the thing she wishes someone would notice. It is
 * deliberately the same question as the stored column below: the thing
 * worth keeping in a column and the thing worth showing her at the end are
 * the same sentence here.
 */
export const BSN_CLOSING_KEY = 'wish_noticed';

/**
 * The question whose answer is stored in its own column
 * (member_happiness_deep_dive_sessions.noticed_wish, migration 215).
 */
export const BSN_COLUMN_KEY = 'wish_noticed';

/**
 * The question the coach's card lifts to the top as the session opener.
 *
 * Question NINE, the same one, and that is unusual in this family on
 * purpose. The brief for this template asks for it directly, and it is the
 * right answer here: the thing she wishes somebody would notice is the
 * thing a coach can actually do something about in the first minute of a
 * session, by noticing it out loud.
 */
export const BSN_OPENER_KEY = 'wish_noticed';

export type BsnDraft = Record<string, string>;

/** A finished sheet: all nine keys, every one carrying real words. */
export type BsnAnswers = Record<string, string>;

/** Whitespace only is not an answer, and a stray tab is not words. */
export function isAnswered(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * The sentence shown above a disabled Continue.
 *
 * Every question is required, so there is exactly one reason a Continue can
 * be dead here, and it is always said out loud.
 */
export function blockedReasonFor(value: string | undefined): string | null {
  return isAnswered(value) ? null : 'Write something here first. There is no wrong answer.';
}

/**
 * A draft that is safe to store mid-sitting.
 *
 * Accepts a partial sheet: it is what the save-and-resume write posts.
 * Unknown keys are dropped, and every value is coerced to a string, so
 * nothing a hand-built request invents reaches the column. That includes
 * the OTHER four templates' keys, which share this table.
 */
export function sanitizeBsnDraft(input: unknown): BsnDraft | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const source = input as Record<string, unknown>;
  const clean: BsnDraft = {};
  for (const question of BSN_QUESTIONS) {
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
 * questions". Half an answer sheet is never stored as a completion.
 */
export function sanitizeBsnAnswers(input: unknown): BsnAnswers | null {
  const draft = sanitizeBsnDraft(input);
  if (!draft) return null;
  for (const question of BSN_QUESTIONS) {
    if (!isAnswered(draft[question.key])) return null;
  }
  return draft;
}

/** The stored answers on a row, or null when they are not a complete set. */
export function readBsnAnswers(input: unknown): BsnAnswers | null {
  return sanitizeBsnAnswers(input);
}

/** The questions on one screen, in order. */
export function questionsForScreen(screen: BsnScreen): BsnQuestion[] {
  return BSN_QUESTIONS.filter((question) => question.screen === screen);
}

/** One question by its key, for the closing sentence and the coach's opener. */
export function questionFor(key: string): BsnQuestion | null {
  return BSN_QUESTIONS.find((question) => question.key === key) ?? null;
}

/**
 * The first question she has not answered yet, for save and resume.
 *
 * Returns 0 for an empty draft and the length of the list for a full one,
 * so a caller can use it directly as a step index without a second rule.
 */
export function firstUnansweredIndex(draft: BsnDraft): number {
  const index = BSN_QUESTIONS.findIndex((question) => !isAnswered(draft[question.key]));
  return index === -1 ? BSN_QUESTIONS.length : index;
}
