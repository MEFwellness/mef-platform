/**
 * Pure heuristics that decide whether a just-recorded exercise completion
 * should land a "Pending Coach Review" item — the Movement Profile write
 * policy's middle tier (see migration 81's header). Same discipline as
 * lib/movement/rules/engine.ts and lib/ai/rules/engine.ts: every signal
 * traces to real completion/feedback rows the member just gave, nothing
 * fabricated or scored. Deliberately conservative — this only detects the
 * signals directly readable from one exercise's completion history
 * (new_pain_report, increased_discomfort, repeated_inability,
 * possible_progression, possible_regression); the schema also supports
 * capability_change / new_movement_limitation / restriction_conflict for a
 * coach (or a future body-assessment integration) to raise through the
 * same table — this function never invents those without real evidence.
 *
 * Called from a server action right after the insert, reading with the
 * member's own session — the review item itself is written under
 * member_id = auth.uid(), same trust boundary as
 * member_insert_own_timeline_events.
 */

import type {
  MemberExerciseCompletion,
  MovementProfileReviewType,
} from '@mef/shared-types-contracts';

export type DetectedReviewSignal = {
  reviewType: MovementProfileReviewType;
  summary: string;
  detail: string;
};

const PAIN_LEVEL_RANK: Record<string, number> = {
  comfortable: 0,
  slight_discomfort: 1,
  moderate_discomfort: 2,
  pain: 3,
};

const EASY_DIFFICULTY = new Set(['very_easy', 'easy']);

/**
 * `priorHistory` is this exercise's completion history BEFORE the new one
 * — newest first, does not include `newCompletion`. Returns zero or more
 * signals; a single completion can raise more than one (e.g. pain and a
 * skip in the same event).
 */
export function detectMovementProfileReviewSignals(
  newCompletion: Pick<
    MemberExerciseCompletion,
    'exercise_name' | 'status' | 'comfort_rating' | 'difficulty_rating'
  >,
  priorHistory: Pick<MemberExerciseCompletion, 'status' | 'comfort_rating' | 'difficulty_rating'>[]
): DetectedReviewSignal[] {
  const signals: DetectedReviewSignal[] = [];
  const name = newCompletion.exercise_name;

  // --- Comfort trend ---------------------------------------------------
  if (newCompletion.comfort_rating) {
    const priorHadPain = priorHistory.some((h) => h.comfort_rating === 'pain');
    if (newCompletion.comfort_rating === 'pain' && !priorHadPain) {
      signals.push({
        reviewType: 'new_pain_report',
        summary: `New pain report on ${name}`,
        detail: `The member rated "${name}" as painful — no prior pain rating for this exercise.`,
      });
    } else {
      const newRank = PAIN_LEVEL_RANK[newCompletion.comfort_rating] ?? 0;
      const lastRated = priorHistory.find((h) => h.comfort_rating);
      const lastRank = lastRated ? (PAIN_LEVEL_RANK[lastRated.comfort_rating!] ?? 0) : 0;
      if (newRank >= 2 && newRank > lastRank) {
        signals.push({
          reviewType: 'increased_discomfort',
          summary: `Increased discomfort on ${name}`,
          detail: `Comfort rating worsened from "${lastRated?.comfort_rating ?? 'no prior rating'}" to "${newCompletion.comfort_rating}" on "${name}".`,
        });
      }
    }
  }

  // --- Repeated inability ------------------------------------------------
  const recentStatuses = [newCompletion.status, ...priorHistory.slice(0, 2).map((h) => h.status)];
  if (recentStatuses.length === 3 && recentStatuses.every((s) => s === 'skipped')) {
    signals.push({
      reviewType: 'repeated_inability',
      summary: `Repeated inability to complete ${name}`,
      detail: `The last 3 attempts at "${name}" were all skipped.`,
    });
  }

  // --- Difficulty trend (progression / regression) -----------------------
  if (newCompletion.difficulty_rating) {
    const recentDifficulty = [
      newCompletion.difficulty_rating,
      ...priorHistory.slice(0, 2).map((h) => h.difficulty_rating),
    ];

    if (
      recentDifficulty.length === 3 &&
      recentDifficulty.every((d) => d && EASY_DIFFICULTY.has(d))
    ) {
      signals.push({
        reviewType: 'possible_progression',
        summary: `Possible progression opportunity on ${name}`,
        detail: `The last 3 difficulty ratings for "${name}" were easy or very easy — this member may be ready for a harder variation.`,
      });
    }

    if (
      recentDifficulty.length >= 2 &&
      recentDifficulty.slice(0, 2).every((d) => d === 'very_difficult')
    ) {
      signals.push({
        reviewType: 'possible_regression',
        summary: `Possible regression needed on ${name}`,
        detail: `The last 2 difficulty ratings for "${name}" were "very difficult" — this member may need an easier variation.`,
      });
    }
  }

  return signals;
}
