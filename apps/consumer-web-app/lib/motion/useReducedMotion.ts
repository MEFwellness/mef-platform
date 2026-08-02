'use client';

/**
 * Root Motion System — the one canonical reduced-motion hook (Prompt 1).
 * Most of this app's existing animations don't need this: their CSS
 * `@media (prefers-reduced-motion: reduce)` rule in app/globals.css
 * already handles degrading gracefully on its own (see e.g.
 * `.mef-fade-in`'s own override). This hook exists for the cases that
 * genuinely need to branch in JS — gating a setTimeout-driven staged
 * reveal, skipping a typewriter's character-by-character mount (the
 * exact bug class documented in
 * components/closing-screen/ClosingScreenPrimitives.tsx's
 * `useCloseScreenReveal`) — so every future feature that needs that
 * branch reads from one shared hook instead of re-implementing the
 * `matchMedia('(prefers-reduced-motion: reduce)')` listener each time.
 *
 * Reactive: flips live if the member changes their OS setting mid-session
 * (same as every existing ad hoc implementation of this check in this
 * codebase already assumed via a one-time read in useEffect; this hook
 * additionally listens for the `change` event so it doesn't require a
 * remount to notice).
 */

import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(QUERY);
    setReduced(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return reduced;
}
