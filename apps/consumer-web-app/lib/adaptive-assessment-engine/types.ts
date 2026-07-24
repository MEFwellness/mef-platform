/**
 * Adaptive Assessment Engine — a reusable, domain-agnostic question-selection
 * primitive. Nothing in this package knows about onboarding, concerns, or
 * any other product concept; it only knows how to pick the next-best
 * question out of a bank, given what's already been answered. A caller (e.g.
 * lib/onboarding/adaptivePlan.ts) supplies its own question shape (as long as
 * it satisfies AdaptiveQuestion) and owns every domain-specific decision:
 * which bank to use, how many questions to ask, when to stop.
 */

export type AnswerValue = string | number | boolean | string[];

/** question_key -> the value already collected for it, if answered. */
export type AnsweredMap = Record<string, AnswerValue | undefined>;

export type RuleOp = 'eq' | 'in' | 'gt' | 'gte' | 'lt' | 'lte';

/** A condition checked against AnsweredMap — the mechanism behind both eligibility gating (Rule) and personalization (Boost). */
export type Rule = {
  question_key: string;
  op: RuleOp;
  value: AnswerValue | AnswerValue[];
};

/** A Rule that, when satisfied, adds `amount` to a question's selection score instead of gating its eligibility. */
export type Boost = Rule & { amount: number };

/**
 * Reserved metadata for a future section/flow navigator built on top of
 * this engine (cross-questionnaire sequencing, explicit skip-to-question,
 * section/assessment completion). Typed here so callers can start storing
 * it now, but selectNext/selectBatch do not read these fields yet — adding
 * a navigator that interprets them is a later, separate task.
 */
export type FollowUpRule = Rule & { targetQuestionKey: string };
export type CompletionRule = { condition: Rule; action: 'complete_section' | 'complete_assessment' };

/** The minimum shape selectNext/selectBatch need — any richer question type (e.g. OnboardingQuestion) can be passed through directly and comes back out unchanged. */
export type AdaptiveQuestion = {
  question_key: string;
  weight: number;
  /** ALL must hold against already-collected answers for this question to be eligible at all. Absent/empty = always eligible. */
  requires?: Rule[] | null;
  /** ANY satisfied rule makes the question ineligible, even if `requires` passes. Absent/empty = never excluded. */
  excludes?: Rule[] | null;
  /** Each satisfied boost adds its `amount` to the base weight — purely additive personalization, never gates eligibility. */
  boosts?: Boost[] | null;
  /** Static additive tiebreak added to the base weight, independent of answered state. Absent = 0 (no change to current scoring). */
  priority?: number | null;
  /** Reserved — not read by selectNext/selectBatch yet. See FollowUpRule. */
  follow_up_rules?: FollowUpRule[] | null;
  /** Reserved — not read by selectNext/selectBatch yet. */
  skip_rules?: Rule[] | null;
  /** Reserved — not read by selectNext/selectBatch yet. See CompletionRule. */
  completion_rules?: CompletionRule[] | null;
};
