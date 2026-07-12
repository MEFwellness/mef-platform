import { createClient } from '@/lib/supabase/server';
import { hasCompletedConsent } from './actions/consent';
import { signOut } from './actions/auth';
import { hasActiveRole } from '@/lib/auth/guards';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export default async function HomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Every sign-in, email-verify callback, and password-reset flow converges
  // here before landing anywhere else. Coaches never have consent/onboarding
  // rows (they're not a member), so without this check every coach login
  // fell straight into the member-only branches below and saw nothing but
  // "Complete consent and onboarding" — there was no coach path at all.
  const isCoach = await hasActiveRole(supabase, user.id, 'coach');
  if (isCoach) redirect('/coach');

  const consented = await hasCompletedConsent(user.id);
  const { data: submission } = await supabase
    .from('onboarding_submissions')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  return (
    <main>
      <h1>MEF Wellness — internal dev build</h1>
      <p>Signed in as {user.email}</p>

      {!consented && (
        <p>
          <Link href="/onboarding">Complete consent and onboarding →</Link>
        </p>
      )}
      {consented && !submission && (
        <p>
          <Link href="/onboarding">Complete your onboarding assessment →</Link>
        </p>
      )}
      {consented && submission && (
        <p>
          <Link href="/dashboard">Go to your dashboard →</Link>
        </p>
      )}

      <form action={signOut}>
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
