/**
 * Deterministic content selection — no LLM, no randomness. Given the
 * signals the service layer has already gathered (published library,
 * Milestone 1 restrictions, recent history, today's priority metric,
 * Milestone 2's narrative), picks exactly one content item and the
 * reason it was picked. Pure function, fully testable without a DB.
 */

import type { MefContentItem, DailyFeedItem, NarrativeItem } from '@mef/shared-types-contracts';
import type { WellnessMetricKey } from '../wellness/wellness-index';
import { filterEligibleContent, type EligibilityContext } from './eligibility';
import type { SelectionReason } from './copy';

export type SelectorInput = {
  library: MefContentItem[];
  restrictedTopics: string[];
  recentHistory: DailyFeedItem[];
  asOfLocalDate: string;
  priorityMetric: WellnessMetricKey | null;
  /** Active, member-visible narrative items only — coach-only items must never leak into feed selection reasoning shown to the member. */
  narrativeItems: NarrativeItem[];
  /** A coach-assigned item for today, if one exists — always wins when eligible. */
  coachAssignedContentItemId: string | null;
};

export type ContentSelection = {
  contentItem: MefContentItem;
  reason: SelectionReason;
};

const NARRATIVE_MATCH_CATEGORIES = new Set([
  'barriers_to_adherence',
  'recurring_patterns',
  'unresolved_concerns',
]);

function findNarrativeMatch(
  eligible: MefContentItem[],
  narrativeItems: NarrativeItem[]
): ContentSelection | null {
  const candidates = narrativeItems
    .filter(
      (item) =>
        item.status === 'active' &&
        item.member_visible &&
        NARRATIVE_MATCH_CATEGORIES.has(item.category)
    )
    .sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned));

  for (const narrativeItem of candidates) {
    const haystack = `${narrativeItem.title} ${narrativeItem.summary}`.toLowerCase();
    const match = eligible.find((content) =>
      content.topics.some((topic) => haystack.includes(topic.toLowerCase()))
    );
    if (match) {
      return {
        contentItem: match,
        reason: { kind: 'narrative_match', narrativeSummary: narrativeItem.summary },
      };
    }
  }
  return null;
}

/** Least-recently-shown first, never-shown items first of all, content_key as a stable final tiebreaker so two otherwise-equal candidates don't flip between runs. */
function pickRotationFallback(
  eligible: MefContentItem[],
  recentHistory: DailyFeedItem[]
): MefContentItem {
  const lastShownDate = new Map<string, string>();
  for (const feedItem of recentHistory) {
    const existing = lastShownDate.get(feedItem.content_item_id);
    if (!existing || feedItem.local_date > existing) {
      lastShownDate.set(feedItem.content_item_id, feedItem.local_date);
    }
  }

  return eligible.slice().sort((a, b) => {
    const aShown = lastShownDate.get(a.id) ?? '';
    const bShown = lastShownDate.get(b.id) ?? '';
    if (aShown !== bShown) return aShown.localeCompare(bShown); // '' (never shown) sorts first
    return a.content_key.localeCompare(b.content_key);
  })[0]!;
}

export function selectContentItem(input: SelectorInput): ContentSelection | null {
  const context: EligibilityContext = {
    restrictedTopics: input.restrictedTopics,
    recentHistory: input.recentHistory,
    asOfLocalDate: input.asOfLocalDate,
  };
  const eligible = filterEligibleContent(input.library, context);
  if (eligible.length === 0) return null;

  if (input.coachAssignedContentItemId) {
    const assigned = eligible.find((item) => item.id === input.coachAssignedContentItemId);
    if (assigned) return { contentItem: assigned, reason: { kind: 'coach_assigned' } };
  }

  const narrativeMatch = findNarrativeMatch(eligible, input.narrativeItems);
  if (narrativeMatch) return narrativeMatch;

  if (input.priorityMetric) {
    const metricMatch = eligible.find(
      (item) => item.eligibility_rules.priorityMetric === input.priorityMetric
    );
    if (metricMatch) {
      return {
        contentItem: metricMatch,
        reason: { kind: 'priority_metric', metric: input.priorityMetric },
      };
    }
  }

  return {
    contentItem: pickRotationFallback(eligible, input.recentHistory),
    reason: { kind: 'goal_rotation' },
  };
}
