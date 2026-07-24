/**
 * Pure selection logic — no I/O, no randomness beyond the injected `random`
 * param (defaults to Math.random, overridable so tests can assert against a
 * deterministic sequence). See types.ts for the rule/boost vocabulary this
 * operates on.
 */

import type { AdaptiveQuestion, AnsweredMap, AnswerValue, Rule } from './types';

function toArray(value: AnswerValue | AnswerValue[]): AnswerValue[] {
  return Array.isArray(value) ? value : [value];
}

function ruleSatisfied(rule: Rule, answered: AnsweredMap): boolean {
  const actual = answered[rule.question_key];
  if (actual === undefined || actual === null) return false;

  switch (rule.op) {
    case 'eq':
      return !Array.isArray(rule.value) && actual === rule.value;
    case 'in': {
      const candidates = toArray(rule.value);
      if (Array.isArray(actual)) return actual.some((v) => candidates.includes(v));
      return candidates.includes(actual);
    }
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const a = typeof actual === 'number' ? actual : Number(actual);
      const b = typeof rule.value === 'number' ? rule.value : Number(rule.value);
      if (Number.isNaN(a) || Number.isNaN(b)) return false;
      if (rule.op === 'gt') return a > b;
      if (rule.op === 'gte') return a >= b;
      if (rule.op === 'lt') return a < b;
      return a <= b;
    }
    default:
      return false;
  }
}

function isEligible(question: AdaptiveQuestion, answered: AnsweredMap): boolean {
  const requires = question.requires;
  if (!requires || requires.length === 0) return true;
  return requires.every((rule) => ruleSatisfied(rule, answered));
}

function scoreQuestion(question: AdaptiveQuestion, answered: AnsweredMap): number {
  let score = question.weight;
  for (const boost of question.boosts ?? []) {
    if (ruleSatisfied(boost, answered)) score += boost.amount;
  }
  return score;
}

/**
 * Picks one question: filters the bank to eligible, not-yet-picked
 * candidates, scores each (base weight + matched boosts), then picks
 * randomly among the top-scoring tier (anything within 1 point of the best
 * score) rather than always taking a single deterministic winner. That
 * weighted-random tiebreak is what makes two members with an identical
 * concern and identical prior answers still see a different question mix.
 * Returns null when nothing eligible remains.
 */
export function selectNext<T extends AdaptiveQuestion>(
  bank: readonly T[],
  answered: AnsweredMap,
  excludeKeys: ReadonlySet<string> | readonly string[],
  random: () => number = Math.random
): T | null {
  const exclude = excludeKeys instanceof Set ? excludeKeys : new Set(excludeKeys);
  const eligible = bank.filter((q) => !exclude.has(q.question_key) && isEligible(q, answered));
  if (eligible.length === 0) return null;

  const scored = eligible.map((question) => ({ question, score: scoreQuestion(question, answered) }));
  const maxScore = Math.max(...scored.map((s) => s.score));
  const topTier = scored.filter((s) => s.score >= maxScore - 1);

  const index = Math.min(Math.floor(random() * topTier.length), topTier.length - 1);
  return topTier[index]!.question;
}

/**
 * Convenience wrapper for phases that don't need mid-phase adaptivity: calls
 * selectNext in a loop, folding each pick into the exclusion set (never into
 * `answered` — a batch-selected question hasn't been answered yet, so later
 * picks in the same batch can't condition on it). Stops early if the bank
 * runs out of eligible candidates before reaching `count`.
 */
export function selectBatch<T extends AdaptiveQuestion>(
  bank: readonly T[],
  answered: AnsweredMap,
  excludeKeys: ReadonlySet<string> | readonly string[],
  count: number,
  random: () => number = Math.random
): T[] {
  const exclude = new Set(excludeKeys);
  const picks: T[] = [];

  for (let i = 0; i < count; i++) {
    const next = selectNext(bank, answered, exclude, random);
    if (!next) break;
    picks.push(next);
    exclude.add(next.question_key);
  }

  return picks;
}
