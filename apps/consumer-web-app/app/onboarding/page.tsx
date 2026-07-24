import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { hasCompletedConsent } from '../actions/consent';
import {
  getOnboardingAssessmentBank,
  getOnboardingAssessmentBankForGuest,
} from '../actions/onboarding';
import { ConsentForm } from './ConsentForm';
import { OnboardingFlow } from './OnboardingFlow';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
const SHELL =
  'min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]';
const CONTAINER = 'mx-auto w-full max-w-md px-5 py-10 sm:px-6 md:max-w-2xl md:px-10';
const HEADING =
  'font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]';

function UnavailableNotice() {
  return (
    <div className={SHELL}>
      <main className={CONTAINER}>
        <h1 className={HEADING}>We&apos;ll be right with you</h1>
        <p className="mt-2 text-[15px] text-[#6B7A72]">
          Your onboarding assessment isn&apos;t available right now. Please try again in a few
          minutes, or contact support if this continues.
        </p>
      </main>
    </div>
  );
}

export default async function OnboardingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // No account required — a visitor can take the assessment before
  // signing up (middleware.ts's PUBLIC_PATHS exempts /onboarding for
  // exactly this). The question list is fetched via a service-role read
  // (getOnboardingAssessmentBankForGuest) since onboarding_questions' RLS
  // requires an authenticated session and this app has no anonymous auth.
  // Nothing is written to Postgres in this branch — OnboardingFlow's
  // guest mode stores answers in localStorage and only ever submits them
  // for real once the member signs in with a real account (see
  // OnboardingFlow.tsx's member-mode migration effect).
  if (!user) {
    const questions = await getOnboardingAssessmentBankForGuest();
    if (questions.length === 0) return <UnavailableNotice />;

    return (
      <div className={SHELL}>
        <main className={CONTAINER}>
          <OnboardingFlow questions={questions} mode="guest" />
        </main>
      </div>
    );
  }

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

  // Existence check, not .maybeSingle() — onboarding_submissions has no
  // unique constraint on user_id by design (lib/onboarding/baseline.ts),
  // so a future reassessment adding a second row here must never turn this
  // into a hard error. This only asks "has the member ever submitted."
  const { data: existing } = await supabase
    .from('onboarding_submissions')
    .select('id')
    .eq('user_id', user.id)
    .limit(1);

  if (existing && existing.length > 0) {
    return (
      <div className={SHELL}>
        <main className={CONTAINER}>
          <h1 className={HEADING}>Onboarding already complete</h1>
          <p className="mt-2 text-[15px] text-[#6B7A72]">
            Thanks — your onboarding assessment is on file. Head to{' '}
            <Link
              href="/checkin"
              className="font-medium text-[#6B7A72] underline underline-offset-2"
            >
              today&apos;s check-in
            </Link>{' '}
            or review your{' '}
            <Link
              href="/profile/baseline"
              className="font-medium text-[#6B7A72] underline underline-offset-2"
            >
              Baseline Assessment
            </Link>
            .
          </p>
        </main>
      </div>
    );
  }

  const questions = await getOnboardingAssessmentBank();

  // getOnboardingAssessmentBank() returns [] both on a real fetch error (logged
  // there) and if reference data is missing — a config problem, never
  // something the member can fix. Show a calm apology instead of an empty
  // form with a submit button that has nothing to submit.
  if (questions.length === 0) {
    return <UnavailableNotice />;
  }

  return (
    <div className={SHELL}>
      <main className={CONTAINER}>
        <OnboardingFlow questions={questions} mode="member" />
      </main>
    </div>
  );
}
