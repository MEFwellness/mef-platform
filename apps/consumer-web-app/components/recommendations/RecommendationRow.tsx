'use client';

/**
 * One recommendation row on /recommendations — mirrors AlertRow's
 * interaction pattern (app/coach/clients/[id]/MemberIntelligencePanel.tsx)
 * exactly: useTransition + router.refresh(), just member-facing copy and
 * member-facing actions (Mark Done / Not Helpful) instead of
 * acknowledge/resolve/dismiss. Never renders confidence, priority, domain,
 * or any internal terminology — only what app/actions/recommendations.ts's
 * describeForMember() already produced.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X } from 'lucide-react';
import type { MemberRecommendationView } from '@/app/actions/recommendations';
import { markRecommendationDone, markRecommendationNotHelpful } from '@/app/actions/recommendations';

export function RecommendationRow({
  recommendation,
  onStartExperiment,
}: {
  recommendation: MemberRecommendationView;
  onStartExperiment?: (rowId: string) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className="py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
        {recommendation.categoryLabel}
      </p>
      <p className="mt-1 text-sm font-medium text-[#1B3A2D]">{recommendation.title}</p>
      <p className="mt-0.5 text-sm leading-relaxed text-[#1B3A2D]/80">{recommendation.explanation}</p>

      {recommendation.completionTracking && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {recommendation.category === 'lifestyle_experiment' && onStartExperiment && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => onStartExperiment(recommendation.rowId)}
              className="inline-flex items-center gap-1 rounded-full bg-[#1B3A2D] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#16302A]"
            >
              Start this experiment
            </button>
          )}
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => markRecommendationDone(recommendation.rowId))}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-[#1B3A2D]/70 hover:bg-[#1B3A2D]/[0.06]"
          >
            <Check className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            Mark done
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => markRecommendationNotHelpful(recommendation.rowId))}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-[#1B3A2D]/70 hover:bg-[#1B3A2D]/[0.06]"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            Not helpful
          </button>
        </div>
      )}

      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </li>
  );
}
