'use client';

import { useRouter } from 'next/navigation';
import { OnboardingForm } from '@/app/onboarding/OnboardingForm';
import type { OnboardingQuestion } from '@mef/shared-types-contracts';

/**
 * Thin client wrapper — OnboardingForm's onSubmitted callback can't be
 * passed directly from the server-component page (functions aren't
 * serializable across that boundary), so this is the client boundary that
 * supplies it: navigate back to the reassessment history/comparison page
 * once the new submission is saved, instead of the original form's
 * default router.refresh() (which is right for /onboarding, wrong here).
 */
export function ReassessmentFormShell({ questions }: { questions: OnboardingQuestion[] }) {
  const router = useRouter();

  return (
    <OnboardingForm
      questions={questions}
      submitLabel="Submit reassessment"
      onSubmitted={() => router.push('/profile/reassessments')}
    />
  );
}
