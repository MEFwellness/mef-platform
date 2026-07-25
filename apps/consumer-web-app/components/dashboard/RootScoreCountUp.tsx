'use client';

/**
 * Home dashboard redesign — the Root Score's "counts up on load" moment in
 * the new hero. Purely presentational: the final value always comes from
 * lib/scoring/service.ts via the snapshot prop the hero already has;
 * this only controls how that same number arrives on screen. Respects
 * prefers-reduced-motion by rendering the final value immediately.
 */

import { useEffect, useState } from 'react';

export function RootScoreCountUp({ value, className = '' }: { value: number; className?: string }) {
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
