'use client';

/**
 * Home dashboard redesign — the "Energy Trend line draws in" requirement,
 * without touching components/EnergyTrendChart.tsx itself (that component
 * is also used by the coach client view, app/coach/clients/[id]/page.tsx,
 * which this redesign must leave untouched). A left-to-right clip-path
 * wipe around the unmodified chart achieves the same "drawing in" feel as
 * animating the SVG stroke directly, entirely from the outside. Respects
 * prefers-reduced-motion by skipping straight to fully revealed.
 */

import { useEffect, useState } from 'react';
import type { DailyCheckin } from '@mef/shared-types-contracts';
import { EnergyTrendChart } from '@/components/EnergyTrendChart';

export function AnimatedEnergyTrendChart({ checkins }: { checkins: DailyCheckin[] }) {
  const [drawn, setDrawn] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    if (drawn) return;
    const raf = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      style={{
        clipPath: drawn ? 'inset(0 0% 0 0)' : 'inset(0 100% 0 0)',
        transition: 'clip-path 1.1s ease-out',
      }}
    >
      <EnergyTrendChart checkins={checkins} />
    </div>
  );
}
