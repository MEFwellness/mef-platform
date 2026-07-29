/**
 * Self-fetching, own-Suspense-boundary Recommendations section for
 * /progress — reads the Recommendation Engine's precomputed result
 * (getMyRecommendationsWithFreshness, app/actions/recommendations.ts)
 * instead of computing it live on this page's own render path. This is
 * the same stored result and staleness rule the Dashboard's
 * RecommendationsCard and the dedicated /recommendations page read from —
 * one source of truth, never computed twice for the same data.
 *
 * A real, uncomputed-before member (first-ever visit) still pays a live
 * compute here — RecommendationsSectionSkeleton (below) is what's on
 * screen meanwhile, per this page's Suspense-per-section restructure.
 */
import { getMyRecommendationsWithFreshness } from '@/app/actions/recommendations';
import { RecommendationsSectionClient } from './RecommendationsSectionClient';

const SKELETON_CARD = 'rounded-[28px] bg-[#1B3A2D]/[0.05] animate-pulse';

/** Sized to roughly match a 2-3 item RecommendationsSectionClient card, so streaming it in doesn't visibly jump the page. */
export function RecommendationsSectionSkeleton() {
  return (
    <div className={`${SKELETON_CARD} mt-5 h-64`} aria-hidden="true" />
  );
}

export async function RecommendationsSection() {
  const { recommendations, isStale } = await getMyRecommendationsWithFreshness();
  return <RecommendationsSectionClient recommendations={recommendations} isStale={isStale} />;
}
