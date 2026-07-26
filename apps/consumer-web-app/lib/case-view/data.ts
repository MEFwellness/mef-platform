/**
 * Case View — database access. Pure functions taking a SupabaseClient,
 * RLS decides who may read/write what. The only genuinely new table
 * here is member_goal_progress_checkins (migration 107, requirement 5's
 * headline measure) — everything else in this module reads tables that
 * already exist, written by systems this feature never touches.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type GoalProgressCheckinRow = { localDate: string; rating: number };

export async function listGoalProgressCheckins(
  supabase: SupabaseClient,
  memberId: string
): Promise<GoalProgressCheckinRow[]> {
  const { data, error } = await supabase
    .from('member_goal_progress_checkins')
    .select('local_date, rating')
    .eq('member_id', memberId)
    .order('local_date', { ascending: true });

  if (error) {
    console.error('listGoalProgressCheckins failed', error);
    return [];
  }
  return (data as { local_date: string; rating: number }[]).map((row) => ({
    localDate: row.local_date,
    rating: row.rating,
  }));
}

export async function upsertGoalProgressCheckin(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string,
  rating: number
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('member_goal_progress_checkins').upsert(
    { member_id: memberId, local_date: localDate, rating },
    { onConflict: 'member_id,local_date' }
  );
  return { error: error?.message ?? null };
}
