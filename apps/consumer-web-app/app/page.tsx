import { createClient } from '@/lib/supabase/server';
import { hasCompletedConsent } from './actions/consent';
import { signOut } from './actions/auth';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export default async function HomePage() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

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
          <Link href="/checkin">Go to today's check-in →</Link>
        </p>
      )}

      <form action={signOut}>
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
