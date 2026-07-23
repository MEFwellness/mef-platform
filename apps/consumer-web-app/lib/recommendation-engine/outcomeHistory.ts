/**
 * Recommendation Engine — outcome-history summarizers (Prompt 12, Part 4).
 * Pure functions over member_recommendation_events (migration 94, see
 * lib/longitudinal-intelligence/data.ts) — this file never queries the
 * database itself, it only shapes already-fetched events into what
 * builder.ts/classifier.ts need to avoid repeating ineffective
 * recommendations and prefer what has worked for this specific member.
 */

import type { RecommendationEvent, RecommendationEventType } from '../longitudinal-intelligence/data';
import type { MemberRecommendationCategory } from './types';

export type CategoryOutcomeSummary = {
  positiveCount: number;
  negativeCount: number;
  stoppedEarlyCount: number;
};

const POSITIVE_EVENTS = new Set<RecommendationEventType>([
  'marked_helpful',
  'reflection_outcome_worked',
  'member_reported_improvement',
]);

const NEGATIVE_EVENTS = new Set<RecommendationEventType>([
  'marked_not_helpful',
  'dismissed',
  'reflection_outcome_didnt_work',
  'member_reported_worsening',
]);

/** One summary per category the member has real history with — every count traces back to a real recorded event, nothing inferred or estimated. */
export function summarizeOutcomeHistory(
  events: RecommendationEvent[],
  categoryByRecommendationId: ReadonlyMap<string, MemberRecommendationCategory>
): Map<MemberRecommendationCategory, CategoryOutcomeSummary> {
  const summary = new Map<MemberRecommendationCategory, CategoryOutcomeSummary>();

  for (const event of events) {
    const category = categoryByRecommendationId.get(event.recommendationId);
    if (!category) continue;

    const entry = summary.get(category) ?? { positiveCount: 0, negativeCount: 0, stoppedEarlyCount: 0 };
    if (POSITIVE_EVENTS.has(event.eventType)) entry.positiveCount += 1;
    if (NEGATIVE_EVENTS.has(event.eventType)) entry.negativeCount += 1;
    if (event.eventType === 'stopped_early') entry.stoppedEarlyCount += 1;
    summary.set(category, entry);
  }

  return summary;
}

/**
 * A specific recommendation row was dismissed/marked-not-helpful and
 * nothing since has happened to it — the "without meaningful new
 * evidence" carve-out. Because buildRecommendationKey (classifier.ts) is
 * deterministic from domain/category/title, a genuinely new piece of
 * evidence (a changed title/category) always produces a fresh row/key
 * naturally, so "no event since" on THIS row id is a correct, sufficient
 * proxy for "no new evidence for this exact suggestion" — never a second
 * evidence-freshness calculation.
 */
export function hasUnresolvedNegativeEvent(
  recommendationRowId: string,
  eventsMostRecentFirst: RecommendationEvent[]
): boolean {
  const latest = eventsMostRecentFirst.find((e) => e.recommendationId === recommendationRowId);
  return latest ? NEGATIVE_EVENTS.has(latest.eventType) : false;
}

/** categories a member has clearly negative history with (more negative than positive, and at least one negative event) — used to prefer other categories when several candidates would otherwise tie. */
export function categoriesWithNegativeHistory(
  history: ReadonlyMap<MemberRecommendationCategory, CategoryOutcomeSummary>
): Set<MemberRecommendationCategory> {
  const result = new Set<MemberRecommendationCategory>();
  for (const [category, summary] of history) {
    if (summary.negativeCount > 0 && summary.negativeCount >= summary.positiveCount) result.add(category);
  }
  return result;
}
