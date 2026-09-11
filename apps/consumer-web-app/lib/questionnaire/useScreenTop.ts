'use client';

/**
 * Every change of screen starts at the top.
 *
 * WHY IT IS NEEDED AT ALL. A taker is one component swapping its own
 * contents, so nothing unmounts between one screen and the next and the
 * browser keeps the scroll position it had. A screen carrying three
 * questions and fifteen options is well over a phone's height, so her
 * Continue is near the bottom and, without this, the next screen opened
 * already scrolled past its own first question.
 *
 * THE KEY IS THE SCREEN, NOT THE STEP, so an intro, a transition, a group
 * of questions and a results screen all count, and a re-render that
 * changes nothing about which screen she is on does not scroll her.
 *
 * IT FIRES ON THE FIRST RENDER TOO, which is what handles resume: a member
 * reopening a questionnaire lands on the screen she left, and a browser
 * that restored her old scroll position would otherwise drop her into the
 * middle of it.
 *
 * A RELOAD PUTS HER BACK WHERE SHE WAS, AND IT DOES IT LATE. Found on
 * production, 2026-09-11, on the Body Systems Survey: every screen change
 * landed at the top and a refresh in the middle of one landed 2,797px
 * down, because a reload restores the position the browser remembers and
 * does it after hydration. Two things, and both are needed because both
 * orders happen. The browser is told to stop doing it, with
 * `scrollRestoration` put back to what it was when she leaves so this is
 * scoped to the flow and nothing else in the app loses its back button
 * position. And if the document was still loading when we hydrated, the
 * scroll is asserted again once it has finished, because that is when a
 * restore that has not happened yet would land.
 *
 * SHARED. This was the Body Systems Survey's own hook until the 2026-09-11
 * questionnaire pass gave the generic taker screens long enough to need
 * exactly the same thing. One implementation, so the fix above cannot be
 * half present in one flow and missing from the other.
 */

import { useEffect, useRef } from 'react';

export function useScreenTop(screenKey: string): void {
  const shown = useRef<string | null>(null);
  useEffect(() => {
    if (shown.current === screenKey) return;
    const isFirstScreen = shown.current === null;
    shown.current = screenKey;
    if (typeof window === 'undefined' || typeof window.scrollTo !== 'function') return;
    // Instant, never smooth: the new screen is already drawn, so a scroll
    // she can watch would be the new screen sliding away from her.
    window.scrollTo(0, 0);
    if (!isFirstScreen) return;

    const history = window.history;
    const restoration = 'scrollRestoration' in history ? history.scrollRestoration : null;
    if (restoration !== null) history.scrollRestoration = 'manual';

    const settled = document.readyState === 'complete';
    const again = () => window.scrollTo(0, 0);
    if (!settled) window.addEventListener('load', again, { once: true });

    return () => {
      if (restoration !== null) history.scrollRestoration = restoration;
      if (!settled) window.removeEventListener('load', again);
    };
  }, [screenKey]);
}
