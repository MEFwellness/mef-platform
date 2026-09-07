/**
 * The nine questions, the two versions of question one, and the only rules
 * about what counts as an answer.
 *
 * EVERY ONE IS OPEN WRITING. There is no scale here, no multiple choice
 * and no derived option list, because this experience is not measuring
 * anything: a coach reads what she actually wrote, and Root reads nothing
 * back to her except her own words. That is also why there is no maximum
 * length.
 *
 * QUESTION ONE HAS TWO VERSIONS AND ONE KEY. The follow-up version and the
 * standalone version ask the same thing of the same slot, so they share a
 * key and a stored answer. Which one she was shown is recorded on the
 * sitting itself (follow_up_source_experience_key), never inferred later
 * from the wording, because the wording is rebuilt at read time.
 *
 * THE FOLLOW-UP VERSION NAMES NO OTHER EXPERIENCE. It quotes what she
 * wrote and says "last time". A member who never did the earlier sitting
 * sees the standalone version and, everywhere she can read, no evidence
 * that another template exists at all.
 *
 * THE QUESTIONS ARE THE INSTRUMENT, so they live here rather than in
 * ./copy.ts, exactly as the three Happiness templates beside it and the
 * Stress & Load Deep-Dive all split them.
 *
 * ONE VERSION STAMP. Every stored sitting carries the version of this list
 * that produced it, so a later edit to the wording leaves old answers
 * readable as answers to the questions actually asked.
 */

import type { TwoyFollowUp } from './followUp';

/** Bump when a prompt changes meaning. Stored on every sitting. */
export const TWOY_QUESTIONS_VERSION = 1;

export type TwoyScreen = 1 | 2 | 3;

export type TwoyQuestion = {
  key: string;
  screen: TwoyScreen;
  /** The standalone wording. Question one's follow-up wording is built below. */
  prompt: string;
};

export const TWOY_QUESTIONS: readonly TwoyQuestion[] = [
  {
    key: 'automatic_yes',
    screen: 1,
    prompt:
      'Think of the last time you said yes when everything in you wanted to say no. What was the request, and what did the yes cost you?',
  },
  {
    key: 'no_movie',
    screen: 1,
    prompt:
      'What do you imagine happens if you say no? Play the movie forward. How much of that movie has ever actually happened?',
  },
  {
    key: 'easiest_hardest',
    screen: 1,
    prompt:
      'Who in your life is easiest to say no to, and who is hardest? What is the difference between them?',
  },
  {
    key: 'body_cost',
    screen: 2,
    prompt:
      'When you say yes to something you do not want, where does it show up in your body afterward? Describe the feeling and where it sits.',
  },
  {
    key: 'cost_to_someone_else',
    screen: 2,
    prompt:
      'What did your yes cost someone else recently? Think of a time your overcommitment meant less of you for something or someone that mattered more.',
  },
  {
    key: 'taught_about_no',
    screen: 2,
    prompt: 'What were you taught, growing up, about what happens to people who say no?',
  },
  {
    key: 'the_unsaid_no',
    screen: 3,
    prompt:
      'Write the no you have been needing to say. The actual words, to the actual person. Nobody sees this but you and your coach.',
  },
  {
    key: 'kind_version',
    screen: 3,
    prompt:
      'What is the kindest true version of that no? Rewrite it the way you could actually say it out loud.',
  },
  {
    key: 'what_becomes_possible',
    screen: 3,
    prompt: 'What would become possible in your life if that no was said and survived?',
  },
] as const;

/**
 * The question that has a follow-up version. Question ONE.
 *
 * Named once, here, so the screen, the coach panel and the copy test can
 * never disagree about which of the nine adapts.
 */
export const TWOY_FOLLOW_UP_KEY = 'automatic_yes';

/**
 * The two halves of the follow-up wording, with her own words dropped
 * between them.
 *
 * Kept as two constants rather than one template string so the copy test
 * can assert the approved sentence without also asserting a particular
 * member's answer, and so nothing in this file can quietly edit what she
 * wrote.
 */
export const TWOY_FOLLOW_UP_PREFIX = 'Last time, you told Root you could ask someone for this: ';
export const TWOY_FOLLOW_UP_SUFFIX = 'Did you ask? What happened, or what stopped you?';

/**
 * Question one's wording for this sitting.
 *
 * HER WORDS ARE NOT EDITED. The only thing done to the quoted answer is
 * trimming the whitespace around it, and adding a period after it when she
 * did not end on sentence punctuation herself, so the sentence that follows
 * does not run into hers. Nothing inside her answer is touched, nothing is
 * shortened and nothing is capitalised.
 */
export function followUpPromptFor(deposit: string): string {
  const quoted = deposit.trim();
  const closed = /[.!?]$/.test(quoted) ? quoted : `${quoted}.`;
  return `${TWOY_FOLLOW_UP_PREFIX}${closed} ${TWOY_FOLLOW_UP_SUFFIX}`;
}

/**
 * The wording a given question is shown in, for a given sitting.
 *
 * Every question but the first ignores the follow-up entirely, and the
 * first ignores it too when there is none. This is the ONE place the choice
 * is made, so the member's screen and the coach's card can never show two
 * different question ones for one stored answer.
 */
export function promptFor(question: TwoyQuestion, followUp: TwoyFollowUp | null): string {
  if (question.key !== TWOY_FOLLOW_UP_KEY || !followUp) return question.prompt;
  return followUpPromptFor(followUp.depositRequest);
}

/**
 * The one answer the closing screen prints, in her own words.
 *
 * Question EIGHT, the kind version of her no. It is deliberately the same
 * question as the stored column below: the thing worth keeping in a column
 * and the thing worth showing her at the end are the same sentence here,
 * unlike The Giving Ledger where they were two.
 */
export const TWOY_CLOSING_KEY = 'kind_version';

/**
 * The question whose answer is stored in its own column
 * (member_happiness_deep_dive_sessions.kind_no, migration 214).
 */
export const TWOY_COLUMN_KEY = 'kind_version';

/**
 * The question the coach's card lifts to the top as the session opener.
 *
 * Question SEVEN, the raw no she has been needing to say, because that is
 * the one a conversation starts from. Deliberately not question eight: the
 * kind version is the one she can say out loud, and the raw one is the one
 * that needs a person sitting across from her.
 */
export const TWOY_OPENER_KEY = 'the_unsaid_no';

export type TwoyDraft = Record<string, string>;

/** A finished sheet: all nine keys, every one carrying real words. */
export type TwoyAnswers = Record<string, string>;

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
 * the OTHER three templates' keys, which share this table.
 */
export function sanitizeTwoyDraft(input: unknown): TwoyDraft | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const source = input as Record<string, unknown>;
  const clean: TwoyDraft = {};
  for (const question of TWOY_QUESTIONS) {
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
export function sanitizeTwoyAnswers(input: unknown): TwoyAnswers | null {
  const draft = sanitizeTwoyDraft(input);
  if (!draft) return null;
  for (const question of TWOY_QUESTIONS) {
    if (!isAnswered(draft[question.key])) return null;
  }
  return draft;
}

/** The stored answers on a row, or null when they are not a complete set. */
export function readTwoyAnswers(input: unknown): TwoyAnswers | null {
  return sanitizeTwoyAnswers(input);
}

/** The questions on one screen, in order. */
export function questionsForScreen(screen: TwoyScreen): TwoyQuestion[] {
  return TWOY_QUESTIONS.filter((question) => question.screen === screen);
}

/** One question by its key, for the closing sentence and the coach's opener. */
export function questionFor(key: string): TwoyQuestion | null {
  return TWOY_QUESTIONS.find((question) => question.key === key) ?? null;
}

/**
 * The first question she has not answered yet, for save and resume.
 *
 * Returns 0 for an empty draft and the length of the list for a full one,
 * so a caller can use it directly as a step index without a second rule.
 */
export function firstUnansweredIndex(draft: TwoyDraft): number {
  const index = TWOY_QUESTIONS.findIndex((question) => !isAnswered(draft[question.key]));
  return index === -1 ? TWOY_QUESTIONS.length : index;
}
