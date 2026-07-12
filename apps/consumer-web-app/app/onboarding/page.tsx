import { createClient } from '@/lib/supabase/server';
import { hasCompletedConsent } from '../actions/consent';
import { getOnboardingQuestions } from '../actions/onboarding';
import { redirect } from 'next/navigation';
import { ConsentForm } from './ConsentForm';
import { OnboardingForm } from './OnboardingForm';

export default async function OnboardingPage() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const consented = await hasCompletedConsent(user.id);

  if (!consented) {
    return (
      <main>
        <h1>Before we start</h1>
        <p>Please review and accept the following before completing your assessment.</p>
        <ConsentForm />
      </main>
    );
  }

  const { data: existing } = await supabase
    .from('onboarding_submissions')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing) {
    return (
      <main>
        <h1>Onboarding already complete</h1>
        <p>
          Thanks — your onboarding assessment is on file. Head to{' '}
          <a href="/checkin">today&apos;s check-in</a>.
        </p>
      </main>
    );
  }

  const questions = await getOnboardingQuestions();

  return (
    <main>
      <h1>Onboarding assessment</h1>
      <OnboardingForm questions={questions} />
    </main>
  );
}
