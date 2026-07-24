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
import { DEFAULT_TRANSITION, FORWARDED_CONTEXT_NOTE, TRANSITION_COPY } from './coachCopy';

export const PRIMARY_CONCERN_QUESTION_KEY = 'primary_concern';

/**
 * primary_concern value -> question_keys to pull forward, in priority order.
 * `sleep` is deliberately `[]`: baseline_sleep_quality is already
 * display_order 2 (the question right after primary_concern), so a member
 * who picks "sleep" already gets the naturally-next question landing on
 * exactly what they said mattered — reordering here would only push
 * something else in front of it.
 */
export const PRIMARY_CONCERN_PRIORITY: Record<string, string[]> = {
  pain: ['baseline_pain_areas'],
  energy: ['baseline_energy_level', 'baseline_movement_frequency'],
  sleep: [],
  stress: ['baseline_digestion'],
  weight: ['baseline_movement_frequency', 'baseline_digestion'],
  digestion: ['baseline_digestion'],
  movement: ['baseline_movement_frequency'],
  performance: ['baseline_energy_level', 'baseline_movement_frequency'],
  healthy_aging: ['baseline_movement_frequency'],
  habits: ['baseline_goals'],
  general_optimization: ['baseline_goals'],
  other: ['baseline_goals'],
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

/**
 * A short "why we're asking this now" line shown inline on the *first*
 * question a concern pulls forward (not a separate screen, unlike
 * transitionLineFor/BranchTransition) — this is what makes the reorder
 * itself read as a coach following the conversation rather than a silent
 * reshuffle. Returns null for every question except that one, so it's safe
 * to call unconditionally per rendered question.
 */
export function contextNoteFor(
  primaryConcern: string | null | undefined,
  questionKey: string
): string | null {
  if (!primaryConcern) return null;
  const firstForwarded = PRIMARY_CONCERN_PRIORITY[primaryConcern]?.[0];
  if (!firstForwarded || firstForwarded !== questionKey) return null;
  return FORWARDED_CONTEXT_NOTE[primaryConcern] ?? null;
}
