/**
 * Progression Intelligence — decides whether a given exercise should
 * progress, be maintained, regress, repeat, deload, or be substituted,
 * from this member's own completion history
 * (member_exercise_completions, migration 81) for that exercise plus
 * today's readiness. Pure function — history is passed in pre-filtered to
 * one (provider, external_id) pair, newest first — fully unit testable.
 */

import type { MemberExerciseCompletion } from '@mef/shared-types-contracts';
import type { PrescriptionFacts } from './facts';

export type ProgressionAction =
  'progress' | 'maintain' | 'regress' | 'repeat' | 'deload' | 'substitute';

export type ProgressionDecision = {
  action: ProgressionAction;
  reasoning: string;
};

/** `history` must already be filtered to one exercise (provider + external_id) and sorted newest-first — see lib/exercise-library/completions.ts's listExerciseCompletionHistory. */
export function decideProgressionAction(
  history: MemberExerciseCompletion[],
  facts: PrescriptionFacts
): ProgressionDecision {
  if (history.length === 0) {
    return {
      action: 'maintain',
      reasoning:
        'No completion history yet for this exercise — starting at a conservative baseline.',
    };
  }

  const latest = history[0]!;

  if (latest.comfort_rating === 'pain') {
    return {
      action: 'substitute',
      reasoning: `The most recent completion (${latest.occurred_at.slice(0, 10)}) reported pain — substituting rather than repeating or progressing.`,
    };
  }

  if (latest.comfort_rating === 'moderate_discomfort') {
    return {
      action: 'regress',
      reasoning: `The most recent completion (${latest.occurred_at.slice(0, 10)}) reported moderate discomfort — regressing to a gentler variation.`,
    };
  }

  if (latest.difficulty_rating === 'very_difficult') {
    return {
      action: 'regress',
      reasoning: `The most recent completion (${latest.occurred_at.slice(0, 10)}) was rated very difficult — regressing to a more manageable variation.`,
    };
  }

  const recentTwo = history.slice(0, 2);
  const allEasy =
    recentTwo.length >= 2 &&
    recentTwo.every((h) => h.difficulty_rating === 'very_easy' || h.difficulty_rating === 'easy');
  const allComfortable = recentTwo.every(
    (h) => h.comfort_rating === 'comfortable' || h.comfort_rating == null
  );
  if (allEasy && allComfortable) {
    return {
      action: 'progress',
      reasoning:
        'The last two completions were rated easy (or very easy) and comfortable — progressing this exercise.',
    };
  }

  const poorReadinessToday =
    (facts.latestCheckin?.painLevel ?? 0) >= 3 ||
    (facts.latestCheckin?.stressLevel ?? 0) >= 4 ||
    (facts.latestCheckin?.sleepQuality ?? 5) <= 2;
  if (poorReadinessToday) {
    return {
      action: 'deload',
      reasoning:
        "Today's readiness signals are below this member's usual baseline — deloading rather than repeating at full intensity.",
    };
  }

  return {
    action: 'repeat',
    reasoning: 'Recent history supports repeating this exercise at the same difficulty.',
  };
}
