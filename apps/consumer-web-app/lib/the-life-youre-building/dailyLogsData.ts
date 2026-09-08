/**
 * The Life You're Building's experiment, on the existing daily log table.
 *
 * cvs_experiment_daily_logs (migration 134) was never Core Values Snapshot
 * specific: it is keyed by experiment_id and holds one row per calendar
 * day. Life Signal Check, the Readiness Pulse and all seven Happiness
 * templates before this one already reuse it as-is, and so does this. There
 * is no new table here and no new column, only the one lookup this
 * experience needs of its own, disambiguated by source_experience_key.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { TLYB_EXPERIENCE_KEY } from './constants';

export {
  listCvsDailyLogs as listTlybDailyLogs,
  upsertCvsDailyLog as upsertTlybDailyLog,
} from '../core-values-snapshot/dailyLogsData';

/** Her most recent The Life You're Building experiment, whatever its status. */
export async function findLatestTlybExperiment(
  supabase: SupabaseClient,
  memberId: string
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from('lifestyle_experiments')
    .select('id')
    .eq('member_id', memberId)
    .eq('source_experience_key', TLYB_EXPERIENCE_KEY)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return { id: data.id as string };
}
