/**
 * Adaptive question ordering for the live onboarding intake. `primary_concern`
 * is always the first question, so it's the one signal available early
 * enough to reorder anything that follows without adding a new persisted
 * question or touching the submit payload (submit_onboarding keys every
 * answer by question_key, never by position — see app/actions/onboarding.ts).
 *
 * This never skips, drops, or duplicates a question: every member still
 * answers all 12 questions before submitting, just in an order that leans
 * toward what they already told us matters to them.
 */

import type { OnboardingQuestion } from '@mef/shared-types-contracts';
import { DEFAULT_TRANSITION, TRANSITION_COPY } from './coachCopy';

export const PRIMARY_CONCERN_QUESTION_KEY = 'primary_concern';

/** primary_concern value -> question_keys to pull forward, in priority order. */
export const PRIMARY_CONCERN_PRIORITY: Record<string, string[]> = {
  pain: ['baseline_pain_areas'],
  energy: ['baseline_energy_level', 'baseline_movement_frequency'],
  sleep: [],
  stress: ['baseline_digestion'],
  weight: ['baseline_movement_frequency', 'baseline_digestion'],
  digestion: ['baseline_digestion'],
  movement: ['baseline_movement_frequency'],
  performance: ['baseline_energy_level', 'baseline_movement_frequency'],
  healthy_aging: [],
  habits: ['baseline_goals'],
  general_optimization: [],
  other: [],
};

/**
 * Pure and permutation-safe: pins `primary_concern` first (a no-op if it's
 * already first, which it always is today), pulls the concern's priority
 * keys to immediately follow it in order, then appends every remaining
 * question in its original relative order. Filters the priority list down
 * to keys actually present in `questions`, so a stale/typo'd key in
 * PRIMARY_CONCERN_PRIORITY can never shrink or corrupt the output.
 */
export function reorderOnboardingQuestions(
  questions: OnboardingQuestion[],
  primaryConcern: string | null | undefined
): OnboardingQuestion[] {
  const byKey = new Map(questions.map((q) => [q.question_key, q]));
  const primary = byKey.get(PRIMARY_CONCERN_QUESTION_KEY);

  const priorityKeys = (primaryConcern ? PRIMARY_CONCERN_PRIORITY[primaryConcern] : undefined) ?? [];
  const forwarded = priorityKeys
    .filter((key) => key !== PRIMARY_CONCERN_QUESTION_KEY)
    .map((key) => byKey.get(key))
    .filter((q): q is OnboardingQuestion => q !== undefined);
  const forwardedKeys = new Set(forwarded.map((q) => q.question_key));

  const rest = questions.filter(
    (q) => q.question_key !== PRIMARY_CONCERN_QUESTION_KEY && !forwardedKeys.has(q.question_key)
  );

  return primary ? [primary, ...forwarded, ...rest] : [...forwarded, ...rest];
}

/** Short, personalized acknowledgment shown once, right after primary_concern is answered. */
export function transitionLineFor(primaryConcern: string | null | undefined): string {
  if (!primaryConcern) return DEFAULT_TRANSITION;
  return TRANSITION_COPY[primaryConcern] ?? DEFAULT_TRANSITION;
}
