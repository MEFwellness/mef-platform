/**
 * Database access for the Root Proactive Coaching Engine — same shape as
 * lib/timeline/data.ts and lib/feed/data.ts: pure functions taking a
 * SupabaseClient, RLS (migration 053) decides who may read/write what.
 * Every function here takes an explicit memberId rather than reading
 * auth.getUser() itself, so the same code path works both under a
 * member's own session (the on-demand generation path, called from
 * Dashboard/Today) and under the service-role client the daily cron uses
 * (app/api/cron/daily-coaching-scan) — exactly like lib/wearables/sync.ts
 * already does for syncWearableConnection.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DailyCheckin, Habit, MorningBrief } from '@mef/shared-types-contracts';
import type { ComposedMorningBrief } from './types';

export async function getMorningBrief(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string
): Promise<MorningBrief | null> {
  const { data, error } = await supabase
    .from('coach_morning_briefs')
    .select('*')
    .eq('member_id', memberId)
    .eq('local_date', localDate)
    .maybeSingle();

  if (error) {
    console.error('getMorningBrief failed', error);
    return null;
  }
  return data as MorningBrief | null;
}

export async function insertMorningBrief(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string,
  brief: ComposedMorningBrief
): Promise<MorningBrief | null> {
  const { data, error } = await supabase
    .from('coach_morning_briefs')
    .insert({
      member_id: memberId,
      local_date: localDate,
      greeting_name: brief.greetingName,
      focus_area: brief.focusArea,
      focus_label: brief.focusLabel,
      recovery_summary: brief.recoverySummary,
      sleep_summary: brief.sleepSummary,
      stress_summary: brief.stressSummary,
      habit_to_prioritize: brief.habitToPrioritize,
      coaching_recommendation: brief.coachingRecommendation,
      encouraging_message: brief.encouragingMessage,
      evidence_refs: brief.evidenceRefs,
    })
    .select('*')
    .single();

  if (error) {
    // unique(member_id, local_date): a concurrent request (or the cron
    // pre-warming while the member opened the app at the same moment)
    // already inserted today's brief — that row is just as correct as
    // the one this call would have written, so read it back instead of
    // surfacing a race as a user-facing error.
    if (error.code === '23505') {
      return getMorningBrief(supabase, memberId, localDate);
    }
    console.error('insertMorningBrief failed', error);
    return null;
  }
  return data as MorningBrief;
}

/** Mirrors app/actions/checkin.ts's getRecentCheckins, but for an explicit memberId so the cron (no per-member session) can call it too. */
export async function listRecentCheckinsForMember(
  supabase: SupabaseClient,
  memberId: string,
  asOfLocalDate: string,
  days = 30
): Promise<DailyCheckin[]> {
  const { data, error } = await supabase
    .from('daily_checkins_current')
    .select('*')
    .eq('user_id', memberId)
    .lte('local_date', asOfLocalDate)
    .order('local_date', { ascending: false })
    .limit(days);

  if (error) {
    console.error('listRecentCheckinsForMember failed', error);
    return [];
  }
  return (data as DailyCheckin[]).reverse(); // oldest first
}

/** Mirrors app/actions/checkin.ts's getActiveHabits, but for an explicit memberId. */
export async function listActiveHabitsForMember(
  supabase: SupabaseClient,
  memberId: string
): Promise<Habit[]> {
  const { data, error } = await supabase
    .from('habits')
    .select('*')
    .eq('user_id', memberId)
    .eq('active', true);

  if (error) {
    console.error('listActiveHabitsForMember failed', error);
    return [];
  }
  return data as Habit[];
}

/** Mirrors app/actions/checkin.ts's getHabitLogsForDate, but for an explicit memberId. */
export async function getHabitLogsForDateForMember(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string
): Promise<Record<string, boolean>> {
  const { data, error } = await supabase
    .from('habit_logs')
    .select('habit_id, completed')
    .eq('user_id', memberId)
    .eq('local_date', localDate);

  if (error) {
    console.error('getHabitLogsForDateForMember failed', error);
    return {};
  }
  return Object.fromEntries(
    (data as { habit_id: string; completed: boolean }[]).map((log) => [log.habit_id, log.completed])
  );
}
