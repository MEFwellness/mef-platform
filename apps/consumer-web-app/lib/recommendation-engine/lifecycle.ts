/**
 * Recommendation Engine — read-time staleness derivation (Prompt 11). No
 * cron, no background job: an untouched 'shown' recommendation older than
 * the staleness window is presented as 'expired' at read time only, the
 * same "recompute on read, never mutate via a background job" discipline
 * Root Score / MemberHealthProfile / Root Map already established. The
 * stored row's status column is never rewritten by this function.
 */

import type { MemberRecommendationRow, RecommendationLifecycleStatus } from './types';

export const RECOMMENDATION_STALE_DAYS = 30;

export function isRecommendationStale(
  row: Pick<MemberRecommendationRow, 'status' | 'updatedAt'>,
  asOfDate: Date,
  staleDays: number = RECOMMENDATION_STALE_DAYS
): boolean {
  if (row.status !== 'shown') return false;
  const updated = new Date(row.updatedAt);
  const staleThreshold = new Date(updated.getTime() + staleDays * 24 * 60 * 60 * 1000);
  return asOfDate > staleThreshold;
}

export function deriveEffectiveStatus(
  row: Pick<MemberRecommendationRow, 'status' | 'updatedAt'>,
  asOfDate: Date
): RecommendationLifecycleStatus {
  return isRecommendationStale(row, asOfDate) ? 'expired' : row.status;
}
