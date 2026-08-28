/**
 * apps/consumer-web-app/app/actions/assessments.ts
 *
 * The only place a Server/Client Component reaches into the Wellness
 * Assessment System. Auth-guards every call, resolves the questionnaire
 * definition from lib/assessment-registry/registry.ts, and delegates all
 * persistence to lib/assessments/store.ts — no Supabase query beyond auth
 * lives in this file, same shape as app/actions/scoring.ts.
 *
 * Deliberately questionnaire-agnostic: every export takes a
 * `questionnaireId` and resolves the rest generically, so a future
 * questionnaire needs zero changes here.
 */

'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { checkAssessmentAccess } from '@/lib/assessment-registry/access';
import {
  findAssessmentRegistryEntry,
  getAssessmentDefinition,
  listAssessmentDefinitions,
} from '@/lib/assessment-registry/registry';
import { toPublicSlug } from '@/lib/assessments/publicSlug';
import { decideNextAction, recordRouterDecision } from '@/lib/investigation-engine/rootRouter';
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
import { localDateFor } from './rootMap';
import { recomputeMyRecommendations } from './recommendations';

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
 * registered questionnaire — reads lib/assessment-registry/registry.ts,
 * so a future questionnaire (Health Appraisal, Breathing, Stress, Circadian &
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
        questionnaireId: toPublicSlug(questionnaire.id),
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

/**
 * What the take page reads.
 *
 * A TAKE URL ONLY EVER READS (2026-08-27). This used to call
 * `getOrCreateInProgressAssessment`, so rendering the take page created
 * the member's draft. The page's own comment said so out loud. A read-only
 * page load during an audit created a real, empty, 91-question draft on a
 * real member's production account, and once it existed the Questionnaires
 * card changed its call to action to "Resume assessment, 0 of 91 questions
 * completed". Back-then-Forward, a refresh and a bookmark all did the same.
 *
 * Now: resume a draft that exists, and otherwise return null so the page
 * can send her somewhere real. Creating is `beginAssessmentAction` below,
 * which is a button.
 */
export async function getMyTakeAssessmentState(
  questionnaireId: string
): Promise<TakeAssessmentState | null> {
  const memberId = await requireMemberId();
  if (!memberId) return null;

  const { questionnaire, copy } = getAssessmentDefinition(questionnaireId);
  const supabase = createClient();
  const inProgress = await findInProgressAssessment(supabase, memberId, questionnaire.id);
  if (!inProgress) return null;

  return { questionnaire, copy, inProgress };
}

/**
 * The Begin / Resume button for a generic-engine questionnaire. The only
 * path that may create a `wellness_assessments` draft, and it is a Server
 * Action, so a GET can never reach it.
 *
 * B4, THE ROUTER LOG (2026-08-27). `recordRouterDecision` used to run on
 * every render of the take page. `investigation_router_decisions` is
 * append-only with no uniqueness, so a refresh, a Back-then-Forward or a
 * Server Action revalidation each added a row. That table exists to keep
 * the Root Model honest about chosen-versus-recommended, and filling it
 * with page views is a quiet falsification of the one log built to catch
 * that. It now runs on the branch that genuinely starts a new attempt, and
 * never on a resume.
 */
async function startAttempt(questionnaireId: string, startRetake: boolean): Promise<void> {
  const overviewHref = `/assessments/${toPublicSlug(questionnaireId)}`;
  const memberId = await requireMemberId();
  if (!memberId) redirect('/login');

  const supabase = createClient();
  const access = await checkAssessmentAccess(supabase, memberId, questionnaireId, {
    intent: 'start',
  });
  if (!access.allowed) redirect(overviewHref);

  const { questionnaire } = getAssessmentDefinition(questionnaireId);
  const existing = await findInProgressAssessment(supabase, memberId, questionnaire.id);

  if (!existing && !startRetake) {
    // A finished questionnaire is never silently restarted. Her results are
    // what she asked for unless she pressed the retake button.
    const latestCompleted = await getLatestCompletedAssessmentSummary(
      supabase,
      memberId,
      questionnaire.id
    );
    if (latestCompleted) {
      redirect(`${overviewHref}/results/${latestCompleted.id}`);
    }
  }

  const isNewAttempt = existing === null;
  await getOrCreateInProgressAssessment(supabase, memberId, questionnaire);

  // Root Router — member agency logging (Method §7 step 4, Investigation
  // Engine's rootRouter.ts). Best-effort, non-throwing: a member starting
  // an assessment must never fail because this log couldn't be written.
  // Only questionnaireId values that resolve to a real AssessmentKey (the
  // Assessment Registry's cross-cutting metadata map, ASSESSMENT_REGISTRY,
  // distinct from this generic engine's own content map,
  // QUESTIONNAIRE_CONTENT_REGISTRY, in the same file) are loggable — Body
  // Assessment, onboarding, and Primal Pattern have their own separate
  // start flows and are intentionally left as a same-shape follow-up.
  const chosenKey = findAssessmentRegistryEntry(questionnaireId)?.key ?? null;
  if (isNewAttempt && chosenKey) {
    try {
      const decision = await decideNextAction(supabase, memberId);
      await recordRouterDecision(supabase, memberId, decision, chosenKey);
    } catch (err) {
      console.error('Root Router decision logging failed', err instanceof Error ? err.message : err);
    }
  }

  redirect(`${overviewHref}/take`);
}

/**
 * Begin or resume. Bound to a questionnaire id by the overview screen and
 * handed to a `<form action=...>`, so React calls it with the form's own
 * FormData appended; nothing here reads it, and there is deliberately no
 * "start a retake" argument a browser could set.
 */
export async function beginAssessmentAction(questionnaireId: string): Promise<void> {
  await startAttempt(questionnaireId, false);
}

/** Take it again. Its own action, so retaking is always something she pressed. */
export async function retakeAssessmentAction(questionnaireId: string): Promise<void> {
  await startAttempt(questionnaireId, true);
}

/**
 * Persists one answer — called after every tap in the take flow. Looks up
 * the point value server-side from the verified questionnaire config
 * rather than trusting a client-supplied score, so a tampered request can
 * change which option was selected but never what it's worth.
 */
/**
 * THE GATE, ON THE WRITE PATH TOO (2026-08-27). Every server action that
 * reads or writes a session asks the same question the card and the take
 * route ask, so a hand-made request cannot do what a screen cannot.
 *
 * 'view', not 'start', and that difference matters: a member who
 * legitimately began a questionnaire must always be able to finish it and
 * to see what she wrote, even if her plan changes underneath her mid-way.
 * What she may not do is BEGIN one, and that is decided on the one path
 * that begins things.
 */
async function mayWriteToSession(
  supabase: ReturnType<typeof createClient>,
  memberId: string,
  assessmentKey: string
): Promise<boolean> {
  const access = await checkAssessmentAccess(supabase, memberId, assessmentKey, {
    intent: 'view',
  });
  return access.allowed;
}

export async function submitAssessmentAnswer(
  questionnaireId: string,
  assessmentId: string,
  categoryId: string,
  questionNumber: number,
  optionIndex: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const memberId = await requireMemberId();
  if (!memberId) return { ok: false, error: 'Not signed in.' };

  const supabaseGate = createClient();
  if (!(await mayWriteToSession(supabaseGate, memberId, questionnaireId))) {
    return { ok: false, error: 'This is not open for you right now.' };
  }

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

  const supabaseGate = createClient();
  if (!(await mayWriteToSession(supabaseGate, memberId, questionnaireId))) {
    return { ok: false, error: 'This is not open for you right now.' };
  }

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
  if (!(await mayWriteToSession(supabase, memberId, questionnaireId))) return null;

  const result = await completeAssessment(supabase, questionnaire, assessmentId);

  // Recommendation Engine — a completed questionnaire is one of the
  // events that materially changes what it would recommend.
  // recomputeMyRecommendations already swallows its own errors, same
  // best-effort discipline as every other post-completion recompute in
  // this app; never allowed to affect the result already returned above.
  const localDate = await localDateFor(supabase, memberId);
  await recomputeMyRecommendations(supabase, memberId, localDate, 'questionnaire_completed');

  return result;
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
