/**
 * The deterministic rules engine — runs BEFORE any LLM is involved, per
 * the milestone's stated philosophy ("the LLM should enhance coaching,
 * not replace deterministic wellness logic"). Rule definitions live in
 * the ai_rules table (supabase/migrations/00000000000027_ai_infrastructure.sql,
 * seeded in supabase/seed/04_ai_agents_and_rules.sql) as data, not code —
 * an admin surface can add/adjust rules later without a deploy. This
 * module only knows how to evaluate the condition grammar and render the
 * output template; it has no opinion about what any specific rule says.
 */

import type { AiActionType, AiRule } from '@mef/shared-types-contracts';
import type { RuleFacts } from './facts';

type ComparableFactValue = RuleFacts[keyof RuleFacts];

type LeafCondition = {
  fact: keyof RuleFacts;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';
  value: ComparableFactValue;
};

type CombinatorCondition = { all: RuleCondition[] } | { any: RuleCondition[] };

export type RuleCondition = LeafCondition | CombinatorCondition;

function isLeafCondition(condition: RuleCondition): condition is LeafCondition {
  return 'fact' in condition;
}

/**
 * A leaf never matches against a null/missing fact (there's no "3
 * consecutive days of increase" claim to make when there isn't enough
 * check-in history yet) — this is what keeps the engine from ever
 * fabricating a match out of absent data.
 */
function evaluateLeaf(leaf: LeafCondition, facts: RuleFacts): boolean {
  const actual = facts[leaf.fact];
  if (actual === null || actual === undefined) return false;

  switch (leaf.operator) {
    case 'eq':
      return actual === leaf.value;
    case 'neq':
      return actual !== leaf.value;
    case 'gt':
      return typeof actual === 'number' && typeof leaf.value === 'number' && actual > leaf.value;
    case 'gte':
      return typeof actual === 'number' && typeof leaf.value === 'number' && actual >= leaf.value;
    case 'lt':
      return typeof actual === 'number' && typeof leaf.value === 'number' && actual < leaf.value;
    case 'lte':
      return typeof actual === 'number' && typeof leaf.value === 'number' && actual <= leaf.value;
    default:
      return false;
  }
}

export function evaluateCondition(condition: RuleCondition, facts: RuleFacts): boolean {
  if (isLeafCondition(condition)) return evaluateLeaf(condition, facts);
  if ('all' in condition) return condition.all.every((c) => evaluateCondition(c, facts));
  return condition.any.some((c) => evaluateCondition(c, facts));
}

export type RuleProduces = {
  insightType: string;
  actionType: AiActionType;
  title: string;
  descriptionTemplate: string;
  confidence: number;
  requiresCoachApproval: boolean;
};

export type RuleMatch = {
  rule: AiRule;
  produces: RuleProduces;
  /** descriptionTemplate with every {{fact}} placeholder substituted from the real facts that made this rule match. */
  description: string;
  facts: RuleFacts;
};

/** {{stressConsecutiveIncreaseDays}} -> the real number that triggered the rule — every rendered description is traceable to actual data, never a canned string. */
function renderTemplate(template: string, facts: RuleFacts): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const value = facts[key as keyof RuleFacts];
    return value === null || value === undefined ? match : String(value);
  });
}

/**
 * Evaluates every enabled rule whose trigger_event_types includes the
 * given event type against the given facts, returning the ones that
 * matched with their output fully rendered. Rules are data
 * (AiRule.conditions/produces are jsonb) — this function is the only
 * place that knows how to interpret that data as executable logic.
 */
export function evaluateRules(rules: AiRule[], eventType: string, facts: RuleFacts): RuleMatch[] {
  const matches: RuleMatch[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (!rule.trigger_event_types.includes(eventType as never)) continue;

    const condition = rule.conditions as RuleCondition;
    if (!evaluateCondition(condition, facts)) continue;

    const produces = rule.produces as RuleProduces;
    matches.push({
      rule,
      produces,
      description: renderTemplate(produces.descriptionTemplate, facts),
      facts,
    });
  }

  return matches.sort((a, b) => a.rule.priority - b.rule.priority);
}
