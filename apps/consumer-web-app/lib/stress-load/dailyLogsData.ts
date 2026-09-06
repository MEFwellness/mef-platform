/**
 * The Stress & Load Deep-Dive's experiment, on the existing daily log
 * table.
 *
 * cvs_experiment_daily_logs (migration 134) was never Core Values Snapshot
 * specific: it is keyed by experiment_id and holds one row per calendar
 * day. Life Signal Check, the Readiness Pulse, Owning Your Value and Where
 * Your Joy Lives already reuse it as-is, and so does this. There is no new
 * table here, no new column and no migration.
 *
 * The "which experiment did this experience start" lookup is the shared
 * one in lib/lifestyle-experiments/data.ts rather than a fourth private
 * copy of the same query.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { findLatestExperimentByExperienceKey } from '@/lib/lifestyle-experiments';
import { STRESS_LOAD_EXPERIENCE_KEY } from './constants';

export {
  listCvsDailyLogs as listStressLoadDailyLogs,
  upsertCvsDailyLog as upsertStressLoadDailyLog,
} from '../core-values-snapshot/dailyLogsData';

/** Her most recent Stress & Load experiment, whatever its status. */
export async function findLatestStressLoadExperiment(
  supabase: SupabaseClient,
  memberId: string
): Promise<{ id: string } | null> {
  return findLatestExperimentByExperienceKey(supabase, memberId, STRESS_LOAD_EXPERIENCE_KEY);
}
