/**
 * Reusable Assessment Engine — generic types.
 *
 * Nothing in this file (or engine/scoring.ts) knows about any specific
 * questionnaire. A questionnaire is just data conforming to these shapes,
 * shipped as a config file under lib/assessments/<questionnaire-id>/ and
 * wired up once in lib/assessments/registry.ts. Adding a future
 * questionnaire (a new CHEK HLC level, a different intake instrument,
 * whatever comes next) means adding a new folder with a questionnaire.json
 * + copy.ts and one registry entry — never touching this file, engine/
 * scoring.ts, or any UI component.
 */

export type PriorityLevel = 'low' | 'moderate' | 'high';

export type QuestionType = 'binary' | 'frequency' | 'multiple_choice';

export type QuestionOption = {
  label: string;
  points: number;
};

export type Question = {
  number: number;
  text: string;
  type: QuestionType;
  options: QuestionOption[];
  maxPoints: number;
  note?: string;
};

export type PriorityBand = {
  min: number;
  max: number;
};

export type PriorityBands = Record<PriorityLevel, PriorityBand>;

export type Category = {
  id: string;
  order: number;
  name: string;
  zones: string[];
  maxScore: number;
  verified: boolean;
  amendment?: string;
  priorityBands: PriorityBands;
  questions: Question[];
};

export type Questionnaire = {
  id: string;
  version: number;
  title: string;
  source: string;
  notes: string;
  scoring: {
    unit: string;
    direction: string;
    categoryScoreFormula: string;
    totalScoreFormula: string;
    totalMaxScore: number;
    totalPriorityBands: PriorityBands;
  };
  verification: {
    allCategoriesReconciled: boolean;
    categoriesVerified: string[];
    categoriesWithDiscrepancy: string[];
    detail: string;
  };
  categories: Category[];
  masterScoreSheet: {
    title: string;
    columnOrder: string[];
    fields: string[];
    administrations: number;
  };
};

/** Selected option index per question number, for a single category. */
export type CategoryAnswers = Record<number, number>;

/** Selected option index per question number, keyed by category id, for the whole questionnaire. */
export type QuestionnaireAnswers = Record<string, CategoryAnswers>;

export type CategoryScoreResult = {
  categoryId: string;
  categoryName: string;
  score: number;
  maxScore: number;
  priority: PriorityLevel;
};

export type QuestionnaireScoreResult = {
  questionnaireId: string;
  questionnaireVersion: number;
  categoryScores: CategoryScoreResult[];
  totalScore: number;
  totalMaxScore: number;
  totalPriority: PriorityLevel;
};

/**
 * Presentation content a results dashboard needs that the source
 * questionnaire itself never specifies — educational copy, coaching focus,
 * welcome-screen framing. Kept out of questionnaire.json deliberately (see
 * SPEC.md: "do not change wording" applies to the extracted instrument
 * itself, not to results-page copy authored for this product), and kept
 * out of the generic engine because it's inherently per-questionnaire
 * content, authored by whoever owns that questionnaire's config folder.
 */
export type CategoryCopy = {
  /** One or two sentences shown on the category's results card. */
  shortDescription: string;
  /** "Coaching focus area" text shown on the category detail page. */
  coachingFocus: string;
  /** Short, natural-language label used inside generated insight sentences (e.g. "circadian rhythm" instead of "Circadian Health"). */
  shortLabel: string;
};

export type AssessmentCopy = {
  /** One sentence for the Questionnaires list-page card — shorter than welcomeSubtitle, which is the full welcome-screen hero paragraph. */
  listDescription: string;
  welcomeSubtitle: string;
  estimatedMinutes: number;
  categoryCopy: Record<string, CategoryCopy>;
};

export type AssessmentDefinition = {
  questionnaire: Questionnaire;
  copy: AssessmentCopy;
};

/**
 * Where a member stands on one questionnaire. Deliberately 3 mutually
 * exclusive buckets, not 4: "Retake Available" is not a separate bucket a
 * questionnaire can be in — it's the retake affordance always offered
 * alongside 'completed' (see components/questionnaires/QuestionnaireCard.tsx),
 * since nothing in this product gates retaking behind a cooldown or
 * expiry. A completed questionnaire is simultaneously "Completed" (its
 * results are viewable) and "Retake Available" (a new attempt can start)
 * every time, not on alternating occasions.
 */
export type QuestionnaireStatus = 'not_started' | 'in_progress' | 'completed';
