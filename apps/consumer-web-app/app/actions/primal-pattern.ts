/**
 * apps/consumer-web-app/app/actions/primal-pattern.ts
 *
 * The only place a Server/Client Component reaches into the Primal
 * Pattern Assessment. Auth-guards every call and delegates all
 * persistence to lib/primal-pattern/store.ts — same shape as
 * app/actions/assessments.ts.
 */

'use server';

import { createClient } from '@/lib/supabase/server';
import {
  PRIMAL_PATTERN_COPY,
  PRIMAL_PATTERN_QUESTIONNAIRE,
  PRIMAL_PATTERN_QUESTIONNAIRE_ID,
} from '@/lib/primal-pattern/questionnaire';
import { totalAnsweredCount } from '@/lib/primal-pattern/scoring';
import { deriveQuestionnaireStatus } from '@/lib/assessments/presentation';
import type { QuestionnaireStatus } from '@/lib/assessments/engine/types';
import type {
  InProgressPrimalPatternAssessment,
  Letter,
  PrimalPatternAssessmentRecord,
  PrimalPatternAssessmentSummary,
  PrimalPatternCopy,
  PrimalPatternQuestionnaire,
} from '@/lib/primal-pattern/types';
import {
  completePrimalPatternAssessment,
  findInProgressPrimalPatternAssessment,
  getLatestCompletedPrimalPatternSummary,
  getOrCreateInProgressPrimalPatternAssessment,
  getPrimalPatternAssessmentResult,
  listCompletedPrimalPatternAssessments,
  savePrimalPatternAnswer,
  skipPrimalPatternQuestion,
} from '@/lib/primal-pattern/store';
import { getNutritionSafetyProfile, upsertNutritionSafetyFlags } from '@/lib/health-safety/store';
import type { NutritionSafetyFlags, NutritionSafetyProfile } from '@/lib/health-safety/types';

async function requireMemberId(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export type PrimalPatternOverview = {
  questionnaire: PrimalPatternQuestionnaire;
  copy: PrimalPatternCopy;
  totalQuestions: number;
  draft: { answered: number; total: number } | null;
  latestCompleted: PrimalPatternAssessmentSummary | null;
  safetyProfile: NutritionSafetyProfile | null;
};

/** Everything the welcome screen needs: static questionnaire metadata, the member's draft/history state, and their current safety-flag profile. */
export async function getMyPrimalPatternOverview(): Promise<PrimalPatternOverview | null> {
  const memberId = await requireMemberId();
  if (!memberId) return null;

  const supabase = createClient();
  const [draftAssessment, latestCompleted, safetyProfile] = await Promise.all([
    findInProgressPrimalPatternAssessment(supabase, memberId, PRIMAL_PATTERN_QUESTIONNAIRE_ID),
    getLatestCompletedPrimalPatternSummary(supabase, memberId, PRIMAL_PATTERN_QUESTIONNAIRE_ID),
    getNutritionSafetyProfile(supabase, memberId),
  ]);

  const total = PRIMAL_PATTERN_QUESTIONNAIRE.questions.length;

  return {
    questionnaire: PRIMAL_PATTERN_QUESTIONNAIRE,
    copy: PRIMAL_PATTERN_COPY,
    totalQuestions: total,
    draft: draftAssessment
      ? {
          answered: totalAnsweredCount(PRIMAL_PATTERN_QUESTIONNAIRE, draftAssessment.answers),
          total,
        }
      : null,
    latestCompleted,
    safetyProfile,
  };
}

export type TakePrimalPatternState = {
  questionnaire: PrimalPatternQuestionnaire;
  copy: PrimalPatternCopy;
  inProgress: InProgressPrimalPatternAssessment;
};

/** Starts a new draft or resumes the existing one — the single entry point for the take flow. */
export async function getMyPrimalPatternTakeState(): Promise<TakePrimalPatternState | null> {
  const memberId = await requireMemberId();
  if (!memberId) return null;

  const supabase = createClient();
  const inProgress = await getOrCreateInProgressPrimalPatternAssessment(
    supabase,
    memberId,
    PRIMAL_PATTERN_QUESTIONNAIRE
  );
  return { questionnaire: PRIMAL_PATTERN_QUESTIONNAIRE, copy: PRIMAL_PATTERN_COPY, inProgress };
}

/** Persists one answer (one or both letters) — called after every tap in the take flow. */
export async function submitPrimalPatternAnswer(
  assessmentId: string,
  questionNumber: number,
  letters: Letter[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const memberId = await requireMemberId();
  if (!memberId) return { ok: false, error: 'Not signed in.' };

  const question = PRIMAL_PATTERN_QUESTIONNAIRE.questions.find((q) => q.number === questionNumber);
  if (!question) return { ok: false, error: 'Unknown question.' };
  if (letters.length === 0 || letters.length > 2 || new Set(letters).size !== letters.length) {
    return { ok: false, error: 'Invalid selection.' };
  }

  try {
    const supabase = createClient();
    await savePrimalPatternAnswer(
      supabase,
      PRIMAL_PATTERN_QUESTIONNAIRE,
      assessmentId,
      questionNumber,
      letters
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to save answer.' };
  }
}

/** Explicitly skips a question, clearing any prior answer for it. */
export async function skipMyPrimalPatternQuestion(
  assessmentId: string,
  questionNumber: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const memberId = await requireMemberId();
  if (!memberId) return { ok: false, error: 'Not signed in.' };

  try {
    const supabase = createClient();
    await skipPrimalPatternQuestion(
      supabase,
      PRIMAL_PATTERN_QUESTIONNAIRE,
      assessmentId,
      questionNumber
    );
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to skip question.',
    };
  }
}

export async function completeMyPrimalPatternAssessment(
  assessmentId: string
): Promise<PrimalPatternAssessmentRecord | null> {
  const memberId = await requireMemberId();
  if (!memberId) return null;

  const supabase = createClient();
  return completePrimalPatternAssessment(supabase, PRIMAL_PATTERN_QUESTIONNAIRE, assessmentId);
}

export type PrimalPatternResultView = {
  record: PrimalPatternAssessmentRecord;
  questionnaire: PrimalPatternQuestionnaire;
  copy: PrimalPatternCopy;
};

export async function getMyPrimalPatternResult(
  assessmentId: string
): Promise<PrimalPatternResultView | null> {
  const memberId = await requireMemberId();
  if (!memberId) return null;

  const supabase = createClient();
  const record = await getPrimalPatternAssessmentResult(supabase, memberId, assessmentId);
  if (!record) return null;

  return { record, questionnaire: PRIMAL_PATTERN_QUESTIONNAIRE, copy: PRIMAL_PATTERN_COPY };
}

/** Oldest-first list of every completed Primal Pattern assessment for this member. */
export async function getMyPrimalPatternHistory(): Promise<PrimalPatternAssessmentSummary[]> {
  const memberId = await requireMemberId();
  if (!memberId) return [];

  const supabase = createClient();
  return listCompletedPrimalPatternAssessments(supabase, memberId, PRIMAL_PATTERN_QUESTIONNAIRE_ID);
}

export type PrimalPatternListItem = {
  questionnaireId: string;
  title: string;
  listDescription: string;
  estimatedMinutes: number;
  status: QuestionnaireStatus;
  draft: { answered: number; total: number } | null;
  latestCompleted: PrimalPatternAssessmentSummary | null;
};

/** The /questionnaires page's entry for this assessment — kept as its own small card component (PrimalPatternQuestionnaireCard) rather than forced into QuestionnaireListItem/QuestionnaireCard, whose latestCompleted shape (totalScore/totalMaxScore/totalPriority) doesn't fit a letter-count result. */
export async function getMyPrimalPatternListItem(): Promise<PrimalPatternListItem | null> {
  const memberId = await requireMemberId();
  if (!memberId) return null;

  const supabase = createClient();
  const [draftAssessment, latestCompleted] = await Promise.all([
    findInProgressPrimalPatternAssessment(supabase, memberId, PRIMAL_PATTERN_QUESTIONNAIRE_ID),
    getLatestCompletedPrimalPatternSummary(supabase, memberId, PRIMAL_PATTERN_QUESTIONNAIRE_ID),
  ]);

  const total = PRIMAL_PATTERN_QUESTIONNAIRE.questions.length;

  return {
    questionnaireId: PRIMAL_PATTERN_QUESTIONNAIRE_ID,
    title: PRIMAL_PATTERN_COPY.displayTitle,
    listDescription: PRIMAL_PATTERN_COPY.listDescription,
    estimatedMinutes: PRIMAL_PATTERN_COPY.estimatedMinutes,
    status: deriveQuestionnaireStatus(Boolean(draftAssessment), Boolean(latestCompleted)),
    draft: draftAssessment
      ? {
          answered: totalAnsweredCount(PRIMAL_PATTERN_QUESTIONNAIRE, draftAssessment.answers),
          total,
        }
      : null,
    latestCompleted,
  };
}

export async function getMyNutritionSafetyProfile(): Promise<NutritionSafetyProfile | null> {
  const memberId = await requireMemberId();
  if (!memberId) return null;

  const supabase = createClient();
  return getNutritionSafetyProfile(supabase, memberId);
}

/** Self-report save — a member updating their own health-safety flags. Never touches assessment data. */
export async function saveMyNutritionSafetyFlags(
  flags: NutritionSafetyFlags
): Promise<{ ok: true; profile: NutritionSafetyProfile } | { ok: false; error: string }> {
  const memberId = await requireMemberId();
  if (!memberId) return { ok: false, error: 'Not signed in.' };

  try {
    const supabase = createClient();
    const profile = await upsertNutritionSafetyFlags(supabase, memberId, flags, memberId, 'member');
    return { ok: true, profile };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to save.' };
  }
}
