/**
 * Root Score System — snapshot persistence. The only file that reads or
 * writes root_score_snapshots. unique(member_id, local_date) on the table
 * means upsertSnapshot always writes exactly one row per member per day —
 * a same-day recalculation updates that row in place rather than
 * appending a duplicate, which is also what keeps listSnapshotHistory
 * naturally chart-ready with no rollup step.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RootScoreSnapshot } from '@mef/shared-types-contracts';
import type { CalculatedSnapshot } from './calculate';

const TABLE = 'root_score_snapshots';

export async function getSnapshotForDate(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string
): Promise<RootScoreSnapshot | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('member_id', memberId)
    .eq('local_date', localDate)
    .maybeSingle();

  if (error) {
    console.error('getSnapshotForDate failed', error);
    return null;
  }
  return data as RootScoreSnapshot | null;
}

export async function getLatestSnapshotBefore(
  supabase: SupabaseClient,
  memberId: string,
  beforeLocalDate: string
): Promise<RootScoreSnapshot | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('member_id', memberId)
    .lt('local_date', beforeLocalDate)
    .order('local_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('getLatestSnapshotBefore failed', error);
    return null;
  }
  return data as RootScoreSnapshot | null;
}

export async function countSnapshotsBefore(
  supabase: SupabaseClient,
  memberId: string,
  beforeLocalDate: string
): Promise<number> {
  const { count, error } = await supabase
    .from(TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('member_id', memberId)
    .lt('local_date', beforeLocalDate);

  if (error) {
    console.error('countSnapshotsBefore failed', error);
    return 0;
  }
  return count ?? 0;
}

export async function upsertSnapshot(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string,
  timezone: string,
  fields: CalculatedSnapshot
): Promise<RootScoreSnapshot | null> {
  const nowIso = new Date().toISOString();
  const row = {
    member_id: memberId,
    local_date: localDate,
    timezone,
    calculated_at: nowIso,
    updated_at: nowIso,
    ...fields,
  };

  const { data, error } = await supabase
    .from(TABLE)
    .upsert(row, { onConflict: 'member_id,local_date' })
    .select('*')
    .single();

  if (error) {
    console.error('upsertSnapshot failed', error);
    return null;
  }
  return data as RootScoreSnapshot;
}

/** Oldest-first — ready to hand straight to a trend chart. */
export async function listSnapshotHistory(
  supabase: SupabaseClient,
  memberId: string,
  days: number
): Promise<RootScoreSnapshot[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('member_id', memberId)
    .order('local_date', { ascending: false })
    .limit(days);

  if (error) {
    console.error('listSnapshotHistory failed', error);
    return [];
  }
  return ((data ?? []) as RootScoreSnapshot[]).reverse();
}
