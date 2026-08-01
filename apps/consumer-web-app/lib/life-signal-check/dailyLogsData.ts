/**
 * Database access for Life Signal Check's Weekly Experiment. Reuses
 * cvs_experiment_daily_logs (migration 134) and its own
 * listCvsDailyLogs/upsertCvsDailyLog functions as-is — that table's
 * schema was never actually Core Values Snapshot-specific (just its
 * name), only ever keyed by experiment_id, so there is nothing here to
 * duplicate. This file only adds the two lookups Life Signal Check needs
 * of its own: which lifestyle_experiments row is "the" current one for
 * this experience, disambiguated from any other non-Recommendation-Engine
 * experience (today, Core Values Snapshot) via source_experience_key
 * (migration 138) — same shape as
 * lib/core-values-snapshot/dailyLogsData.ts's own findLatestCvsExperiment.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export { listCvsDailyLogs as listLscDailyLogs, upsertCvsDailyLog as upsertLscDailyLog } from '../core-values-snapshot/dailyLogsData';

export async function findLatestLscExperiment(
  supabase: SupabaseClient,
  memberId: string
): Promise<{ id: string; sourceSessionId: string | null } | null> {
  const { data, error } = await supabase
    .from('lifestyle_experiments')
    .select('id, source_session_id')
    .eq('member_id', memberId)
    .eq('source_experience_key', 'life-signal-check')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return { id: data.id as string, sourceSessionId: (data.source_session_id as string | null) ?? null };
}

export async function findLscExperimentBySessionId(
  supabase: SupabaseClient,
  sessionId: string
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from('lifestyle_experiments')
    .select('id')
    .eq('source_session_id', sessionId)
    .eq('source_experience_key', 'life-signal-check')
    .maybeSingle();

  if (error || !data) return null;
  return { id: data.id as string };
}
