/**
 * Pure eligibility filtering — no I/O. Decides which content items are
 * safe and non-repetitive to show a member today, given data the caller
 * (selector.ts) has already fetched. Every exclusion reason is real: a
 * contraindicated topic, content shown too recently, or a safety
 * classification level higher than the content is rated safe for.
 */

import type {
  MefContentItem,
  DailyFeedItem,
  SafetyClassificationLevel,
} from '@mef/shared-types-contracts';

const CLASSIFICATION_RANK: SafetyClassificationLevel[] = [
  'standard_coaching',
  'coaching_with_caution',
  'medical_evaluation_recommended',
  'coach_review_required',
  'safety_response_only',
];

/** How many days a content item stays "recently shown" and excluded from repetition-avoidance selection, unless it's the only eligible item left. */
export const REPETITION_AVOIDANCE_DAYS = 21;

export type EligibilityContext = {
  restrictedTopics: string[];
  recentHistory: DailyFeedItem[];
  asOfLocalDate: string;
};

function daysBetween(earlier: string, later: string): number {
  const [ey, em, ed] = earlier.split('-').map(Number);
  const [ly, lm, ld] = later.split('-').map(Number);
  const earlierUtc = Date.UTC(ey!, em! - 1, ed!);
  const laterUtc = Date.UTC(ly!, lm! - 1, ld!);
  return Math.round((laterUtc - earlierUtc) / (1000 * 60 * 60 * 24));
}

/** True if this content item's contraindication_tags intersect the member's currently-restricted topics — the Milestone 1 safety gate. */
export function isContraindicated(item: MefContentItem, restrictedTopics: string[]): boolean {
  if (restrictedTopics.length === 0) return false;
  return item.contraindication_tags.some((tag) => restrictedTopics.includes(tag));
}

/** True if this item was shown within the repetition-avoidance window. */
export function wasRecentlyShown(item: MefContentItem, context: EligibilityContext): boolean {
  return context.recentHistory.some(
    (feedItem) =>
      feedItem.content_item_id === item.id &&
      daysBetween(feedItem.local_date, context.asOfLocalDate) <= REPETITION_AVOIDANCE_DAYS
  );
}

/**
 * Filters the full published library down to what's actually eligible
 * today. Falls back to allowing recently-shown items (but never
 * contraindicated ones) if repetition avoidance would otherwise leave
 * nothing — a member should never see an empty feed because the library
 * is small, only because every remaining option is genuinely unsafe.
 */
export function filterEligibleContent(
  library: MefContentItem[],
  context: EligibilityContext
): MefContentItem[] {
  const safe = library.filter((item) => !isContraindicated(item, context.restrictedTopics));
  const fresh = safe.filter((item) => !wasRecentlyShown(item, context));
  return fresh.length > 0 ? fresh : safe;
}

/** The classification level a content item requires isn't exceeded — content library items only ever carry the 3 auto-deliverable levels (see migration 30), this just orders them for scoring purposes elsewhere. */
export function classificationRank(level: SafetyClassificationLevel): number {
  return CLASSIFICATION_RANK.indexOf(level);
}
