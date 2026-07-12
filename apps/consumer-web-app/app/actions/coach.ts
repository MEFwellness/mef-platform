'use server';

import { createClient } from '@/lib/supabase/server';
import type { Profile, DailyCheckin } from '@mef/shared-types-contracts';

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
