'use client';

import { useState } from 'react';
import { OnboardingForm } from './OnboardingForm';
import { OnboardingCompletionScreen } from './OnboardingCompletionScreen';
import type { OnboardingQuestion } from '@mef/shared-types-contracts';

/**
 * Wraps the original /onboarding submission with the new completion
 * transition screen, using the exact same onSubmitted escape hatch
 * OnboardingForm already offered the reassessment flow. No change to
 * OnboardingForm's submit/validation logic itself. Without onSubmitted,
 * a successful submit falls through to router.refresh(), which re-runs
 * app/onboarding/page.tsx server-side and immediately swaps in its small
 * "Onboarding already complete" text block; that's still exactly what
 * happens on a later visit (bookmark, back button, direct navigation).
 * This screen is only interposed the first time, right after submitting.
 */
export function OnboardingFlow({ questions }: { questions: OnboardingQuestion[] }) {
  const [justCompleted, setJustCompleted] = useState(false);

  if (justCompleted) {
    return <OnboardingCompletionScreen />;
  }

  return <OnboardingForm questions={questions} onSubmitted={() => setJustCompleted(true)} />;
}
