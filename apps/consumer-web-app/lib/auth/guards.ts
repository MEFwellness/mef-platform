import type { SupabaseClient } from '@supabase/supabase-js';
import { requestCache } from '../reactRequestCache';

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
/**
 * ASKED ONCE PER REQUEST (performance and stability audit, 2026-09-06).
 *
 * A trace of one real Home render counted six separate `has_active_role`
 * round trips for the same member and the same two roles: the page asks,
 * the bottom bar asks, the coach launcher asks, several cards ask. The
 * answer cannot change in the middle of one render, so this is memoized on
 * (client, member, role) the way every other hot reader in this app is —
 * `createClient` returns one instance per request, which is what makes the
 * key stable (see lib/supabase/server.ts).
 *
 * It also matters beyond its own six round trips: an RPC is a POST, and
 * lib/supabase/readOnce.ts throws away every read this request has
 * remembered whenever it sees one, because some RPCs genuinely write. Six
 * repeats of a pure read were emptying that map six times.
 *
 * SCOPED TO ONE REQUEST, NEVER LONGER, so a grant or a revoke is in force
 * on the very next request. The one call site that changes a grant
 * (app/actions/admin.ts) redirects afterwards, so nothing reads a role it
 * has just changed within the same request.
 */
export const hasActiveRole = requestCache(async function hasActiveRole(
  supabase: SupabaseClient,
  userId: string,
  role: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc('has_active_role', {
    p_user: userId,
    p_role: role,
  });
  if (error) {
    console.error('hasActiveRole RPC failed', error);
    return false; // fail closed
  }
  return Boolean(data);
});
