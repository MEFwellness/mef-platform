/**
 * Reusable Assessment Engine — persistence-facing types. Distinct from
 * engine/types.ts (which describes a questionnaire's *content*): these
 * describe a member's *response* to one, as stored in wellness_assessments/
 * wellness_assessment_answers/wellness_assessment_category_scores
 * (migration 62). Questionnaire-agnostic — nothing here references any
 * one specific assessment.
 */

import type {
  AssessmentContext,
  CategoryScoreResult,
  PriorityLevel,
  QuestionnaireAnswers,
} from './engine/types';

export type AssessmentStatus = 'in_progress' | 'completed';

/** The in-progress or completed assessment row itself, plus its resume position. */
export type AssessmentRecord = {
  id: string;
  questionnaireId: string;
  questionnaireVersion: number;
  status: AssessmentStatus;
  currentCategoryId: string | null;
  currentQuestionNumber: number | null;
  totalScore: number | null;
  totalMaxScore: number | null;
  totalPriority: PriorityLevel | null;
  startedAt: string;
  completedAt: string | null;
  /** Bumped on every answer/context save (store.ts) — the "last saved" timestamp a resume screen shows a member, never used in scoring. */
  updatedAt: string;
  /**
   * Answers to the questionnaire's own `contextQuestions`, if it declares
   * any, keyed by key. Optional and absent/`{}` for every questionnaire
   * that doesn't declare `contextQuestions` — this field exists for the
   * generic conditional-question mechanism in engine/types.ts, not for
   * any one specific questionnaire.
   */
  context?: AssessmentContext;
};

/** An in-progress assessment plus every answer captured so far — enough to resume the taking flow exactly where it left off. */
export type InProgressAssessment = {
  record: AssessmentRecord;
  answers: QuestionnaireAnswers;
};

/** A completed assessment's full result — the persisted score-sheet equivalent. */
export type AssessmentResult = {
  record: AssessmentRecord;
  categoryScores: CategoryScoreResult[];
};

/** Lightweight row for history lists — no per-category detail. */
export type AssessmentSummary = {
  id: string;
  completedAt: string;
  totalScore: number;
  totalMaxScore: number;
  totalPriority: PriorityLevel;
};

/** One category's score across a single completed assessment — the unit a trend chart plots. */
export type CategoryScorePoint = {
  assessmentId: string;
  completedAt: string;
  score: number;
  maxScore: number;
  priority: PriorityLevel;
};
