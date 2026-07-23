'use client';

import { useEffect, useRef, useState } from 'react';
import { OnboardingForm } from './OnboardingForm';
import { OnboardingIntro } from './OnboardingIntro';
import { OnboardingCompletionScreen } from './OnboardingCompletionScreen';
import { GuestObservationScreen } from './GuestObservationScreen';
import { submitOnboarding } from '../actions/onboarding';
import {
  saveGuestOnboardingAnswers,
  getGuestOnboardingAnswers,
  clearGuestOnboardingAnswers,
  markGuestOnboardingMigrated,
} from '@/lib/onboarding/guestStorage';
import type { OnboardingAnswerInput, OnboardingQuestion } from '@mef/shared-types-contracts';

type Stage = 'checking' | 'intro' | 'form' | 'complete' | 'observation';

/**
 * Runs the /onboarding experience in one of two modes, decided server-side
 * by app/onboarding/page.tsx based on whether a session exists:
 *
 * - 'guest' (no account): intro -> form -> observation. The form's answers
 *   are saved to localStorage (lib/onboarding/guestStorage.ts) instead of
 *   Postgres — RLS makes a real write impossible before signup anyway
 *   (supabase/migrations/00000000000016_rls_policies.sql requires
 *   auth.uid()) — and GuestObservationScreen shows a non-diagnostic
 *   reflection plus a create-account CTA instead of the member completion
 *   screen.
 *
 * - 'member' (signed in, past consent, no submission yet — page.tsx
 *   already guarantees all three before this ever renders): starts in a
 *   neutral 'checking' stage that's identical on the server and the
 *   client, so hydration never mismatches (reading localStorage can only
 *   happen client-side). A mount effect then decides: no pending guest
 *   answers -> 'intro' (today's exact original behavior, unchanged for
 *   every member who didn't start as a guest); pending guest answers ->
 *   silently submit them via the same submitOnboarding() the authenticated
 *   form itself calls on its last question, then 'complete'. This is how a
 *   guest who just created an account gets their assessment saved without
 *   re-answering all 12 questions — consent was already required and
 *   recorded before OnboardingFlow ever renders in member mode (see
 *   app/onboarding/page.tsx's unchanged consent gate), so this adds no new
 *   consent/legal surface, just a new call site for an already-gated
 *   action.
 */
export function OnboardingFlow({
  questions,
  mode,
}: {
  questions: OnboardingQuestion[];
  mode: 'guest' | 'member';
}) {
  const [stage, setStage] = useState<Stage>(mode === 'guest' ? 'intro' : 'checking');
  const [guestPayload, setGuestPayload] = useState<OnboardingAnswerInput[]>([]);
  // Guards against firing submitOnboarding() twice for the same pending
  // payload — without this, React 18 StrictMode's dev-only double-invoke
  // of this effect (mount -> cleanup -> mount again, same ref across both)
  // calls submitOnboarding() from both invocations before either one's
  // await resolves, since neither has cleared localStorage yet by the time
  // the second starts. The ref (unlike a `cancelled` closure variable)
  // persists across that synthetic remount, so the second invocation sees
  // it already set and never starts a second request.
  const migrationStartedRef = useRef(false);

  useEffect(() => {
    if (mode !== 'member') return;
    if (migrationStartedRef.current) return;

    const pending = getGuestOnboardingAnswers();
    if (!pending) {
      setStage('intro');
      return;
    }

    migrationStartedRef.current = true;
    let cancelled = false;

    (async () => {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
      const result = await submitOnboarding(timezone, pending);

      if (result.error) {
        // Best-effort convenience only — fall back to the normal flow
        // rather than stranding the member on an error screen; the guest
        // answers stay in localStorage so a later visit can retry.
        migrationStartedRef.current = false;
        if (!cancelled) setStage('intro');
        return;
      }

      // Always clear/mark regardless of `cancelled` — the write already
      // succeeded, so leaving localStorage stale would risk a duplicate
      // submission on the member's next visit. Only the visible stage
      // transition is skipped if the component genuinely unmounted (e.g.
      // the member navigated away mid-request).
      clearGuestOnboardingAnswers();
      markGuestOnboardingMigrated();
      if (!cancelled) setStage('complete');
    })();

    return () => {
      cancelled = true;
    };
  }, [mode]);

  if (stage === 'checking') {
    return null;
  }

  if (stage === 'complete') {
    return <OnboardingCompletionScreen />;
  }

  if (stage === 'observation') {
    return <GuestObservationScreen answers={guestPayload} />;
  }

  if (stage === 'intro') {
    return <OnboardingIntro onStart={() => setStage('form')} />;
  }

  if (mode === 'guest') {
    return (
      <OnboardingForm
        questions={questions}
        guestMode
        onGuestSave={(payload) => {
          saveGuestOnboardingAnswers(payload);
          setGuestPayload(payload);
        }}
        onSubmitted={() => setStage('observation')}
        submitLabel="See my reflection"
      />
    );
  }

  return <OnboardingForm questions={questions} onSubmitted={() => setStage('complete')} />;
}
