/**
 * The nine questions, and the only rules about what counts as an answer.
 *
 * EVERY ONE IS OPEN WRITING. There is no scale here, no multiple choice
 * and no derived option list, because this experience is not measuring
 * anything: a coach reads what she actually wrote, and Root reads nothing
 * back to her except her own words. That is also why there is no maximum
 * length. A member who wants to write four hundred words about yesterday
 * should be able to.
 *
 * THE QUESTIONS ARE THE INSTRUMENT, so they live here rather than in
 * ./copy.ts, exactly as the Stress & Load Deep-Dive splits them. The frame
 * around them (the intro, the closing, the experiment, the resource) is
 * copy and lives there.
 *
 * ONE VERSION STAMP. Every stored sitting carries the version of this list
 * that produced it, so a later edit to the wording leaves old answers
 * readable as answers to the questions actually asked.
 */

/** Bump when a prompt changes meaning. Stored on every sitting. */
export const OYV_QUESTIONS_VERSION = 1;

export type OyvScreen = 1 | 2 | 3;

export type OyvQuestion = {
  key: string;
  screen: OyvScreen;
  prompt: string;
};

export const OYV_QUESTIONS: readonly OyvQuestion[] = [
  {
    key: 'doing_for_others',
    screen: 1,
    prompt:
      'Walk through yesterday. Who did you do something for, and what was it? Include the small things you would normally never count.',
  },
  {
    key: 'doing_undone',
    screen: 1,
    prompt:
      'Which of those would go undone if you stopped? What do you imagine would actually happen?',
  },
  {
    key: 'receiving',
    screen: 1,
    prompt:
      'When did someone last do something for you without being asked? What was it, and what did receiving it feel like?',
  },
  {
    key: 'valued_because',
    screen: 2,
    prompt:
      'Finish this sentence, and take your time: People value me because... Then read it back. Is anything on that list about who you are, not what you do?',
  },
  {
    key: 'described_without_doing',
    screen: 2,
    prompt:
      'If someone who loves you described your value without naming a single thing you do for anyone, what would they say?',
  },
  {
    key: 'for_yourself',
    screen: 2,
    prompt:
      'When you do something purely for yourself, what shows up first: permission, guilt, or something else? Describe it.',
  },
  {
    key: 'strongest_moment',
    screen: 3,
    prompt:
      'Where in your week do you feel strongest and most yourself? What are you doing in that moment?',
  },
  {
    key: 'not_yours_to_carry',
    screen: 3,
    prompt:
      'Name one thing you are carrying that is not actually yours to carry. What would it take to set it down?',
  },
  {
    key: 'held_sentence',
    screen: 3,
    prompt: 'Write one sentence you would like to believe about yourself. Root will hold onto it.',
  },
] as const;

/**
 * The question whose answer is stored in its own column and shown as the
 * centerpiece of the closing screen and the top of the coach's card.
 *
 * Named once, here, so the screen, the column, the action and the panel can
 * never disagree about which of the nine it is.
 */
export const OYV_HELD_SENTENCE_KEY = 'held_sentence';

export type OyvDraft = Record<string, string>;

/** A finished sheet: all nine keys, every one carrying real words. */
export type OyvAnswers = Record<string, string>;

/** Whitespace only is not an answer, and a stray tab is not words. */
export function isAnswered(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * The sentence shown above a disabled Continue.
 *
 * Every question is required, so there is exactly one reason a Continue can
 * be dead here, and it is always said out loud. Same rule the check-in
 * wizard and the Stress & Load Deep-Dive both obey: a disabled button with
 * no explanation is a screen a member gets stuck on.
 */
export function blockedReasonFor(value: string | undefined): string | null {
  return isAnswered(value) ? null : 'Write something here first. There is no wrong answer.';
}

/**
 * A draft that is safe to store mid-sitting.
 *
 * Unlike the sanitizer below, this accepts a partial sheet: it is what the
 * save-and-resume write posts, and a member who has answered three of nine
 * has a real, storable draft. Unknown keys are dropped, and every value is
 * coerced to a string, so nothing a hand-built request invents reaches the
 * column.
 */
export function sanitizeOyvDraft(input: unknown): OyvDraft | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const source = input as Record<string, unknown>;
  const clean: OyvDraft = {};
  for (const question of OYV_QUESTIONS) {
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
export function sanitizeOyvAnswers(input: unknown): OyvAnswers | null {
  const draft = sanitizeOyvDraft(input);
  if (!draft) return null;
  for (const question of OYV_QUESTIONS) {
    if (!isAnswered(draft[question.key])) return null;
  }
  return draft;
}

/**
 * The stored answers on a row, or null when they are not a complete set.
 *
 * Never half an answer sheet, the same posture readStressLoadAnswers takes:
 * a coach card that rendered eight of nine questions with one silently
 * blank would be worse than a card that says out loud it could not read
 * them.
 */
export function readOyvAnswers(input: unknown): OyvAnswers | null {
  return sanitizeOyvAnswers(input);
}

/** The questions on one screen, in order. */
export function questionsForScreen(screen: OyvScreen): OyvQuestion[] {
  return OYV_QUESTIONS.filter((question) => question.screen === screen);
}

/**
 * The first question she has not answered yet, for save and resume.
 *
 * Returns 0 for an empty draft and the length of the list for a full one,
 * so a caller can use it directly as a step index without a second rule.
 */
export function firstUnansweredIndex(draft: OyvDraft): number {
  const index = OYV_QUESTIONS.findIndex((question) => !isAnswered(draft[question.key]));
  return index === -1 ? OYV_QUESTIONS.length : index;
}
