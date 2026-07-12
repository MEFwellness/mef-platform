/**
 * apps/consumer-web-app/app/actions/checkin.ts
 *
 * Exports required by the dashboard: getTodaysCheckin, getRecentCheckins,
 * resolveLocalDate. Also included: submitDailyCheckin (used by the
 * check-in form) and the habit-log helpers, since they're part of the same
 * feature and don't cost anything to keep.
 */

'use server';

import { createClient } from '@/lib/supabase/server';
import type { DailyCheckinInput, DailyCheckin, Habit } from '@mef/shared-types-contracts';
import type { ActionResult } from './auth';

// ---- Time helpers ----

/**
 * Late-checkin grace window: a submission within 6 hours after local
 * midnight may target the previous local_date. Must be async — every
 * export from a 'use server' file has to be an async function in Next.js,
 * even one that doesn't await anything internally.
 */
export async function resolveLocalDate(
  nowInTz: Date,
  requestedYesterday: boolean
): Promise<string> {
  const hoursSinceMidnight = nowInTz.getHours() + nowInTz.getMinutes() / 60;
  const canLogYesterday = hoursSinceMidnight < 6;

  const target = new Date(nowInTz);
  if (requestedYesterday && canLogYesterday) {
    target.setDate(target.getDate() - 1);
  }
  return target.toISOString().slice(0, 10);
}

// ---- Check-in read/write ----

export async function submitDailyCheckin(input: DailyCheckinInput): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return { error: 'Not signed in.' };

  const { error } = await supabase.rpc('submit_daily_checkin', {
    p_timezone: input.timezone,
    p_local_date: input.local_date,
    p_mood_level: input.mood_level,
    p_sleep_quality: input.sleep_quality,
    p_sleep_duration: input.sleep_duration,
    p_energy_level: input.energy_level,
    p_stress_level: input.stress_level,
    p_water_cups: input.water_cups,
    p_digestion_rating: input.digestion_rating,
    p_pain_discomfort_level: input.pain_discomfort_level,
    p_movement_today: input.movement_today,
    p_new_or_worsening_concern: input.new_or_worsening_concern,
    p_optional_notes: input.optional_notes
  });

  if (error) return { error: error.message };
  return {};
}

/**
 * Today's check-in, reading from the daily_checkins_current view (the
 * highest checkin_version row per date), or null if nothing's been
 * submitted yet.
 */
export async function getTodaysCheckin(localDate: string): Promise<DailyCheckin | null> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('daily_checkins_current')
    .select('*')
    .eq('user_id', user.id)
    .eq('local_date', localDate)
    .maybeSingle();

  if (error) {
    console.error('getTodaysCheckin failed', error);
    return null;
  }
  return data as DailyCheckin | null;
}

/**
 * Last N days of check-ins, oldest first, for the dashboard trend chart.
 * Reads from daily_checkins_current so an edited day never shows up twice.
 */
export async function getRecentCheckins(days: number): Promise<DailyCheckin[]> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('daily_checkins_current')
    .select('*')
    .eq('user_id', user.id)
    .order('local_date', { ascending: false })
    .limit(days);

  if (error) {
    console.error('getRecentCheckins failed', error);
    return [];
  }
  return (data as DailyCheckin[]).reverse(); // oldest first, for left-to-right chart bars
}

// ---- Habits (used by the check-in form's habit checklist, if present) ----

export async function getActiveHabits(): Promise<Habit[]> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('habits')
    .select('*')
    .eq('user_id', user.id)
    .eq('active', true);

  if (error) {
    console.error('getActiveHabits failed', error);
    return [];
  }
  return data as Habit[];
}

export async function logHabitCompletion(
  habitId: string,
  localDate: string,
  timezone: string,
  completed: boolean
): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const { error } = await supabase
    .from('habit_logs')
    .upsert(
      { habit_id: habitId, user_id: user.id, local_date: localDate, timezone, completed },
      { onConflict: 'habit_id,local_date' }
    );

  if (error) return { error: error.message };
  return {};
}

/**
 * Habit completion state for a single date, keyed by habit_id — used to
 * prefill the check-in page's habit checklist so a revisit shows what's
 * already been logged today instead of resetting to unchecked.
 */
export async function getHabitLogsForDate(localDate: string): Promise<Record<string, boolean>> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return {};

  const { data, error } = await supabase
    .from('habit_logs')
    .select('habit_id, completed')
    .eq('user_id', user.id)
    .eq('local_date', localDate);

  if (error) {
    console.error('getHabitLogsForDate failed', error);
    return {};
  }
  return Object.fromEntries(data.map((log) => [log.habit_id, log.completed]));
}