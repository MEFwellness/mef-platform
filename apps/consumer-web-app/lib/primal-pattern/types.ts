/**
 * Primal Pattern Assessment — types. Parallel to, but deliberately distinct
 * from, lib/assessments/engine/types.ts: that engine models single-select,
 * points-valued options grouped into categories with priority bands. This
 * questionnaire is a flat list of questions with exactly two lettered
 * options (A/B), where a member may select both letters on one question or
 * neither (skip), and the result is a three-way classification derived by
 * comparing letter counts, not a point sum. See migration 64's header
 * comment for the full rationale for keeping these separate.
 */

export type Letter = 'A' | 'B';

export type PrimalPatternQuestion = {
  number: number;
  prompt: string;
  optionA: string;
  optionB: string;
};

export type PrimalPatternQuestionnaire = {
  id: string;
  version: number;
  title: string;
  questions: PrimalPatternQuestion[];
};

/** Member-facing presentation copy — kept separate from questionnaire content for the same reason lib/assessments/engine/types.ts's AssessmentCopy is: content edits shouldn't touch verbatim question wording. */
export type PrimalPatternCopy = {
  displayTitle: string;
  listDescription: string;
  welcomeSubtitle: string;
  estimatedMinutes: number;
  /** Small, non-prominent footer shown once on the completed results screen. Never rendered as a title. */
  practitionerFooter: string;
};

/** Selected letters per question number. A missing key means the question was skipped. */
export type PrimalPatternAnswers = Record<number, Letter[]>;

export type PrimalPatternResult = 'polar' | 'variable' | 'equatorial';

export type PrimalPatternScore = {
  aCount: number;
  bCount: number;
  bothCount: number;
  skippedCount: number;
  result: PrimalPatternResult;
};

export type PrimalPatternAssessmentStatus = 'in_progress' | 'completed';

export type PrimalPatternAssessmentRecord = {
  id: string;
  questionnaireId: string;
  questionnaireVersion: number;
  status: PrimalPatternAssessmentStatus;
  currentQuestionNumber: number | null;
  result: PrimalPatternResult | null;
  aCount: number;
  bCount: number;
  skippedCount: number;
  bothCount: number;
  startedAt: string;
  completedAt: string | null;
};

export type InProgressPrimalPatternAssessment = {
  record: PrimalPatternAssessmentRecord;
  answers: PrimalPatternAnswers;
};

export type PrimalPatternAssessmentSummary = {
  id: string;
  completedAt: string;
  result: PrimalPatternResult;
  aCount: number;
  bCount: number;
  skippedCount: number;
  bothCount: number;
};
