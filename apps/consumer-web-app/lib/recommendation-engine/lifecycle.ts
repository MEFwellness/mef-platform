/**
 * Recommendation Engine — read-time lifecycle rules (Prompt 11). No cron,
 * no background job: an untouched 'shown' recommendation older than the
 * staleness window is presented as 'expired' at read time only, the same
 * "recompute on read, never mutate via a background job" discipline Root
 * Score / MemberHealthProfile / Root Map already established. The stored
 * row's status column is never rewritten by anything in this file.
 *
 * onlyCurrentCoachingFocus is the second such rule: at most one card on
 * screen may claim to be today's coaching focus.
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

/**
 * The RecommendationDomain the Coaching Brain's once-a-day focus is
 * written under (lib/intelligence-engine/recommendations.ts's
 * dailyCoachingRecommendation). Every "Today's coaching focus: X" row
 * carries it, whichever X the Brain picked that day.
 */
export const DAILY_COACHING_FOCUS_DOMAIN = 'daily_coaching';

/** True for a row that is one of the once-a-day coaching focus cards. */
export function isDailyCoachingFocus(row: Pick<MemberRecommendationRow, 'sourceDomain'>): boolean {
  return row.sourceDomain === DAILY_COACHING_FOCUS_DOMAIN;
}

/**
 * Read-time guarantee that a member never sees two cards both claiming to
 * be today's coaching focus: of the daily-coaching rows handed in, only
 * the newest survives, and every other kind of recommendation passes
 * through untouched and in its original order.
 *
 * The write path (data.ts's retireSupersededCoachingFocus) is what
 * actually retires the losers in the database. This exists as well, rather
 * than instead, because that write can legitimately not happen: a coach
 * viewing a client triggers the same recompute and migration 91 gives a
 * coach no UPDATE policy on a member's rows, and any recompute is
 * best-effort and swallows its own errors. A display rule that depends on
 * a write having succeeded is not a guarantee.
 */
export function onlyCurrentCoachingFocus<T extends Pick<MemberRecommendationRow, 'sourceDomain' | 'createdAt'>>(
  rows: T[]
): T[] {
  const focusRows = rows.filter(isDailyCoachingFocus);
  if (focusRows.length <= 1) return rows;

  const newest = focusRows.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
  return rows.filter((row) => !isDailyCoachingFocus(row) || row === newest);
}
