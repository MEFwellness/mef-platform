'use client';

/**
 * "We noticed something", as she reads it.
 *
 * QUIET, NOT AN INTERRUPTION. It is drawn inside the experiment section,
 * on the page she is already on. It is never a pop-up, never a
 * notification and never a banner over something else, because an
 * observation that interrupts her is an instruction wearing a softer
 * coat.
 *
 * IT CHANGES NOTHING. Her pattern, her starting range, her plate and her
 * meal cards are exactly what they were before it appeared. Nothing
 * downstream of lib/fuel-pattern/experiment/insights.ts writes to any of
 * them, and that is the property this card depends on rather than a
 * promise it makes.
 *
 * Muted gold on a warm ground, one hairline, no icon and no action.
 */

import { CVS_GOLD_DIVIDER } from '@/components/core-values-snapshot/theme';
import type { FpaInsight } from '@/lib/fuel-pattern/experiment/insights';

export function InsightCard({ insight }: { insight: FpaInsight }) {
  return (
    <div
      data-fpa-insight={insight.id}
      className="mt-5 rounded-[24px] border border-[#C4A050]/35 bg-[#FDF9EF] p-5"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#B89340]">
        {insight.header}
      </p>
      <div className={`${CVS_GOLD_DIVIDER} mt-3 max-w-[120px]`} aria-hidden="true" />
      <p className="mt-3.5 text-[14.5px] leading-[1.7] text-[#1B3A2D]">{insight.body}</p>
    </div>
  );
}
