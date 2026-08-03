'use client';

/**
 * The branded "Reset" entry animation itself — five stages (Brand
 * Entrance, The Press, Activation, Welcome, Enter the App), driven by a
 * plain setTimeout chain against lib/entry-animation/timing.ts's numbers
 * rather than animationend listeners (same discipline as
 * lib/introRevealTiming.ts). Mounted only by RootResetEntryGate.tsx, which
 * owns the session-entry rule; this component only knows how to play the
 * sequence once asked to.
 *
 * Purely presentational and non-interactive: aria-hidden, no focusable
 * children, so a screen reader skips it entirely rather than announcing
 * it (satisfies "screen readers do not announce the splash repeatedly" by
 * never announcing it at all) and keyboard focus is never at risk of
 * landing inside it. Deliberately has no tap-anywhere-skip handler, unlike
 * components/reveal/RevealSequence.tsx's own Moments — confirmed directly
 * against production that a real login's own tap on the "Log in" button
 * can land on this overlay as a same-position "ghost click" the instant
 * it mounts covering the full viewport where that button used to be,
 * dismissing the animation before it ever really started. The safe
 * timeout below is the sole guarantee against a member getting stuck.
 */

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useReducedMotion } from '@/lib/motion/useReducedMotion';
import { resetEntryGreetingLines } from '@/lib/entry-animation/greeting';
import {
  RESET_ENTRY_ARRIVE_MS,
  RESET_ENTRY_PRESS_MS,
  RESET_ENTRY_RELEASE_MS,
  RESET_ENTRY_WELCOME_MS,
  RESET_ENTRY_EXIT_MS,
  RESET_ENTRY_NAME_WAIT_MS,
  RESET_ENTRY_SAFE_TIMEOUT_MS,
  RESET_ENTRY_REDUCED_ARRIVE_MS,
  RESET_ENTRY_REDUCED_WELCOME_MS,
  RESET_ENTRY_REDUCED_EXIT_MS,
} from '@/lib/entry-animation/timing';

type FullPhase = 'arrive' | 'press' | 'release' | 'welcome' | 'exit';
type ReducedPhase = 'fade' | 'welcome' | 'exit';

export function RootResetEntryAnimation({
  firstName,
  onComplete,
}: {
  firstName: string | null | undefined;
  onComplete: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const [fullPhase, setFullPhase] = useState<FullPhase>('arrive');
  const [reducedPhase, setReducedPhase] = useState<ReducedPhase>('fade');
  const doneRef = useRef(false);
  const firstNameRef = useRef(firstName);
  firstNameRef.current = firstName;

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onComplete();
  };

  // Hard backstop, independent of the phase chain below: guarantees the
  // overlay is removed even if a timer/promise in the chain never
  // resolves. Never itself a source of an early cut — well past every
  // phase chain's own natural total.
  useEffect(() => {
    const safety = setTimeout(finish, RESET_ENTRY_SAFE_TIMEOUT_MS);
    return () => clearTimeout(safety);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const schedule = (fn: () => void, ms: number) => {
      const id = setTimeout(fn, ms);
      timers.push(id);
    };

    // Welcome/Exit are scheduled *relative to when Welcome actually starts*,
    // not as a fixed offset from mount — Welcome can start either on
    // schedule (name already resolved, the common case) or up to
    // RESET_ENTRY_NAME_WAIT_MS later (name still loading). Scheduling
    // Exit/finish as fixed mount-relative offsets that always included
    // RESET_ENTRY_NAME_WAIT_MS (an earlier version of this code) made the
    // *common*, already-resolved case run ~4.4s instead of the intended
    // ~3.6s — RESET_ENTRY_NAME_WAIT_MS was being added even when no wait
    // ever actually happened. Chaining fixes that: the common case's real
    // total is exactly RESET_ENTRY_TOTAL_MS; only the genuinely-still-
    // loading case runs the full extra RESET_ENTRY_NAME_WAIT_MS (timing.ts
    // keeps that worst case under the 4s ceiling on its own).
    const proceedToWelcome = () => {
      setFullPhase('welcome');
      schedule(() => setFullPhase('exit'), RESET_ENTRY_WELCOME_MS);
      schedule(finish, RESET_ENTRY_WELCOME_MS + RESET_ENTRY_EXIT_MS);
    };

    schedule(() => setFullPhase('press'), RESET_ENTRY_ARRIVE_MS);
    schedule(() => setFullPhase('release'), RESET_ENTRY_ARRIVE_MS + RESET_ENTRY_PRESS_MS);
    schedule(() => {
      // Stage 4 needs the first name, but never blocks the sequence on the
      // network indefinitely (spec: "if loading outlasts the animation,
      // hold the final logo state ... rather than replaying"). If it's
      // already resolved (the common case — the fetch had the whole
      // Arrive+Press+Release runway to finish), move on immediately;
      // otherwise wait up to RESET_ENTRY_NAME_WAIT_MS more, then proceed
      // with whatever we have (falls back to "Welcome back." via
      // greetingLines() if still undefined/null).
      if (firstNameRef.current !== undefined) {
        proceedToWelcome();
        return;
      }
      schedule(proceedToWelcome, RESET_ENTRY_NAME_WAIT_MS);
    }, RESET_ENTRY_ARRIVE_MS + RESET_ENTRY_PRESS_MS + RESET_ENTRY_RELEASE_MS);

    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  useEffect(() => {
    if (!reducedMotion) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const schedule = (fn: () => void, ms: number) => timers.push(setTimeout(fn, ms));

    schedule(() => setReducedPhase('welcome'), RESET_ENTRY_REDUCED_ARRIVE_MS);
    schedule(
      () => setReducedPhase('exit'),
      RESET_ENTRY_REDUCED_ARRIVE_MS + RESET_ENTRY_REDUCED_WELCOME_MS
    );
    schedule(
      finish,
      RESET_ENTRY_REDUCED_ARRIVE_MS + RESET_ENTRY_REDUCED_WELCOME_MS + RESET_ENTRY_REDUCED_EXIT_MS
    );

    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  const [line1, line2] = resetEntryGreetingLines(firstName);
  const showWelcomeText = reducedMotion ? reducedPhase !== 'fade' : fullPhase === 'welcome' || fullPhase === 'exit';
  const logoClass = reducedMotion
    ? 'mef-fade-in'
    : fullPhase === 'arrive'
      ? 'mef-reset-entry-arrive'
      : fullPhase === 'press'
        ? 'mef-reset-entry-press'
        : 'mef-reset-entry-release';
  const overlayExiting = reducedMotion ? reducedPhase === 'exit' : fullPhase === 'exit';

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 z-[999] flex flex-col items-center justify-center bg-[#FAFAF8] ${
        overlayExiting ? (reducedMotion ? 'mef-reset-entry-exit-reduced' : 'mef-reset-entry-exit') : ''
      }`}
    >
      <div className="relative flex flex-col items-center">
        {!reducedMotion && fullPhase === 'release' && (
          <div
            className="mef-reset-entry-glow-ring pointer-events-none absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              background:
                'radial-gradient(circle, rgba(212,178,101,0.55) 0%, rgba(196,160,80,0.25) 55%, rgba(196,160,80,0) 75%)',
            }}
          />
        )}
        <div className={logoClass}>
          <Image
            src="/images/rooted-reset-logo.png"
            alt="Rooted Reset"
            width={104}
            height={104}
            priority
            style={{ objectFit: 'contain', borderRadius: '20px' }}
          />
        </div>
        <div className="mt-6 flex flex-col items-center text-center" style={{ minHeight: '3.5rem' }}>
          {showWelcomeText && (
            <>
              <p
                className="font-[family-name:var(--font-cormorant-garamond)] text-2xl text-[#152E24] mef-fade-up"
              >
                {line1}
              </p>
              <p
                className="mt-1.5 text-sm text-[#6B7A72] mef-fade-up"
                style={{ animationDelay: '150ms' }}
              >
                {line2}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
