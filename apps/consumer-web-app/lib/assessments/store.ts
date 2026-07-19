/**
 * Reusable Assessment Engine — persistence. The only file in this feature
 * that talks to Supabase (migration 62's wellness_assessments /
 * wellness_assessment_answers / wellness_assessment_category_scores).
 * Every function takes an already-authenticated client and an explicit
 * memberId — same trust boundary as lib/scoring/service.ts and
 * lib/onboarding/baseline.ts: RLS is the actual authorization boundary,
 * this file makes no role decision of its own.
 *
 * Scoring itself never happens here beyond calling into
 * lib/assessments/engine/scoring.ts at completion time — this file only
 * reads/writes rows and assembles them into the persistence-facing types
 * from lib/assessments/types.ts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { findFirstUnanswered, flattenQuestions } from './engine/navigation';
import { findCategory, isQuestionnaireComplete, scoreQuestionnaire } from './engine/scoring';
import type {
  AssessmentContext,
  PriorityLevel,
  Questionnaire,
  QuestionnaireAnswers,
} from './engine/types';
import {
  buildAssessmentComparison,
  findClosestAssessmentOnOrBefore,
  type AssessmentComparison,
} from './comparison';
import type {
  AssessmentRecord,
  AssessmentResult,
  AssessmentSummary,
  CategoryScorePoint,
  InProgressAssessment,
} from './types';

type AssessmentRow = {
  id: string;
  questionnaire_id: string;
  questionnaire_version: number;
  status: 'in_progress' | 'completed';
  current_category_id: string | null;
  current_question_number: number | null;
  total_score: number | null;
  total_max_score: number | null;
  total_priority: PriorityLevel | null;
  started_at: string;
  completed_at: string | null;
  context: AssessmentContext | null;
};

function mapRecord(row: AssessmentRow): AssessmentRecord {
  return {
    id: row.id,
    questionnaireId: row.questionnaire_id,
    questionnaireVersion: row.questionnaire_version,
    status: row.status,
    currentCategoryId: row.current_category_id,
    currentQuestionNumber: row.current_question_number,
    totalScore: row.total_score,
    totalMaxScore: row.total_max_score,
    totalPriority: row.total_priority,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    context: row.context ?? {},
  };
}

/** Every stored answer for one assessment (in-progress or completed — answer rows are never deleted at completion), keyed by category then question number. */
export async function getAssessmentAnswers(
  supabase: SupabaseClient,
  assessmentId: string
): Promise<QuestionnaireAnswers> {
  return fetchAnswers(supabase, assessmentId);
}

async function fetchAnswers(
  supabase: SupabaseClient,
  assessmentId: string
): Promise<QuestionnaireAnswers> {
  const { data, error } = await supabase
    .from('wellness_assessment_answers')
    .select('category_id, question_number, option_index')
    .eq('assessment_id', assessmentId);

  if (error) throw new Error(`Failed to load assessment answers: ${error.message}`);

  const answers: QuestionnaireAnswers = {};
  for (const row of data ?? []) {
    const category = (answers[row.category_id] ??= {});
    category[row.question_number] = row.option_index;
  }
  return answers;
}

/** The member's open draft for this questionnaire, if one exists — never creates one. Powers the welcome screen's "Resume" vs. "Start" decision without side effects. */
export async function findInProgressAssessment(
  supabase: SupabaseClient,
  memberId: string,
  questionnaireId: string
): Promise<InProgressAssessment | null> {
  const { data: existing, error } = await supabase
    .from('wellness_assessments')
    .select('*')
    .eq('member_id', memberId)
    .eq('questionnaire_id', questionnaireId)
    .eq('status', 'in_progress')
    .maybeSingle();

  if (error || !existing) return null;

  const answers = await fetchAnswers(supabase, existing.id);
  return { record: mapRecord(existing as AssessmentRow), answers };
}

/**
 * Returns the member's open draft for this questionnaire, creating one if
 * none exists — this, plus the partial unique index in migration 62, is
 * what makes "start" and "resume" the same entry point: a member can never
 * end up with two open drafts of the same questionnaire to accidentally
 * choose between.
 */
export async function getOrCreateInProgressAssessment(
  supabase: SupabaseClient,
  memberId: string,
  questionnaire: Questionnaire
): Promise<InProgressAssessment> {
  const existing = await findInProgressAssessment(supabase, memberId, questionnaire.id);
  if (existing) return existing;

  const flat = flattenQuestions(questionnaire);
  const first = flat[0];

  const { data: created, error: createError } = await supabase
    .from('wellness_assessments')
    .insert({
      member_id: memberId,
      questionnaire_id: questionnaire.id,
      questionnaire_version: questionnaire.version,
      status: 'in_progress',
      current_category_id: first?.category.id ?? null,
      current_question_number: first?.question.number ?? null,
    })
    .select('*')
    .single();

  if (createError || !created) {
    throw new Error(`Failed to start assessment: ${createError?.message ?? 'unknown error'}`);
  }

  return { record: mapRecord(created as AssessmentRow), answers: {} };
}

/**
 * Persists one answer to a questionnaire's contextQuestions (e.g. Four
 * Doctors' gender gate) — a small, generic side-channel on the assessment
 * row itself, not part of wellness_assessment_answers, since it isn't a
 * scored question from the source instrument. Merges into the existing
 * `context` object rather than overwriting it, so answering one context
 * question never clobbers another.
 */
export async function saveContext(
  supabase: SupabaseClient,
  assessmentId: string,
  key: string,
  value: string
): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from('wellness_assessments')
    .select('context')
    .eq('id', assessmentId)
    .single();

  if (fetchError) throw new Error(`Failed to load assessment context: ${fetchError.message}`);

  const nextContext: AssessmentContext = { ...(existing?.context ?? {}), [key]: value };

  const { error: updateError } = await supabase
    .from('wellness_assessments')
    .update({ context: nextContext, updated_at: new Date().toISOString() })
    .eq('id', assessmentId);

  if (updateError) throw new Error(`Failed to save assessment context: ${updateError.message}`);
}

/**
 * Persists one answer and advances the resume position to the next
 * unanswered question — called after every single tap in the take flow
 * (see app/actions/assessments.ts), which is what makes "auto-save after
 * every answer" and "save and resume later" the same mechanism.
 */
export async function saveAnswer(
  supabase: SupabaseClient,
  questionnaire: Questionnaire,
  assessmentId: string,
  categoryId: string,
  questionNumber: number,
  optionIndex: number,
  points: number
): Promise<QuestionnaireAnswers> {
  const { error: answerError } = await supabase.from('wellness_assessment_answers').upsert(
    {
      assessment_id: assessmentId,
      category_id: categoryId,
      question_number: questionNumber,
      option_index: optionIndex,
      points,
      answered_at: new Date().toISOString(),
    },
    { onConflict: 'assessment_id,category_id,question_number' }
  );

  if (answerError) throw new Error(`Failed to save answer: ${answerError.message}`);

  // Only questionnaires that declare contextQuestions ever need this extra
  // read — for any other questionnaire (every one that predates this
  // mechanism), skip it entirely so the query count here is unchanged.
  let context: AssessmentContext = {};
  if (questionnaire.contextQuestions && questionnaire.contextQuestions.length > 0) {
    const { data: assessmentRow } = await supabase
      .from('wellness_assessments')
      .select('context')
      .eq('id', assessmentId)
      .single();
    context = assessmentRow?.context ?? {};
  }

  const answers = await fetchAnswers(supabase, assessmentId);
  const flat = flattenQuestions(questionnaire);
  const next = findFirstUnanswered(flat, answers, context);

  const { error: positionError } = await supabase
    .from('wellness_assessments')
    .update({
      current_category_id: next?.category.id ?? null,
      current_question_number: next?.question.number ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', assessmentId);

  if (positionError) throw new Error(`Failed to update resume position: ${positionError.message}`);

  return answers;
}

/**
 * Scores the assessment (via the verified engine, never re-derived by a
 * client) and marks it complete. Throws if any question is still
 * unanswered — the take flow's Next/Submit controls are expected to
 * prevent this from ever being called early, but the write path itself
 * never trusts that and re-checks completeness against the real stored
 * answers.
 */
export async function completeAssessment(
  supabase: SupabaseClient,
  questionnaire: Questionnaire,
  assessmentId: string
): Promise<AssessmentResult> {
  // Same guard as saveAnswer above: only fetch context for a questionnaire
  // that actually declares contextQuestions. Every other questionnaire
  // completes exactly the same way it did before this mechanism existed.
  let context: AssessmentContext = {};
  if (questionnaire.contextQuestions && questionnaire.contextQuestions.length > 0) {
    const { data: assessmentRow, error: assessmentError } = await supabase
      .from('wellness_assessments')
      .select('context')
      .eq('id', assessmentId)
      .single();

    if (assessmentError || !assessmentRow) {
      throw new Error(`Failed to load assessment: ${assessmentError?.message ?? 'not found'}`);
    }
    context = assessmentRow.context ?? {};
  }

  const answers = await fetchAnswers(supabase, assessmentId);
  if (!isQuestionnaireComplete(questionnaire, answers, context)) {
    throw new Error('Cannot complete an assessment with unanswered questions.');
  }

  const result = scoreQuestionnaire(questionnaire, answers, context);
  const completedAt = new Date().toISOString();

  const { data: updated, error: updateError } = await supabase
    .from('wellness_assessments')
    .update({
      status: 'completed',
      completed_at: completedAt,
      total_score: result.totalScore,
      total_max_score: result.totalMaxScore,
      total_priority: result.totalPriority,
      current_category_id: null,
      current_question_number: null,
      updated_at: completedAt,
    })
    .eq('id', assessmentId)
    .select('*')
    .single();

  if (updateError || !updated) {
    throw new Error(`Failed to complete assessment: ${updateError?.message ?? 'unknown error'}`);
  }

  const { error: scoresError } = await supabase.from('wellness_assessment_category_scores').upsert(
    result.categoryScores.map((c) => ({
      assessment_id: assessmentId,
      category_id: c.categoryId,
      score: c.score,
      max_score: c.maxScore,
      priority: c.priority,
    })),
    { onConflict: 'assessment_id,category_id' }
  );

  if (scoresError) throw new Error(`Failed to save category scores: ${scoresError.message}`);

  return { record: mapRecord(updated as AssessmentRow), categoryScores: result.categoryScores };
}

export async function getAssessmentResult(
  supabase: SupabaseClient,
  memberId: string,
  assessmentId: string,
  questionnaire: Questionnaire
): Promise<AssessmentResult | null> {
  const { data: assessment, error: assessmentError } = await supabase
    .from('wellness_assessments')
    .select('*')
    .eq('id', assessmentId)
    .eq('member_id', memberId)
    .eq('status', 'completed')
    .maybeSingle();

  if (assessmentError || !assessment) return null;

  const { data: scores, error: scoresError } = await supabase
    .from('wellness_assessment_category_scores')
    .select('category_id, score, max_score, priority')
    .eq('assessment_id', assessmentId);

  if (scoresError) throw new Error(`Failed to load category scores: ${scoresError.message}`);

  return {
    record: mapRecord(assessment as AssessmentRow),
    categoryScores: (scores ?? []).map((s) => ({
      categoryId: s.category_id,
      categoryName: findCategory(questionnaire, s.category_id).name,
      score: s.score,
      maxScore: s.max_score,
      priority: s.priority,
    })),
  };
}

/** Oldest-first, every completed assessment for this questionnaire. */
export async function listCompletedAssessments(
  supabase: SupabaseClient,
  memberId: string,
  questionnaireId: string
): Promise<AssessmentSummary[]> {
  const { data, error } = await supabase
    .from('wellness_assessments')
    .select('id, completed_at, total_score, total_max_score, total_priority')
    .eq('member_id', memberId)
    .eq('questionnaire_id', questionnaireId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: true });

  if (error || !data) return [];

  return data
    .filter(
      (
        row
      ): row is typeof row & {
        completed_at: string;
        total_score: number;
        total_max_score: number;
        total_priority: PriorityLevel;
      } =>
        row.completed_at !== null &&
        row.total_score !== null &&
        row.total_max_score !== null &&
        row.total_priority !== null
    )
    .map((row) => ({
      id: row.id,
      completedAt: row.completed_at,
      totalScore: row.total_score,
      totalMaxScore: row.total_max_score,
      totalPriority: row.total_priority,
    }));
}

export async function getLatestCompletedAssessmentSummary(
  supabase: SupabaseClient,
  memberId: string,
  questionnaireId: string
): Promise<AssessmentSummary | null> {
  const history = await listCompletedAssessments(supabase, memberId, questionnaireId);
  return history.length > 0 ? history[history.length - 1]! : null;
}

/** Oldest-first score history for one category, across every completed assessment — the input to a category trend chart. */
export async function getCategoryScoreHistory(
  supabase: SupabaseClient,
  memberId: string,
  questionnaireId: string,
  categoryId: string
): Promise<CategoryScorePoint[]> {
  const summaries = await listCompletedAssessments(supabase, memberId, questionnaireId);
  if (summaries.length === 0) return [];

  const { data, error } = await supabase
    .from('wellness_assessment_category_scores')
    .select('assessment_id, score, max_score, priority')
    .eq('category_id', categoryId)
    .in(
      'assessment_id',
      summaries.map((s) => s.id)
    );

  if (error || !data) return [];

  const byAssessmentId = new Map(data.map((row) => [row.assessment_id, row]));

  return summaries
    .map((summary) => {
      const row = byAssessmentId.get(summary.id);
      if (!row) return null;
      return {
        assessmentId: summary.id,
        completedAt: summary.completedAt,
        score: row.score,
        maxScore: row.max_score,
        priority: row.priority as PriorityLevel,
      };
    })
    .filter((point): point is CategoryScorePoint => point !== null);
}

export type ComparisonMode = 'previous' | { daysAgo: number };

/**
 * Resolves which second assessment to compare against — either the one
 * immediately before `currentAssessmentId` chronologically, or the
 * completed assessment closest to (but not after) N days before the
 * current one's completion — then hands both real results to the pure
 * comparison builder. Returns null only if the current assessment itself
 * can't be found/owned; a missing "previous" assessment is a normal,
 * expected state (a first-ever assessment) and yields
 * comparison.previous === null instead of a null return here.
 */
export async function getAssessmentComparison(
  supabase: SupabaseClient,
  memberId: string,
  questionnaire: Questionnaire,
  currentAssessmentId: string,
  mode: ComparisonMode
): Promise<AssessmentComparison | null> {
  const current = await getAssessmentResult(supabase, memberId, currentAssessmentId, questionnaire);
  if (!current || !current.record.completedAt) return null;

  const history = await listCompletedAssessments(supabase, memberId, questionnaire.id);
  const others = history.filter((h) => h.id !== currentAssessmentId);
  const currentCompletedAt = new Date(current.record.completedAt);

  let previousSummary: AssessmentSummary | null = null;
  if (mode === 'previous') {
    const before = others.filter((h) => new Date(h.completedAt) < currentCompletedAt);
    previousSummary = before.length > 0 ? before[before.length - 1]! : null;
  } else {
    const targetDate = new Date(currentCompletedAt.getTime() - mode.daysAgo * 24 * 60 * 60 * 1000);
    previousSummary = findClosestAssessmentOnOrBefore(others, targetDate);
  }

  const previous = previousSummary
    ? await getAssessmentResult(supabase, memberId, previousSummary.id, questionnaire)
    : null;

  return buildAssessmentComparison(current, previous);
}
