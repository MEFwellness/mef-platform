'use client';

/**
 * Shared client-side "recompute in the background, update in place" hook
 * for the Recommendation Engine's precomputed result
 * (member_recommendation_computations, migration 116). Used by both
 * RecommendationsClient.tsx (/recommendations) and
 * app/progress/RecommendationsSection.tsx.
 *
 * Next.js 14.2 (this app's version) has no stable `after()`/`waitUntil` —
 * a detached, un-awaited promise in a Vercel serverless function has no
 * guarantee of finishing after the response is sent. So "background
 * recompute" here means: render the stale stored result immediately (the
 * server already read it fast, no live compute on the request path), then
 * have the client itself make one real, awaited call
 * (refreshMyRecommendations, a Server Action) to actually run the
 * recompute, swapping in the fresh result when it resolves. From the
 * member's perspective this is indistinguishable from a true background
 * job — the page never waits on it — while staying fully reliable, since
 * the recompute runs inside a real request/response cycle rather than a
 * detached one.
 */
import { useEffect, useState } from 'react';
import { refreshMyRecommendations, type MemberRecommendationView } from '@/app/actions/recommendations';

export function useRecommendationsFreshness(
  initialRecommendations: MemberRecommendationView[],
  initiallyStale: boolean
): MemberRecommendationView[] {
  const [recommendations, setRecommendations] = useState(initialRecommendations);

  useEffect(() => {
    if (!initiallyStale) return;
    let cancelled = false;

    refreshMyRecommendations().then((fresh) => {
      if (!cancelled) setRecommendations(fresh);
    });

    return () => {
      cancelled = true;
    };
    // Only ever runs once per mount for the staleness snapshot the server
    // rendered with — a later staleness change requires a new page load
    // (or router.refresh(), which remounts this component with fresh
    // props), not a re-run of this same effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return recommendations;
}
