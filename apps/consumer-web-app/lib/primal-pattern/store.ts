/**
 * Primal Pattern Assessment — persistence. The only file in this feature
 * that talks to Supabase (migration 64's primal_pattern_assessments /
 * primal_pattern_assessment_answers). Same trust boundary as
 * lib/assessments/store.ts: every function takes an already-authenticated
 * client and an explicit memberId, RLS is the actual authorization
 * boundary, this file makes no role decision of its own.
 *
 * Resume position is tracked explicitly via current_question_number,
 * advanced on every answer AND every explicit skip — unlike the
 * points-based engine (lib/assessments/store.ts), which can derive resume
 * position from "first unanswered question" because every question there
 * must eventually be answered to complete. This questionnaire allows a
 * question to be permanently skipped, so "first unanswered" would
 * incorrectly snap a member back to a question they deliberately passed
 * on instead of where they actually stopped.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { scorePrimalPattern } from './scoring';
import type {
  InProgressPrimalPatternAssessment,
  Letter,
  PrimalPatternAnswers,
  PrimalPatternAssessmentRecord,
  PrimalPatternAssessmentSummary,
  PrimalPatternQuestionnaire,
  PrimalPatternResult,
} from './types';

const TABLE = 'primal_pattern_assessments';
const ANSWERS_TABLE = 'primal_pattern_assessment_answers';

type AssessmentRow = {
  id: string;
  questionnaire_id: string;
  questionnaire_version: number;
  status: 'in_progress' | 'completed';
  current_question_number: number | null;
  result: PrimalPatternResult | null;
  a_count: number;
  b_count: number;
  skipped_count: number;
  both_count: number;
  started_at: string;
  completed_at: string | null;
};

function mapRecord(row: AssessmentRow): PrimalPatternAssessmentRecord {
  return {
    id: row.id,
    questionnaireId: row.questionnaire_id,
    questionnaireVersion: row.questionnaire_version,
    status: row.status,
    currentQuestionNumber: row.current_question_number,
    result: row.result,
    aCount: row.a_count,
    bCount: row.b_count,
    skippedCount: row.skipped_count,
    bothCount: row.both_count,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

async function fetchAnswers(
  supabase: SupabaseClient,
  assessmentId: string
): Promise<PrimalPatternAnswers> {
  const { data, error } = await supabase
    .from(ANSWERS_TABLE)
    .select('question_number, selected_letters')
    .eq('assessment_id', assessmentId);

  if (error) throw new Error(`Failed to load Primal Pattern answers: ${error.message}`);

  const answers: PrimalPatternAnswers = {};
  for (const row of data ?? []) {
    answers[row.question_number as number] = row.selected_letters as Letter[];
  }
  return answers;
}

export async function getPrimalPatternAnswers(
  supabase: SupabaseClient,
  assessmentId: string
): Promise<PrimalPatternAnswers> {
  return fetchAnswers(supabase, assessmentId);
}

/** The member's open draft for this questionnaire, if one exists — never creates one. */
export async function findInProgressPrimalPatternAssessment(
  supabase: SupabaseClient,
  memberId: string,
  questionnaireId: string
): Promise<InProgressPrimalPatternAssessment | null> {
  const { data: existing, error } = await supabase
    .from(TABLE)
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
 * Returns the member's open draft, creating one if none exists — same
 * "start and resume are the same entry point" guarantee migration 64's
 * partial unique index gives lib/assessments/store.ts.
 */
export async function getOrCreateInProgressPrimalPatternAssessment(
  supabase: SupabaseClient,
  memberId: string,
  questionnaire: PrimalPatternQuestionnaire
): Promise<InProgressPrimalPatternAssessment> {
  const existing = await findInProgressPrimalPatternAssessment(
    supabase,
    memberId,
    questionnaire.id
  );
  if (existing) return existing;

  const { data: created, error: createError } = await supabase
    .from(TABLE)
    .insert({
      member_id: memberId,
      questionnaire_id: questionnaire.id,
      questionnaire_version: questionnaire.version,
      status: 'in_progress',
      current_question_number: questionnaire.questions[0]?.number ?? null,
    })
    .select('*')
    .single();

  if (createError || !created) {
    throw new Error(
      `Failed to start Primal Pattern assessment: ${createError?.message ?? 'unknown error'}`
    );
  }

  return { record: mapRecord(created as AssessmentRow), answers: {} };
}

function nextResumePosition(
  questionnaire: PrimalPatternQuestionnaire,
  questionNumber: number
): number {
  const total = questionnaire.questions.length;
  return Math.min(questionNumber + 1, total);
}

/**
 * Persists one answer (one or both letters) and advances the resume
 * position — called after every tap in the take flow.
 */
export async function savePrimalPatternAnswer(
  supabase: SupabaseClient,
  questionnaire: PrimalPatternQuestionnaire,
  assessmentId: string,
  questionNumber: number,
  letters: Letter[]
): Promise<PrimalPatternAnswers> {
  const { error: answerError } = await supabase.from(ANSWERS_TABLE).upsert(
    {
      assessment_id: assessmentId,
      question_number: questionNumber,
      selected_letters: letters,
      answered_at: new Date().toISOString(),
    },
    { onConflict: 'assessment_id,question_number' }
  );

  if (answerError) throw new Error(`Failed to save Primal Pattern answer: ${answerError.message}`);

  const { error: positionError } = await supabase
    .from(TABLE)
    .update({
      current_question_number: nextResumePosition(questionnaire, questionNumber),
      updated_at: new Date().toISOString(),
    })
    .eq('id', assessmentId);

  if (positionError) throw new Error(`Failed to update resume position: ${positionError.message}`);

  return fetchAnswers(supabase, assessmentId);
}

/**
 * Explicitly skips a question: clears any stored answer for it (a member
 * may skip a question they'd previously answered) and advances the resume
 * position exactly like an answer would, so refreshing mid-flow always
 * lands on the question after the last one visited, not the one just
 * skipped.
 */
export async function skipPrimalPatternQuestion(
  supabase: SupabaseClient,
  questionnaire: PrimalPatternQuestionnaire,
  assessmentId: string,
  questionNumber: number
): Promise<PrimalPatternAnswers> {
  const { error: deleteError } = await supabase
    .from(ANSWERS_TABLE)
    .delete()
    .eq('assessment_id', assessmentId)
    .eq('question_number', questionNumber);

  if (deleteError) throw new Error(`Failed to skip question: ${deleteError.message}`);

  const { error: positionError } = await supabase
    .from(TABLE)
    .update({
      current_question_number: nextResumePosition(questionnaire, questionNumber),
      updated_at: new Date().toISOString(),
    })
    .eq('id', assessmentId);

  if (positionError) throw new Error(`Failed to update resume position: ${positionError.message}`);

  return fetchAnswers(supabase, assessmentId);
}

/**
 * Scores the assessment (via the verified engine, never re-derived by a
 * client) and marks it complete. Unlike the points-based engine, there is
 * no "every question must be answered" precondition here — skipping is a
 * first-class, always-available choice, so completion is valid at any
 * point in the flow.
 */
export async function completePrimalPatternAssessment(
  supabase: SupabaseClient,
  questionnaire: PrimalPatternQuestionnaire,
  assessmentId: string
): Promise<PrimalPatternAssessmentRecord> {
  const answers = await fetchAnswers(supabase, assessmentId);
  const score = scorePrimalPattern(questionnaire, answers);
  const completedAt = new Date().toISOString();

  const { data: updated, error: updateError } = await supabase
    .from(TABLE)
    .update({
      status: 'completed',
      completed_at: completedAt,
      result: score.result,
      a_count: score.aCount,
      b_count: score.bCount,
      skipped_count: score.skippedCount,
      both_count: score.bothCount,
      current_question_number: null,
      updated_at: completedAt,
    })
    .eq('id', assessmentId)
    .select('*')
    .single();

  if (updateError || !updated) {
    throw new Error(
      `Failed to complete Primal Pattern assessment: ${updateError?.message ?? 'unknown error'}`
    );
  }

  return mapRecord(updated as AssessmentRow);
}

export async function getPrimalPatternAssessmentResult(
  supabase: SupabaseClient,
  memberId: string,
  assessmentId: string
): Promise<PrimalPatternAssessmentRecord | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', assessmentId)
    .eq('member_id', memberId)
    .eq('status', 'completed')
    .maybeSingle();

  if (error || !data) return null;
  return mapRecord(data as AssessmentRow);
}

/** Oldest-first, every completed assessment for this questionnaire. */
export async function listCompletedPrimalPatternAssessments(
  supabase: SupabaseClient,
  memberId: string,
  questionnaireId: string
): Promise<PrimalPatternAssessmentSummary[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('id, completed_at, result, a_count, b_count, skipped_count, both_count')
    .eq('member_id', memberId)
    .eq('questionnaire_id', questionnaireId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: true });

  if (error || !data) return [];

  return data
    .filter(
      (row): row is typeof row & { completed_at: string; result: PrimalPatternResult } =>
        row.completed_at !== null && row.result !== null
    )
    .map((row) => ({
      id: row.id,
      completedAt: row.completed_at,
      result: row.result,
      aCount: row.a_count,
      bCount: row.b_count,
      skippedCount: row.skipped_count,
      bothCount: row.both_count,
    }));
}

export async function getLatestCompletedPrimalPatternSummary(
  supabase: SupabaseClient,
  memberId: string,
  questionnaireId: string
): Promise<PrimalPatternAssessmentSummary | null> {
  const history = await listCompletedPrimalPatternAssessments(supabase, memberId, questionnaireId);
  return history.length > 0 ? history[history.length - 1]! : null;
}
