/**
 * Reusable Assessment Engine — pure unit tests over the Short Health
 * Assessment Questionnaire (short-haq), an original MEF-authored
 * symptom-frequency questionnaire (see lib/assessments/short-haq/
 * questionnaire.json's "source" field). Same philosophy as
 * assessments-engine.test.ts's CHEK HLC1/Four Doctors fixtures: every test
 * derives its answers directly from the shipped questionnaire data, no
 * Supabase, no mocks.
 */
import { describe, it, expect } from 'vitest';
import { SHORT_HAQ_QUESTIONNAIRE } from '../lib/assessments/short-haq';
import { getAssessmentDefinition, findAssessmentDefinition } from '../lib/assessments/registry';
import {
  classifyPriority,
  findCategory,
  isQuestionActive,
  isQuestionnaireComplete,
  scoreCategory,
  scoreQuestionnaire,
  totalAnsweredCount,
  totalQuestionCount,
} from '../lib/assessments/engine/scoring';
import { findFirstUnanswered, flattenQuestions } from '../lib/assessments/engine/navigation';
import type { AssessmentContext, Category, CategoryAnswers, QuestionnaireAnswers } from '../lib/assessments/engine/types';

function minAnswers(category: Category): CategoryAnswers {
  const answers: CategoryAnswers = {};
  for (const question of category.questions) {
    const zeroIndex = question.options.findIndex((o) => o.points === 0);
    expect(zeroIndex).toBeGreaterThanOrEqual(0);
    answers[question.number] = zeroIndex;
  }
  return answers;
}

function maxAnswers(category: Category): CategoryAnswers {
  const answers: CategoryAnswers = {};
  for (const question of category.questions) {
    const maxIndex = question.options.findIndex((o) => o.points === question.maxPoints);
    expect(maxIndex).toBeGreaterThanOrEqual(0);
    answers[question.number] = maxIndex;
  }
  return answers;
}

function categoryHasConditional(category: Category): boolean {
  return category.questions.some((q) => q.condition !== undefined);
}

function allAnswers(
  context: AssessmentContext,
  picker: (category: Category) => CategoryAnswers
): QuestionnaireAnswers {
  const answers: QuestionnaireAnswers = {};
  for (const category of SHORT_HAQ_QUESTIONNAIRE.categories) {
    const categoryAnswers = picker(category);
    for (const question of category.questions) {
      if (!isQuestionActive(question, context) && categoryAnswers[question.number] !== undefined) {
        delete categoryAnswers[question.number];
      }
    }
    answers[category.id] = categoryAnswers;
  }
  return answers;
}

describe('questionnaire data integrity (short-haq fixture)', () => {
  it('has all 9 categories and 56 configured questions', () => {
    expect(SHORT_HAQ_QUESTIONNAIRE.categories).toHaveLength(9);
    const configuredQuestionCount = SHORT_HAQ_QUESTIONNAIRE.categories.reduce(
      (sum, c) => sum + c.questions.length,
      0
    );
    expect(configuredQuestionCount).toBe(56);
  });

  it('every non-conditional category maxScore equals the sum of its own question maxPoints', () => {
    for (const category of SHORT_HAQ_QUESTIONNAIRE.categories) {
      if (categoryHasConditional(category)) continue;
      const computed = category.questions.reduce((sum, q) => sum + q.maxPoints, 0);
      expect(computed, `${category.id} maxScore should equal sum of question maxPoints`).toBe(
        category.maxScore
      );
    }
  });

  it('hormonal_balance maxScore (15) equals the per-respondent achievable max (3 shared + 2 gated), not the 7-question configured sum (21)', () => {
    const category = findCategory(SHORT_HAQ_QUESTIONNAIRE, 'hormonal_balance');
    expect(category.questions).toHaveLength(7);
    expect(category.questions.reduce((sum, q) => sum + q.maxPoints, 0)).toBe(21);
    expect(category.maxScore).toBe(15);
  });

  it('every question has exactly one zero-point option (an achievable floor)', () => {
    for (const category of SHORT_HAQ_QUESTIONNAIRE.categories) {
      for (const question of category.questions) {
        expect(question.options.some((o) => o.points === 0)).toBe(true);
      }
    }
  });

  it('the questionnaire totalMaxScore (162) equals the sum of all category maxScores', () => {
    const computed = SHORT_HAQ_QUESTIONNAIRE.categories.reduce((sum, c) => sum + c.maxScore, 0);
    expect(computed).toBe(SHORT_HAQ_QUESTIONNAIRE.scoring.totalMaxScore);
    expect(computed).toBe(162);
  });

  it('priority bands are contiguous within every category (no gap, no overlap)', () => {
    for (const category of SHORT_HAQ_QUESTIONNAIRE.categories) {
      const { low, moderate, high } = category.priorityBands;
      expect(low.min).toBe(0);
      expect(moderate.min).toBe(low.max + 1);
      expect(high.min).toBe(moderate.max + 1);
      expect(high.max).toBe(category.maxScore);
    }
  });

  it('the total priority bands are contiguous', () => {
    const { low, moderate, high } = SHORT_HAQ_QUESTIONNAIRE.scoring.totalPriorityBands;
    expect(low.min).toBe(0);
    expect(moderate.min).toBe(low.max + 1);
    expect(high.min).toBe(moderate.max + 1);
    expect(high.max).toBe(SHORT_HAQ_QUESTIONNAIRE.scoring.totalMaxScore);
  });

  it('hormonal_balance has exactly 4 gender-conditional questions, 2 gated to each value', () => {
    const category = findCategory(SHORT_HAQ_QUESTIONNAIRE, 'hormonal_balance');
    const conditional = category.questions.filter((q) => q.condition);
    expect(conditional).toHaveLength(4);
    expect(conditional.filter((q) => q.condition!.equals.includes('male'))).toHaveLength(2);
    expect(conditional.filter((q) => q.condition!.equals.includes('female'))).toHaveLength(2);
  });

  it('exposes one contextQuestion gating hormonal_balance, with male/female/unspecified options', () => {
    const gate = SHORT_HAQ_QUESTIONNAIRE.contextQuestions?.find(
      (cq) => cq.categoryId === 'hormonal_balance'
    );
    expect(gate).toBeDefined();
    expect(gate!.options.map((o) => o.value).sort()).toEqual(['female', 'male', 'unspecified']);
  });
});

describe('classifyPriority (short-haq stress_and_mood category)', () => {
  const bands = findCategory(SHORT_HAQ_QUESTIONNAIRE, 'stress_and_mood').priorityBands; // high 14-21, moderate 7-13, low 0-6

  it('classifies low, moderate (inclusive both edges), and high (inclusive lower edge)', () => {
    expect(classifyPriority(0, bands)).toBe('low');
    expect(classifyPriority(6, bands)).toBe('low');
    expect(classifyPriority(7, bands)).toBe('moderate');
    expect(classifyPriority(13, bands)).toBe('moderate');
    expect(classifyPriority(14, bands)).toBe('high');
    expect(classifyPriority(21, bands)).toBe('high');
  });
});

describe('scoreCategory (short-haq, non-conditional category)', () => {
  const category = findCategory(SHORT_HAQ_QUESTIONNAIRE, 'digestive_wellness');

  it('scores 0 / low priority at the floor', () => {
    const result = scoreCategory(category, minAnswers(category));
    expect(result.score).toBe(0);
    expect(result.priority).toBe('low');
  });

  it('scores maxScore (21) / high priority at the ceiling', () => {
    const result = scoreCategory(category, maxAnswers(category));
    expect(result.score).toBe(21);
    expect(result.maxScore).toBe(21);
    expect(result.priority).toBe('high');
  });

  it('throws when an answer is missing for a question', () => {
    const answers = minAnswers(category);
    delete answers[1];
    expect(() => scoreCategory(category, answers)).toThrow(/Missing answer/);
  });
});

describe('scoreCategory (short-haq, conditional hormonal_balance category)', () => {
  const category = findCategory(SHORT_HAQ_QUESTIONNAIRE, 'hormonal_balance');

  it('computes a 15-point dynamic maxScore for a resolved "female" context (3 shared + 2 gated)', () => {
    const context: AssessmentContext = { hormonal_balance_gender: 'female' };
    const answers: CategoryAnswers = {};
    for (const question of category.questions.filter((q) => isQuestionActive(q, context))) {
      answers[question.number] = question.options.findIndex((o) => o.points === question.maxPoints);
    }
    const result = scoreCategory(category, answers, context);
    expect(result.maxScore).toBe(15);
    expect(result.score).toBe(15);
    expect(result.priority).toBe('high');
  });

  it('computes a 9-point dynamic maxScore when gender is unresolved ("unspecified" or unset)', () => {
    for (const context of [{ hormonal_balance_gender: 'unspecified' }, {}] as AssessmentContext[]) {
      const answers: CategoryAnswers = {};
      for (const question of category.questions.filter((q) => isQuestionActive(q, context))) {
        answers[question.number] = question.options.findIndex(
          (o) => o.points === question.maxPoints
        );
      }
      const result = scoreCategory(category, answers, context);
      expect(result.maxScore).toBe(9);
      expect(result.score).toBe(9);
    }
  });
});

describe('scoreQuestionnaire / isQuestionnaireComplete (short-haq)', () => {
  it('scores 0 / low priority across the board on an all-minimum response (resolved gender)', () => {
    const context: AssessmentContext = { hormonal_balance_gender: 'male' };
    const answers = allAnswers(context, minAnswers);
    expect(isQuestionnaireComplete(SHORT_HAQ_QUESTIONNAIRE, answers, context)).toBe(true);
    const result = scoreQuestionnaire(SHORT_HAQ_QUESTIONNAIRE, answers, context);
    expect(result.totalScore).toBe(0);
    expect(result.totalPriority).toBe('low');
    expect(result.categoryScores).toHaveLength(9);
  });

  it('scores the full max (162) / high priority on an all-maximum response with resolved gender', () => {
    const context: AssessmentContext = { hormonal_balance_gender: 'male' };
    const answers = allAnswers(context, maxAnswers);
    const result = scoreQuestionnaire(SHORT_HAQ_QUESTIONNAIRE, answers, context);
    expect(result.totalScore).toBe(162);
    expect(result.totalMaxScore).toBe(162);
    expect(result.totalPriority).toBe('high');
  });

  it('is incomplete until the gender-gated hormonal_balance questions are answered', () => {
    const context: AssessmentContext = { hormonal_balance_gender: 'female' };
    expect(isQuestionnaireComplete(SHORT_HAQ_QUESTIONNAIRE, {}, context)).toBe(false);
  });

  it('totalQuestionCount shrinks to 52 while gender is unresolved, and grows to 54 once resolved', () => {
    expect(totalQuestionCount(SHORT_HAQ_QUESTIONNAIRE, {})).toBe(52);
    expect(totalQuestionCount(SHORT_HAQ_QUESTIONNAIRE, { hormonal_balance_gender: 'male' })).toBe(54);
  });

  it('totalAnsweredCount matches an all-minimum resolved response', () => {
    const context: AssessmentContext = { hormonal_balance_gender: 'female' };
    const answers = allAnswers(context, minAnswers);
    expect(totalAnsweredCount(SHORT_HAQ_QUESTIONNAIRE, answers, context)).toBe(54);
  });
});

describe('navigation (flattening, resume position) — short-haq', () => {
  it('flattens all 56 configured questions in category-order then question-number order', () => {
    const flat = flattenQuestions(SHORT_HAQ_QUESTIONNAIRE);
    expect(flat).toHaveLength(56);
    expect(flat[0]!.category.id).toBe('digestive_wellness');
    expect(flat[0]!.question.number).toBe(1);
    expect(flat[flat.length - 1]!.category.id).toBe('hormonal_balance');
    expect(flat[flat.length - 1]!.question.number).toBe(7);
  });

  it('findFirstUnanswered resumes at the very first question on an empty response', () => {
    const flat = flattenQuestions(SHORT_HAQ_QUESTIONNAIRE);
    const next = findFirstUnanswered(flat, {});
    expect(next?.category.id).toBe('digestive_wellness');
    expect(next?.question.number).toBe(1);
  });

  it('findFirstUnanswered skips inactive gender-gated questions once the other branch is fully answered', () => {
    const flat = flattenQuestions(SHORT_HAQ_QUESTIONNAIRE);
    const context: AssessmentContext = { hormonal_balance_gender: 'male' };
    const answers = allAnswers(context, minAnswers);
    // Every active question is answered; nothing left, including the
    // female-gated questions that were correctly skipped.
    expect(findFirstUnanswered(flat, answers, context)).toBeNull();
  });
});

describe('registry (short-haq)', () => {
  it('resolves the short-haq definition by id', () => {
    const definition = getAssessmentDefinition('short-haq');
    expect(definition.questionnaire).toBe(SHORT_HAQ_QUESTIONNAIRE);
    expect(Object.keys(definition.copy.categoryCopy)).toHaveLength(9);
    expect(definition.copy.displayTitle).not.toMatch(/CHEK/i);
    expect(definition.copy.attribution).toBeUndefined();
  });

  it('is findable via findAssessmentDefinition', () => {
    expect(findAssessmentDefinition('short-haq')).not.toBeNull();
  });
});
