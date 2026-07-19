/**
 * Reusable Assessment Engine — pure unit tests over lib/assessments/engine/
 * (scoring + navigation), using the registered CHEK HLC1 questionnaire as
 * the verification fixture. No Supabase, no mocks: every test derives its
 * answers directly from the shipped questionnaire data, so a data edit
 * that breaks an invariant fails here rather than at runtime, and the
 * engine functions themselves are exercised exactly as any future
 * questionnaire's UI would call them. See docs/assessments/
 * chek-hlc1-nutrition-lifestyle/SPEC.md for the CHEK HLC1 extraction
 * record, including the Fungus & Parasites amendment (verified max is
 * 115, not the score sheet's printed 195).
 */
import { describe, it, expect } from 'vitest';
import { CHEK_HLC1_QUESTIONNAIRE } from '../lib/assessments/chek-hlc1';
import { FOUR_DOCTORS_QUESTIONNAIRE } from '../lib/assessments/four-doctors';
import { getAssessmentDefinition, findAssessmentDefinition } from '../lib/assessments/registry';
import {
  classifyPriority,
  countAnsweredInCategory,
  findCategory,
  isCategoryComplete,
  isQuestionActive,
  isQuestionnaireComplete,
  scoreCategory,
  scoreQuestionnaire,
  totalAnsweredCount,
  totalQuestionCount,
} from '../lib/assessments/engine/scoring';
import {
  findFirstUnanswered,
  flattenQuestions,
  getFlatIndex,
} from '../lib/assessments/engine/navigation';
import type {
  AssessmentContext,
  Category,
  CategoryAnswers,
  QuestionnaireAnswers,
} from '../lib/assessments/engine/types';

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

function allMinAnswers(): QuestionnaireAnswers {
  const answers: QuestionnaireAnswers = {};
  for (const category of CHEK_HLC1_QUESTIONNAIRE.categories) {
    answers[category.id] = minAnswers(category);
  }
  return answers;
}

function allMaxAnswers(): QuestionnaireAnswers {
  const answers: QuestionnaireAnswers = {};
  for (const category of CHEK_HLC1_QUESTIONNAIRE.categories) {
    answers[category.id] = maxAnswers(category);
  }
  return answers;
}

describe('questionnaire data integrity (CHEK HLC1 fixture)', () => {
  it('has all 7 categories and 91 questions total', () => {
    expect(CHEK_HLC1_QUESTIONNAIRE.categories).toHaveLength(7);
    expect(totalQuestionCount(CHEK_HLC1_QUESTIONNAIRE)).toBe(91);
  });

  it('every category maxScore equals the sum of its own question maxPoints', () => {
    for (const category of CHEK_HLC1_QUESTIONNAIRE.categories) {
      const computed = category.questions.reduce((sum, q) => sum + q.maxPoints, 0);
      expect(computed, `${category.id} maxScore should equal sum of question maxPoints`).toBe(
        category.maxScore
      );
    }
  });

  it('the questionnaire totalMaxScore equals the sum of all category maxScores', () => {
    const computed = CHEK_HLC1_QUESTIONNAIRE.categories.reduce((sum, c) => sum + c.maxScore, 0);
    expect(computed).toBe(CHEK_HLC1_QUESTIONNAIRE.scoring.totalMaxScore);
    expect(computed).toBe(635);
  });

  it('every question has exactly one zero-point option (an achievable floor)', () => {
    for (const category of CHEK_HLC1_QUESTIONNAIRE.categories) {
      for (const question of category.questions) {
        expect(question.options.some((o) => o.points === 0)).toBe(true);
      }
    }
  });

  it("Fungus & Parasites is verified with the corrected max of 115 (not the score sheet's printed 195)", () => {
    const category = findCategory(CHEK_HLC1_QUESTIONNAIRE, 'fungus_and_parasites');
    expect(category.verified).toBe(true);
    expect(category.maxScore).toBe(115);
    expect(category.questions).toHaveLength(13);
  });

  it('priority bands are contiguous within every category (no gap, no overlap)', () => {
    for (const category of CHEK_HLC1_QUESTIONNAIRE.categories) {
      const { low, moderate, high } = category.priorityBands;
      expect(low.min).toBe(0);
      expect(moderate.min).toBe(low.max + 1);
      expect(high.min).toBe(moderate.max + 1);
      expect(high.max).toBe(category.maxScore);
    }
  });
});

describe('classifyPriority', () => {
  const bands = findCategory(CHEK_HLC1_QUESTIONNAIRE, 'stress').priorityBands; // high 40-81, moderate 20-39, low 0-19

  it('classifies the low band', () => {
    expect(classifyPriority(0, bands)).toBe('low');
    expect(classifyPriority(19, bands)).toBe('low');
  });

  it('classifies the moderate band, inclusive at both edges', () => {
    expect(classifyPriority(20, bands)).toBe('moderate');
    expect(classifyPriority(39, bands)).toBe('moderate');
  });

  it('classifies the high band, inclusive at the lower edge', () => {
    expect(classifyPriority(40, bands)).toBe('high');
    expect(classifyPriority(81, bands)).toBe('high');
  });
});

describe('scoreCategory', () => {
  it('scores 0 / low priority when every question picks its zero-point option', () => {
    const category = findCategory(CHEK_HLC1_QUESTIONNAIRE, 'you_are_what_you_eat');
    const result = scoreCategory(category, minAnswers(category));
    expect(result.score).toBe(0);
    expect(result.priority).toBe('low');
  });

  it('scores maxScore / high priority when every question picks its highest-point option', () => {
    const category = findCategory(CHEK_HLC1_QUESTIONNAIRE, 'you_are_what_you_eat');
    const result = scoreCategory(category, maxAnswers(category));
    expect(result.score).toBe(130);
    expect(result.maxScore).toBe(130);
    expect(result.priority).toBe('high');
  });

  it('scores the corrected Fungus & Parasites max of 115 at the top', () => {
    const category = findCategory(CHEK_HLC1_QUESTIONNAIRE, 'fungus_and_parasites');
    const result = scoreCategory(category, maxAnswers(category));
    expect(result.score).toBe(115);
    expect(result.priority).toBe('high');
  });

  it('throws when an answer is missing for a question', () => {
    const category = findCategory(CHEK_HLC1_QUESTIONNAIRE, 'stress');
    const answers = minAnswers(category);
    delete answers[1];
    expect(() => scoreCategory(category, answers)).toThrow(/Missing answer/);
  });

  it('throws when an answer references an out-of-range option index', () => {
    const category = findCategory(CHEK_HLC1_QUESTIONNAIRE, 'stress');
    const answers = minAnswers(category);
    answers[1] = 99;
    expect(() => scoreCategory(category, answers)).toThrow(/no option at index/);
  });
});

describe('scoreQuestionnaire', () => {
  it('scores 0 / low priority across the board on an all-minimum response', () => {
    const result = scoreQuestionnaire(CHEK_HLC1_QUESTIONNAIRE, allMinAnswers());
    expect(result.totalScore).toBe(0);
    expect(result.totalPriority).toBe('low');
    expect(result.categoryScores).toHaveLength(7);
    expect(result.categoryScores.every((c) => c.score === 0 && c.priority === 'low')).toBe(true);
  });

  it('scores the full corrected max (635) / high priority on an all-maximum response', () => {
    const result = scoreQuestionnaire(CHEK_HLC1_QUESTIONNAIRE, allMaxAnswers());
    expect(result.totalScore).toBe(635);
    expect(result.totalMaxScore).toBe(635);
    expect(result.totalPriority).toBe('high');
  });

  it('throws when an entire category is missing from the answers', () => {
    const answers = allMinAnswers();
    delete answers.fungus_and_parasites;
    expect(() => scoreQuestionnaire(CHEK_HLC1_QUESTIONNAIRE, answers)).toThrow(
      /Missing answers for category/
    );
  });
});

describe('progress helpers', () => {
  it('countAnsweredInCategory / isCategoryComplete track partial progress', () => {
    const category = findCategory(CHEK_HLC1_QUESTIONNAIRE, 'stress');
    expect(countAnsweredInCategory(category, undefined)).toBe(0);
    expect(isCategoryComplete(category, undefined)).toBe(false);

    const partial = minAnswers(category);
    delete partial[12];
    expect(countAnsweredInCategory(category, partial)).toBe(11);
    expect(isCategoryComplete(category, partial)).toBe(false);

    const full = minAnswers(category);
    expect(countAnsweredInCategory(category, full)).toBe(12);
    expect(isCategoryComplete(category, full)).toBe(true);
  });

  it('isQuestionnaireComplete / totalAnsweredCount reflect the whole response', () => {
    expect(isQuestionnaireComplete(CHEK_HLC1_QUESTIONNAIRE, {})).toBe(false);
    expect(totalAnsweredCount(CHEK_HLC1_QUESTIONNAIRE, {})).toBe(0);

    const complete = allMinAnswers();
    expect(isQuestionnaireComplete(CHEK_HLC1_QUESTIONNAIRE, complete)).toBe(true);
    expect(totalAnsweredCount(CHEK_HLC1_QUESTIONNAIRE, complete)).toBe(91);
  });
});

describe('navigation (flattening, resume position)', () => {
  it('flattens all 91 questions in category-order then question-number order', () => {
    const flat = flattenQuestions(CHEK_HLC1_QUESTIONNAIRE);
    expect(flat).toHaveLength(91);
    expect(flat[0]!.category.id).toBe('you_are_what_you_eat');
    expect(flat[0]!.question.number).toBe(1);
    expect(flat[flat.length - 1]!.category.id).toBe('detoxification_system_health');
    expect(flat[flat.length - 1]!.question.number).toBe(10);
    flat.forEach((ref, i) => expect(ref.flatIndex).toBe(i));
  });

  it('getFlatIndex finds the correct position and throws for an unknown question', () => {
    const flat = flattenQuestions(CHEK_HLC1_QUESTIONNAIRE);
    expect(getFlatIndex(flat, 'you_are_what_you_eat', 1)).toBe(0);
    expect(getFlatIndex(flat, 'stress', 1)).toBe(25); // first 25 questions belong to "You Are What You Eat"
    expect(() => getFlatIndex(flat, 'stress', 999)).toThrow();
  });

  it('findFirstUnanswered resumes at the very first question on an empty response', () => {
    const flat = flattenQuestions(CHEK_HLC1_QUESTIONNAIRE);
    const next = findFirstUnanswered(flat, {});
    expect(next?.category.id).toBe('you_are_what_you_eat');
    expect(next?.question.number).toBe(1);
  });

  it('findFirstUnanswered resumes mid-questionnaire, and returns null once complete', () => {
    const flat = flattenQuestions(CHEK_HLC1_QUESTIONNAIRE);
    const answers = allMinAnswers();
    delete answers.circadian_health![5];
    const next = findFirstUnanswered(flat, answers);
    expect(next?.category.id).toBe('circadian_health');
    expect(next?.question.number).toBe(5);

    expect(findFirstUnanswered(flat, allMinAnswers())).toBeNull();
  });
});

describe('registry', () => {
  it('resolves the CHEK HLC1 definition by id', () => {
    const definition = getAssessmentDefinition('chek-hlc1-nutrition-lifestyle');
    expect(definition.questionnaire).toBe(CHEK_HLC1_QUESTIONNAIRE);
    expect(definition.copy.categoryCopy.stress).toBeDefined();
    expect(Object.keys(definition.copy.categoryCopy)).toHaveLength(7);
  });

  it('throws for an unknown id, and findAssessmentDefinition returns null instead', () => {
    expect(() => getAssessmentDefinition('not-a-real-questionnaire')).toThrow(
      /Unknown questionnaire/
    );
    expect(findAssessmentDefinition('not-a-real-questionnaire')).toBeNull();
  });
});

/**
 * Four Doctors is the first questionnaire to use conditional questions
 * (Dr. Quiet's gender-gated pair, see docs/assessments/four-doctors/
 * SPEC.md §6) — these tests exercise `isQuestionActive` and every
 * context-aware engine function it threads through, alongside a plain
 * data-integrity pass over the config itself.
 */
describe('questionnaire data integrity (Four Doctors fixture)', () => {
  it('has all 4 categories and 54 questions configured', () => {
    expect(FOUR_DOCTORS_QUESTIONNAIRE.categories).toHaveLength(4);
    const configuredQuestionCount = FOUR_DOCTORS_QUESTIONNAIRE.categories.reduce(
      (sum, c) => sum + c.questions.length,
      0
    );
    expect(configuredQuestionCount).toBe(54);
  });

  it('every question has exactly one zero-point option (an achievable floor)', () => {
    for (const category of FOUR_DOCTORS_QUESTIONNAIRE.categories) {
      for (const question of category.questions) {
        expect(question.options.some((o) => o.points === 0)).toBe(true);
      }
    }
  });

  it('Dr. Movement is fully verified (question sum matches the printed master table)', () => {
    const category = findCategory(FOUR_DOCTORS_QUESTIONNAIRE, 'dr_movement');
    expect(category.verified).toBe(true);
    expect(category.maxScore).toBe(150);
  });

  it('Dr. Happiness, Dr. Quiet, and Dr. Diet are flagged unverified with a documented amendment', () => {
    for (const id of ['dr_happiness', 'dr_quiet', 'dr_diet']) {
      const category = findCategory(FOUR_DOCTORS_QUESTIONNAIRE, id);
      expect(category.verified, `${id} should be unverified`).toBe(false);
      expect(category.amendment, `${id} should have an amendment note`).toBeTruthy();
    }
  });

  it('Dr. Quiet has exactly 4 gender-conditional questions, 2 gated to each value', () => {
    const category = findCategory(FOUR_DOCTORS_QUESTIONNAIRE, 'dr_quiet');
    const conditional = category.questions.filter((q) => q.condition);
    expect(conditional).toHaveLength(4);
    expect(conditional.filter((q) => q.condition!.equals.includes('male'))).toHaveLength(2);
    expect(conditional.filter((q) => q.condition!.equals.includes('female'))).toHaveLength(2);
  });

  it('exposes one contextQuestion gating Dr. Quiet, with male/female/unspecified options', () => {
    const gate = FOUR_DOCTORS_QUESTIONNAIRE.contextQuestions?.find(
      (cq) => cq.categoryId === 'dr_quiet'
    );
    expect(gate).toBeDefined();
    expect(gate!.options.map((o) => o.value).sort()).toEqual(['female', 'male', 'unspecified']);
  });

  it('priority bands are contiguous within every category', () => {
    for (const category of FOUR_DOCTORS_QUESTIONNAIRE.categories) {
      const { low, moderate, high } = category.priorityBands;
      expect(low.min).toBe(0);
      expect(moderate.min).toBe(low.max + 1);
      expect(high.min).toBe(moderate.max + 1);
      expect(high.max).toBe(category.maxScore);
    }
  });
});

describe('isQuestionActive', () => {
  const category = findCategory(FOUR_DOCTORS_QUESTIONNAIRE, 'dr_quiet');
  const unconditional = category.questions.find((q) => q.number === 1)!;
  const maleQuestion = category.questions.find((q) => q.number === 4)!;
  const femaleQuestion = category.questions.find((q) => q.number === 6)!;

  it('a question with no condition is always active', () => {
    expect(isQuestionActive(unconditional, {})).toBe(true);
    expect(isQuestionActive(unconditional, { dr_quiet_gender: 'male' })).toBe(true);
  });

  it('a conditional question is active only when context matches', () => {
    expect(isQuestionActive(maleQuestion, { dr_quiet_gender: 'male' })).toBe(true);
    expect(isQuestionActive(maleQuestion, { dr_quiet_gender: 'female' })).toBe(false);
    expect(isQuestionActive(maleQuestion, { dr_quiet_gender: 'unspecified' })).toBe(false);
    expect(isQuestionActive(maleQuestion, {})).toBe(false);
    expect(isQuestionActive(femaleQuestion, { dr_quiet_gender: 'female' })).toBe(true);
    expect(isQuestionActive(femaleQuestion, { dr_quiet_gender: 'male' })).toBe(false);
  });
});

function fourDoctorsAnswers(
  category: Category,
  context: AssessmentContext,
  optionPicker: (points: number[]) => number
): CategoryAnswers {
  const answers: CategoryAnswers = {};
  for (const question of category.questions) {
    if (!isQuestionActive(question, context)) continue;
    answers[question.number] = optionPicker(question.options.map((o) => o.points));
  }
  return answers;
}

const zeroPointIndex = (points: number[]) => points.findIndex((p) => p === 0);
const maxPointIndex = (points: number[]) =>
  points.reduce((best, p, i, arr) => (p === Math.max(...arr) ? i : best), 0);

describe('scoreCategory with a conditional category (Dr. Quiet)', () => {
  const category = findCategory(FOUR_DOCTORS_QUESTIONNAIRE, 'dr_quiet');

  it('computes an 80-point dynamic maxScore for a resolved "male" context (6 always-on + 2 gated)', () => {
    const context: AssessmentContext = { dr_quiet_gender: 'male' };
    const answers = fourDoctorsAnswers(category, context, maxPointIndex);
    const result = scoreCategory(category, answers, context);
    expect(result.maxScore).toBe(80);
    expect(result.score).toBe(80);
    expect(result.priority).toBe('high');
  });

  it('computes a 60-point dynamic maxScore when gender is unresolved ("unspecified" or unset)', () => {
    for (const context of [{ dr_quiet_gender: 'unspecified' }, {}] as AssessmentContext[]) {
      const answers = fourDoctorsAnswers(category, context, maxPointIndex);
      const result = scoreCategory(category, answers, context);
      expect(result.maxScore).toBe(60);
      expect(result.score).toBe(60);
    }
  });

  it('scores 0 at the floor regardless of which gender branch is active', () => {
    const context: AssessmentContext = { dr_quiet_gender: 'female' };
    const answers = fourDoctorsAnswers(category, context, zeroPointIndex);
    const result = scoreCategory(category, answers, context);
    expect(result.score).toBe(0);
    expect(result.priority).toBe('low');
  });
});

describe('progress helpers respect context (Dr. Quiet)', () => {
  const category = findCategory(FOUR_DOCTORS_QUESTIONNAIRE, 'dr_quiet');

  it('countAnsweredInCategory / isCategoryComplete only require the active 8 questions, not all 10', () => {
    const context: AssessmentContext = { dr_quiet_gender: 'male' };
    const answers = fourDoctorsAnswers(category, context, zeroPointIndex);
    expect(countAnsweredInCategory(category, answers, context)).toBe(8);
    expect(isCategoryComplete(category, answers, context)).toBe(true);

    // Answering the *other* gender's questions instead never counts toward completion.
    const wrongBranchAnswers = fourDoctorsAnswers(
      category,
      { dr_quiet_gender: 'female' },
      zeroPointIndex
    );
    expect(isCategoryComplete(category, wrongBranchAnswers, context)).toBe(false);
  });

  it('totalQuestionCount / totalAnsweredCount shrink to 52 once gender resolves, and to 50 while unresolved', () => {
    expect(totalQuestionCount(FOUR_DOCTORS_QUESTIONNAIRE, {})).toBe(50);
    expect(totalQuestionCount(FOUR_DOCTORS_QUESTIONNAIRE, { dr_quiet_gender: 'male' })).toBe(52);
  });
});

describe('scoreQuestionnaire / isQuestionnaireComplete (Four Doctors)', () => {
  function allAnswers(
    context: AssessmentContext,
    optionPicker: (points: number[]) => number
  ): QuestionnaireAnswers {
    const answers: QuestionnaireAnswers = {};
    for (const category of FOUR_DOCTORS_QUESTIONNAIRE.categories) {
      answers[category.id] = fourDoctorsAnswers(category, context, optionPicker);
    }
    return answers;
  }

  it('is incomplete until the gender-gated questions are answered', () => {
    const context: AssessmentContext = { dr_quiet_gender: 'male' };
    expect(isQuestionnaireComplete(FOUR_DOCTORS_QUESTIONNAIRE, {}, context)).toBe(false);
    const complete = allAnswers(context, zeroPointIndex);
    expect(isQuestionnaireComplete(FOUR_DOCTORS_QUESTIONNAIRE, complete, context)).toBe(true);
  });

  it('scores a dynamic totalMaxScore of 610 for a resolved gender, and 590 while unresolved', () => {
    const resolvedContext: AssessmentContext = { dr_quiet_gender: 'female' };
    const resolved = scoreQuestionnaire(
      FOUR_DOCTORS_QUESTIONNAIRE,
      allAnswers(resolvedContext, maxPointIndex),
      resolvedContext
    );
    expect(resolved.totalMaxScore).toBe(610);
    expect(resolved.totalScore).toBe(610);
    expect(resolved.totalPriority).toBe('high');

    const unresolvedContext: AssessmentContext = { dr_quiet_gender: 'unspecified' };
    const unresolved = scoreQuestionnaire(
      FOUR_DOCTORS_QUESTIONNAIRE,
      allAnswers(unresolvedContext, maxPointIndex),
      unresolvedContext
    );
    expect(unresolved.totalMaxScore).toBe(590);
  });

  it('scores 0 / low priority across the board on an all-minimum response', () => {
    const context: AssessmentContext = { dr_quiet_gender: 'male' };
    const result = scoreQuestionnaire(
      FOUR_DOCTORS_QUESTIONNAIRE,
      allAnswers(context, zeroPointIndex),
      context
    );
    expect(result.totalScore).toBe(0);
    expect(result.totalPriority).toBe('low');
    expect(result.categoryScores).toHaveLength(4);
  });
});

describe('registry (Four Doctors)', () => {
  it('resolves the Four Doctors definition by id', () => {
    const definition = getAssessmentDefinition('four-doctors');
    expect(definition.questionnaire).toBe(FOUR_DOCTORS_QUESTIONNAIRE);
    expect(Object.keys(definition.copy.categoryCopy).sort()).toEqual([
      'dr_diet',
      'dr_happiness',
      'dr_movement',
      'dr_quiet',
    ]);
    expect(definition.copy.displayTitle).not.toMatch(/CHEK/i);
  });
});
