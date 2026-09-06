/**
 * The nine questions, and the only rules about what counts as an answer.
 *
 * EVERY ONE IS OPEN WRITING. There is no scale here, no multiple choice
 * and no derived option list, because this experience is not measuring
 * anything: a coach reads what she actually wrote, and Root reads nothing
 * back to her except her own words. That is also why there is no maximum
 * length. A member who wants to write four hundred words about one
 * afternoon should be able to.
 *
 * THE QUESTIONS ARE THE INSTRUMENT, so they live here rather than in
 * ./copy.ts, exactly as Owning Your Value and the Stress & Load Deep-Dive
 * both split them. The frame around them (the intro, the closing, the
 * experiment, the resource) is copy and lives there.
 *
 * ONE VERSION STAMP. Every stored sitting carries the version of this list
 * that produced it, so a later edit to the wording leaves old answers
 * readable as answers to the questions actually asked.
 */

/** Bump when a prompt changes meaning. Stored on every sitting. */
export const WYJL_QUESTIONS_VERSION = 1;

export type WyjlScreen = 1 | 2 | 3;

export type WyjlQuestion = {
  key: string;
  screen: WyjlScreen;
  prompt: string;
};

export const WYJL_QUESTIONS: readonly WyjlQuestion[] = [
  {
    key: 'light_moment',
    screen: 1,
    prompt:
      'Think of a moment in the last month when you felt genuinely light, even briefly. Not relaxed, not relieved. Light. Where were you and what was happening?',
  },
  {
    key: 'loved_doing_before',
    screen: 1,
    prompt:
      'Now go further back. What did you love doing before life got this full? Describe yourself doing it. What did that version of you feel like?',
  },
  {
    key: 'laugh_hardest_with',
    screen: 1,
    prompt:
      'When you laugh hardest, who are you usually with? What is it about being around them?',
  },
  {
    key: 'reach_for',
    screen: 2,
    prompt:
      'At the end of a long day, what do you usually reach for to feel better? After you do it, do you feel filled up, or just less empty? Be honest.',
  },
  {
    key: 'too_much_effort',
    screen: 2,
    prompt:
      'What is something that always sounds like too much effort beforehand, but you are always glad you did afterward?',
  },
  {
    key: 'time_moves_fastest',
    screen: 2,
    prompt:
      'Where in your week does time move fastest? What are you doing when you look up and an hour has vanished?',
  },
  {
    key: 'two_hours',
    screen: 3,
    prompt:
      'If you had two hours next week that belonged to nobody but you, no guilt attached, and you had to spend them on joy rather than rest or catching up, what would you do?',
  },
  {
    key: 'twenty_minute_version',
    screen: 3,
    prompt: 'What is the smallest version of that? Something that fits in twenty minutes.',
  },
  {
    key: 'talks_you_out',
    screen: 3,
    prompt:
      'What usually talks you out of it? Write down what that voice says, word for word.',
  },
] as const;

/**
 * The two questions the closing screen places side by side.
 *
 * Named once, here, so the closing screen and the copy test can never
 * disagree about which two of the nine are paired. The order matters: the
 * fixed line beneath them is written for this pair in this order, and
 * nothing about either answer is interpreted.
 */
export const WYJL_CLOSING_PAIR_KEYS = ['reach_for', 'time_moves_fastest'] as const;

/**
 * The question whose answer is stored in its own column
 * (member_happiness_deep_dive_sessions.twenty_minute_joy, migration 212),
 * so a later feature can read the twenty minute thing rather than digging
 * it out of the answers blob.
 *
 * Named once, here, so the screen, the column, the action and the panel can
 * never disagree about which of the nine it is.
 */
export const WYJL_TWENTY_MINUTE_KEY = 'twenty_minute_version';

/**
 * The question the coach's card lifts to the top as the session opener.
 *
 * Deliberately NOT the same question as the stored column above. The column
 * holds the small version, because that is the one a later feature could
 * act on. The opener is the big one, because "what would you do with two
 * free hours" is where a conversation starts. Both are named here so
 * neither is decided by a screen.
 */
export const WYJL_OPENER_KEY = 'two_hours';

export type WyjlDraft = Record<string, string>;

/** A finished sheet: all nine keys, every one carrying real words. */
export type WyjlAnswers = Record<string, string>;

/** Whitespace only is not an answer, and a stray tab is not words. */
export function isAnswered(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * The sentence shown above a disabled Continue.
 *
 * Every question is required, so there is exactly one reason a Continue can
 * be dead here, and it is always said out loud. Same rule the check-in
 * wizard, the Stress & Load Deep-Dive and Owning Your Value all obey: a
 * disabled button with no explanation is a screen a member gets stuck on.
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
 * nothing a hand-built request invents reaches the column.
 */
export function sanitizeWyjlDraft(input: unknown): WyjlDraft | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const source = input as Record<string, unknown>;
  const clean: WyjlDraft = {};
  for (const question of WYJL_QUESTIONS) {
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
export function sanitizeWyjlAnswers(input: unknown): WyjlAnswers | null {
  const draft = sanitizeWyjlDraft(input);
  if (!draft) return null;
  for (const question of WYJL_QUESTIONS) {
    if (!isAnswered(draft[question.key])) return null;
  }
  return draft;
}

/**
 * The stored answers on a row, or null when they are not a complete set.
 *
 * Never half an answer sheet: a closing screen that placed one real answer
 * beside one silent blank would be worse than one that says out loud it
 * could not read them.
 */
export function readWyjlAnswers(input: unknown): WyjlAnswers | null {
  return sanitizeWyjlAnswers(input);
}

/** The questions on one screen, in order. */
export function questionsForScreen(screen: WyjlScreen): WyjlQuestion[] {
  return WYJL_QUESTIONS.filter((question) => question.screen === screen);
}

/** One question by its key, for the closing pair and the coach's opener. */
export function questionFor(key: string): WyjlQuestion | null {
  return WYJL_QUESTIONS.find((question) => question.key === key) ?? null;
}

/**
 * The first question she has not answered yet, for save and resume.
 *
 * Returns 0 for an empty draft and the length of the list for a full one,
 * so a caller can use it directly as a step index without a second rule.
 */
export function firstUnansweredIndex(draft: WyjlDraft): number {
  const index = WYJL_QUESTIONS.findIndex((question) => !isAnswered(draft[question.key]));
  return index === -1 ? WYJL_QUESTIONS.length : index;
}
