/**
 * Member Coaching Memory Engine (Part 2) — deterministic, structured
 * memory derived entirely from a member's own real history: their Daily
 * Coaching Feed history (completions, skips, saves, reflections) paired
 * with the content each feed item pointed to, plus their own Member
 * Health Narrative (Milestone 2's recent_wins/barriers_to_adherence/etc).
 *
 * This is explicitly NOT an LLM memory — every field is a plain count,
 * lookup, or filter over rows the member/coach already produced. No text
 * is generated here; lib/feed/continuity.ts turns these facts into
 * sentences.
 */

import type {
  DailyFeedItem,
  MefContentItem,
  FourDoctorsCategory,
  NarrativeItem,
} from '@mef/shared-types-contracts';
import { addDaysToLocalDate } from './dateMath';

export type FeedHistoryPair = { feedItem: DailyFeedItem; content: MefContentItem | null };

export type SavedItem = {
  feedItemId: string;
  contentItemId: string;
  title: string;
  localDate: string;
};

export type FeedMemory = {
  /** All-time (within the provided history window) completed lesson count. */
  completedCount: number;
  completedThisWeek: number;
  skippedCount: number;
  reflectionsWritten: number;
  /** Saved for later and never completed since — newest first (mirrors input order). */
  savedNotCompleted: SavedItem[];
  categoryCounts: Record<FourDoctorsCategory, number>;
  categoryCountsThisWeek: Record<FourDoctorsCategory, number>;
  categoryCountsPreviousWeek: Record<FourDoctorsCategory, number>;
  /** Categories of the member's recent lessons, most-recent-first — "previous coaching topics". */
  recentCategories: FourDoctorsCategory[];
  /** The most-completed category in the window — "recurring coaching category" — or null with no completions yet. */
  mostFrequentCategory: FourDoctorsCategory | null;
};

const CATEGORIES: FourDoctorsCategory[] = [
  'doctor_diet',
  'doctor_quiet',
  'doctor_movement',
  'doctor_happiness',
];

function zeroCategoryCounts(): Record<FourDoctorsCategory, number> {
  return { doctor_diet: 0, doctor_quiet: 0, doctor_movement: 0, doctor_happiness: 0 };
}

function pickMostFrequent(counts: Record<FourDoctorsCategory, number>): FourDoctorsCategory | null {
  let best: FourDoctorsCategory | null = null;
  let bestCount = 0;
  for (const category of CATEGORIES) {
    if (counts[category] > bestCount) {
      best = category;
      bestCount = counts[category];
    }
  }
  return best;
}

/**
 * @param historyPairs Past feed items (excluding today) paired with their
 *   content, newest-first — exactly what app/actions/feed.ts's
 *   getFeedHistory()/getClientFeedHistory() already return.
 * @param todayLocalDate The member's current local_date, so "this week"
 *   means "the 7 days ending today," not a fixed calendar week.
 */
export function buildFeedMemory(
  historyPairs: FeedHistoryPair[],
  todayLocalDate: string
): FeedMemory {
  const weekStart = addDaysToLocalDate(todayLocalDate, -7);
  const previousWeekStart = addDaysToLocalDate(todayLocalDate, -14);

  let completedCount = 0;
  let completedThisWeek = 0;
  let skippedCount = 0;
  let reflectionsWritten = 0;
  const savedNotCompleted: SavedItem[] = [];
  const categoryCounts = zeroCategoryCounts();
  const categoryCountsThisWeek = zeroCategoryCounts();
  const categoryCountsPreviousWeek = zeroCategoryCounts();
  const recentCategories: FourDoctorsCategory[] = [];

  for (const { feedItem, content } of historyPairs) {
    const inThisWeek = feedItem.local_date >= weekStart;
    const inPreviousWeek =
      feedItem.local_date >= previousWeekStart && feedItem.local_date < weekStart;

    if (feedItem.completed_at) {
      completedCount++;
      if (inThisWeek) completedThisWeek++;
      if (content) {
        categoryCounts[content.four_doctors_category]++;
        if (inThisWeek) categoryCountsThisWeek[content.four_doctors_category]++;
        if (inPreviousWeek) categoryCountsPreviousWeek[content.four_doctors_category]++;
      }
    }
    if (feedItem.dismissed_at) skippedCount++;
    if (feedItem.reflection_submitted_at) reflectionsWritten++;
    if (feedItem.saved_at && !feedItem.completed_at) {
      savedNotCompleted.push({
        feedItemId: feedItem.id,
        contentItemId: feedItem.content_item_id,
        title: content?.title ?? 'a saved lesson',
        localDate: feedItem.local_date,
      });
    }
    if (content && recentCategories.length < 14) {
      recentCategories.push(content.four_doctors_category);
    }
  }

  return {
    completedCount,
    completedThisWeek,
    skippedCount,
    reflectionsWritten,
    savedNotCompleted,
    categoryCounts,
    categoryCountsThisWeek,
    categoryCountsPreviousWeek,
    recentCategories,
    mostFrequentCategory: pickMostFrequent(categoryCounts),
  };
}

const WIN_CATEGORIES = new Set<NarrativeItem['category']>([
  'recent_wins',
  'successful_interventions',
  'progress_trends',
]);
const STRUGGLE_CATEGORIES = new Set<NarrativeItem['category']>([
  'barriers_to_adherence',
  'unresolved_concerns',
]);

function mostRecent(items: NarrativeItem[]): NarrativeItem | null {
  return (
    items
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ??
    null
  );
}

/** The most recent genuine win — a real, already-recorded narrative item, never inferred here. */
export function pickRecentWin(narrativeItems: NarrativeItem[]): NarrativeItem | null {
  return mostRecent(
    narrativeItems.filter(
      (item) => item.status === 'active' && item.member_visible && WIN_CATEGORIES.has(item.category)
    )
  );
}

/** The most recent genuine struggle — same discipline as pickRecentWin. */
export function pickRecentStruggle(narrativeItems: NarrativeItem[]): NarrativeItem | null {
  return mostRecent(
    narrativeItems.filter(
      (item) =>
        item.status === 'active' && item.member_visible && STRUGGLE_CATEGORIES.has(item.category)
    )
  );
}
