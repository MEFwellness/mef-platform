/**
 * Personal Reset Plan — server-side entitlement gate. Same fail-closed
 * shape as lib/welcome/eligibility.ts's isEligibleForWelcomeFlow: a
 * missing profile, a query error, or a null grant timestamp all resolve
 * to false. Callers must treat false as "route this member away from the
 * experience," never as a reason to trust client-side state instead.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export async function hasResetPlanAccess(supabase: SupabaseClient, memberId: string): Promise<boolean> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('reset_plan_granted_at')
    .eq('id', memberId)
    .maybeSingle();

  if (error || !profile) return false;
  return profile.reset_plan_granted_at != null;
}
