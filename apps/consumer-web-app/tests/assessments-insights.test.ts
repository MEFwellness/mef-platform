/**
 * Pure unit tests for lib/assessments/insights.ts's deterministic,
 * template-based summary generation. Every test constructs its own
 * synthetic QuestionnaireScoreResult (real category ids/names/maxScores
 * from the registered CHEK HLC1 questionnaire, chosen priorities) rather
 * than depending on real scoring output — this keeps the test in control
 * of exactly which priority combination is being exercised.
 */
import { describe, it, expect } from 'vitest';
import { CHEK_HLC1_QUESTIONNAIRE } from '../lib/assessments/chek-hlc1';
import { CHEK_HLC1_COPY } from '../lib/assessments/chek-hlc1/copy';
import { buildWellnessInsight } from '../lib/assessments/insights';
import { findCategory, classifyPriority } from '../lib/assessments/engine/scoring';
import type { CategoryScoreResult, PriorityLevel, QuestionnaireScoreResult } from '../lib/assessments/engine/types';

function scoreFor(categoryId: string, priority: PriorityLevel): number {
  const category = findCategory(CHEK_HLC1_QUESTIONNAIRE, categoryId);
  const band = category.priorityBands[priority];
  return band.min;
}

function makeResult(priorities: Partial<Record<string, PriorityLevel>>): QuestionnaireScoreResult {
  const categoryScores: CategoryScoreResult[] = CHEK_HLC1_QUESTIONNAIRE.categories.map((category) => {
    const priority = priorities[category.id] ?? 'low';
    const score = scoreFor(category.id, priority);
    return { categoryId: category.id, categoryName: category.name, score, maxScore: category.maxScore, priority };
  });
  const totalScore = categoryScores.reduce((sum, c) => sum + c.score, 0);
  return {
    questionnaireId: CHEK_HLC1_QUESTIONNAIRE.id,
    questionnaireVersion: CHEK_HLC1_QUESTIONNAIRE.version,
    categoryScores,
    totalScore,
    totalMaxScore: CHEK_HLC1_QUESTIONNAIRE.scoring.totalMaxScore,
    totalPriority: classifyPriority(totalScore, CHEK_HLC1_QUESTIONNAIRE.scoring.totalPriorityBands),
  };
}

describe('buildWellnessInsight', () => {
  it('gives a positive, non-diagnostic summary when every category is low priority', () => {
    const insight = buildWellnessInsight(makeResult({}), CHEK_HLC1_QUESTIONNAIRE, CHEK_HLC1_COPY);
    expect(insight.focusCategoryIds).toEqual([]);
    expect(insight.summary).toMatch(/low-priority range/i);
    expect(insight.headline).toBe('A strong overall pattern');
  });

  it('names trending categories when nothing is high but something is moderate', () => {
    const insight = buildWellnessInsight(
      makeResult({ stress: 'moderate' }),
      CHEK_HLC1_QUESTIONNAIRE,
      CHEK_HLC1_COPY
    );
    expect(insight.focusCategoryIds).toEqual(['stress']);
    expect(insight.summary).toContain('stress');
  });

  it('calls out a single standout category when exactly one is high priority', () => {
    const insight = buildWellnessInsight(
      makeResult({ stress: 'high' }),
      CHEK_HLC1_QUESTIONNAIRE,
      CHEK_HLC1_COPY
    );
    expect(insight.focusCategoryIds[0]).toBe('stress');
    expect(insight.summary).toContain('stress');
    expect(insight.summary).toMatch(/stands out/);
  });

  it('uses the authored relationship sentence for the stress + circadian + digestive combination', () => {
    const insight = buildWellnessInsight(
      makeResult({ stress: 'high', circadian_health: 'high', digestive_system_health: 'high' }),
      CHEK_HLC1_QUESTIONNAIRE,
      CHEK_HLC1_COPY
    );
    expect(insight.summary).toBe(
      'Your stress, circadian rhythm, and digestive scores all indicate they deserve greater attention. These areas commonly influence one another — improving sleep consistency may positively support stress recovery and digestive wellness.'
    );
    expect(insight.focusCategoryIds).toEqual(
      expect.arrayContaining(['stress', 'circadian_health', 'digestive_system_health'])
    );
  });

  it('falls back to a generic multi-category sentence for a combination with no authored rule', () => {
    const insight = buildWellnessInsight(
      makeResult({ you_are_what_you_eat: 'high', fungus_and_parasites: 'high' }),
      CHEK_HLC1_QUESTIONNAIRE,
      CHEK_HLC1_COPY
    );
    expect(insight.summary).toContain('food choices');
    expect(insight.summary).toContain('gut balance');
    expect(insight.summary).toMatch(/deserve greater attention/);
  });

  it('never diagnoses or claims disease in any generated summary across all tested combinations', () => {
    const forbidden = /diagnos|disease|cure|treat(ment)?|disorder|syndrome/i;
    const results = [
      makeResult({}),
      makeResult({ stress: 'moderate' }),
      makeResult({ stress: 'high' }),
      makeResult({ stress: 'high', circadian_health: 'high', digestive_system_health: 'high' }),
      makeResult({ you_are_what_you_eat: 'high', fungus_and_parasites: 'high' }),
    ];
    for (const result of results) {
      const insight = buildWellnessInsight(result, CHEK_HLC1_QUESTIONNAIRE, CHEK_HLC1_COPY);
      expect(insight.summary).not.toMatch(forbidden);
      expect(insight.headline).not.toMatch(forbidden);
    }
  });
});
