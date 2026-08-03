'use client';

/**
 * Root Motion System — generic count-up primitive (Bible §9 "Progress
 * feedback"/§3 "Grow", the numeric-counter sibling of `GrowBar`'s width
 * fill). Not a new implementation: `components/dashboard/RootScoreCountUp.tsx`
 * already built this exact raf-driven, cubic-eased, reduced-motion-aware
 * counter for the Root Score hero (Prompt 5) — generalized here under
 * the Root Motion System's own namespace so any other real, accumulating
 * number (e.g. the Protein Ledger's daily gram tally) can reuse it
 * instead of a second implementation. `RootScoreCountUp` now re-exports
 * this component under its own name, so the dashboard hero's behavior
 * and import path are unchanged.
 */

import { useEffect, useState } from 'react';

export function CountUp({ value, className = '' }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(value);
      return;
    }

    let raf = 0;
    const durationMs = 1000;
    const start = performance.now();

    function tick(now: number) {
      const progress = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * value));
      if (progress < 1) raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <span className={className}>{display}</span>;
}
