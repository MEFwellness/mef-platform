/**
 * apps/consumer-web-app/app/actions/assessments.ts
 *
 * The only place a Server/Client Component reaches into the Wellness
 * Assessment System. Auth-guards every call, resolves the questionnaire
 * definition from lib/assessments/registry.ts, and delegates all
 * persistence to lib/assessments/store.ts — no Supabase query beyond auth
 * lives in this file, same shape as app/actions/scoring.ts.
 *
 * Deliberately questionnaire-agnostic: every export takes a
 * `questionnaireId` and resolves the rest generically, so a future
 * questionnaire needs zero changes here.
 */

'use server';

import { createClient } from '@/lib/supabase/server';
import { getAssessmentDefinition, listAssessmentDefinitions } from '@/lib/assessments/registry';
import {
  findCategory,
  isQuestionActive,
  totalAnsweredCount,
  totalQuestionCount,
} from '@/lib/assessments/engine/scoring';
import { buildWellnessInsight, type WellnessInsight } from '@/lib/assessments/insights';
import { deriveQuestionnaireStatus } from '@/lib/assessments/presentation';
import type {
  AssessmentCopy,
  Questionnaire,
  QuestionnaireStatus,
} from '@/lib/assessments/engine/types';
import type { AssessmentComparison } from '@/lib/assessments/comparison';
import type {
  AssessmentResult,
  AssessmentSummary,
  CategoryScorePoint,
  InProgressAssessment,
} from '@/lib/assessments/types';
import {
  completeAssessment,
  findInProgressAssessment,
  getAssessmentAnswers,
  getAssessmentComparison,
  getAssessmentResult,
  getCategoryScoreHistory,
  getLatestCompletedAssessmentSummary,
  getOrCreateInProgressAssessment,
  listCompletedAssessments,
  saveAnswer,
  saveContext,
  type ComparisonMode,
} from '@/lib/assessments/store';

async function requireMemberId(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export type AssessmentOverview = {
  questionnaire: Questionnaire;
  copy: AssessmentCopy;
  sectionCount: number;
  totalQuestions: number;
  draft: { answered: number; total: number; updatedAt: string } | null;
  latestCompleted: AssessmentSummary | null;
};

/** Everything the welcome/overview screen needs: static questionnaire metadata plus the member's current draft/history state. */
export async function getMyAssessmentOverview(
  questionnaireId: string
): Promise<AssessmentOverview | null> {
  const memberId = await requireMemberId();
  if (!memberId) return null;

  const { questionnaire, copy } = getAssessmentDefinition(questionnaireId);
  const supabase = createClient();

  const [draftAssessment, latestCompleted] = await Promise.all([
    findInProgressAssessment(supabase, memberId, questionnaireId),
    getLatestCompletedAssessmentSummary(supabase, memberId, questionnaireId),
  ]);

  return {
    questionnaire,
    copy,
    sectionCount: questionnaire.categories.length,
    totalQuestions: totalQuestionCount(questionnaire),
    draft: draftAssessment
      ? {
          answered: totalAnsweredCount(
            questionnaire,
            draftAssessment.answers,
            draftAssessment.record.context
          ),
          total: totalQuestionCount(questionnaire, draftAssessment.record.context),
          updatedAt: draftAssessment.record.updatedAt,
        }
      : null,
    latestCompleted,
  };
}

export type QuestionnaireListItem = {
  questionnaireId: string;
  title: string;
  listDescription: string;
  sectionCount: number;
  estimatedMinutes: number;
  status: QuestionnaireStatus;
  draft: { answered: number; total: number } | null;
  latestCompleted: AssessmentSummary | null;
};

/**
 * Everything the dedicated Questionnaires page needs, for every
 * registered questionnaire — reads lib/assessments/registry.ts, so a
 * future questionnaire (Health Appraisal, Breathing, Stress, Circadian &
 * Sleep, Digestive, Hormone, Colon Transit, Right/Left Brain, ...) shows
 * up here automatically the moment it's added to the registry, with zero
 * change to this function or the page that renders it.
 */
export async function getMyQuestionnaireList(): Promise<QuestionnaireListItem[]> {
  const memberId = await requireMemberId();
  if (!memberId) return [];

  const supabase = createClient();

  return Promise.all(
    listAssessmentDefinitions().map(async ({ questionnaire, copy }) => {
      const [draftAssessment, latestCompleted] = await Promise.all([
        findInProgressAssessment(supabase, memberId, questionnaire.id),
        getLatestCompletedAssessmentSummary(supabase, memberId, questionnaire.id),
      ]);

      return {
        questionnaireId: questionnaire.id,
        title: copy.displayTitle,
        listDescription: copy.listDescription,
        sectionCount: questionnaire.categories.length,
        estimatedMinutes: copy.estimatedMinutes,
        status: deriveQuestionnaireStatus(Boolean(draftAssessment), Boolean(latestCompleted)),
        draft: draftAssessment
          ? {
              answered: totalAnsweredCount(
                questionnaire,
                draftAssessment.answers,
                draftAssessment.record.context
              ),
              total: totalQuestionCount(questionnaire, draftAssessment.record.context),
            }
          : null,
        latestCompleted,
      };
    })
  );
}

export type TakeAssessmentState = {
  questionnaire: Questionnaire;
  copy: AssessmentCopy;
  inProgress: InProgressAssessment;
};

/** Starts a new draft or resumes the existing one — the single entry point for the take flow. */
export async function getMyTakeAssessmentState(
  questionnaireId: string
): Promise<TakeAssessmentState | null> {
  const memberId = await requireMemberId();
  if (!memberId) return null;

  const { questionnaire, copy } = getAssessmentDefinition(questionnaireId);
  const supabase = createClient();
  const inProgress = await getOrCreateInProgressAssessment(supabase, memberId, questionnaire);
  return { questionnaire, copy, inProgress };
}

/**
 * Persists one answer — called after every tap in the take flow. Looks up
 * the point value server-side from the verified questionnaire config
 * rather than trusting a client-supplied score, so a tampered request can
 * change which option was selected but never what it's worth.
 */
export async function submitAssessmentAnswer(
  questionnaireId: string,
  assessmentId: string,
  categoryId: string,
  questionNumber: number,
  optionIndex: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const memberId = await requireMemberId();
  if (!memberId) return { ok: false, error: 'Not signed in.' };

  try {
    const { questionnaire } = getAssessmentDefinition(questionnaireId);
    const category = findCategory(questionnaire, categoryId);
    const question = category.questions.find((q) => q.number === questionNumber);
    const option = question?.options[optionIndex];
    if (!question || !option) {
      return { ok: false, error: 'Unknown question or option.' };
    }

    const supabase = createClient();
    await saveAnswer(
      supabase,
      questionnaire,
      assessmentId,
      categoryId,
      questionNumber,
      optionIndex,
      option.points
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to save answer.' };
  }
}

/**
 * Persists one answer to a questionnaire's contextQuestions (e.g. Four
 * Doctors' gender gate) — same shape/auth-guard pattern as
 * submitAssessmentAnswer. Validates the submitted value against the
 * context question's own configured options before writing, so a
 * tampered request can pick an unexpected value but never one outside
 * the small enumerated set the questionnaire actually defines.
 */
export async function submitAssessmentContext(
  questionnaireId: string,
  assessmentId: string,
  key: string,
  value: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const memberId = await requireMemberId();
  if (!memberId) return { ok: false, error: 'Not signed in.' };

  try {
    const { questionnaire } = getAssessmentDefinition(questionnaireId);
    const contextQuestion = questionnaire.contextQuestions?.find((cq) => cq.key === key);
    const option = contextQuestion?.options.find((o) => o.value === value);
    if (!contextQuestion || !option) {
      return { ok: false, error: 'Unknown context question or value.' };
    }

    const supabase = createClient();
    await saveContext(supabase, assessmentId, key, value);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to save answer.' };
  }
}

export async function completeMyAssessment(
  questionnaireId: string,
  assessmentId: string
): Promise<AssessmentResult | null> {
  const memberId = await requireMemberId();
  if (!memberId) return null;

  const { questionnaire } = getAssessmentDefinition(questionnaireId);
  const supabase = createClient();
  return completeAssessment(supabase, questionnaire, assessmentId);
}

export type AssessmentResultView = {
  result: AssessmentResult;
  questionnaire: Questionnaire;
  copy: AssessmentCopy;
  insight: WellnessInsight;
};

export async function getMyAssessmentResult(
  questionnaireId: string,
  assessmentId: string
): Promise<AssessmentResultView | null> {
  const memberId = await requireMemberId();
  if (!memberId) return null;

  const { questionnaire, copy } = getAssessmentDefinition(questionnaireId);
  const supabase = createClient();
  const result = await getAssessmentResult(supabase, memberId, assessmentId, questionnaire);
  if (!result) return null;

  const scoreResult = {
    questionnaireId: questionnaire.id,
    questionnaireVersion: questionnaire.version,
    categoryScores: result.categoryScores,
    totalScore: result.record.totalScore!,
    totalMaxScore: result.record.totalMaxScore!,
    totalPriority: result.record.totalPriority!,
  };

  return {
    result,
    questionnaire,
    copy,
    insight: buildWellnessInsight(scoreResult, questionnaire, copy),
  };
}

/** Oldest-first list of every completed assessment for this questionnaire. */
export async function getMyAssessmentHistory(
  questionnaireId: string
): Promise<AssessmentSummary[]> {
  const memberId = await requireMemberId();
  if (!memberId) return [];

  const supabase = createClient();
  return listCompletedAssessments(supabase, memberId, questionnaireId);
}

export async function getMyAssessmentComparison(
  questionnaireId: string,
  assessmentId: string,
  mode: ComparisonMode
): Promise<AssessmentComparison | null> {
  const memberId = await requireMemberId();
  if (!memberId) return null;

  const { questionnaire } = getAssessmentDefinition(questionnaireId);
  const supabase = createClient();
  return getAssessmentComparison(supabase, memberId, questionnaire, assessmentId, mode);
}

/** Oldest-first score history for one category — the input to its trend chart. */
export async function getMyCategoryScoreHistory(
  questionnaireId: string,
  categoryId: string
): Promise<CategoryScorePoint[]> {
  const memberId = await requireMemberId();
  if (!memberId) return [];

  const supabase = createClient();
  return getCategoryScoreHistory(supabase, memberId, questionnaireId, categoryId);
}

export type AnsweredQuestionView = {
  questionNumber: number;
  questionText: string;
  selectedLabel: string;
  points: number;
};

/** Every question in one category, with the member's selected answer for one specific (owned, completed) assessment — the "questions answered" list on the category detail page. */
export async function getMyAssessmentCategoryAnswers(
  questionnaireId: string,
  assessmentId: string,
  categoryId: string
): Promise<AnsweredQuestionView[] | null> {
  const memberId = await requireMemberId();
  if (!memberId) return null;

  const { questionnaire } = getAssessmentDefinition(questionnaireId);
  const category = findCategory(questionnaire, categoryId);

  const supabase = createClient();
  // Confirms ownership + completed status through the same RLS-backed read
  // every other result view uses, rather than trusting the assessmentId alone.
  const owned = await getAssessmentResult(supabase, memberId, assessmentId, questionnaire);
  if (!owned) return null;

  const answers = await getAssessmentAnswers(supabase, assessmentId);
  const categoryAnswers = answers[categoryId] ?? {};

  return category.questions
    .filter((question) => isQuestionActive(question, owned.record.context ?? {}))
    .map((question) => {
      const optionIndex = categoryAnswers[question.number];
      const option = optionIndex !== undefined ? question.options[optionIndex] : undefined;
      return {
        questionNumber: question.number,
        questionText: question.text,
        selectedLabel: option?.label ?? 'Not answered',
        points: option?.points ?? 0,
      };
    });
}
