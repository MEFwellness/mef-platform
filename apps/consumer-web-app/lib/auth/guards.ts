import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * IMPORTANT: these functions exist to redirect a signed-in-but-wrong-role
 * user to a sensible page (good UX). They are NOT the security boundary.
 * The actual boundary is the RLS policies in
 * supabase/migrations/00000000000016_rls_policies.sql, enforced by Postgres
 * regardless of what this file does or a bug in it. If this file returned
 * the wrong answer entirely, a member still could not read a coach's
 * assigned-client data — the database itself would refuse the query.
 *
 * Both calls below go through the same has_active_role() database function
 * the RLS policies use, via an RPC — so "UX check" and "real check" can
 * never silently disagree about what an active role grant means.
 */
export async function hasActiveRole(
  supabase: SupabaseClient,
  userId: string,
  role: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc('has_active_role', {
    p_user: userId,
    p_role: role
  });
  if (error) {
    console.error('hasActiveRole RPC failed', error);
    return false; // fail closed
  }
  return Boolean(data);
}
