'use client';

/**
 * One-shot scroll-triggered chart reveal: draws in the first time the
 * chart scrolls into view, then latches — it never resets or replays on
 * a later scroll pass. This is deliberately NOT components/ScrollDrawIn.tsx:
 * that component's whole documented purpose is to replay every time a
 * chart is scrolled back into view (built for Home's Energy Trend chart,
 * reused as-is for the Progress page's Root Score chart in an earlier
 * task). This task ("Your Wellness Story" rework) explicitly requires the
 * opposite behavior for this page's two trend charts — "fires once per
 * page view, not on every scroll pass" — so this is a second, narrower
 * hook rather than a change to ScrollDrawIn's behavior, which stays
 * exactly as-is for Home.
 *
 * Exposes `drawn`/`reducedMotion` directly (rather than opaquely wrapping
 * `children` the way ScrollDrawIn does) so the chart component itself can
 * sequence a second animation stage — the data points fading/scaling in
 * only after the line finishes — which isn't possible from outside an
 * opaque wrapper.
 */

import { useEffect, useRef, useState } from 'react';

const REVEAL_THRESHOLD = 0.3;

export function useChartRevealOnce() {
  const ref = useRef<HTMLDivElement>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setReducedMotion(reduced);
    if (reduced) {
      setDrawn(true);
      return;
    }

    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          setDrawn(true);
          // Once per page view: disconnect immediately so nothing here
          // ever resets `drawn` back to false and replays later.
          observer.disconnect();
        }
      },
      { threshold: REVEAL_THRESHOLD }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { ref, drawn, reducedMotion };
}
