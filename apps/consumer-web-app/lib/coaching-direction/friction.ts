/**
 * The friction question.
 *
 * AUDIT-ADAPTIVE-REVEAL.md, 2.17. Rule 7 requires that when an action is
 * not completed before a new one is assigned, the member is asked what got
 * in the way. Nothing asked. The engine had a silent counter instead: three
 * consecutive ignored days changed the framing, two framing changes with no
 * response escalated to a coach and stopped offering it. Root drew
 * conclusions about a member from her silence and never once put a question
 * to her.
 *
 * This EXTENDS the engine's existing 3-day step. It does not replace it and
 * it does not bypass anything:
 *
 *   - Safety and re-entry are overrides that suspend the ladder entirely.
 *     A thread cannot reach the ignore window in a state where either is
 *     firing, so this can never appear over a safety moment.
 *   - The Reset Plan commitment rule is untouched.
 *   - Escalation is untouched. If she ignores the QUESTION as well, the
 *     approach change proceeds on the next run exactly as it did before
 *     this existed, and so does everything after it.
 *
 * The one thing that changes: on the day the ignore window closes, the
 * question is asked BEFORE the reword. Root asks first and adapts second.
 *
 * Pure. No I/O.
 */

import { APPROACH_REFRAMED, APPROACH_SMALLER, APPROACH_AS_WRITTEN } from './adaptation';

/**
 * The closed set of answers, and the shape of the list is the point.
 *
 * Every option is a fact about the DAY or about the SUGGESTION. None of
 * them is a fact about her. There is no "did not feel like it", no "not
 * motivated", no "skipped it", and there will not be one: a member telling
 * an app why something did not happen should not have to pick a
 * self-criticism from a menu to do it.
 */
export const FRICTION_REASONS = [
  'no_time',
  'too_hard',
  'forgot',
  'not_relevant',
  'something_else',
] as const;

export type FrictionReason = (typeof FRICTION_REASONS)[number];

export function isFrictionReason(value: unknown): value is FrictionReason {
  return typeof value === 'string' && (FRICTION_REASONS as readonly string[]).includes(value);
}

/** Root's own voice: short, plain, and it does not mention the streak. */
export const FRICTION_QUESTION = 'This one has not landed. What got in the way?';

export const FRICTION_NOTE_PLACEHOLDER = 'Anything else worth saying (optional)';

export const FRICTION_ANSWER_ACKNOWLEDGEMENT =
  'Thank you, that helps. I will take it into account.';

export const FRICTION_OPTION_LABEL: Record<FrictionReason, string> = {
  no_time: 'No time',
  too_hard: 'Too much to take on',
  forgot: 'I forgot',
  not_relevant: 'Not what I need right now',
  something_else: 'Something else',
};

export type FrictionOption = { reason: FrictionReason; label: string };

export const FRICTION_OPTIONS: FrictionOption[] = FRICTION_REASONS.map((reason) => ({
  reason,
  label: FRICTION_OPTION_LABEL[reason],
}));

/**
 * What her answer means for how Root asks next time.
 *
 * This is the whole reason the question exists rather than being a survey.
 * The engine already had three framings and walked them in a fixed order;
 * her answer now decides WHICH one, because the fixed order was a guess
 * and this is not.
 *
 *   no_time       the ask was too big for the day she had -> its smaller step
 *   too_hard      the same, said differently                -> its smaller step
 *   forgot        nothing wrong with the ask, she did not
 *                 see it in time. Rewording a suggestion
 *                 she never read would be answering a
 *                 question she did not ask               -> leave it as written
 *   not_relevant  the ask itself is wrong for her right
 *                 now, which is the one case a smaller
 *                 version does not help                   -> the reframe
 *   something_else she told us it is none of the above, so
 *                 the engine falls back to its own
 *                 existing order rather than guessing     -> the next framing
 */
export function approachForFrictionReason(
  reason: FrictionReason,
  currentApproach: number
): number {
  switch (reason) {
    case 'no_time':
    case 'too_hard':
      return APPROACH_SMALLER;
    case 'forgot':
      return APPROACH_AS_WRITTEN;
    case 'not_relevant':
      return APPROACH_REFRAMED;
    case 'something_else':
      return Math.min(currentApproach + 1, APPROACH_REFRAMED);
    default: {
      const exhaustive: never = reason;
      return exhaustive;
    }
  }
}

/**
 * One thread's friction state, as read from the outcome ledger.
 *
 * All three fields are independently meaningful, and collapsing any two of
 * them would break a real case:
 *
 *   asked=false                    never asked. Ask now.
 *   asked=true, answered=false     asked and ignored. Proceed silently, as
 *                                  before. Never ask twice.
 *   asked=true, answered=true      she told us. Use it.
 */
export type ThreadFrictionState = {
  asked: boolean;
  answered: boolean;
  reason: FrictionReason | null;
  /**
   * The member's own local date Root last put the question in front of her.
   *
   * Carried because the question is a TODAY question. Without this, "asked
   * and not answered" is true forever the moment she ignores it once, and
   * the card would carry an unanswered question from three weeks ago for
   * the rest of her membership.
   */
  lastAskedLocalDate: string | null;
};

export const NO_FRICTION_STATE: ThreadFrictionState = {
  asked: false,
  answered: false,
  reason: null,
  lastAskedLocalDate: null,
};

/** Whether the question is live on the member's screen right now. */
export function isFrictionQuestionOpen(
  friction: ThreadFrictionState,
  todayLocalDate: string
): boolean {
  return !friction.answered && friction.lastAskedLocalDate === todayLocalDate;
}

/**
 * Whether Root should put the question to her on this run.
 *
 * Deliberately takes the same two facts `adaptThread` takes, so the two
 * cannot disagree about when the window has closed: the question fires at
 * exactly the moment the approach change would have, and instead of it.
 */
export function shouldAskFriction(input: {
  /** True when the thread has reached the ignore window and is not blocked. */
  wouldChangeApproach: boolean;
  friction: ThreadFrictionState;
}): boolean {
  return input.wouldChangeApproach && !input.friction.asked;
}

/**
 * The framing to use, once the window has closed.
 *
 * Her answer wins when she gave one. Silence, whether she was never asked
 * or was asked and did not reply, falls back to `defaultApproach`, which is
 * exactly what `adaptThread` computed before this file existed. That is the
 * "if the member ignores the question itself, the current silent behavior
 * proceeds as before" rule, expressed as the default rather than as a
 * special case.
 */
export function approachAfterFriction(
  friction: ThreadFrictionState,
  defaultApproach: number,
  currentApproach: number
): number {
  if (!friction.answered || !friction.reason) return defaultApproach;
  return approachForFrictionReason(friction.reason, currentApproach);
}
