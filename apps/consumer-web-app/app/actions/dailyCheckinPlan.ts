'use server';

/**
 * Server actions wiring the daily check-in to the adaptive picker
 * (lib/daily-checkin-adaptive/). Fixed core is never read from here — it
 * comes straight from the FIXED_CORE_QUESTION_KEYS constant the check-in
 * pages already import directly.
 */

import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { getTodaysCheckinPlan } from '@/lib/daily-checkin-adaptive/plan';
import { upsertProbeAnswer, listProbeAnswersForDate } from '@/lib/daily-checkin-adaptive/data';
import type { TodaysCheckinPlan } from '@/lib/daily-checkin-adaptive/types';
import type { ActionResult } from './auth';

export async function getTodaysCheckinPlanAction(localDate: string): Promise<TodaysCheckinPlan | null> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return null;

  return getTodaysCheckinPlan(supabase, user.id, localDate);
}

export async function submitProbeAnswerAction(
  localDate: string,
  questionKey: string,
  value: unknown
): Promise<ActionResult> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return { error: 'Not signed in.' };

  const { error } = await upsertProbeAnswer(supabase, user.id, localDate, questionKey, value);
  if (error) return { error };
  return {};
}

export async function getProbeAnswersForDateAction(localDate: string): Promise<Record<string, unknown>> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return {};

  const answers = await listProbeAnswersForDate(supabase, user.id, localDate);
  return Object.fromEntries(answers);
}
