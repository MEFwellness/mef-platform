/**
 * The eleven questions, as data.
 *
 * Three screens, eleven questions, one question per screen. Declared once,
 * with stable keys and a version number stored on every sitting, so that
 * if the wording is ever changed, past answers stay readable as answers to
 * the questions actually asked rather than being silently re-labelled.
 *
 * REQUIRED MEANS A SENTENCE SHE CAN READ. Every question carries its own
 * `blockedReason`, exactly as lib/weekly-reflection/questions.ts and
 * lib/daily-checkin-adaptive/wizardUnits.ts do: a question cannot be marked
 * required without also supplying the line shown above the disabled
 * Continue, so a silently dead Continue is not writable here. All eleven
 * are required, per the brief.
 *
 * TWO QUESTIONS ARE BUILT FROM HER OWN EARLIER ANSWERS. Q3 offers only what
 * she picked in Q2, and Q8 offers only what she picked in Q7. Those are
 * `derived_single` questions, and their options are computed from the draft
 * rather than declared here, which is what makes "she can only narrow down
 * something she actually said" a property of the type rather than a rule
 * the screen has to remember.
 *
 * ONE DEFINITION OF ANSWERED, shared by the client (to decide whether
 * Continue is live) and by the server action (to decide whether the
 * submission is complete). Two definitions would mean a Continue that works
 * and a save that rejects.
 *
 * NO EM DASHES anywhere in this file. Every string here is read by a member
 * or by her coach.
 */

/** Bump only when a question's wording or meaning changes. Stored on every sitting. */
export const STRESS_LOAD_QUESTIONS_VERSION = 1;

export const STRESS_LOAD_QUESTION_KEYS = [
  'load_weight',
  'load_sources',
  'load_follows_home',
  'load_would_drop',
  'body_signals',
  'body_loudest_when',
  'response_actions',
  'response_relied_on',
  'recovery_sources',
  'recovery_amount',
  'lean_on',
] as const;

export type StressLoadQuestionKey = (typeof STRESS_LOAD_QUESTION_KEYS)[number];

export function isStressLoadQuestionKey(value: unknown): value is StressLoadQuestionKey {
  return (
    typeof value === 'string' &&
    (STRESS_LOAD_QUESTION_KEYS as readonly string[]).includes(value)
  );
}

/** The option value that opens a short text field. One spelling, everywhere. */
export const OTHER_VALUE = 'other';

/** The longest free text answer. Generous enough for a paragraph, short enough that this stays a sitting and not a journal. */
export const STRESS_LOAD_TEXT_MAX_LENGTH = 400;

/** The longest "something else" label. It has to fit on a button she taps on the next screen. */
export const STRESS_LOAD_OTHER_MAX_LENGTH = 80;

export type StressLoadOption = { value: string; label: string };

export type StressLoadScreen = 1 | 2 | 3;

type Common = {
  key: StressLoadQuestionKey;
  screen: StressLoadScreen;
  prompt: string;
  hint: string | null;
  blockedReason: string;
};

export type StressLoadQuestion =
  | (Common & { kind: 'scale'; options: readonly StressLoadOption[]; values: readonly number[] })
  | (Common & { kind: 'multi'; options: readonly StressLoadOption[]; allowsOther: boolean })
  | (Common & { kind: 'single'; options: readonly StressLoadOption[] })
  | (Common & { kind: 'derived_single'; sourceKey: StressLoadQuestionKey })
  | (Common & { kind: 'text'; maxLength: number });

// ---------------------------------------------------------------------
// Screen 1: The Load.
// ---------------------------------------------------------------------

/**
 * Q1's scale. Words, not bare numbers, for the same reason the Weekly
 * Reflection's is: a member picking "3" out of five with nothing written
 * beside it is guessing at what the middle means, and so is the coach
 * reading it back. The number is what makes two sittings comparable, the
 * word is what makes the number mean the same thing twice.
 */
export const LOAD_WEIGHT_OPTIONS: readonly StressLoadOption[] = [
  { value: '1', label: 'Light' },
  { value: '2', label: 'Manageable' },
  { value: '3', label: 'Full' },
  { value: '4', label: 'Heavy' },
  { value: '5', label: 'Crushing' },
];

export const LOAD_SOURCE_OPTIONS: readonly StressLoadOption[] = [
  { value: 'work', label: 'Work or business' },
  { value: 'family', label: 'Family or caregiving' },
  { value: 'money', label: 'Money' },
  { value: 'health', label: 'Health' },
  { value: 'relationship', label: 'A relationship' },
  { value: 'home', label: 'Home or living situation' },
  { value: 'carrying_for_someone', label: "Something I'm carrying for someone else" },
  { value: OTHER_VALUE, label: 'Something else' },
];

// ---------------------------------------------------------------------
// Screen 2: The Body's Answer.
// ---------------------------------------------------------------------

export const BODY_SIGNAL_OPTIONS: readonly StressLoadOption[] = [
  { value: 'sleep', label: 'My sleep changes' },
  { value: 'tension', label: 'Tension, tightness, or aches' },
  { value: 'energy', label: 'My energy drops' },
  { value: 'digestion', label: 'My digestion changes' },
  { value: 'mood', label: 'I get irritable or my mood shifts' },
  { value: 'cravings', label: 'Cravings show up' },
  { value: 'mind', label: 'My mind races' },
  { value: 'illness', label: 'I get sick more easily' },
];

export const BODY_LOUDEST_OPTIONS: readonly StressLoadOption[] = [
  { value: 'morning', label: 'Morning' },
  { value: 'midday', label: 'Midday' },
  { value: 'evening', label: 'Evening' },
  { value: 'night', label: "At night, when I'm trying to sleep" },
  { value: 'all_day', label: 'All day' },
];

/**
 * Q7's options, exactly as the brief lists them, in that order.
 *
 * Neutral presentation, and that is a design decision with teeth: nothing
 * in this list is styled, ordered or worded as the wrong answer. A member
 * who drinks when it gets heavy has told her coach something useful, and a
 * screen that flinched at her answer would stop getting honest ones.
 */
export const RESPONSE_ACTION_OPTIONS: readonly StressLoadOption[] = [
  { value: 'push_through', label: 'Push through and keep going' },
  { value: 'shut_down', label: 'Shut down or withdraw' },
  { value: 'distract', label: 'Scroll, watch TV, or distract myself' },
  { value: 'comfort_eat', label: 'Snack or eat for comfort' },
  { value: 'alcohol', label: 'Drink alcohol' },
  { value: 'move', label: 'Exercise or move' },
  { value: 'talk', label: 'Talk to someone' },
  { value: 'sleep', label: 'Sleep or lie down' },
  { value: 'irritable', label: 'Get irritable or take it out on others' },
  { value: 'work_more', label: 'Work more, stay busy' },
  { value: 'quiet', label: 'Breathing, meditation, prayer, or quiet time' },
  { value: OTHER_VALUE, label: 'Other' },
];

// ---------------------------------------------------------------------
// Screen 3: The Recovery Side.
// ---------------------------------------------------------------------

export const RECOVERY_SOURCE_OPTIONS: readonly StressLoadOption[] = [
  { value: 'sleep', label: 'Sleep' },
  { value: 'alone', label: 'Time alone' },
  { value: 'people', label: 'Time with people I love' },
  { value: 'movement', label: 'Movement' },
  { value: 'outside', label: 'Being outside' },
  { value: 'prayer', label: 'Prayer or quiet time' },
  { value: 'making', label: 'Making or creating something' },
  { value: 'music', label: 'Music' },
  { value: 'laughing', label: 'Laughing' },
  { value: 'nothing', label: 'Doing nothing at all' },
  { value: OTHER_VALUE, label: 'Other' },
];

export const RECOVERY_AMOUNT_OPTIONS: readonly StressLoadOption[] = [
  { value: 'none', label: 'None' },
  { value: 'taste', label: 'A taste' },
  { value: 'not_enough', label: 'Some, but not enough' },
  { value: 'fair_amount', label: 'A fair amount' },
  { value: 'plenty', label: 'Plenty' },
];

/** The one option that means she named nobody. Read by the pattern rules, so it is named once here. */
export const NO_ONE_VALUE = 'no_one';

export const LEAN_ON_OPTIONS: readonly StressLoadOption[] = [
  { value: 'partner', label: 'Partner' },
  { value: 'family', label: 'Family' },
  { value: 'friend', label: 'A friend' },
  { value: 'coach', label: 'My coach' },
  { value: 'faith', label: 'Faith or community' },
  { value: NO_ONE_VALUE, label: 'No one right now' },
  { value: OTHER_VALUE, label: 'Other' },
];

// ---------------------------------------------------------------------
// The eleven, in order.
// ---------------------------------------------------------------------

export const STRESS_LOAD_QUESTIONS: readonly StressLoadQuestion[] = [
  {
    key: 'load_weight',
    screen: 1,
    kind: 'scale',
    prompt: 'How heavy has the load felt over the last two weeks?',
    hint: null,
    options: LOAD_WEIGHT_OPTIONS,
    values: [1, 2, 3, 4, 5],
    blockedReason: 'Pick the one that fits the last two weeks best.',
  },
  {
    key: 'load_sources',
    screen: 1,
    kind: 'multi',
    prompt: 'Where is the weight coming from right now?',
    hint: 'Pick as many as are true.',
    options: LOAD_SOURCE_OPTIONS,
    allowsOther: true,
    blockedReason: 'Pick at least one place the weight is coming from.',
  },
  {
    key: 'load_follows_home',
    screen: 1,
    kind: 'derived_single',
    prompt: "Which one follows you home, even when you're not there?",
    hint: null,
    sourceKey: 'load_sources',
    blockedReason: 'Pick the one that follows you home.',
  },
  {
    key: 'load_would_drop',
    screen: 1,
    kind: 'text',
    prompt: 'If you could drop one thing tomorrow with no consequences, what would it be?',
    hint: 'Say it honestly. Nothing happens to it. Your coach reads this with you.',
    maxLength: STRESS_LOAD_TEXT_MAX_LENGTH,
    blockedReason: 'Name the one thing you would drop.',
  },
  {
    key: 'body_signals',
    screen: 2,
    kind: 'multi',
    prompt: "How does your body tell you it's too much?",
    hint: 'Pick as many as are true.',
    options: BODY_SIGNAL_OPTIONS,
    allowsOther: false,
    blockedReason: 'Pick at least one way your body tells you.',
  },
  {
    key: 'body_loudest_when',
    screen: 2,
    kind: 'single',
    prompt: 'When is it loudest?',
    hint: null,
    options: BODY_LOUDEST_OPTIONS,
    blockedReason: 'Pick when it is loudest.',
  },
  {
    key: 'response_actions',
    screen: 2,
    kind: 'multi',
    prompt: 'When it hits, what do you usually do?',
    hint: 'Pick as many as are true. Nothing here is a wrong answer.',
    options: RESPONSE_ACTION_OPTIONS,
    allowsOther: true,
    blockedReason: 'Pick at least one thing you usually do.',
  },
  {
    key: 'response_relied_on',
    screen: 2,
    kind: 'derived_single',
    prompt: 'Which one do you rely on most?',
    hint: null,
    sourceKey: 'response_actions',
    blockedReason: 'Pick the one you rely on most.',
  },
  {
    key: 'recovery_sources',
    screen: 3,
    kind: 'multi',
    prompt: 'What genuinely restores you? Not what should. What does.',
    hint: 'Pick as many as are true. The first one you pick is the one Root builds from.',
    options: RECOVERY_SOURCE_OPTIONS,
    allowsOther: true,
    blockedReason: 'Pick at least one thing that genuinely restores you.',
  },
  {
    key: 'recovery_amount',
    screen: 3,
    kind: 'single',
    prompt: 'How much of that did you actually get last week?',
    hint: null,
    options: RECOVERY_AMOUNT_OPTIONS,
    blockedReason: 'Pick how much of it you actually got.',
  },
  {
    key: 'lean_on',
    screen: 3,
    kind: 'multi',
    prompt: "Who or what can you lean on when it's heavy?",
    hint: 'Pick as many as are true.',
    options: LEAN_ON_OPTIONS,
    allowsOther: true,
    blockedReason: 'Pick at least one answer, including "No one right now" if that is the honest one.',
  },
] as const;

export function stressLoadQuestion(key: StressLoadQuestionKey): StressLoadQuestion {
  const question = STRESS_LOAD_QUESTIONS.find((q) => q.key === key);
  // Unreachable by construction: the key type is the list.
  if (!question) throw new Error(`Unknown Stress & Load question: ${key}`);
  return question;
}

// ---------------------------------------------------------------------
// The answers.
// ---------------------------------------------------------------------

/** A multi-select answer. `selected` is in the order she tapped, which is what makes "the first one you pick" a real answer rather than an alphabetical accident. */
export type MultiAnswer = { selected: string[]; otherText: string | null };

export type StressLoadAnswerValue = number | string | MultiAnswer;

export type StressLoadAnswers = {
  load_weight: number;
  load_sources: MultiAnswer;
  load_follows_home: string;
  load_would_drop: string;
  body_signals: MultiAnswer;
  body_loudest_when: string;
  response_actions: MultiAnswer;
  response_relied_on: string;
  recovery_sources: MultiAnswer;
  recovery_amount: string;
  lean_on: MultiAnswer;
};

/** What the experience holds while she is still filling it in. */
export type StressLoadDraft = Partial<Record<StressLoadQuestionKey, StressLoadAnswerValue>>;

export function isMultiAnswer(value: unknown): value is MultiAnswer {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.selected)) return false;
  if (!raw.selected.every((entry) => typeof entry === 'string')) return false;
  return raw.otherText === null || typeof raw.otherText === 'string';
}

export function multiAnswerOf(draft: StressLoadDraft, key: StressLoadQuestionKey): MultiAnswer {
  const value = draft[key];
  return isMultiAnswer(value) ? value : { selected: [], otherText: null };
}

/**
 * The options a derived question offers: exactly what she picked on the
 * question it derives from, in the order she picked them, with her own
 * words standing in for "Something else".
 *
 * Nothing else can ever appear here, which is the whole point: Q3 asks her
 * to narrow down her own list, and an option she never chose would be Root
 * putting a source of pressure into her mouth.
 */
export function derivedOptionsFor(
  question: StressLoadQuestion,
  draft: StressLoadDraft
): StressLoadOption[] {
  if (question.kind !== 'derived_single') return [];
  const source = stressLoadQuestion(question.sourceKey);
  if (source.kind !== 'multi') return [];

  const answer = multiAnswerOf(draft, question.sourceKey);
  const byValue = new Map(source.options.map((option) => [option.value, option.label]));

  return answer.selected
    .filter((value) => byValue.has(value))
    .map((value) => ({
      value,
      label:
        value === OTHER_VALUE && answer.otherText?.trim()
          ? answer.otherText.trim()
          : (byValue.get(value) as string),
    }));
}

/**
 * Whether one question has been answered well enough to move past it.
 *
 * A multi-select whose "Other" is ticked with an empty text field is NOT
 * answered, because the next screen would then offer her a button with no
 * words on it. The draft is passed in because a derived question's valid
 * answers are the earlier question's own selections and nothing else.
 */
export function isAnswered(
  question: StressLoadQuestion,
  value: unknown,
  draft: StressLoadDraft = {}
): boolean {
  switch (question.kind) {
    case 'scale':
      return (
        typeof value === 'number' &&
        Number.isInteger(value) &&
        question.values.includes(value)
      );
    case 'text':
      return typeof value === 'string' && value.trim().length > 0;
    case 'single':
      return typeof value === 'string' && question.options.some((o) => o.value === value);
    case 'derived_single':
      return (
        typeof value === 'string' &&
        derivedOptionsFor(question, draft).some((o) => o.value === value)
      );
    case 'multi': {
      if (!isMultiAnswer(value)) return false;
      const allowed = new Set(question.options.map((o) => o.value));
      if (value.selected.length === 0) return false;
      if (!value.selected.every((entry) => allowed.has(entry))) return false;
      if (value.selected.includes(OTHER_VALUE)) {
        return Boolean(value.otherText && value.otherText.trim().length > 0);
      }
      return true;
    }
  }
}

/**
 * The sentence shown above a disabled Continue, or null once this question
 * is answered.
 *
 * "Other" with nothing typed gets its own line rather than the question's
 * general one, because "Pick at least one" is confusing advice for a
 * member who has already picked one.
 */
export const OTHER_BLOCKED_REASON = 'Add a few words for the one you marked as something else.';

export function blockedReasonFor(
  question: StressLoadQuestion,
  draft: StressLoadDraft
): string | null {
  const value = draft[question.key];
  if (isAnswered(question, value, draft)) return null;
  if (
    question.kind === 'multi' &&
    isMultiAnswer(value) &&
    value.selected.length > 0 &&
    value.selected.includes(OTHER_VALUE)
  ) {
    return OTHER_BLOCKED_REASON;
  }
  return question.blockedReason;
}

/**
 * A complete, trimmed answer set, or null when anything is missing or out
 * of range.
 *
 * Runs on the SERVER over whatever the client posted, so a hand-built
 * request cannot store a 9 on a five point scale, a source of pressure she
 * never picked as the one that follows her home, or a key that is not one
 * of the eleven. It re-derives the two derived questions from the sanitized
 * multi-select answers rather than trusting the posted values.
 */
export function sanitizeStressLoadAnswers(value: unknown): StressLoadAnswers | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const clean: StressLoadDraft = {};

  // Two passes, because a derived question can only be validated once the
  // question it derives from is already clean.
  for (const question of STRESS_LOAD_QUESTIONS) {
    if (question.kind === 'derived_single') continue;
    const answer = raw[question.key];

    if (question.kind === 'text') {
      if (typeof answer !== 'string') return null;
      const trimmed = answer.trim().slice(0, question.maxLength);
      if (trimmed.length === 0) return null;
      clean[question.key] = trimmed;
      continue;
    }

    if (question.kind === 'multi') {
      if (!isMultiAnswer(answer)) return null;
      const allowed = new Set(question.options.map((o) => o.value));
      const seen = new Set<string>();
      const selected: string[] = [];
      for (const entry of answer.selected) {
        if (!allowed.has(entry) || seen.has(entry)) continue;
        seen.add(entry);
        selected.push(entry);
      }
      const otherText = answer.otherText?.trim().slice(0, STRESS_LOAD_OTHER_MAX_LENGTH) || null;
      const candidate: MultiAnswer = { selected, otherText };
      if (!isAnswered(question, candidate)) return null;
      clean[question.key] = candidate;
      continue;
    }

    if (!isAnswered(question, answer)) return null;
    clean[question.key] = answer as number | string;
  }

  for (const question of STRESS_LOAD_QUESTIONS) {
    if (question.kind !== 'derived_single') continue;
    const answer = raw[question.key];
    if (!isAnswered(question, answer, clean)) return null;
    clean[question.key] = answer as string;
  }

  return clean as StressLoadAnswers;
}

/** The same sanitizer applied on the way OUT, so a row written by any means renders only what the current vocabulary permits. Null rather than half an answer sheet. */
export function readStressLoadAnswers(value: unknown): StressLoadAnswers | null {
  return sanitizeStressLoadAnswers(value);
}

// ---------------------------------------------------------------------
// Reading answers back, in her own words.
// ---------------------------------------------------------------------

/**
 * One option's label, with her own words standing in for "Other".
 *
 * Takes the option LIST rather than the question, so a caller that already
 * knows which list it is reading (the coach card, the key insight copy) can
 * resolve a label without reconstructing a question object.
 */
export function labelForOption(
  options: readonly StressLoadOption[],
  value: string,
  otherText: string | null
): string {
  if (value === OTHER_VALUE && otherText?.trim()) return otherText.trim();
  return options.find((o) => o.value === value)?.label ?? value;
}

/**
 * One answer, as a coach reads it: a list of her own words for a
 * multi-select, one line for everything else.
 *
 * Derived answers resolve their label through the question they derive
 * from, so "Something else" reads as what she actually typed rather than as
 * the word "other".
 */
export function readableAnswer(
  question: StressLoadQuestion,
  answers: StressLoadAnswers
): string[] {
  switch (question.kind) {
    case 'scale': {
      const value = answers.load_weight;
      const label = question.options.find((o) => o.value === String(value))?.label;
      return [label ? `${label} (${value} of 5)` : `${value} of 5`];
    }
    case 'text':
      return [answers[question.key] as string];
    case 'single': {
      const value = answers[question.key] as string;
      return [question.options.find((o) => o.value === value)?.label ?? value];
    }
    case 'multi': {
      const answer = answers[question.key] as MultiAnswer;
      return answer.selected.map((value) =>
        labelForOption(question.options, value, answer.otherText)
      );
    }
    case 'derived_single': {
      const source = stressLoadQuestion(question.sourceKey);
      const sourceAnswer = answers[question.sourceKey] as MultiAnswer;
      const value = answers[question.key] as string;
      const options = source.kind === 'multi' ? source.options : [];
      return [labelForOption(options, value, sourceAnswer.otherText)];
    }
  }
}
