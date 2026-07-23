/**
 * Recommendation Engine — dashboard entry point (Prompt 11). Self-fetching
 * async server component, same shape as WhatWereNoticingCard.tsx and
 * RootMapCard.tsx: its own data (getMyRecommendations) streams in
 * independently via the Suspense boundary the dashboard wraps it in.
 * Renders nothing when there's nothing active — never a broken-looking
 * empty state.
 */

import Link from 'next/link';
import { ChevronRight, Compass } from 'lucide-react';
import { getMyRecommendations } from '@/app/actions/recommendations';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

export async function RecommendationsCard() {
  const recommendations = await getMyRecommendations();
  const active = recommendations.filter((r) => r.status === 'shown');
  if (active.length === 0) return null;

  return (
    <Link
      href="/recommendations"
      className={`${CARD} mef-animate-in group block p-7 transition hover:bg-[#FAFAF8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B3A2D]`}
    >
      <div className="flex items-center gap-2 text-[#6B7A72]">
        <Compass className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">Recommended For You</p>
      </div>
      <ul className="mt-3 space-y-2">
        {active.slice(0, 3).map((r) => (
          <li key={r.rowId} className="text-sm leading-relaxed text-[#1B3A2D]">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
              {r.categoryLabel}
            </span>
            <br />
            {r.title}
          </li>
        ))}
      </ul>
      {active.length > 3 && (
        <p className="mt-2 text-xs font-medium text-[#6B7A72]">+{active.length - 3} more</p>
      )}
      <div className="mt-4 flex items-center gap-1 text-sm font-medium text-[#1B3A2D] opacity-70 transition group-hover:opacity-100">
        See all recommendations
        <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
      </div>
    </Link>
  );
}
