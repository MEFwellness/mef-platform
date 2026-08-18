/**
 * "Need another option?" — the reasons she can give, and what each one
 * means to the rules.
 *
 * WARM AND NO FAULT, everywhere. Nothing on this sheet implies she has
 * done something wrong, nothing asks her to justify herself, and "I just
 * do not like it" is a first-class answer sitting in the same list as
 * everything else. The one free-text box is optional and is read by her
 * coach, never by a rule that scores her.
 *
 * THE BRANCH IS THE POINT. Four reasons look like one question and are
 * four completely different questions:
 *
 *   pain              a safety event. No replacement is offered at all.
 *   too difficult     a request for a genuine regression, never a
 *                     sideways move and never something harder.
 *   too easy          NOT a request for something harder. Progression is
 *                     her coach's decision. It is logged and flagged.
 *   everything else   practical or preference. Two or three options that
 *                     do the same job in the same place in her session.
 *
 * NO EM DASHES, per the house rule.
 */
import type {
  ExerciseFeedbackBranch,
  ExerciseFeedbackReason,
} from '@mef/shared-types-contracts';

export interface FeedbackReasonOption {
  value: ExerciseFeedbackReason;
  /** What she taps. Her words, first person, no blame. */
  label: string;
}

/** The sheet, in the order it is offered. */
export const FEEDBACK_REASONS: readonly FeedbackReasonOption[] = [
  { value: 'pain', label: 'I feel pain or discomfort' },
  { value: 'too_difficult', label: 'Too difficult' },
  { value: 'too_easy', label: 'Too easy' },
  { value: 'do_not_understand', label: 'I do not understand it' },
  { value: 'no_equipment', label: 'I do not have the equipment' },
  { value: 'no_space', label: 'Not enough space' },
  { value: 'not_comfortable', label: 'Not comfortable doing it' },
  { value: 'do_not_like', label: 'I just do not like it' },
  { value: 'other', label: 'Something else' },
];

export const FEEDBACK_REASON_VALUES: readonly ExerciseFeedbackReason[] = FEEDBACK_REASONS.map(
  (option) => option.value
);

export function isFeedbackReason(value: unknown): value is ExerciseFeedbackReason {
  return typeof value === 'string' && FEEDBACK_REASON_VALUES.includes(value as ExerciseFeedbackReason);
}

export function feedbackReasonLabel(reason: ExerciseFeedbackReason): string {
  return FEEDBACK_REASONS.find((option) => option.value === reason)?.label ?? 'Something else';
}

/**
 * The reasons that get offered alternatives at all: practical problems and
 * preferences. Every one of them means "this exercise does not work for me
 * here", which is a question about which exercise fills the slot, not a
 * question about how hard the slot is or whether it is safe.
 */
const PRACTICAL_REASONS = new Set<ExerciseFeedbackReason>([
  'do_not_understand',
  'no_equipment',
  'no_space',
  'not_comfortable',
  'do_not_like',
]);

/**
 * Which rules a reason is judged under. `other` is decided by what she
 * typed: see ./safety.ts, which is the only thing allowed to read her
 * words, and reads them for exactly one purpose.
 */
export function branchForReason(
  reason: ExerciseFeedbackReason,
  otherTextIsPainFamily: boolean
): ExerciseFeedbackBranch {
  if (reason === 'pain') return 'safety';
  if (reason === 'too_difficult') return 'regression';
  if (reason === 'too_easy') return 'progression_note';
  if (reason === 'other') return otherTextIsPainFamily ? 'safety' : 'alternatives';
  if (PRACTICAL_REASONS.has(reason)) return 'alternatives';
  return 'alternatives';
}

/**
 * Whether a report should put the exercise on her do-not-offer list, and
 * why. Pain is immediate and is not negotiable. A dislike or a discomfort
 * is only an avoidance once it REPEATS, because one bad day with an
 * exercise is not a verdict on it.
 */
export function avoidanceSourceFor(input: {
  branch: ExerciseFeedbackBranch;
  reason: ExerciseFeedbackReason;
  /** How many times she has reported this same exercise before, this one included. */
  reportCount: number;
}): 'pain' | 'repeated_dislike' | null {
  if (input.branch === 'safety') return 'pain';
  if (
    (input.reason === 'do_not_like' || input.reason === 'not_comfortable') &&
    input.reportCount >= 2
  ) {
    return 'repeated_dislike';
  }
  return null;
}

/** How many skips of one exercise count as "she is not doing this one". */
export const REPEATED_SKIP_THRESHOLD = 3;
