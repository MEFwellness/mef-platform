/**
 * Picks at most one safe, non-invasive narrative sentence to weave into a
 * coaching recommendation — never a raw dump of everything the system
 * knows about a member. Pure function over already-fetched items, so the
 * "Bad: We know you always fail when you travel" vs. "Good: Travel has
 * made consistency harder for you before, so today's plan is
 * intentionally lighter" distinction the milestone draws is enforced by
 * construction: generator.ts already writes every summary in the "Good"
 * register, so this function's only job is choosing WHICH one (if any)
 * is relevant right now, never rephrasing.
 */

import type { NarrativeItem } from '@mef/shared-types-contracts';

const REFERENCE_CATEGORIES = new Set([
  'barriers_to_adherence',
  'recurring_patterns',
  'successful_interventions',
]);

export function pickCoachingReferenceSentence(
  items: NarrativeItem[],
  priorityMetricLabel: string | null
): string | null {
  const candidates = items.filter((item) => item.status === 'active' && item.member_visible);

  // A coach explicitly pinning something is the strongest signal of
  // relevance — always wins over an automatically-matched item.
  const pinned = candidates.find(
    (item) => item.is_pinned && REFERENCE_CATEGORIES.has(item.category)
  );
  if (pinned) return pinned.summary;

  if (priorityMetricLabel) {
    const needle = priorityMetricLabel.toLowerCase();
    const relevant = candidates.find(
      (item) =>
        REFERENCE_CATEGORIES.has(item.category) &&
        (item.title.toLowerCase().includes(needle) || item.summary.toLowerCase().includes(needle))
    );
    if (relevant) return relevant.summary;
  }

  return null;
}
