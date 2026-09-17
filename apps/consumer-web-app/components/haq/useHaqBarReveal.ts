'use client';

/**
 * ONE RESULT BAR, FILLED ONCE, THE FIRST TIME IT IS SEEN.
 *
 * A row's bar starts empty and runs out to its band width when the row first
 * reaches the screen. It then LATCHES: scrolling away and back does nothing,
 * because the fill is a statement of her result, not a scroll toy, and a bar
 * that re-ran every pass would turn twenty one calm statements into a page
 * that never settles.
 *
 * WHY NOT components/useChartRevealOnce.ts. That hook latches too, and this
 * one was very nearly it. It has no safety net, which is a real gap here:
 * IntersectionObserver only reports a CHANGE across a threshold at the frames
 * it samples, so a row can travel from below the fold to above it in one
 * flick, or be jumped past by a restored scroll position, with the ratio
 * measured as zero at both ends. No threshold is crossed, the callback never
 * runs, and that row's bar stays at zero width for good, which on this page
 * reads as a section with no result. components/dashboard/RevealOnScroll.tsx
 * found that exact failure on Home and carries the fix, so the fix is here
 * too: a passive scroll listener fills any row the page has already carried
 * past. Whichever arrives first disconnects the other.
 *
 * REDUCED MOTION IS THE SAME PAGE WITHOUT THE TRAVEL. Filled immediately, at
 * the same width, with the transition switched off by the caller. Nothing is
 * withheld from her, only the movement.
 */

import { useEffect, useRef, useState } from 'react';

/** Enough of the row on screen to count as arrived, without waiting for all of it. */
const REVEAL_THRESHOLD = 0.35;

export function useHaqBarReveal() {
  const ref = useRef<HTMLLIElement>(null);
  const [filled, setFilled] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    // jsdom, and any browser old enough to lack either API, gets the finished
    // page rather than an empty one: the result is what matters, the motion
    // is the decoration.
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setReducedMotion(reduced);

    if (reduced || typeof IntersectionObserver === 'undefined') {
      setFilled(true);
      return;
    }

    const node = ref.current;
    if (!node) return;

    let done = false;
    const fill = () => {
      if (done) return;
      done = true;
      setFilled(true);
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) fill();
      },
      { threshold: REVEAL_THRESHOLD }
    );

    /** A row the page has already carried past has had its moment. */
    function onScroll() {
      const rect = ref.current?.getBoundingClientRect();
      if (rect && rect.top < 0) fill();
    }

    observer.observe(node);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  return { ref, filled, reducedMotion };
}
