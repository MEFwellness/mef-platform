'use server';

import { createClient } from '@/lib/supabase/server';
import { hasCompletedConsent } from './consent';
import type { OnboardingAnswerInput, OnboardingQuestion } from '@mef/shared-types-contracts';
import type { ActionResult } from './auth';

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

  const { error } = await supabase.rpc('submit_onboarding', {
    p_assessment_version: ASSESSMENT_VERSION,
    p_timezone: timezone,
    p_raw_payload: rawPayload,
    p_answers: answers,
  });

  if (error) return { error: error.message };
  return {};
}
