/**
 * Database access for cvs_experiment_daily_logs (migration 134) — the
 * Weekly Experiment's daily Yes/Not-today taps and day-3 check-in
 * response. Same pure-functions-take-a-SupabaseClient, RLS-is-the-
 * boundary shape as lib/lifestyle-experiments/data.ts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CvsDailyLogRow, Day3Response } from './experiment';

type Row = {
  local_date: string;
  completed: boolean | null;
  day3_response: string | null;
};

function fromRow(row: Row): CvsDailyLogRow {
  return {
    localDate: row.local_date,
    completed: row.completed,
    day3Response: (row.day3_response as Day3Response | null) ?? null,
  };
}

export async function listCvsDailyLogs(
  supabase: SupabaseClient,
  experimentId: string
): Promise<CvsDailyLogRow[]> {
  const { data, error } = await supabase
    .from('cvs_experiment_daily_logs')
    .select('local_date, completed, day3_response')
    .eq('experiment_id', experimentId)
    .order('local_date', { ascending: true });

  if (error) {
    console.error('listCvsDailyLogs failed', error);
    return [];
  }
  return (data as Row[]).map(fromRow);
}

/** Upserts one calendar day's row — the evening tap and the day-3 response both land here, whichever comes first for that date. */
export async function upsertCvsDailyLog(
  supabase: SupabaseClient,
  memberId: string,
  experimentId: string,
  localDate: string,
  patch: { completed?: boolean; day3Response?: Day3Response }
): Promise<boolean> {
  const { data: existing } = await supabase
    .from('cvs_experiment_daily_logs')
    .select('completed, day3_response')
    .eq('experiment_id', experimentId)
    .eq('local_date', localDate)
    .maybeSingle();

  const { error } = await supabase.from('cvs_experiment_daily_logs').upsert(
    {
      member_id: memberId,
      experiment_id: experimentId,
      local_date: localDate,
      completed: patch.completed ?? existing?.completed ?? null,
      day3_response: patch.day3Response ?? existing?.day3_response ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'experiment_id,local_date' }
  );

  if (error) {
    console.error('upsertCvsDailyLog failed', error);
    return false;
  }
  return true;
}

/** The member's most recent Core Values Snapshot-sourced experiment, disambiguated from any other non-Recommendation-Engine experience (today, Life Signal Check) via source_experience_key (migration 138) rather than the old "recommendation_id is null" heuristic, which could no longer tell the two apart once a second such experience existed. */
export async function findLatestCvsExperiment(
  supabase: SupabaseClient,
  memberId: string
): Promise<{ id: string; sourceSessionId: string | null } | null> {
  const { data, error } = await supabase
    .from('lifestyle_experiments')
    .select('id, source_session_id')
    .eq('member_id', memberId)
    .eq('source_experience_key', 'core-values-snapshot')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return { id: data.id as string, sourceSessionId: (data.source_session_id as string | null) ?? null };
}

export async function findCvsExperimentBySessionId(
  supabase: SupabaseClient,
  sessionId: string
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from('lifestyle_experiments')
    .select('id')
    .eq('source_session_id', sessionId)
    .maybeSingle();

  if (error || !data) return null;
  return { id: data.id as string };
}
