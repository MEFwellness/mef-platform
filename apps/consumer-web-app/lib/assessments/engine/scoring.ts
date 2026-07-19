/**
 * Reusable Assessment Engine — scoring. Pure and generic: every function
 * takes the questionnaire/category definition and the member's answers as
 * plain arguments, so it works identically for any questionnaire that
 * conforms to engine/types.ts, not just the one currently registered.
 *
 * Priority classification uses each band's `min` only (score >= high.min ->
 * high, else score >= moderate.min -> moderate, else low). That's correct
 * because every verified questionnaire's bands are contiguous — see
 * assessments.engine.test.ts's data-integrity check, which fails loudly if
 * a future questionnaire config ships with a gap or overlap.
 */

import type {
  Category,
  CategoryAnswers,
  CategoryScoreResult,
  PriorityBands,
  PriorityLevel,
  Question,
  Questionnaire,
  QuestionnaireAnswers,
  QuestionnaireScoreResult,
} from './types';

export function classifyPriority(score: number, bands: PriorityBands): PriorityLevel {
  if (score >= bands.high.min) return 'high';
  if (score >= bands.moderate.min) return 'moderate';
  return 'low';
}

export function findCategory(questionnaire: Questionnaire, categoryId: string): Category {
  const category = questionnaire.categories.find((c) => c.id === categoryId);
  if (!category) {
    throw new Error(`Unknown category "${categoryId}" in questionnaire "${questionnaire.id}"`);
  }
  return category;
}

function resolveSelectedPoints(
  category: Category,
  question: Question,
  answers: CategoryAnswers
): number {
  const optionIndex = answers[question.number];
  if (optionIndex === undefined) {
    throw new Error(
      `Missing answer for "${category.name}" question ${question.number}: "${question.text}"`
    );
  }
  const option = question.options[optionIndex];
  if (option === undefined) {
    throw new Error(
      `"${category.name}" question ${question.number} has no option at index ${optionIndex} ` +
        `(valid range 0-${question.options.length - 1})`
    );
  }
  return option.points;
}

export function scoreCategory(category: Category, answers: CategoryAnswers): CategoryScoreResult {
  const score = category.questions.reduce(
    (sum, question) => sum + resolveSelectedPoints(category, question, answers),
    0
  );
  return {
    categoryId: category.id,
    categoryName: category.name,
    score,
    maxScore: category.maxScore,
    priority: classifyPriority(score, category.priorityBands),
  };
}

/** How many of a category's questions already have a stored answer — drives progress bars and the resume position. */
export function countAnsweredInCategory(
  category: Category,
  answers: CategoryAnswers | undefined
): number {
  if (!answers) return 0;
  return category.questions.filter((q) => answers[q.number] !== undefined).length;
}

export function isCategoryComplete(
  category: Category,
  answers: CategoryAnswers | undefined
): boolean {
  return countAnsweredInCategory(category, answers) === category.questions.length;
}

export function isQuestionnaireComplete(
  questionnaire: Questionnaire,
  answers: QuestionnaireAnswers
): boolean {
  return questionnaire.categories.every((category) =>
    isCategoryComplete(category, answers[category.id])
  );
}

export function totalQuestionCount(questionnaire: Questionnaire): number {
  return questionnaire.categories.reduce((sum, c) => sum + c.questions.length, 0);
}

export function totalAnsweredCount(
  questionnaire: Questionnaire,
  answers: QuestionnaireAnswers
): number {
  return questionnaire.categories.reduce(
    (sum, category) => sum + countAnsweredInCategory(category, answers[category.id]),
    0
  );
}

export function scoreQuestionnaire(
  questionnaire: Questionnaire,
  answers: QuestionnaireAnswers
): QuestionnaireScoreResult {
  const categoryScores = questionnaire.categories.map((category) => {
    const categoryAnswers = answers[category.id];
    if (!categoryAnswers) {
      throw new Error(`Missing answers for category "${category.id}" ("${category.name}")`);
    }
    return scoreCategory(category, categoryAnswers);
  });

  const totalScore = categoryScores.reduce((sum, result) => sum + result.score, 0);

  return {
    questionnaireId: questionnaire.id,
    questionnaireVersion: questionnaire.version,
    categoryScores,
    totalScore,
    totalMaxScore: questionnaire.scoring.totalMaxScore,
    totalPriority: classifyPriority(totalScore, questionnaire.scoring.totalPriorityBands),
  };
}
