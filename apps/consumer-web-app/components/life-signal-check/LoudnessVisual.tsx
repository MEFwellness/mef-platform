'use client';

import { useEffect, useState } from 'react';
import { CVS_FOREST, CVS_GOLD } from '@/components/core-values-snapshot/theme';
import type { LoudnessVisualRow } from '@/lib/life-signal-check/copy';

type Props = { rows: LoudnessVisualRow[] };

/** One horizontal loudness bar per signal, in the style of Core Values Snapshot's own GapVisual — the chosen signal in gold, the rest in green tints, per the build brief. Quiet, no axes, no extra numbers. */
export function LoudnessVisual({ rows }: Props) {
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="mt-6 space-y-4">
      {rows.map((row) => {
        const width = animated ? Math.max(row.score / 3, 0.06) * 100 : 0;
        return (
          <div key={row.signal}>
            <div className="flex items-center justify-between text-xs font-medium text-[#6B7A72]">
              <span className={row.isChosen ? 'font-semibold text-[#1B3A2D]' : undefined}>{row.label}</span>
              <span>{row.score}/3</span>
            </div>
            <div className="mt-1.5 h-3 w-full overflow-hidden rounded-full bg-[#1B3A2D]/8">
              <div
                className="h-full rounded-full transition-[width] duration-[1100ms] ease-out motion-reduce:transition-none"
                style={{ width: `${width}%`, backgroundColor: row.isChosen ? CVS_GOLD : CVS_FOREST, opacity: row.isChosen ? 1 : 0.35 }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
