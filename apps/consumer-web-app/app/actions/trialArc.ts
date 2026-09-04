/**
 * THE ONLY THING IN THIS APPLICATION THAT WRITES trial_arc_suppressed_at.
 *
 * One column, one door, one direction. This action can silence the trial
 * arc for one account, and it can un-silence it. It cannot grant access,
 * cannot move a trial date, cannot change a tier, and cannot turn the arc
 * ON for an account the eligibility rules already refused: clearing the
 * stamp only removes a reason to say no, and all six rules in
 * lib/trial-arc/eligibility.ts still have to pass on their own afterwards.
 *
 * ADMIN ONLY, FOUR TIMES OVER, exactly as app/actions/memberAccess.ts is:
 *
 *   1. requireAdmin here, through the same hasActiveRole check the RLS
 *      policies themselves call.
 *   2. member_access_assert_admin() inside admin_set_trial_arc_suppression,
 *      which does not exempt the service role.
 *   3. The platform_admin_all_member_subscriptions RLS policy, which is the
 *      only write policy that table has ever had.
 *   4. middleware.ts, which checks the role on every /admin path before the
 *      screen this is called from renders at all.
 *
 * NO MEMBER-FACING PATH REACHES THIS FILE, and it is not a convention:
 * tests/trial-arc-suppression-guard.test.ts reads the source and fails the
 * build if the RPC or the column is named anywhere outside this file and
 * the two read-only modules that derive from it.
 */

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { hasActiveRole } from '@/lib/auth/guards';

export type TrialArcActionResult = { ok: true } | { ok: false; error: string };

/**
 * Suppress the arc for this member, or lift the suppression.
 *
 * The panel refreshes and re-reads afterwards rather than holding an
 * optimistic guess, for the same reason the access controls beside it do:
 * on a screen whose job is deciding what somebody is sent, showing a
 * hopeful state would be the wrong trade.
 */
export async function setTrialArcSuppressionAction(
  memberId: string,
  suppressed: boolean
): Promise<TrialArcActionResult> {
  if (typeof memberId !== 'string' || memberId.length === 0) {
    return { ok: false, error: 'No member named.' };
  }
  if (typeof suppressed !== 'boolean') {
    return { ok: false, error: 'Say whether the trial arc is suppressed or not.' };
  }

  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Not signed in.' };
  if (!(await hasActiveRole(supabase, user.id, 'platform_administrator'))) {
    return { ok: false, error: 'Admin access required.' };
  }

  const { error } = await supabase.rpc('admin_set_trial_arc_suppression', {
    p_member_id: memberId,
    p_suppressed: suppressed,
  });
  if (error) {
    console.error('setTrialArcSuppressionAction failed', error);
    return { ok: false, error: 'That change could not be saved. Please try again.' };
  }

  revalidatePath('/admin/access');
  return { ok: true };
}
