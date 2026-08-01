'use client';

/**
 * The Recommendations section on /progress — same card, same
 * RecommendationRow, same "recompute in the background, update in place"
 * behavior as /recommendations' own RecommendationsClient.tsx (both use
 * the shared useRecommendationsFreshness hook), just without the
 * Lifestyle Experiments list, which is out of this page's scope. Reusing
 * RecommendationRow directly rather than a second row component — mark
 * done/not helpful behave identically here and there.
 */
import { RecommendationRow } from '@/components/recommendations/RecommendationRow';
import { useRecommendationsFreshness } from '@/hooks/useRecommendationsFreshness';
import type { MemberRecommendationView } from '@/app/actions/recommendations';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

export function RecommendationsSectionClient({
  recommendations: initialRecommendations,
  isStale,
}: {
  recommendations: MemberRecommendationView[];
  isStale: boolean;
}) {
  const recommendations = useRecommendationsFreshness(initialRecommendations, isStale);
  const active = recommendations.filter((r) => r.status === 'shown');

  return (
    <section className={`${CARD} mef-animate-in mt-5 p-6`}>
      <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">Recommendations</p>
      {active.length === 0 ? (
        <p className="mt-3 text-sm leading-relaxed text-[#6B7A72]">
          Nothing new right now. Keep checking in and completing assessments, and recommendations
          will show up here as patterns emerge.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-[#1B3A2D]/5">
          {active.map((r) => (
            <RecommendationRow key={r.rowId} recommendation={r} />
          ))}
        </ul>
      )}
    </section>
  );
}
