/**
 * Reusable Assessment Engine — comparison. Pure: takes two already-fetched
 * AssessmentResult objects (or a null previous, when there's nothing yet
 * to compare against) and produces a per-category and overall delta. No
 * Supabase here — lib/assessments/store.ts resolves *which* two
 * assessments to compare (latest vs. previous, or latest vs. the closest
 * completed assessment to N days ago) and hands the results to this file.
 *
 * Direction is inverted from the usual "up is good" intuition on purpose:
 * every questionnaire registered in this engine scores higher-is-worse
 * (see questionnaire.scoring.direction), so a lower score than last time
 * is an improvement.
 */

import type { PriorityLevel } from './engine/types';
import type { AssessmentResult } from './types';

export type ComparisonDirection = 'improved' | 'regressed' | 'unchanged' | 'unknown';

export type CategoryComparisonEntry = {
  categoryId: string;
  currentScore: number;
  currentMaxScore: number;
  currentPriority: PriorityLevel;
  previousScore: number | null;
  previousPriority: PriorityLevel | null;
  delta: number | null;
  direction: ComparisonDirection;
};

export type AssessmentComparison = {
  current: AssessmentResult;
  previous: AssessmentResult | null;
  totalDelta: number | null;
  totalDirection: ComparisonDirection;
  categories: CategoryComparisonEntry[];
};

function directionFromDelta(delta: number | null): ComparisonDirection {
  if (delta === null) return 'unknown';
  if (delta < 0) return 'improved';
  if (delta > 0) return 'regressed';
  return 'unchanged';
}

export function buildAssessmentComparison(
  current: AssessmentResult,
  previous: AssessmentResult | null
): AssessmentComparison {
  const previousByCategory = new Map(previous?.categoryScores.map((c) => [c.categoryId, c]) ?? []);

  const categories: CategoryComparisonEntry[] = current.categoryScores.map((currentCategory) => {
    const previousCategory = previousByCategory.get(currentCategory.categoryId) ?? null;
    const delta = previousCategory ? currentCategory.score - previousCategory.score : null;
    return {
      categoryId: currentCategory.categoryId,
      currentScore: currentCategory.score,
      currentMaxScore: currentCategory.maxScore,
      currentPriority: currentCategory.priority,
      previousScore: previousCategory?.score ?? null,
      previousPriority: previousCategory?.priority ?? null,
      delta,
      direction: directionFromDelta(delta),
    };
  });

  const totalDelta =
    previous?.record.totalScore != null && current.record.totalScore != null
      ? current.record.totalScore - previous.record.totalScore
      : null;

  return {
    current,
    previous,
    totalDelta,
    totalDirection: directionFromDelta(totalDelta),
    categories,
  };
}

/** Picks the completed assessment (oldest-first list) whose completedAt is closest to — but not after — `targetDate`. Null if none qualify (e.g. the member's only assessment is more recent than the target window). */
export function findClosestAssessmentOnOrBefore<T extends { completedAt: string }>(
  assessmentsOldestFirst: T[],
  targetDate: Date
): T | null {
  let best: T | null = null;
  for (const assessment of assessmentsOldestFirst) {
    if (new Date(assessment.completedAt) <= targetDate) {
      best = assessment;
    } else {
      break;
    }
  }
  return best;
}
