import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getOnboardingQuestions } from '@/app/actions/onboarding';
import { ReassessmentFormShell } from './ReassessmentFormShell';

const SHELL =
  'min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]';
const CONTAINER = 'mx-auto w-full max-w-md px-5 py-10 sm:px-6 md:max-w-2xl md:px-10';
const HEADING =
  'font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]';

/**
 * Reuses the exact same OnboardingForm and question set as the original
 * /onboarding flow — same questions, same sliders, same required-answer
 * validation. The only difference is what happens after a successful
 * submit (ReassessmentFormShell navigates to the new entry instead of
 * re-rendering "already complete"). submit_onboarding() itself tags this
 * as a reassessment server-side (migration 25) since the member already
 * has a prior submission — this page never needs to say so explicitly.
 */
export default async function NewReassessmentPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: submissions } = await supabase
    .from('onboarding_submissions')
    .select('id')
    .eq('user_id', user.id)
    .limit(1);
  if (!submissions || submissions.length === 0) redirect('/onboarding');

  const questions = await getOnboardingQuestions();

  // Same config-error guard as /onboarding (app/onboarding/page.tsx) — an
  // empty question set is never something the member can fix.
  if (questions.length === 0) {
    return (
      <div className={SHELL}>
        <main className={CONTAINER}>
          <h1 className={HEADING}>We&apos;ll be right with you</h1>
          <p className="mt-2 text-[15px] text-[#6B7A72]">
            Your reassessment isn&apos;t available right now. Please try again in a few minutes,
            or contact support if this continues.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className={SHELL}>
      <main className={CONTAINER}>
        <h1 className={HEADING}>New reassessment</h1>
        <p className="mt-2 text-[15px] text-[#6B7A72]">
          The same questions as your baseline, so your answers can be compared side by side.
        </p>
        <div className="mt-6">
          <ReassessmentFormShell questions={questions} />
        </div>
      </main>
    </div>
  );
}
