/**
 * Coach Prioritization — "choose the highest leverage, never overwhelm
 * members: one primary focus, two secondary opportunities, everything
 * else waits." A pure reshaping of the Recommendation[] the MEF
 * Intelligence Engine already computed (lib/intelligence-engine/
 * recommendations.ts) — never a second recommendation source.
 */

import type { Recommendation } from '../intelligence-engine/types';
import type { PrioritizedOpportunity, WellnessCorePrioritization } from './types';

const PRIORITY_RANK: Record<Recommendation['priority'], number> = { high: 2, medium: 1, low: 0 };

function toOpportunity(r: Recommendation): PrioritizedOpportunity {
  return { domain: r.domain, title: r.title, detail: r.detail, confidence: r.confidence };
}

export function prioritizeRecommendations(
  recommendations: Recommendation[]
): WellnessCorePrioritization {
  const sorted = [...recommendations].sort(
    (a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || b.confidence - a.confidence
  );

  const [primaryRec, ...rest] = sorted;
  const secondaryRecs = rest.slice(0, 2);
  const deferredCount = Math.max(0, sorted.length - (primaryRec ? 1 : 0) - secondaryRecs.length);

  return {
    primary: primaryRec ? toOpportunity(primaryRec) : null,
    secondary: secondaryRecs.map(toOpportunity),
    deferredCount,
  };
}
