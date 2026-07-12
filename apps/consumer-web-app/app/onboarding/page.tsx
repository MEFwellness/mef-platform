import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { hasCompletedConsent } from '../actions/consent';
import { getOnboardingQuestions } from '../actions/onboarding';
import { redirect } from 'next/navigation';
import { ConsentForm } from './ConsentForm';
import { OnboardingForm } from './OnboardingForm';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
const SHELL = 'min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]';
const CONTAINER = 'mx-auto w-full max-w-md px-5 py-10 sm:px-6 md:max-w-2xl md:px-10';
const HEADING = 'font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]';

export default async function OnboardingPage() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const consented = await hasCompletedConsent(user.id);

  if (!consented) {
    return (
      <div className={SHELL}>
        <main className={CONTAINER}>
          <h1 className={HEADING}>Before we start</h1>
          <p className="mt-2 text-[15px] text-[#6B7A72]">
            Please review and accept the following before completing your assessment.
          </p>
          <div className={`${CARD} mt-6 p-6`}>
            <ConsentForm />
          </div>
        </main>
      </div>
    );
  }

  const { data: existing } = await supabase
    .from('onboarding_submissions')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing) {
    return (
      <div className={SHELL}>
        <main className={CONTAINER}>
          <h1 className={HEADING}>Onboarding already complete</h1>
          <p className="mt-2 text-[15px] text-[#6B7A72]">
            Thanks — your onboarding assessment is on file. Head to{' '}
            <Link href="/checkin" className="font-medium text-[#854D0E] underline underline-offset-2">
              today&apos;s check-in
            </Link>
            .
          </p>
        </main>
      </div>
    );
  }

  const questions = await getOnboardingQuestions();

  return (
    <div className={SHELL}>
      <main className={CONTAINER}>
        <h1 className={HEADING}>Onboarding assessment</h1>
        <p className="mt-2 text-[15px] text-[#6B7A72]">
          A few questions so your coach can understand where you&apos;re starting from.
        </p>
        <div className="mt-6">
          <OnboardingForm questions={questions} />
        </div>
      </main>
    </div>
  );
}
