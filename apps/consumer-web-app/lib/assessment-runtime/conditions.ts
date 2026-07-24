import type { AnswerValue, SessionAnswers } from './types';

/**
 * The generic visibility/branching evaluator. Deliberately a separate,
 * richer vocabulary from lib/adaptive-assessment-engine's Rule/RuleOp
 * (eq/in/gt/gte/lt/lte, flat-list-only, AND-only) rather than an extension
 * of it — that module stays exactly as Prompt 1 left it (onboarding-safe).
 * This becomes the real interpreter for unified_assessment_questions'
 * requires/excludes/skip_rules jsonb columns, which migration 98 added and
 * left "reserved, nothing reads them yet."
 */
export type ConditionOp =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'greaterThan'
  | 'lessThan'
  | 'exists'
  | 'notExists';

export type LeafCondition = {
  type: 'leaf';
  questionKey: string;
  op: ConditionOp;
  /** Unused for exists/notExists. */
  value?: AnswerValue;
};

export type AndCondition = { type: 'and'; conditions: Condition[] };
export type OrCondition = { type: 'or'; conditions: Condition[] };

export type Condition = LeafCondition | AndCondition | OrCondition;

function toNumber(value: AnswerValue | undefined): number | null {
  if (value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isNaN(n) ? null : n;
}

function evaluateLeaf(leaf: LeafCondition, answers: SessionAnswers): boolean {
  const actual = answers[leaf.questionKey];

  switch (leaf.op) {
    case 'exists':
      return actual !== undefined;
    case 'notExists':
      return actual === undefined;
    case 'equals':
      return actual !== undefined && actual === leaf.value;
    case 'notEquals':
      return actual === undefined || actual !== leaf.value;
    case 'contains': {
      if (actual === undefined || leaf.value === undefined) return false;
      if (Array.isArray(actual)) return actual.includes(leaf.value as string);
      if (typeof actual === 'string' && typeof leaf.value === 'string') return actual.includes(leaf.value);
      return false;
    }
    case 'greaterThan': {
      const a = toNumber(actual);
      const b = toNumber(leaf.value);
      return a !== null && b !== null && a > b;
    }
    case 'lessThan': {
      const a = toNumber(actual);
      const b = toNumber(leaf.value);
      return a !== null && b !== null && a < b;
    }
  }
}

/** Pure, no I/O. Arbitrarily nestable AND/OR over leaf conditions. */
export function evaluateCondition(condition: Condition, answers: SessionAnswers): boolean {
  switch (condition.type) {
    case 'and':
      return condition.conditions.every((c) => evaluateCondition(c, answers));
    case 'or':
      return condition.conditions.some((c) => evaluateCondition(c, answers));
    case 'leaf':
      return evaluateLeaf(condition, answers);
  }
}

/** unified_assessment_questions.requires/excludes/skip_rules are raw jsonb — this is the one place that trusts authored content to match the Condition shape, mirroring lib/onboarding/adaptivePlan.ts's toAdaptive() and lib/assessment-foundation/adaptive.ts's toAdaptiveUnifiedQuestion() for the same trust boundary. */
export function parseCondition(raw: unknown): Condition | null {
  if (raw === null || raw === undefined) return null;
  return raw as Condition;
}

export function parseConditionList(raw: unknown): Condition[] {
  if (raw === null || raw === undefined) return [];
  return raw as Condition[];
}
