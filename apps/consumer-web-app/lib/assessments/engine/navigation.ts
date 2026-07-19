/**
 * Reusable Assessment Engine — navigation. Flattens every category's
 * questions into one ordered sequence (category order, then question
 * number within category) so the one-question-per-screen flow, its
 * overall progress bar, and its "resume where you left off" logic all
 * have a single, unambiguous notion of "next question" — independent of
 * how many categories or questions a given questionnaire happens to have.
 */

import { isQuestionActive } from './scoring';
import type {
  AssessmentContext,
  Category,
  Question,
  Questionnaire,
  QuestionnaireAnswers,
} from './types';

const NO_CONTEXT: AssessmentContext = {};

export type FlatQuestionRef = {
  flatIndex: number;
  category: Category;
  question: Question;
};

export function flattenQuestions(questionnaire: Questionnaire): FlatQuestionRef[] {
  const orderedCategories = [...questionnaire.categories].sort((a, b) => a.order - b.order);
  const flat: FlatQuestionRef[] = [];
  for (const category of orderedCategories) {
    for (const question of category.questions) {
      flat.push({ flatIndex: flat.length, category, question });
    }
  }
  return flat;
}

export function getFlatIndex(
  flat: FlatQuestionRef[],
  categoryId: string,
  questionNumber: number
): number {
  const index = flat.findIndex(
    (ref) => ref.category.id === categoryId && ref.question.number === questionNumber
  );
  if (index === -1) {
    throw new Error(
      `Question ${questionNumber} in category "${categoryId}" not found in questionnaire`
    );
  }
  return index;
}

/**
 * First question with no stored answer yet, in flattened order — the
 * resume position. Skips questions inactive for this respondent's context
 * (see `isQuestionActive`) so resume never lands on, and progress never
 * waits on, a branch the member didn't take. Null if every active
 * question is answered.
 */
export function findFirstUnanswered(
  flat: FlatQuestionRef[],
  answers: QuestionnaireAnswers,
  context: AssessmentContext = NO_CONTEXT
): FlatQuestionRef | null {
  return (
    flat.find(
      (ref) =>
        isQuestionActive(ref.question, context) &&
        answers[ref.category.id]?.[ref.question.number] === undefined
    ) ?? null
  );
}
