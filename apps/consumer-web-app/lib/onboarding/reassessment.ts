/**
 * Multi-assessment history on top of the same onboarding_submissions /
 * onboarding_answers tables baseline.ts already reads — nothing here
 * changes what "baseline" means (still the earliest submission,
 * unchanged in baseline.ts) or touches that file. This module only adds
 * the ability to see every OTHER submission a member has made since.
 *
 * Reuses buildBaselineAssessment()/BaselineAssessment straight from
 * baseline.ts: a reassessment's answers have the exact same shape as the
 * baseline's, so there's no reason to duplicate that assembly logic.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  OnboardingAnswerRecord,
  OnboardingQuestion,
  OnboardingSubmission,
} from '@mef/shared-types-contracts';
import { buildBaselineAssessment, type BaselineAssessment } from './baseline';
import { selectAllRows } from '../data/pagedSelect';

export type AssessmentSummary = {
  submissionId: string;
  submittedAt: string;
  localDate: string;
  assessmentType: OnboardingSubmission['assessment_type'];
};

/** Every submission a member has ever made, oldest first — the baseline is always index 0. */
export async function fetchAssessmentHistory(
  supabase: SupabaseClient,
  userId: string
): Promise<AssessmentSummary[]> {
  const { rows: data, error } = await selectAllRows<
    Pick<OnboardingSubmission, 'id' | 'submitted_at' | 'local_date' | 'assessment_type'>
  >(() =>
    supabase
      .from('onboarding_submissions')
      .select('id, submitted_at, local_date, assessment_type')
      .eq('user_id', userId)
      .order('submitted_at', { ascending: true })
      .order('id', { ascending: true })
  );

  if (error) return [];

  return data.map((row) => ({
    submissionId: row.id,
    submittedAt: row.submitted_at,
    localDate: row.local_date,
    assessmentType: row.assessment_type,
  }));
}

async function fetchAssessmentBySubmission(
  supabase: SupabaseClient,
  submission: OnboardingSubmission
): Promise<BaselineAssessment> {
  const [{ rows: answerRows }, { rows: questions }] = await Promise.all([
    selectAllRows<OnboardingAnswerRecord>(() =>
      supabase
        .from('onboarding_answers')
        .select('*')
        .eq('submission_id', submission.id)
        .order('id', { ascending: true })
    ),
    selectAllRows<OnboardingQuestion>(() =>
      supabase
        .from('onboarding_questions')
        .select('*')
        .eq('assessment_version_id', submission.assessment_version_id)
        .order('display_order', { ascending: true })
        .order('id', { ascending: true })
    ),
  ]);

  return buildBaselineAssessment(
    submission,
    (questions ?? []) as OnboardingQuestion[],
    (answerRows ?? []) as OnboardingAnswerRecord[]
  );
}

/** A specific submission by id, scoped to userId so a member/coach can't be handed someone else's by guessing an id — RLS would already refuse the read, this just keeps the "whose" question explicit. */
export async function fetchAssessmentById(
  supabase: SupabaseClient,
  userId: string,
  submissionId: string
): Promise<BaselineAssessment | null> {
  const { data: submission, error } = await supabase
    .from('onboarding_submissions')
    .select('*')
    .eq('user_id', userId)
    .eq('id', submissionId)
    .maybeSingle();

  if (error || !submission) return null;
  return fetchAssessmentBySubmission(supabase, submission as OnboardingSubmission);
}

/** The most recent reassessment (not the baseline) — the "current" side of a baseline-vs-latest comparison. Null if none exists yet. */
export async function fetchLatestReassessment(
  supabase: SupabaseClient,
  userId: string
): Promise<BaselineAssessment | null> {
  const { data: submission, error } = await supabase
    .from('onboarding_submissions')
    .select('*')
    .eq('user_id', userId)
    .eq('assessment_type', 'reassessment')
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !submission) return null;
  return fetchAssessmentBySubmission(supabase, submission as OnboardingSubmission);
}
