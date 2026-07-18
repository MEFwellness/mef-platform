/**
 * Pure unit tests for lib/assessments/comparison.ts. No Supabase — every
 * AssessmentResult here is hand-built. Direction is deliberately inverted
 * from "up is good": every registered questionnaire scores higher-is-worse
 * (see questionnaire.scoring.direction), so a lower score than last time
 * is an "improved" direction.
 */
import { describe, it, expect } from 'vitest';
import { buildAssessmentComparison, findClosestAssessmentOnOrBefore } from '../lib/assessments/comparison';
import type { AssessmentResult } from '../lib/assessments/types';

function makeResult(
  id: string,
  completedAt: string,
  categoryScores: { categoryId: string; score: number; maxScore: number; priority: 'low' | 'moderate' | 'high' }[]
): AssessmentResult {
  const totalScore = categoryScores.reduce((sum, c) => sum + c.score, 0);
  return {
    record: {
      id,
      questionnaireId: 'chek-hlc1-nutrition-lifestyle',
      questionnaireVersion: 1,
      status: 'completed',
      currentCategoryId: null,
      currentQuestionNumber: null,
      totalScore,
      totalMaxScore: 635,
      totalPriority: 'moderate',
      startedAt: completedAt,
      completedAt,
    },
    categoryScores: categoryScores.map((c) => ({ ...c, categoryName: c.categoryId })),
  };
}

describe('buildAssessmentComparison', () => {
  it('marks direction "unknown" for every category and the total when there is no previous assessment', () => {
    const current = makeResult('a1', '2026-06-01T00:00:00Z', [
      { categoryId: 'stress', score: 40, maxScore: 81, priority: 'high' },
    ]);
    const comparison = buildAssessmentComparison(current, null);
    expect(comparison.previous).toBeNull();
    expect(comparison.totalDirection).toBe('unknown');
    expect(comparison.categories[0]!.direction).toBe('unknown');
    expect(comparison.categories[0]!.previousScore).toBeNull();
  });

  it('marks "improved" when the score went down (lower is better on this scale)', () => {
    const previous = makeResult('a0', '2026-05-01T00:00:00Z', [
      { categoryId: 'stress', score: 50, maxScore: 81, priority: 'high' },
    ]);
    const current = makeResult('a1', '2026-06-01T00:00:00Z', [
      { categoryId: 'stress', score: 30, maxScore: 81, priority: 'moderate' },
    ]);
    const comparison = buildAssessmentComparison(current, previous);
    expect(comparison.totalDelta).toBe(-20);
    expect(comparison.totalDirection).toBe('improved');
    expect(comparison.categories[0]!.direction).toBe('improved');
    expect(comparison.categories[0]!.delta).toBe(-20);
  });

  it('marks "regressed" when the score went up, and "unchanged" when it stayed flat', () => {
    const previous = makeResult('a0', '2026-05-01T00:00:00Z', [
      { categoryId: 'stress', score: 30, maxScore: 81, priority: 'moderate' },
      { categoryId: 'circadian_health', score: 20, maxScore: 90, priority: 'moderate' },
    ]);
    const current = makeResult('a1', '2026-06-01T00:00:00Z', [
      { categoryId: 'stress', score: 50, maxScore: 81, priority: 'high' },
      { categoryId: 'circadian_health', score: 20, maxScore: 90, priority: 'moderate' },
    ]);
    const comparison = buildAssessmentComparison(current, previous);
    const stress = comparison.categories.find((c) => c.categoryId === 'stress')!;
    const circadian = comparison.categories.find((c) => c.categoryId === 'circadian_health')!;
    expect(stress.direction).toBe('regressed');
    expect(circadian.direction).toBe('unchanged');
  });

  it('treats a category present now but absent from the previous assessment as unknown, not zero', () => {
    const previous = makeResult('a0', '2026-05-01T00:00:00Z', []);
    const current = makeResult('a1', '2026-06-01T00:00:00Z', [
      { categoryId: 'stress', score: 10, maxScore: 81, priority: 'low' },
    ]);
    const comparison = buildAssessmentComparison(current, previous);
    expect(comparison.categories[0]!.direction).toBe('unknown');
    expect(comparison.categories[0]!.previousScore).toBeNull();
  });
});

describe('findClosestAssessmentOnOrBefore', () => {
  const items = [
    { completedAt: '2026-01-01T00:00:00Z' },
    { completedAt: '2026-03-01T00:00:00Z' },
    { completedAt: '2026-05-01T00:00:00Z' },
  ];

  it('returns the latest item on or before the target date', () => {
    const result = findClosestAssessmentOnOrBefore(items, new Date('2026-04-01T00:00:00Z'));
    expect(result?.completedAt).toBe('2026-03-01T00:00:00Z');
  });

  it('returns null when every item is after the target date', () => {
    const result = findClosestAssessmentOnOrBefore(items, new Date('2025-12-01T00:00:00Z'));
    expect(result).toBeNull();
  });

  it('returns the last item when the target date is after everything', () => {
    const result = findClosestAssessmentOnOrBefore(items, new Date('2026-12-01T00:00:00Z'));
    expect(result?.completedAt).toBe('2026-05-01T00:00:00Z');
  });
});
