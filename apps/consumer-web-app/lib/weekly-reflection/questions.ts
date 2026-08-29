/**
 * The five spine questions. Identical every week, forever, which is the
 * whole reason they are worth asking.
 *
 * A reflection is only comparable across weeks if the question did not
 * move between them. So these are declared once, as data, with stable
 * keys, and a version number stored on every row. If the five are ever
 * changed, past answers stay readable as answers to the questions they
 * were actually asked, rather than being silently re-labelled as answers
 * to new ones.
 *
 * REQUIRED MEANS A SENTENCE SHE CAN READ. Every question here carries a
 * `blockedReason`, exactly as lib/daily-checkin-adaptive/wizardUnits.ts
 * makes a check-in unit carry one: there is no way to mark a question
 * required without also supplying the line shown above the disabled
 * Continue. A silently dead Continue is not writable here, which is a
 * stronger guarantee than a test.
 *
 * All five are required, and that is a decision rather than an oversight.
 * The coach side of this feature is "coach and member look at the same
 * picture in the Friday review", and a reflection with three blanks in it
 * is not that picture. The cost is one member who genuinely has nothing to
 * say for a question, and it is paid in the hints: "If nothing did, say
 * so" is a real answer, in her own words, and it is more useful to a coach
 * than an empty field.
 *
 * NO EM DASHES anywhere in this file. Every string here is read by a
 * member.
 */

/** Bump only when a question's wording or meaning changes. Stored on every row. */
export const WEEKLY_REFLECTION_QUESTIONS_VERSION = 1;

export const REFLECTION_QUESTION_KEYS = [
  'week_overall',
  'what_helped',
  'what_got_in_the_way',
  'body_response',
  'next_week_change',
] as const;

export type ReflectionQuestionKey = (typeof REFLECTION_QUESTION_KEYS)[number];

export function isReflectionQuestionKey(value: unknown): value is ReflectionQuestionKey {
  return typeof value === 'string' && (REFLECTION_QUESTION_KEYS as readonly string[]).includes(value);
}

/**
 * Question 1's scale. Words, not bare numbers.
 *
 * A member picking "3" out of five with nothing written beside it is
 * guessing at what the middle means, and so is the coach reading it back.
 * The number is what makes the week comparable; the word is what makes the
 * number mean the same thing twice.
 */
export const WEEK_OVERALL_OPTIONS = [
  { value: 1, label: 'Really hard' },
  { value: 2, label: 'A bit of a grind' },
  { value: 3, label: 'Mixed' },
  { value: 4, label: 'Pretty good' },
  { value: 5, label: 'Really good' },
] as const;

export type WeekOverallValue = (typeof WEEK_OVERALL_OPTIONS)[number]['value'];

export function weekOverallLabel(value: number): string | null {
  return WEEK_OVERALL_OPTIONS.find((option) => option.value === value)?.label ?? null;
}

/** The longest answer a short free-text question accepts. Generous enough for a paragraph, short enough that this stays a reflection and not a journal. */
export const REFLECTION_TEXT_MAX_LENGTH = 400;

export type ReflectionQuestion =
  | {
      key: ReflectionQuestionKey;
      kind: 'scale';
      prompt: string;
      hint: string | null;
      options: typeof WEEK_OVERALL_OPTIONS;
      blockedReason: string;
    }
  | {
      key: ReflectionQuestionKey;
      kind: 'text';
      prompt: string;
      hint: string | null;
      maxLength: number;
      blockedReason: string;
    };

export const WEEKLY_REFLECTION_QUESTIONS: readonly ReflectionQuestion[] = [
  {
    key: 'week_overall',
    kind: 'scale',
    prompt: 'How did this week feel overall?',
    hint: null,
    options: WEEK_OVERALL_OPTIONS,
    blockedReason: 'Pick the one that fits your week best.',
  },
  {
    key: 'what_helped',
    kind: 'text',
    prompt: 'What helped you most this week?',
    hint: 'Anything at all, however small.',
    maxLength: REFLECTION_TEXT_MAX_LENGTH,
    blockedReason: 'Write a line about what helped.',
  },
  {
    key: 'what_got_in_the_way',
    kind: 'text',
    prompt: 'What got in the way?',
    hint: 'If nothing did, say so.',
    maxLength: REFLECTION_TEXT_MAX_LENGTH,
    blockedReason: 'Write a line about what got in the way, or say nothing did.',
  },
  {
    key: 'body_response',
    kind: 'text',
    prompt: 'How did your body respond this week?',
    hint: 'Energy, sleep, pain, digestion.',
    maxLength: REFLECTION_TEXT_MAX_LENGTH,
    blockedReason: 'Write a line about how your body responded.',
  },
  {
    key: 'next_week_change',
    kind: 'text',
    prompt: 'What do you want to be different next week?',
    hint: 'One thing is plenty.',
    maxLength: REFLECTION_TEXT_MAX_LENGTH,
    blockedReason: 'Name one thing you want to be different.',
  },
] as const;

/** The five answers, as stored and as read back. */
export type ReflectionAnswers = {
  week_overall: number;
  what_helped: string;
  what_got_in_the_way: string;
  body_response: string;
  next_week_change: string;
};

/** A partial answer set, which is what the experience holds while she is still filling it in. */
export type ReflectionAnswerDraft = Partial<Record<ReflectionQuestionKey, number | string>>;

/**
 * Whether one question has been answered well enough to move past it.
 *
 * The single definition of "answered", shared by the client (to decide
 * whether Continue is live) and by the server action (to decide whether
 * the submission is complete). Two definitions here would mean a Continue
 * that works and a save that rejects, which is the worst version of this
 * screen.
 */
export function isAnswered(question: ReflectionQuestion, value: unknown): boolean {
  if (question.kind === 'scale') {
    return (
      typeof value === 'number' &&
      Number.isInteger(value) &&
      question.options.some((option) => option.value === value)
    );
  }
  return typeof value === 'string' && value.trim().length > 0;
}

/** The first unanswered question's own sentence, or null once every one of them is answered. */
export function firstBlockedReason(draft: ReflectionAnswerDraft): string | null {
  return (
    WEEKLY_REFLECTION_QUESTIONS.find((question) => !isAnswered(question, draft[question.key]))
      ?.blockedReason ?? null
  );
}

/**
 * A complete, trimmed answer set, or null when anything is missing or out
 * of range.
 *
 * Runs on the server over whatever the client posted, so a hand-built
 * request cannot store a 9 on a five point scale, a thousand word essay,
 * or a key that is not one of the five.
 */
export function sanitizeReflectionAnswers(value: unknown): ReflectionAnswers | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const out: Record<string, number | string> = {};

  for (const question of WEEKLY_REFLECTION_QUESTIONS) {
    const answer = raw[question.key];
    if (question.kind === 'scale') {
      if (!isAnswered(question, answer)) return null;
      out[question.key] = answer as number;
      continue;
    }
    if (typeof answer !== 'string') return null;
    const trimmed = answer.trim().slice(0, question.maxLength);
    if (trimmed.length === 0) return null;
    out[question.key] = trimmed;
  }

  return out as ReflectionAnswers;
}

/** The same sanitizer applied on the way OUT, so a row written by any means renders only what the current vocabulary permits. Returns null rather than a half row. */
export function readReflectionAnswers(value: unknown): ReflectionAnswers | null {
  return sanitizeReflectionAnswers(value);
}
