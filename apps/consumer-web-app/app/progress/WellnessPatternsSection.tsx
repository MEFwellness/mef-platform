/**
 * Self-fetching, own-Suspense-boundary wrapper around WellnessPatternsPanel
 * — pulled out of /progress's main data batch for the same reason as
 * WellnessStorySection: getMyWellnessPatterns recalculates the Personal
 * Wellness Intelligence Engine live on every call
 * (recalculateWellnessIntelligence, by design), the other slow thing this
 * page does. No change to what it computes — only where it's awaited from.
 */
import { getMyWellnessPatterns } from '@/app/actions/wellness-intelligence';
import { WellnessPatternsPanel } from './WellnessPatternsPanel';

const SKELETON_CARD = 'rounded-[28px] bg-[#1B3A2D]/[0.05] animate-pulse';

export function WellnessPatternsSectionSkeleton() {
  return <div className={`${SKELETON_CARD} mt-5 h-40`} aria-hidden="true" />;
}

export async function WellnessPatternsSection() {
  const insights = await getMyWellnessPatterns();
  return <WellnessPatternsPanel insights={insights} />;
}
