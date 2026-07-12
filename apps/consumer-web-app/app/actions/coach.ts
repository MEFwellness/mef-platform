'use server';

import { createClient } from '@/lib/supabase/server';
import type { Profile, DailyCheckin, Habit, CoachNote } from '@mef/shared-types-contracts';
import type { ActionResult } from './auth';

/**
 * Reads only what coach_read_assigned_* RLS policies allow (migration 16).
 * If a coach's assignment is revoked between page loads, this simply
 * returns fewer rows on the next call — no cache to invalidate, because
 * there is no cache; every read goes through Postgres and its policies
 * directly.
 */
export async function listAssignedClients(): Promise<Profile[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: assignments, error: assignmentError } = await supabase
    .from('coach_client_assignments')
    .select('client_id')
    .eq('coach_id', user.id)
    .eq('status', 'active');

  if (assignmentError || !assignments || assignments.length === 0) return [];

  const clientIds = assignments.map((a) => a.client_id);
  const { data: profiles, error } = await supabase.from('profiles').select('*').in('id', clientIds);

  if (error) {
    console.error('listAssignedClients failed', error);
    return [];
  }
  return profiles as Profile[];
}

export async function getClientCheckins(clientId: string): Promise<DailyCheckin[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('daily_checkins_current')
    .select('*')
    .eq('user_id', clientId)
    .order('local_date', { ascending: false })
    .limit(14);

  // If this coach isn't actually assigned to clientId, RLS returns zero
  // rows here — not an error, just nothing. That's the deny-by-default
  // behavior working as intended.
  if (error) {
    console.error('getClientCheckins failed', error);
    return [];
  }
  return data as DailyCheckin[];
}

/** Same coach_read_assigned_habits RLS as everything else here — zero rows for an unassigned client. */
export async function getClientHabits(clientId: string): Promise<Habit[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('habits')
    .select('*')
    .eq('user_id', clientId)
    .eq('active', true);

  if (error) {
    console.error('getClientHabits failed', error);
    return [];
  }
  return data as Habit[];
}

/** Habit completion state for a single date, keyed by habit_id — mirrors getHabitLogsForDate in checkin.ts. */
export async function getClientHabitLogs(
  clientId: string,
  localDate: string
): Promise<Record<string, boolean>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('habit_logs')
    .select('habit_id, completed')
    .eq('user_id', clientId)
    .eq('local_date', localDate);

  if (error) {
    console.error('getClientHabitLogs failed', error);
    return {};
  }
  return Object.fromEntries(data.map((log) => [log.habit_id, log.completed]));
}

/**
 * Private coach notes — never visible to members. coach_notes has no
 * member-facing RLS policy at all (migration 23), so this is enforced by
 * Postgres even if this action layer had a bug; there's no policy path
 * that could ever let a member's session read this table.
 */
export async function getCoachNotes(clientId: string): Promise<CoachNote[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('coach_notes')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('getCoachNotes failed', error);
    return [];
  }
  return data as CoachNote[];
}

export async function addCoachNote(clientId: string, note: string): Promise<ActionResult> {
  const trimmed = note.trim();
  if (!trimmed) return { error: 'Note cannot be empty.' };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  // is_active_coach_for RLS check (migration 23) is what actually rejects
  // a note about a client this coach isn't assigned to — not this check.
  const { error } = await supabase
    .from('coach_notes')
    .insert({ coach_id: user.id, client_id: clientId, note: trimmed });

  if (error) return { error: error.message };
  return {};
}
