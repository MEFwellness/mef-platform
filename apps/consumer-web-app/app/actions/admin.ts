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

/**
 * A FILTERED LIST SAYS SO (2026-08-29).
 *
 * These two reads hide seeded QA fixtures, which is right: an admin's
 * "every user" view must never count a fixture as a real member. What was
 * wrong is that they hid them in silence. An administrator looking for an
 * account he knew existed found a list that did not contain it and a screen
 * that offered no reason, no count and no way to look. That reads as a lost
 * member, not as a filter doing its job, and the difference matters most on
 * exactly the screen where you go to check whether somebody signed up.
 *
 * So both reads now return what they removed alongside what they kept, and
 * both take the same `includeTest` switch `/admin/access` has always had.
 * The filtering itself is unchanged.
 *
 * One query, partitioned here rather than two queries with two WHERE
 * clauses, so the count of hidden rows and the rows shown can never
 * disagree about the same instant.
 */
export interface AdminUserList {
  /** The accounts the screen renders, oldest first. */
  users: Profile[];
  /** How many accounts the filter removed. Always 0 when includeTest is true. */
  hiddenTestCount: number;
}

export async function listUsers(includeTest = false): Promise<AdminUserList> {
  const supabase = createClient();
  const { data, error } = await supabase.from('profiles').select('*').order('created_at');
  if (error) {
    console.error('listUsers failed — likely not platform_administrator', error);
    return { users: [], hiddenTestCount: 0 };
  }
  const all = (data ?? []) as Profile[];
  if (includeTest) return { users: all, hiddenTestCount: 0 };
  const users = all.filter((profile) => !profile.is_test);
  return { users, hiddenTestCount: all.length - users.length };
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
    p_client_id: clientId,
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
    p_reason: reason,
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

/**
 * Assignment history, under the same switch and the same honesty rule as
 * listUsers above: a pairing touching a fixture on either side is hidden by
 * default, and the screen is told how many were hidden rather than being
 * handed a shorter list with no explanation.
 */
export interface AdminAssignmentList {
  assignments: CoachClientAssignment[];
  /** Pairings removed because a fixture stood on one side or the other. */
  hiddenTestCount: number;
}

export async function listAssignmentHistory(includeTest = false): Promise<AdminAssignmentList> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('coach_client_assignments')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('listAssignmentHistory failed', error);
    return { assignments: [], hiddenTestCount: 0 };
  }
  const all = (data ?? []) as CoachClientAssignment[];
  if (includeTest) return { assignments: all, hiddenTestCount: 0 };

  const { data: testProfiles, error: testError } = await supabase
    .from('profiles')
    .select('id')
    .eq('is_test', true);
  if (testError) {
    // Fail towards showing, the same way lib/staff/testAccounts.ts does:
    // an unreadable profile list is not evidence that anybody is a fixture,
    // and hiding a real pairing is the worse of the two mistakes.
    console.error('listAssignmentHistory could not read test accounts', testError);
    return { assignments: all, hiddenTestCount: 0 };
  }
  const testIds = new Set((testProfiles ?? []).map((profile) => profile.id as string));
  const assignments = all.filter((a) => !testIds.has(a.coach_id) && !testIds.has(a.client_id));
  return { assignments, hiddenTestCount: all.length - assignments.length };
}
