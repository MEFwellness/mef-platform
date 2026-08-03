import type { SupabaseClient, User } from '@supabase/supabase-js';
import { hasCompletedConsent } from '@/app/actions/consent';
import { hasActiveRole } from '@/lib/auth/guards';
import { WELCOME_FLOW_ENABLED, isEligibleForWelcomeFlow } from '@/lib/welcome/eligibility';

/**
 * The exact role/consent/onboarding routing decision app/page.tsx's
 * HomePage has always made, pulled out into its own function so
 * app/actions/auth.ts's signIn() can also call it — signIn() previously
 * always redirected to '/' and let HomePage resolve the real destination
 * as a *second*, separate request. That extra hop is invisible to a
 * member (both happen before anything renders) but broke two things this
 * build needed: it's what caused the branded entry animation's
 * session-entry cookie (lib/entry-animation/rule.ts) to sometimes get
 * decided twice for what was really one login, and it's why a deep link a
 * signed-out member followed (middleware.ts's `redirectedFrom` query
 * param) was never actually honored — signIn() had no way to know about
 * it once it committed to redirecting to '/' unconditionally.
 *
 * Returns a path, never redirects itself, so both call sites keep full
 * control over *when* the redirect happens (signIn() needs to set a
 * cookie first).
 */
export async function resolvePostLoginPath(supabase: SupabaseClient, user: User): Promise<string> {
  const isCoach = await hasActiveRole(supabase, user.id, 'coach');
  if (isCoach) return '/coach';

  const isAdmin = await hasActiveRole(supabase, user.id, 'platform_administrator');
  if (isAdmin) return '/admin';

  if (WELCOME_FLOW_ENABLED) {
    const eligibleForWelcome = await isEligibleForWelcomeFlow(supabase, user.id);
    if (eligibleForWelcome) return '/welcome';
  }

  const consented = await hasCompletedConsent(user.id);
  if (!consented) return '/onboarding';

  // Existence check, not .maybeSingle() — see app/onboarding/page.tsx for
  // why this can't assume at most one row once reassessments exist.
  const { data: submissions } = await supabase
    .from('onboarding_submissions')
    .select('id')
    .eq('user_id', user.id)
    .limit(1);
  if (!submissions || submissions.length === 0) return '/onboarding';

  return '/dashboard';
}

/**
 * Whether a `redirectedFrom` value (middleware.ts's own query param, or
 * the login form's hidden field carrying it through the POST) is safe to
 * redirect to directly: same-origin-relative and not pointing back into
 * the auth flow itself (which would either loop or discard the "you just
 * signed in" state). Deliberately conservative — this is the one place a
 * value from a query string influences where an authenticated redirect
 * goes, so it must never accept a protocol-relative or absolute URL
 * (open-redirect risk).
 */
export function isSafePostLoginRedirect(path: string | null | undefined): path is string {
  if (!path) return false;
  if (!path.startsWith('/') || path.startsWith('//')) return false;
  const disallowed = ['/login', '/signup', '/verify', '/reset-password'];
  return !disallowed.some((prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`));
}
