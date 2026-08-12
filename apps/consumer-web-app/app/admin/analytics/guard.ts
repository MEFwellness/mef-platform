/**
 * The one access check for every admin analytics page.
 *
 * Same check the API surface uses. app/actions/analyticsAdmin.ts's
 * requireAdmin calls getCachedUser() and then hasActiveRole(supabase,
 * user.id, 'platform_administrator'); this calls exactly the same two
 * functions, against the same has_active_role database function the RLS
 * policies themselves use. A page and an action can therefore never
 * disagree about who is an administrator.
 *
 * The only difference is what happens on refusal: an action returns an
 * error result, a page redirects, because a redirect is the right answer
 * for someone who typed a URL. Neither is the security boundary. The real
 * boundaries are unchanged from Prompt 1 and still sit underneath every
 * number on these screens:
 *
 *   1. Every action called by these pages runs its own requireAdmin.
 *   2. Every analytics database function calls analytics_assert_admin()
 *      first, which raises 42501.
 *   3. Those functions are security invoker, so row level security still
 *      applies underneath.
 *
 * A signed-out visitor goes to /login. A signed-in member or coach goes to
 * /dashboard, exactly as app/admin/reset-plan-test-tools does, so nothing
 * about this section is discoverable by anyone who is not an administrator.
 */

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { hasActiveRole } from '@/lib/auth/guards';

export type AdminAnalyticsViewer = {
  userId: string;
  /** Only so the shared bottom navigation renders the same way it does everywhere else. */
  isCoach: boolean;
};

export async function requireAnalyticsAdmin(): Promise<AdminAnalyticsViewer> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const isAdmin = await hasActiveRole(supabase, user.id, 'platform_administrator');
  if (!isAdmin) redirect('/dashboard');

  const isCoach = await hasActiveRole(supabase, user.id, 'coach');
  return { userId: user.id, isCoach };
}
