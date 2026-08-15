import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { hasActiveRole } from './guards';
import { requestCache } from '@/lib/reactRequestCache';
import type { StaffRoles } from './staffRouting';

/**
 * The one place a server component asks "which staff roles does this
 * request hold", so the coach and admin layouts (app/coach/layout.tsx,
 * app/admin/layout.tsx) can render the right navigation without every
 * page underneath them repeating the same two lookups.
 *
 * Before this existed, each admin page did its own
 * `hasActiveRole(supabase, user.id, 'coach')` purely to hand the answer to
 * the bottom navigation. An administrator who was not also a coach got
 * `false`, and `false` meant "render the full member bar", which is
 * exactly how the member navigation (Home, Food Lens, Check-In, Progress,
 * Today) ended up sitting underneath the admin screens, offering an
 * administrator five doors into the member experience. The chrome decision
 * now lives in a layout that knows both roles, not in a page that only
 * ever looked up one of them.
 *
 * Request-memoized for the same reason getCachedUser() is: a single admin
 * page load resolves the layout, the page, and the actions the page calls,
 * and all of them would otherwise repeat the same has_active_role RPC.
 *
 * NOT AN AUTHORIZATION BOUNDARY, like everything else in lib/auth: this
 * decides which navigation bar is drawn. middleware.ts turns away the
 * wrong role before any of these routes render, and the RLS policies
 * decide what any of these accounts may actually read. Both roles fail
 * closed to false (see hasActiveRole), so a broken lookup renders the
 * member experience rather than granting staff chrome to anyone.
 */
export const getStaffRoles = requestCache(async (): Promise<StaffRoles> => {
  const user = await getCachedUser();
  if (!user) return { isCoach: false, isAdmin: false };

  const supabase = createClient();
  const [isCoach, isAdmin] = await Promise.all([
    hasActiveRole(supabase, user.id, 'coach'),
    hasActiveRole(supabase, user.id, 'platform_administrator'),
  ]);
  return { isCoach, isAdmin };
});
