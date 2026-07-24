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

/** The minimum shape selectNext/selectBatch need — any richer question type (e.g. OnboardingQuestion) can be passed through directly and comes back out unchanged. */
export type AdaptiveQuestion = {
  question_key: string;
  weight: number;
  /** ALL must hold against already-collected answers for this question to be eligible at all. Absent/empty = always eligible. */
  requires?: Rule[] | null;
  /** Each satisfied boost adds its `amount` to the base weight — purely additive personalization, never gates eligibility. */
  boosts?: Boost[] | null;
};
