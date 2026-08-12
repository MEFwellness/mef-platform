'use server';

import { createClient } from '@/lib/supabase/server';
import type { DailyFeedItem, MefContentItem } from '@mef/shared-types-contracts';
import type { ActionResult } from './auth';
import { resolveLocalDate } from './checkin';
import {
  getOrCreateTodaysFeed,
  markFeedOpened,
  completeFeedAction,
  saveFeedItem,
  dismissFeedItem,
  submitFeedReflection,
  rateFeedHelpfulness,
  coachReplaceFeedItem,
} from '@/lib/feed/service';
import {
  listFeedHistory,
  getContentItem,
  getContentItemsByIds,
  listPublishedContent,
  getFeedItemById,
} from '@/lib/feed/data';
import { recalculateIntelligenceCore } from '@/lib/intelligence-core/service';
import { trackProductEvent, resolveMemberTimezone } from '@/lib/analytics/track';
import type { EngagementAction } from '@/lib/analytics/surfaces';

/**
 * Product analytics for Today's Focus, the daily feed item the Today
 * screen leads with. 'opened_item' is the view; every other action here is
 * a real interaction (completed, saved, dismissed, reflected on, rated).
 * The item's content, the member's reflection text, and their helpfulness
 * rating never appear in the payload: only that an interaction of that
 * kind happened.
 */
async function trackTodaysFocus(
  supabase: ReturnType<typeof createClient>,
  memberId: string,
  action: EngagementAction
): Promise<void> {
  await trackProductEvent(supabase, {
    memberId,
    eventType: 'feature_engaged',
    timezone: await resolveMemberTimezone(supabase, memberId),
    payload: { feature: 'todays_focus', action },
  });
}

async function currentMemberLocalDate(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<string> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', userId)
    .single();
  const timezone = profile?.timezone ?? 'America/New_York';
  return resolveLocalDate(
    new Date(new Date().toLocaleString('en-US', { timeZone: timezone })),
    false
  );
}

export async function getTodaysFeed(): Promise<{
  feedItem: DailyFeedItem;
  content: MefContentItem;
} | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const localDate = await currentMemberLocalDate(supabase, user.id);
  const feedItem = await getOrCreateTodaysFeed(supabase, user.id, localDate);
  if (!feedItem) return null;

  const content = await getContentItem(supabase, feedItem.content_item_id);
  if (!content) return null;

  return { feedItem, content };
}

/** Past feed items (excluding today), newest first, each paired with its content item — for the "revisit a past day" surface. */
export async function getFeedHistory(): Promise<
  { feedItem: DailyFeedItem; content: MefContentItem | null }[]
> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const localDate = await currentMemberLocalDate(supabase, user.id);
  const items = (await listFeedHistory(supabase, user.id, 30)).filter(
    (item) => item.local_date !== localDate
  );

  const contentById = await getContentItemsByIds(
    supabase,
    items.map((item) => item.content_item_id)
  );
  return items.map((feedItem) => ({
    feedItem,
    content: contentById.get(feedItem.content_item_id) ?? null,
  }));
}

export async function markTodaysFeedOpened(feedItemId: string): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await markFeedOpened(supabase, feedItemId, user.id);
  // Product analytics, "Today's Focus was viewed." This action already
  // fires exactly once per real page view (FeedInteractions calls it from
  // a mount effect keyed on the stable daily item id), so it is the right
  // and only place for the view half of Today's Focus without adding a
  // second trigger that could double count.
  await trackTodaysFocus(supabase, user.id, 'opened_item');
}

export async function completeFeedActionForMember(feedItemId: string): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };
  const ok = await completeFeedAction(supabase, feedItemId, user.id);
  if (ok) {
    const localDate = await currentMemberLocalDate(supabase, user.id);
    await recalculateIntelligenceCore(supabase, user.id, localDate);
    await trackTodaysFocus(supabase, user.id, 'completed_item');
  }
  return ok ? {} : { error: 'Could not update this item.' };
}

export async function saveFeedItemForMember(feedItemId: string): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };
  const ok = await saveFeedItem(supabase, feedItemId, user.id);
  if (ok) await trackTodaysFocus(supabase, user.id, 'advanced');
  return ok ? {} : { error: 'Could not save this item.' };
}

export async function dismissFeedItemForMember(feedItemId: string): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };
  const ok = await dismissFeedItem(supabase, feedItemId, user.id);
  if (ok) await trackTodaysFocus(supabase, user.id, 'dismissed_item');
  return ok ? {} : { error: 'Could not dismiss this item.' };
}

export async function submitFeedReflectionForMember(
  feedItemId: string,
  response: string
): Promise<ActionResult> {
  const trimmed = response.trim();
  if (!trimmed) return { error: 'Reflection cannot be empty.' };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };
  const ok = await submitFeedReflection(supabase, feedItemId, user.id, trimmed);
  if (ok) {
    const localDate = await currentMemberLocalDate(supabase, user.id);
    await recalculateIntelligenceCore(supabase, user.id, localDate);
    // The reflection text itself is never in the analytics payload, only
    // the fact that one was submitted.
    await trackTodaysFocus(supabase, user.id, 'advanced');
  }
  return ok ? {} : { error: 'Could not save your reflection.' };
}

export async function rateFeedHelpfulnessForMember(
  feedItemId: string,
  helpful: boolean
): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };
  const ok = await rateFeedHelpfulness(supabase, feedItemId, user.id, helpful);
  if (ok) await trackTodaysFocus(supabase, user.id, 'advanced');
  return ok ? {} : { error: 'Could not save your rating.' };
}

// ---- Coach controls ----

export async function getClientFeedHistory(
  clientId: string
): Promise<{ feedItem: DailyFeedItem; content: MefContentItem | null }[]> {
  const supabase = createClient();
  const items = await listFeedHistory(supabase, clientId, 30);
  const contentById = await getContentItemsByIds(
    supabase,
    items.map((item) => item.content_item_id)
  );
  return items.map((feedItem) => ({
    feedItem,
    content: contentById.get(feedItem.content_item_id) ?? null,
  }));
}

export async function listContentLibraryForCoach(): Promise<MefContentItem[]> {
  const supabase = createClient();
  return listPublishedContent(supabase);
}

export async function coachReplaceFeedItemAction(
  feedItemId: string,
  newContentItemId: string,
  note: string
): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const existing = await getFeedItemById(supabase, feedItemId);
  if (!existing) return { error: 'Feed item not found.' };

  const ok = await coachReplaceFeedItem(
    supabase,
    feedItemId,
    user.id,
    newContentItemId,
    note || null
  );
  return ok
    ? {}
    : { error: 'Could not replace this item. You may not be assigned to this client.' };
}
