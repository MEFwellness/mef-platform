/**
 * Self-fetching, own-Suspense-boundary wrapper around WellnessStoryPanel —
 * pulled out of /progress's main data batch because getMyWellnessStorySummary
 * recalculates the Intelligence Core live on every call
 * (recalculateIntelligenceCore, by design — see that function's own doc
 * comment), the slowest thing this page does. Streaming this
 * independently lets every other section (Root Score, Trends, Coaching
 * Insights, Comparison, History, and now Recommendations) render without
 * waiting on it. No change to what recalculateIntelligenceCore computes
 * or how often — only where its result is awaited from.
 */
import { getMyWellnessStorySummary } from '@/app/actions/intelligence-core';
import { WellnessStoryPanel } from './WellnessStoryPanel';

const SKELETON_CARD = 'rounded-[28px] bg-[#1B3A2D]/[0.05] animate-pulse';

export function WellnessStorySectionSkeleton() {
  return <div className={`${SKELETON_CARD} mt-5 h-56`} aria-hidden="true" />;
}

export async function WellnessStorySection() {
  const summary = await getMyWellnessStorySummary();
  if (!summary) return null;
  return <WellnessStoryPanel summary={summary} />;
}
