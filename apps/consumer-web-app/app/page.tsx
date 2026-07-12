import { createClient } from '@/lib/supabase/server';
import { hasCompletedConsent } from './actions/consent';
import { hasActiveRole } from '@/lib/auth/guards';
import { redirect } from 'next/navigation';

/**
 * Pure routing hub, never rendered UI — every path below ends in a
 * redirect. This used to be an "internal dev build" placeholder page that
 * required a manual click through to reach a dashboard; every sign-in,
 * email-verify callback, and password-reset flow still converges here
 * first, so it stays the single place role-based post-login routing lives,
 * it just no longer shows anything itself.
 */
export default async function HomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const isCoach = await hasActiveRole(supabase, user.id, 'coach');
  if (isCoach) redirect('/coach');

  const isAdmin = await hasActiveRole(supabase, user.id, 'platform_administrator');
  if (isAdmin) redirect('/admin');

  // Member: preserve the existing consent -> onboarding -> dashboard
  // progression, just without ever rendering a landing page in between.
  const consented = await hasCompletedConsent(user.id);
  if (!consented) redirect('/onboarding');

  // Existence check, not .maybeSingle() — see app/onboarding/page.tsx for
  // why this can't assume at most one row once reassessments exist.
  const { data: submissions } = await supabase
    .from('onboarding_submissions')
    .select('id')
    .eq('user_id', user.id)
    .limit(1);
  if (!submissions || submissions.length === 0) redirect('/onboarding');

  redirect('/dashboard');
}
