'use client';

import { useState } from 'react';
import { OnboardingForm } from './OnboardingForm';
import { OnboardingIntro } from './OnboardingIntro';
import { OnboardingCompletionScreen } from './OnboardingCompletionScreen';
import type { OnboardingQuestion } from '@mef/shared-types-contracts';

type Stage = 'intro' | 'form' | 'complete';

/**
 * Runs the /onboarding experience as three stages: an expectations screen
 * (OnboardingIntro), the paced question-by-question form (OnboardingForm),
 * and a completion transition (OnboardingCompletionScreen) — using the same
 * onSubmitted escape hatch OnboardingForm already offered the reassessment
 * flow, which renders OnboardingForm directly and never sees this component
 * or the intro stage at all. No change to OnboardingForm's submit/validation
 * logic. Without onSubmitted, a successful submit falls through to
 * router.refresh(), which re-runs app/onboarding/page.tsx server-side and
 * immediately swaps in its small "Onboarding already complete" text block;
 * that's still exactly what happens on a later visit (bookmark, back
 * button, direct navigation). The completion screen is only interposed the
 * first time, right after submitting.
 */
export function OnboardingFlow({ questions }: { questions: OnboardingQuestion[] }) {
  const [stage, setStage] = useState<Stage>('intro');

  if (stage === 'complete') {
    return <OnboardingCompletionScreen />;
  }

  if (stage === 'intro') {
    return <OnboardingIntro onStart={() => setStage('form')} />;
  }

  return (
    <OnboardingForm questions={questions} onSubmitted={() => setStage('complete')} />
  );
}
