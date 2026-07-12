'use server';

import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from './auth';
import type { CoachClientAssignment, Profile } from '@mef/shared-types-contracts';

/**
 * Every function here relies on the platform_admin_all_* RLS policies
 * (migration 16). A non-admin calling these gets a Postgres-level rejection
 * on the underlying insert/update inside the RPC functions — there is no
 * separate "is this user an admin" check duplicated here that could drift
 * from the database's own answer.
 */

export async function listUsers(): Promise<Profile[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from('profiles').select('*').order('created_at');
  if (error) {
    console.error('listUsers failed — likely not platform_administrator', error);
    return [];
  }
  return data as Profile[];
}

export async function grantCoachRole(targetUserId: string): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase.rpc('grant_coach_role', { p_target_user: targetUserId });
  if (error) return { error: error.message };
  return {};
}

export async function revokeCoachRole(targetUserId: string): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase.rpc('revoke_coach_role', { p_target_user: targetUserId });
  if (error) return { error: error.message };
  return {};
}

export async function assignClientToCoach(
  coachId: string,
  clientId: string
): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase.rpc('assign_client_to_coach', {
    p_coach_id: coachId,
    p_client_id: clientId
  });
  if (error) return { error: error.message };
  return {};
}

export async function revokeAssignment(
  assignmentId: string,
  reason: string
): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase.rpc('revoke_assignment', {
    p_assignment_id: assignmentId,
    p_reason: reason
  });
  if (error) return { error: error.message };
  return {};
}

/**
 * User IDs currently holding an active (non-revoked) coach grant — used by
 * the admin UI to decide whether to show "Grant coach" or "Revoke coach"
 * for each user. listUsers() alone doesn't carry role info.
 */
export async function listActiveCoachUserIds(): Promise<string[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role', 'coach')
    .is('revoked_at', null);

  if (error) {
    console.error('listActiveCoachUserIds failed', error);
    return [];
  }
  return data.map((row) => row.user_id);
}

export async function listAssignmentHistory(): Promise<CoachClientAssignment[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('coach_client_assignments')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('listAssignmentHistory failed', error);
    return [];
  }
  return data as CoachClientAssignment[];
}
