/**
 * Cross-question validation for driver-probe follow-ups (2026-08-14 bug
 * fix). A follow-up's answer can contradict its own parent's answer, and
 * until this module existed nothing noticed:
 *
 *   "How many meals did you skip today?"  ->  2
 *   "Which meal(s) did you skip?"         ->  Breakfast   (single-select)
 *
 * She said two, the screen recorded one, and there was no way to say
 * which two — the question carried a fake "More than one" option instead
 * of letting her tap two meals.
 *
 * The rule below is deliberately DATA-DRIVEN rather than keyed to the
 * meals question: any `multi_select` follow-up whose parent is a `count`
 * question must have exactly as many options selected as the number the
 * parent recorded. A coach adding another count-parent follow-up in
 * /coach/questions gets the same validation with no deploy, which is the
 * property the whole question bank is built around.
 *
 * Nothing here blocks when the shape does not match (parent absent from
 * today's plan, parent unanswered, parent not a count, follow-up not
 * multi-select) — a validation nobody can satisfy is the bug this fixes,
 * so every uncertain case fails OPEN.
 */

import type { AnsweredMap } from '../adaptive-assessment-engine/types';
import type { DriverProbeQuestion } from './types';

/**
 * The question a follow-up hangs off: its first `requires` rule's
 * question_key. Same single convention interleaveFollowUps() and
 * screenGrouping.ts's parentDomainOf() already read, not a second one.
 */
export function parentQuestionKey(question: DriverProbeQuestion): string | null {
  return question.requires[0]?.question_key ?? null;
}

/**
 * How many options this follow-up must have selected, derived from its
 * parent's own recorded answer. Non-null ONLY when all of these hold:
 * the follow-up is multi_select, its parent is in the given question list,
 * the parent is a `count` question, and the member has answered it with a
 * positive whole number. Every other case returns null = no requirement.
 */
export function requiredSelectionCount(
  question: DriverProbeQuestion,
  allQuestions: readonly DriverProbeQuestion[],
  answered: AnsweredMap
): number | null {
  if (question.responseType !== 'multi_select') return null;

  const parentKey = parentQuestionKey(question);
  if (!parentKey) return null;

  const parent = allQuestions.find((q) => q.questionKey === parentKey);
  if (!parent || parent.responseType !== 'count') return null;

  const parentAnswer = answered[parentKey];
  if (typeof parentAnswer !== 'number' || !Number.isInteger(parentAnswer) || parentAnswer <= 0) return null;

  // Never demand more selections than the question actually offers — a
  // count of 3 against a two-option follow-up would otherwise be
  // unsatisfiable, the exact failure mode this module exists to prevent.
  return Math.min(parentAnswer, question.options.length);
}

/**
 * Per-question nouns for the helper line, so it reads like a sentence a
 * coach would say ("Select 2 meals.") rather than a generic form error.
 * Same deliberately tiny lookup pattern as DriverProbeField's
 * SCALE_ANCHOR_LABELS and screenGrouping's PARENT_KEY_DOMAIN_HINTS: a
 * question with no entry here still gets a correct, if plainer, line, so
 * a coach-authored question never renders a blank or broken reason.
 */
const SELECTION_NOUNS: Record<string, { singular: string; plural: string }> = {
  'checkin_probe.skipped_meal_which': { singular: 'meal', plural: 'meals' },
};

function noun(questionKey: string, count: number): string {
  const entry = SELECTION_NOUNS[questionKey] ?? { singular: 'option', plural: 'options' };
  return count === 1 ? entry.singular : entry.plural;
}

/** How many options are currently selected, for any answer shape a multi_select can be holding (including "nothing yet"). */
export function selectionCount(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  // A single stored string is a pre-multi_select answer read back from
  // history — one selection, never discarded (same tolerance
  // CheckinForm's painLocation initializer already applies).
  return typeof value === 'string' && value.length > 0 ? 1 : 0;
}

/**
 * The member-facing reason this follow-up does not yet satisfy its
 * parent, or null when it does (or when no count requirement applies at
 * all). No em dashes: member-facing copy.
 */
export function countMatchBlockedReason(
  question: DriverProbeQuestion,
  allQuestions: readonly DriverProbeQuestion[],
  answered: AnsweredMap,
  value: unknown
): string | null {
  const required = requiredSelectionCount(question, allQuestions, answered);
  if (required === null) return null;

  const selected = selectionCount(value);
  if (selected === required) return null;
  if (selected > required) {
    return `Select only ${required} ${noun(question.questionKey, required)}, or change the number above.`;
  }
  return `Select ${required} ${noun(question.questionKey, required)}.`;
}
