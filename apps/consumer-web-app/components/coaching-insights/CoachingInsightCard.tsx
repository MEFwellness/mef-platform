'use client';

/**
 * One Coaching Intelligence Engine statement, with the required
 * "Why am I seeing this?" tap — an inline reveal of the same
 * already-composed, plain-language explanation string every insight is
 * generated with (lib/coaching-insights/copy.ts's buildExplanation),
 * never a raw confidence number, table name, or source id shown directly.
 */

import { useState } from 'react';
import { Info } from 'lucide-react';
import type { CoachingInsightView } from '@/app/actions/coaching-insights';

export function CoachingInsightCard({ insight }: { insight: CoachingInsightView }) {
  const [showWhy, setShowWhy] = useState(false);

  return (
    <li className="rounded-2xl bg-[#FAFAF8] p-4 text-sm leading-relaxed text-[#1B3A2D]">
      <p>{insight.statement}</p>
      <button
        type="button"
        onClick={() => setShowWhy((v) => !v)}
        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#6B7A72] underline underline-offset-2 hover:text-[#1B3A2D]"
        aria-expanded={showWhy}
      >
        <Info className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
        Why am I seeing this?
      </button>
      {showWhy && (
        <p className="mt-2 text-xs leading-relaxed text-[#6B7A72]">{insight.explanation}</p>
      )}
    </li>
  );
}
