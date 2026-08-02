/**
 * Database access for Readiness Pulse's Weekly Experiment (both the
 * action-type experiments — Ready Now / Ready If It's Small — and the
 * noticing-type ones — Still Deciding's Daily Noticing / Not Yet's The
 * Noticing). Reuses cvs_experiment_daily_logs (migration 134) and its own
 * listCvsDailyLogs/upsertCvsDailyLog functions as-is, exactly the same
 * reuse Life Signal Check's own lib/life-signal-check/dailyLogsData.ts
 * already established — that table's schema was never actually Core
 * Values Snapshot-specific, only ever keyed by experiment_id. This file
 * only adds the lookups Readiness Pulse needs of its own, disambiguated
 * via source_experience_key = 'readiness-pulse' (migration 138's own
 * column, unconstrained free text).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export { listCvsDailyLogs as listRplDailyLogs, upsertCvsDailyLog as upsertRplDailyLog } from '../core-values-snapshot/dailyLogsData';

export async function findLatestRplExperiment(
  supabase: SupabaseClient,
  memberId: string
): Promise<{ id: string; sourceSessionId: string | null } | null> {
  const { data, error } = await supabase
    .from('lifestyle_experiments')
    .select('id, source_session_id')
    .eq('member_id', memberId)
    .eq('source_experience_key', 'readiness-pulse')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return { id: data.id as string, sourceSessionId: (data.source_session_id as string | null) ?? null };
}

export async function findRplExperimentBySessionId(supabase: SupabaseClient, sessionId: string): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from('lifestyle_experiments')
    .select('id')
    .eq('source_session_id', sessionId)
    .eq('source_experience_key', 'readiness-pulse')
    .maybeSingle();

  if (error || !data) return null;
  return { id: data.id as string };
}

/** Life Signal Check's own most recent experiment (regardless of who reads it) — used only by Readiness Pulse's Evidence Echo eligibility check (getEvidenceEchoContext in app/actions/readinessPulse.ts), which looks specifically at her Life Signal Check experiment per the build brief ("by Conversation 3 her Life Signal Check experiment has plausibly finished"), not at any Readiness Pulse experiment of her own. */
export async function findLatestLscExperimentForEcho(
  supabase: SupabaseClient,
  memberId: string
): Promise<{ id: string; title: string; startDate: string; durationDays: number; status: string } | null> {
  const { data, error } = await supabase
    .from('lifestyle_experiments')
    .select('id, title, start_date, duration_days, status')
    .eq('member_id', memberId)
    .eq('source_experience_key', 'life-signal-check')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return {
    id: data.id as string,
    title: data.title as string,
    startDate: data.start_date as string,
    durationDays: data.duration_days as number,
    status: data.status as string,
  };
}
