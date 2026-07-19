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
  AssessmentContext,
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

const NO_CONTEXT: AssessmentContext = {};

export function classifyPriority(score: number, bands: PriorityBands): PriorityLevel {
  if (score >= bands.high.min) return 'high';
  if (score >= bands.moderate.min) return 'moderate';
  return 'low';
}

/**
 * Whether a question applies to this respondent. Questions with no
 * `condition` always apply — this is a no-op for any questionnaire whose
 * questions never set `condition`, so it's safe to call unconditionally
 * everywhere questions are iterated.
 */
export function isQuestionActive(question: Question, context: AssessmentContext): boolean {
  if (!question.condition) return true;
  return question.condition.equals.includes(context[question.condition.contextKey] ?? '');
}

function categoryHasConditionalQuestions(category: Category): boolean {
  return category.questions.some((q) => q.condition !== undefined);
}

/**
 * A category with no conditional questions returns its own `questions`
 * array unchanged (same reference, not a filtered copy) — this is what
 * lets every caller below (`scoreCategory`, the progress helpers) behave
 * as a true no-op, not just a numerically-equal one, for any category
 * that doesn't opt into conditional questions.
 */
function activeQuestions(category: Category, context: AssessmentContext): Question[] {
  if (!categoryHasConditionalQuestions(category)) return category.questions;
  return category.questions.filter((q) => isQuestionActive(q, context));
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

/**
 * Scores a category, counting only questions active for this respondent
 * (see `isQuestionActive`). For a category with no conditional questions,
 * this is byte-for-byte the original, pre-conditional-questions behavior:
 * every question is scored and `maxScore` is `category.maxScore`, read
 * directly rather than recomputed — the config's own asserted value stays
 * the source of truth, unchanged. Only a category that actually declares
 * conditional questions gets a dynamically-derived `maxScore` (the sum of
 * this respondent's active questions' `maxPoints`), since that's the only
 * case where the config's static max can't be trusted for one respondent.
 */
export function scoreCategory(
  category: Category,
  answers: CategoryAnswers,
  context: AssessmentContext = NO_CONTEXT
): CategoryScoreResult {
  const active = activeQuestions(category, context);
  const score = active.reduce(
    (sum, question) => sum + resolveSelectedPoints(category, question, answers),
    0
  );
  const maxScore = categoryHasConditionalQuestions(category)
    ? active.reduce((sum, question) => sum + question.maxPoints, 0)
    : category.maxScore;
  return {
    categoryId: category.id,
    categoryName: category.name,
    score,
    maxScore,
    priority: classifyPriority(score, category.priorityBands),
  };
}

/** How many of a category's active questions already have a stored answer — drives progress bars and the resume position. */
export function countAnsweredInCategory(
  category: Category,
  answers: CategoryAnswers | undefined,
  context: AssessmentContext = NO_CONTEXT
): number {
  if (!answers) return 0;
  return activeQuestions(category, context).filter((q) => answers[q.number] !== undefined).length;
}

export function isCategoryComplete(
  category: Category,
  answers: CategoryAnswers | undefined,
  context: AssessmentContext = NO_CONTEXT
): boolean {
  return (
    countAnsweredInCategory(category, answers, context) ===
    activeQuestions(category, context).length
  );
}

export function isQuestionnaireComplete(
  questionnaire: Questionnaire,
  answers: QuestionnaireAnswers,
  context: AssessmentContext = NO_CONTEXT
): boolean {
  return questionnaire.categories.every((category) =>
    isCategoryComplete(category, answers[category.id], context)
  );
}

export function totalQuestionCount(
  questionnaire: Questionnaire,
  context: AssessmentContext = NO_CONTEXT
): number {
  return questionnaire.categories.reduce((sum, c) => sum + activeQuestions(c, context).length, 0);
}

export function totalAnsweredCount(
  questionnaire: Questionnaire,
  answers: QuestionnaireAnswers,
  context: AssessmentContext = NO_CONTEXT
): number {
  return questionnaire.categories.reduce(
    (sum, category) => sum + countAnsweredInCategory(category, answers[category.id], context),
    0
  );
}

/**
 * For a questionnaire with no conditional questions anywhere, `totalMaxScore`
 * is read directly from `questionnaire.scoring.totalMaxScore` — byte-for-byte
 * the original behavior, unchanged. Only a questionnaire that actually
 * declares conditional questions in at least one category gets a
 * dynamically-derived total (the sum of each category's own resolved
 * `maxScore`), since the config's single static total can't capture a
 * per-respondent-dependent achievable max.
 */
export function scoreQuestionnaire(
  questionnaire: Questionnaire,
  answers: QuestionnaireAnswers,
  context: AssessmentContext = NO_CONTEXT
): QuestionnaireScoreResult {
  const categoryScores = questionnaire.categories.map((category) => {
    const categoryAnswers = answers[category.id];
    if (!categoryAnswers) {
      throw new Error(`Missing answers for category "${category.id}" ("${category.name}")`);
    }
    return scoreCategory(category, categoryAnswers, context);
  });

  const totalScore = categoryScores.reduce((sum, result) => sum + result.score, 0);
  const hasAnyConditionalQuestions = questionnaire.categories.some(categoryHasConditionalQuestions);
  const totalMaxScore = hasAnyConditionalQuestions
    ? categoryScores.reduce((sum, result) => sum + result.maxScore, 0)
    : questionnaire.scoring.totalMaxScore;

  return {
    questionnaireId: questionnaire.id,
    questionnaireVersion: questionnaire.version,
    categoryScores,
    totalScore,
    totalMaxScore,
    totalPriority: classifyPriority(totalScore, questionnaire.scoring.totalPriorityBands),
  };
}
