'use client';

import { useEffect, useState } from 'react';
import { CVS_FOREST, CVS_GOLD } from './theme';
import type { GapVisualCopy } from '@/lib/core-values-snapshot/copy';

type Props = {
  /** Normalized 0-1 — importance is 0-8, so this is importance/8. */
  matteringFraction: number;
  /** Raw attention out of 5. */
  attentionOutOf5: number;
  copy: GapVisualCopy;
};

/** Two horizontal bars animating left to right on mount — quiet, no axes, no extra numbers, per the brief. */
export function GapVisual({ matteringFraction, attentionOutOf5, copy }: Props) {
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const matteringWidth = animated ? Math.max(matteringFraction, 0.08) * 100 : 0;
  const attentionWidth = animated ? Math.max(attentionOutOf5 / 5, 0.04) * 100 : 0;

  return (
    <div className="mt-6">
      <div>
        <p className="text-xs font-medium text-[#6B7A72]">{copy.matteringLabel}</p>
        <div className="mt-1.5 h-3 w-full overflow-hidden rounded-full bg-[#1B3A2D]/8">
          <div
            className="h-full rounded-full transition-[width] duration-[1100ms] ease-out motion-reduce:transition-none"
            style={{ width: `${matteringWidth}%`, backgroundColor: CVS_FOREST }}
          />
        </div>
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium text-[#6B7A72]">{copy.attentionLabel}</p>
        <div className="mt-1.5 h-3 w-full overflow-hidden rounded-full bg-[#1B3A2D]/8">
          <div
            className="h-full rounded-full transition-[width] duration-[1100ms] ease-out motion-reduce:transition-none"
            style={{ width: `${attentionWidth}%`, backgroundColor: CVS_GOLD }}
          />
        </div>
      </div>

      <p
        className={`mt-3 text-center text-[11px] font-medium uppercase tracking-wider ${
          copy.aligned ? 'text-[#4F7A63]' : 'text-[#9B7B3A]'
        }`}
      >
        {copy.gapLabel}
      </p>
    </div>
  );
}
