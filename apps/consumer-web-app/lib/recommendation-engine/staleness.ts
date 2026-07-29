/**
 * Pure staleness rule for the Recommendation Engine's precomputed result
 * (member_recommendation_computations, migration 116). The engine now
 * recomputes eagerly at three real data-changing events (a completed
 * check-in, a coach-published assessment, a completed questionnaire — see
 * recomputeAndPersist's callers), so a page load normally just reads an
 * already-fresh stored result. This is the read-side safety net for the
 * cases that eager recompute doesn't cover: a member whose data changed
 * before this table existed, or whose eager recompute step failed
 * (best-effort, never allowed to break the event that triggered it).
 *
 * Deliberately narrow: only compares against the member's latest
 * check-in, the "at minimum" trigger every member has, rather than a
 * general cross-source "latest data-changing event of any kind" signal —
 * building the latter would mean either extending the Health Timeline's
 * event-type vocabulary to cover questionnaire completion (which has no
 * timeline event today) or inventing a second, parallel event log neither
 * requested nor needed given eager recompute already covers those two
 * events at the point they happen.
 */
import type { RecommendationComputationState } from './data';

export function isRecommendationComputationStale(
  state: RecommendationComputationState | null,
  latestCheckinRecordedAt: string | null
): boolean {
  if (!state) return false; // "never computed" is a distinct case the caller handles separately (compute live)
  if (!latestCheckinRecordedAt) return false; // nothing to compare against
  return new Date(latestCheckinRecordedAt).getTime() > new Date(state.computedAt).getTime();
}
