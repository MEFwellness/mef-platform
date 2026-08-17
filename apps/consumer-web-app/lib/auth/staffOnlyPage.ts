/**
 * The server-side half of the internal-movement-tool gate.
 *
 * middleware.ts already redirects a member away from /exercises and
 * /movement/profile (lib/auth/staffRouting.ts). This is the second line,
 * inside the page itself, for the same reason lib/auth/guards.ts exists
 * alongside RLS: a routing rule that lives in exactly one place is a
 * routing rule one config change away from being skipped, and these pages
 * sit outside the /coach and /admin route groups whose layouts would
 * otherwise carry the decision.
 *
 * Fails towards the member: hasActiveRole() returns false on a failed RPC
 * (see getStaffRoles), and false here means redirect. A coach caught by a
 * broken lookup lands on the Movement screen for one request; a member
 * never lands on an internal tool.
 */

import { redirect } from 'next/navigation';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { getStaffRoles } from './staffRoles';
import { MEMBER_FALLBACK_PATH, type StaffRoles } from './staffRouting';

/** Redirects anyone who is not a coach or an administrator, and returns both role booleans so the caller can draw the right staff navigation. */
export async function requireStaffForInternalTool(): Promise<StaffRoles> {
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const roles = await getStaffRoles();
  if (!roles.isCoach && !roles.isAdmin) redirect(MEMBER_FALLBACK_PATH);

  return roles;
}
