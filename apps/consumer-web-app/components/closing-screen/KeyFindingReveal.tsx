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
 * only gating). This closes that gap.
 *
 * Deliberately NOT built on ClosingScreenPrimitives.tsx's own
 * `useCloseScreenReveal`/`useDelayedReveal` — a real bug, caught live on
 * app.mefwellness.com while verifying this exact component, rules that
 * out. Those hooks' `useDelayedReveal(play, delayMs)` initializes its
 * `revealed` state to `!play`, and `play` is always `false` on a
 * component's very first render (its own `useCloseScreenReveal` effect
 * hasn't run yet) — so `revealed` starts `true` regardless of whether
 * this is really a first-time view. Inside Core Values Snapshot/Life
 * Signal Check's own Client Component takers that's a minor, invisible
 * one-frame quirk (the whole taker only ever exists client-side, no
 * server HTML to leak). WBSA/generic/Primal Pattern's results pages are
 * Server Components, though: Next.js server-renders the "revealed" state
 * into the actual HTML response, so the finding was present in the very
 * first bytes sent to the browser — confirmed empirically (a live fetch
 * showed identical page content at 150ms and at 850ms after navigation,
 * i.e. the "staged" delay never visibly gated anything). This component
 * instead starts in an explicit `'pending'` state that renders `null` on
 * both the server and the client's first render (so there's nothing to
 * leak into SSR output and no hydration mismatch), then resolves to
 * `'instant'` or `'staged'` in a single effect after mount.
 *
 * Same `mef-close-seen:{storageKey}` localStorage convention as
 * `useCloseScreenReveal` (a separate write, not shared state — this
 * component owns its own key namespace's screens). Reduced motion always
 * resolves instantly. The finding's own data and wording are passed
 * through unchanged via `children` — this component only controls when
 * it mounts, never what it says.
 */

import { useEffect, useState, type ReactNode } from 'react';

type RevealState = 'pending' | 'instant' | 'staged';

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
  const [state, setState] = useState<RevealState>('pending');

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const key = `mef-close-seen:${storageKey}`;
    let alreadySeen = false;
    try {
      alreadySeen = window.localStorage.getItem(key) === '1';
      if (!alreadySeen) window.localStorage.setItem(key, '1');
    } catch {
      alreadySeen = false;
    }

    if (reducedMotion || alreadySeen) {
      setState('instant');
      return undefined;
    }

    const timer = setTimeout(() => setState('staged'), delayMs);
    return () => clearTimeout(timer);
  }, [storageKey, delayMs]);

  if (state === 'pending') return null;

  return <div className={state === 'staged' ? `mef-fade-in ${className}` : className}>{children}</div>;
}
