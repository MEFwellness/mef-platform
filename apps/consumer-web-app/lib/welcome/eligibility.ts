import type { SupabaseClient } from '@supabase/supabase-js';
import { hasActiveRole } from '@/lib/auth/guards';

/**
 * Was kept false through Prompt 1 until the four-screen welcome interface
 * (app/welcome/WelcomeFlow.tsx) existed. Now that it does, this activates
 * the welcome route from the normal post-login routing hub (app/page.tsx)
 * for eligible members. Turning it back off (without touching anything
 * else) is the safe rollback if the interface ever needs to be pulled:
 * app/page.tsx's routing and app/welcome/page.tsx's own eligibility check
 * both key off this one constant.
 */
export const WELCOME_FLOW_ENABLED: boolean = true;

/**
 * True only for a signed-in member who should see the welcome flow: marked
 * eligible at signup (handle_new_user, migration 85), hasn't finished it,
 * and isn't a coach or administrator.
 *
 * Fails closed (false) on a missing profile, a query error, or an
 * ambiguous role. Callers must treat "false" as "send this user through
 * the existing normal routing," never as a reason to block access to
 * something they could already reach.
 */
export async function isEligibleForWelcomeFlow(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('welcome_flow_eligible, welcome_flow_completed_at')
    .eq('id', userId)
    .maybeSingle();

  if (error || !profile) return false;
  if (!profile.welcome_flow_eligible) return false;
  if (profile.welcome_flow_completed_at) return false;

  const [isCoach, isAdmin] = await Promise.all([
    hasActiveRole(supabase, userId, 'coach'),
    hasActiveRole(supabase, userId, 'platform_administrator'),
  ]);
  if (isCoach || isAdmin) return false;

  return true;
}
