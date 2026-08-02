'use client';

/**
 * Progressive Reveal Engine (Prompt 3), requirement 6: assessment results
 * screens are Moments — their key finding should be revealed with
 * anticipation (Bible §13's Signature Moment template) rather than
 * appearing instantly. Core Values Snapshot, Life Signal Check, and
 * Readiness Pulse already have this via components/closing-screen/
 * ClosingScreenPrimitives.tsx's own staged mechanics; WBSA, the generic
 * points-scored engine (CHEK HLC1 / Four Doctors / Short-HAQ), and Primal
 * Pattern Diet Type did not (confirmed by reading each results page: they
 * render their headline instantly, on every visit, with no first-time-
 * only gating). This closes that gap using the exact same, already-proven
 * primitives rather than a second mechanism.
 *
 * A quiet beat (`delayMs`), then the finding fades in — first-time-only,
 * gated by `useCloseScreenReveal`'s own `mef-close-seen:{storageKey}`
 * localStorage key; every revisit renders the finding instantly, no
 * replay, matching every other closing screen in the app. Reduced motion
 * skips the beat outright. The finding's own data and wording are passed
 * through unchanged via `children` — this component only controls when
 * it mounts, never what it says.
 */

import type { ReactNode } from 'react';
import { useCloseScreenReveal, useDelayedReveal } from './ClosingScreenPrimitives';

export function KeyFindingReveal({
  storageKey,
  delayMs = 500,
  className = '',
  children,
}: {
  storageKey: string;
  delayMs?: number;
  className?: string;
  children: ReactNode;
}) {
  const play = useCloseScreenReveal(storageKey);
  const revealed = useDelayedReveal(play, delayMs);

  if (!revealed) return null;

  return (
    <div className={play ? `mef-fade-in ${className}` : className}>{children}</div>
  );
}
