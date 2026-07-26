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
import {
  upsertProbeAnswer,
  listProbeAnswersForDate,
  listActiveDriverProbeQuestions,
} from '@/lib/daily-checkin-adaptive/data';
import type { DriverProbeQuestion, ProbeScreen, TodaysCheckinPlan } from '@/lib/daily-checkin-adaptive/types';
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

/**
 * Every active local-follow-up row (driver_id null — e.g.
 * checkin_probe.what_kept_you_up) for one check-in screen. These are
 * never part of a day's rotating plan (probeBank.ts excludes null
 * driver_id from the bank entirely) — a local follow-up's visibility is
 * decided client-side, live, against whatever the member has already
 * answered in the current check-in (see
 * lib/daily-checkin-adaptive/localFollowUps.ts), so the form needs the
 * full row list up front rather than a daily-selected subset.
 */
export async function getLocalFollowUpQuestionsAction(screen: ProbeScreen): Promise<DriverProbeQuestion[]> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return [];

  const questions = await listActiveDriverProbeQuestions(supabase);
  return questions.filter((q) => q.driverId === null && q.screen === screen);
}
