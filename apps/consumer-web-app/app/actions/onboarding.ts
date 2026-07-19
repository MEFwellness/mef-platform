'use server';

import { createClient } from '@/lib/supabase/server';
import { hasCompletedConsent } from './consent';
import { fetchBaselineAssessment, type BaselineAssessment } from '@/lib/onboarding/baseline';
import {
  fetchAssessmentHistory,
  fetchAssessmentById,
  fetchLatestReassessment,
  type AssessmentSummary,
} from '@/lib/onboarding/reassessment';
import {
  buildComparison,
  buildProgressSummary,
  type ComparisonMetric,
  type ProgressSummary,
} from '@/lib/onboarding/comparison';
import type { OnboardingAnswerInput, OnboardingQuestion } from '@mef/shared-types-contracts';
import type { ActionResult } from './auth';
import { emitAndDispatch } from '@/lib/ai/events';
import { buildRuleFacts } from '@/lib/ai/rules/facts';
import { recordTimelineEvent } from '@/lib/timeline/data';

const ASSESSMENT_VERSION = 1;

export async function getOnboardingQuestions(): Promise<OnboardingQuestion[]> {
  const supabase = createClient();
  const { data: version } = await supabase
    .from('onboarding_assessment_versions')
    .select('id')
    .eq('assessment_version', ASSESSMENT_VERSION)
    .is('retired_at', null)
    .single();

  if (!version) return [];

  const { data, error } = await supabase
    .from('onboarding_questions')
    .select('*')
    .eq('assessment_version_id', version.id)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Failed to load onboarding questions', error);
    return [];
  }
  return data as OnboardingQuestion[];
}

/**
 * Submits onboarding via the submit_onboarding() Postgres function
 * (migration 18) so the raw payload and every typed answer are written
 * atomically. This function deliberately does NOT compute or write to
 * onboarding_baselines — per Sprint 1 task 7, no wellness conclusions are
 * generated this sprint. That table stays empty until the baseline
 * projection job is built.
 *
 * Also the write path for reassessments (unchanged since migration 25):
 * submit_onboarding() itself decides server-side whether this is the
 * member's first submission ever (-> 'baseline') or a later one
 * (-> 'reassessment') — this action doesn't need to know or care which,
 * so the reassessment flow (app/profile/reassessments/new) calls this
 * exact same function with the exact same payload shape.
 */
export async function submitOnboarding(
  timezone: string,
  answers: OnboardingAnswerInput[]
): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: 'Not signed in.' };

  const consented = await hasCompletedConsent(user.id);
  if (!consented) return { error: 'Consent must be completed before onboarding.' };

  const rawPayload = { answers, submitted_client_side_at: new Date().toISOString() };

  const { data: submissionId, error } = await supabase.rpc('submit_onboarding', {
    p_assessment_version: ASSESSMENT_VERSION,
    p_timezone: timezone,
    p_raw_payload: rawPayload,
    p_answers: answers,
  });

  if (error) {
    // submit_onboarding()'s exceptions (migration 18) are internal-consistency
    // guards — "no active assessment version", "unknown question_key" — never
    // something a member did wrong, so the raw Postgres message isn't
    // actionable for them and shouldn't be shown. Log it for us, show them a
    // generic apology instead.
    console.error('submit_onboarding RPC failed', error);
    return {
      error:
        'Something went wrong submitting your assessment. Please try again, or contact support if it keeps happening.',
    };
  }

  // AI event emission — best-effort, never allowed to affect the result
  // above. submit_onboarding() itself already decided baseline vs
  // reassessment (migration 25); read that back rather than re-deciding
  // it here a second way.
  try {
    if (submissionId) {
      const { data: submission } = await supabase
        .from('onboarding_submissions')
        .select('assessment_type, local_date')
        .eq('id', submissionId)
        .single();

      if (submission) {
        const facts = buildRuleFacts([], submission.local_date);
        const isReassessment = submission.assessment_type === 'reassessment';
        await emitAndDispatch(
          supabase,
          {
            eventType: isReassessment ? 'reassessment_completed' : 'member_completed_onboarding',
            memberId: user.id,
            source: 'member',
            payload: { submissionId },
          },
          facts
        );

        await recordTimelineEvent(supabase, {
          memberId: user.id,
          eventType: isReassessment ? 'reassessment_completed' : 'onboarding_completed',
          localDate: submission.local_date,
          title: isReassessment ? 'Completed a reassessment' : 'Completed onboarding',
          sourceFeature: 'onboarding_submissions',
          sourceRecordId: submissionId,
        });
      }
    }
  } catch (aiError) {
    console.error('AI event emission failed for submitOnboarding', aiError);
  }

  return {};
}

/**
 * The signed-in member's own Baseline Assessment — their first-ever
 * onboarding submission, permanently preserved. Returns null if they
 * haven't completed onboarding yet; there is no separate "not found"
 * error, since that's just the normal state before their first submission.
 */
export async function getMyBaselineAssessment(): Promise<BaselineAssessment | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  return fetchBaselineAssessment(supabase, user.id);
}

/** Every submission the signed-in member has ever made, oldest first (baseline always first). */
export async function getMyAssessmentHistory(): Promise<AssessmentSummary[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  return fetchAssessmentHistory(supabase, user.id);
}

/** A specific past submission of the signed-in member's own, by id — used to open one entry from their reassessment history. */
export async function getMyAssessmentById(
  submissionId: string
): Promise<BaselineAssessment | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  return fetchAssessmentById(supabase, user.id, submissionId);
}

/**
 * Baseline-vs-latest-reassessment comparison for the signed-in member.
 * `latest` is null (and every metric's direction is null) until they've
 * completed at least one reassessment — that's a real, honest empty
 * state, not an error.
 */
export async function getMyProgressComparison(): Promise<{
  baseline: BaselineAssessment | null;
  latest: BaselineAssessment | null;
  metrics: ComparisonMetric[];
  summary: ProgressSummary;
}> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const metrics = buildComparison(null, null);
    return { baseline: null, latest: null, metrics, summary: buildProgressSummary(metrics) };
  }

  const [baseline, latest] = await Promise.all([
    fetchBaselineAssessment(supabase, user.id),
    fetchLatestReassessment(supabase, user.id),
  ]);

  const metrics = buildComparison(baseline, latest);
  return { baseline, latest, metrics, summary: buildProgressSummary(metrics) };
}
