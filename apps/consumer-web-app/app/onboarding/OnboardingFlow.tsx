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

type Stage = 'checking' | 'intro' | 'form' | 'reflecting' | 'complete' | 'observation';

const REFLECTING_DELAY_MS = 1100;

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
  // Only true when 'complete' was reached via the silent guest-answer
  // migration below, not a member completing onboarding directly — lets
  // OnboardingCompletionScreen keep the momentum from the guest journey
  // instead of resetting to a generic "you're all set" the instant the
  // account exists.
  const [justMigrated, setJustMigrated] = useState(false);
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
      if (!cancelled) {
        setJustMigrated(true);
        setStage('complete');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode]);

  // A brief, deliberate pause between the last question and the reveal —
  // long enough to read as "reflecting on what you shared" rather than an
  // instant, mechanical page swap, short enough to never feel like a real
  // loading wait (nothing async actually happens here in guest mode).
  useEffect(() => {
    if (stage !== 'reflecting') return;
    const timer = setTimeout(() => setStage('observation'), REFLECTING_DELAY_MS);
    return () => clearTimeout(timer);
  }, [stage]);

  if (stage === 'checking') {
    return null;
  }

  if (stage === 'complete') {
    return <OnboardingCompletionScreen justMigrated={justMigrated} />;
  }

  if (stage === 'reflecting') {
    return (
      <div
        role="status"
        className="mef-animate-in flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center"
      >
        <span className="mef-pulse-dot h-3 w-3 rounded-full bg-[#1B3A2D]" aria-hidden="true" />
        <p className="font-[family-name:var(--font-cormorant-garamond)] text-2xl text-[#1B3A2D]">
          Reflecting on what you shared...
        </p>
      </div>
    );
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
        onSubmitted={() => setStage('reflecting')}
        submitLabel="See my reflection"
      />
    );
  }

  return <OnboardingForm questions={questions} onSubmitted={() => setStage('complete')} />;
}
