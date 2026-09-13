import type { SupabaseClient, User } from '@supabase/supabase-js';
import { hasCompletedConsent } from '@/app/actions/consent';
import { hasActiveRole } from '@/lib/auth/guards';
import { WELCOME_FLOW_ENABLED, welcomeFlowEligibleFrom } from '@/lib/welcome/eligibility';

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
  /**
   * ASKED ALL AT ONCE, NOT ONE AFTER THE OTHER (2026-09-13).
   *
   * This function used to make six database round trips strictly in
   * sequence for one sign-in: coach, administrator, the display name, the
   * welcome columns of the SAME profiles row, consent, and onboarding. A
   * member on a slow connection paid all six end to end while the button
   * said "Logging in", which is the delay reported on the live site.
   *
   * The decisions are unchanged, in the same order and with the same
   * precedence. Only the asking is overlapped: the three answers needed to
   * make the first three decisions are asked together, and the two needed
   * for the last two are asked together. Reading a row we may not end up
   * using costs nothing a member can feel; asking for it only after the
   * previous answer came back costs her a round trip every time.
   */
  const [isCoach, isAdmin, profileResult] = await Promise.all([
    hasActiveRole(supabase, user.id, 'coach'),
    hasActiveRole(supabase, user.id, 'platform_administrator'),
    supabase
      .from('profiles')
      .select('display_name, welcome_flow_eligible, welcome_flow_completed_at')
      .eq('id', user.id)
      .maybeSingle(),
  ]);

  if (isCoach) return '/coach';
  if (isAdmin) return '/admin';

  const profile = profileResult.data;

  // FIX 1 (2026-08-03) — no member should ever reach the home greeting
  // with no name on file (it used to fall back to the literal word
  // "there"). A brand-new member is already asked at /name via the auth
  // callback (app/api/auth/callback/route.ts) before this function is
  // ever reached; this catches every existing account that predates that
  // step, with the same one-time, non-skippable screen. /name's own guard
  // (app/name/page.tsx) redirects straight past this the instant
  // display_name is set, so this never fires more than once per member.
  if (!profile?.display_name) return '/name';

  if (WELCOME_FLOW_ENABLED && welcomeFlowEligibleFrom(profile, { isCoach, isAdmin })) {
    return '/welcome';
  }

  // Existence check, not .maybeSingle() — see app/onboarding/page.tsx for
  // why this can't assume at most one row once reassessments exist.
  const [consented, submissionsResult] = await Promise.all([
    hasCompletedConsent(user.id),
    supabase.from('onboarding_submissions').select('id').eq('user_id', user.id).limit(1),
  ]);
  if (!consented) return '/onboarding';
  const submissions = submissionsResult.data;
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
