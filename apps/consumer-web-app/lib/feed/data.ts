/**
 * Database access for the Daily Coaching Feed — mirrors the shape of
 * lib/ai/data.ts, lib/safety/data.ts, lib/narrative/data.ts: pure
 * functions taking a SupabaseClient, RLS (migration 30) decides who may
 * read/write what. Inserts generate their own id and skip `.select()`,
 * same defensive discipline established in Milestone 1/2 (see
 * lib/safety/data.ts's insertReviewQueueEntry for the original writeup).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { forgetReads, readOnce } from '../data/readOnce';
import type {
  MefContentItem,
  DailyFeedItem,
  DailyFeedEventType,
} from '@mef/shared-types-contracts';

const CONTENT_CACHE_TTL_MS = 5 * 60_000; // content changes rarely — an admin publishing new content is a deliberate, infrequent action
let contentCache: { items: MefContentItem[]; expiresAt: number } | null = null;

export async function listPublishedContent(supabase: SupabaseClient): Promise<MefContentItem[]> {
  const now = Date.now();
  if (contentCache && contentCache.expiresAt > now) return contentCache.items;

  const { data, error } = await supabase
    .from('mef_content_items')
    .select('*')
    .eq('status', 'published');
  if (error) {
    console.error('listPublishedContent failed', error);
    return [];
  }

  const items = (data ?? []) as MefContentItem[];
  contentCache = { items, expiresAt: now + CONTENT_CACHE_TTL_MS };
  return items;
}

/** Test-only escape hatch, mirrors lib/ai/data.ts's clearAiConfigCacheForTests. */
export function clearContentCacheForTests(): void {
  contentCache = null;
}

export async function getContentItem(
  supabase: SupabaseClient,
  contentItemId: string
): Promise<MefContentItem | null> {
  const { data, error } = await supabase
    .from('mef_content_items')
    .select('*')
    .eq('id', contentItemId)
    .maybeSingle();

  if (error) {
    console.error('getContentItem failed', error);
    return null;
  }
  return data as MefContentItem | null;
}

/**
 * Batched sibling of getContentItem — the Coaching Brain, the Intelligence
 * Engine's Member Health Profile, and the Morning Brief's continuity
 * sentence each build up to 30-100 (feedItem, content) pairs from feed
 * history, and previously looked up each content_item_id with its own
 * `.eq('id', x).maybeSingle()` round trip (an N+1 fetch over what's really
 * one bounded set of ids). One `.in('id', ids)` query returns the exact
 * same rows; callers key into the returned Map instead of awaiting a
 * fresh query per item — `undefined` (treated as `null`) for the same
 * cases getContentItem would have returned null (a missing/deleted id).
 */
export async function getContentItemsByIds(
  supabase: SupabaseClient,
  contentItemIds: string[]
): Promise<Map<string, MefContentItem>> {
  const uniqueIds = [...new Set(contentItemIds)];
  if (uniqueIds.length === 0) return new Map();

  const { data, error } = await supabase.from('mef_content_items').select('*').in('id', uniqueIds);

  if (error) {
    console.error('getContentItemsByIds failed', error);
    return new Map();
  }
  return new Map((data as MefContentItem[]).map((item) => [item.id, item]));
}

export async function getFeedItemForDate(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string
): Promise<DailyFeedItem | null> {
  const { data, error } = await supabase
    .from('daily_feed_items')
    .select('*')
    .eq('member_id', memberId)
    .eq('local_date', localDate)
    .maybeSingle();

  if (error) {
    console.error('getFeedItemForDate failed', error);
    return null;
  }
  return data as DailyFeedItem | null;
}

export async function getFeedItemById(
  supabase: SupabaseClient,
  feedItemId: string
): Promise<DailyFeedItem | null> {
  const { data, error } = await supabase
    .from('daily_feed_items')
    .select('*')
    .eq('id', feedItemId)
    .maybeSingle();

  if (error) {
    console.error('getFeedItemById failed', error);
    return null;
  }
  return data as DailyFeedItem | null;
}

/** Most recent feed history, newest first — used both for repetition avoidance (selector) and the member's "revisit a past day" view. */
export async function listFeedHistory(
  supabase: SupabaseClient,
  memberId: string,
  limit = 30
): Promise<DailyFeedItem[]> {
  const { data, error } = await supabase
    .from('daily_feed_items')
    .select('*')
    .eq('member_id', memberId)
    .order('local_date', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('listFeedHistory failed', error);
    return [];
  }
  return data as DailyFeedItem[];
}

export type InsertFeedItemInput = {
  memberId: string;
  localDate: string;
  contentItemId: string;
  focusText: string;
  whyText: string;
  selectionReasons: Record<string, unknown>;
  safetyClassificationId: string | null;
  coachAssignedBy: string | null;
  coachNote: string | null;
};

export async function insertFeedItem(
  supabase: SupabaseClient,
  input: InsertFeedItemInput
): Promise<DailyFeedItem | null> {
  const id = randomUUID();
  const now = new Date().toISOString();

  const { error } = await supabase.from('daily_feed_items').insert({
    id,
    member_id: input.memberId,
    local_date: input.localDate,
    content_item_id: input.contentItemId,
    focus_text: input.focusText,
    why_text: input.whyText,
    selection_reasons: input.selectionReasons,
    safety_classification_id: input.safetyClassificationId,
    coach_assigned_by: input.coachAssignedBy,
    coach_note: input.coachNote,
  });

  if (error) {
    // Most likely the (member_id, local_date) unique constraint — a
    // concurrent request already created today's feed. Not an error the
    // caller needs to see; getOrCreateTodaysFeed re-reads afterward.
    console.error('insertFeedItem failed', error);
    return null;
  }

  return {
    id,
    member_id: input.memberId,
    local_date: input.localDate,
    content_item_id: input.contentItemId,
    focus_text: input.focusText,
    why_text: input.whyText,
    selection_reasons: input.selectionReasons,
    safety_classification_id: input.safetyClassificationId,
    coach_assigned_by: input.coachAssignedBy,
    coach_note: input.coachNote,
    replaced_content_item_id: null,
    completed_at: null,
    saved_at: null,
    dismissed_at: null,
    reflection_response: null,
    reflection_submitted_at: null,
    helpful: null,
    created_at: now,
    updated_at: now,
  };
}

export async function updateFeedItem(
  supabase: SupabaseClient,
  feedItemId: string,
  patch: Record<string, unknown>
): Promise<boolean> {
  const { error } = await supabase
    .from('daily_feed_items')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', feedItemId);

  if (error) {
    console.error('updateFeedItem failed', error);
    return false;
  }
  return true;
}

export async function insertFeedEvent(
  supabase: SupabaseClient,
  input: {
    feedItemId: string;
    memberId: string;
    eventType: DailyFeedEventType;
    metadata?: Record<string, unknown> | undefined;
  }
): Promise<void> {
  const { error } = await supabase.from('daily_feed_events').insert({
    feed_item_id: input.feedItemId,
    member_id: input.memberId,
    event_type: input.eventType,
    metadata: input.metadata ?? {},
  });

  // Analytics logging must never throw — same discipline as lib/ai/data.ts's insertLog.
  if (error) {
    console.error('insertFeedEvent failed', error);
  }
}

/** The topics currently restricted for this member per Milestone 1's still-open coach review cases — see migration 30's get_member_restricted_topics for why this goes through an RPC rather than a direct table read. */
export async function getMemberRestrictedTopics(
  supabase: SupabaseClient,
  memberId: string
): Promise<string[]> {
  // ONE READ PER REQUEST (Home speed build, 2026-08-28). Seven engines ask
  // this on one Home load, each before deciding whether it may say
  // anything about a topic under coach review. Forgotten by
  // lib/safety/service.ts's evaluateConcern, which is the only thing in a
  // member request that can open a new review case.
  return readOnce(`${RESTRICTED_TOPICS_KEY_PREFIX}${memberId}`, () =>
    readMemberRestrictedTopics(supabase, memberId)
  );
}

export const RESTRICTED_TOPICS_KEY_PREFIX = 'restrictedTopics:';

/** Called by the one write that can change what topics are restricted for a member inside a single request. */
export function forgetRestrictedTopics(memberId: string): void {
  forgetReads(`${RESTRICTED_TOPICS_KEY_PREFIX}${memberId}`);
}

async function readMemberRestrictedTopics(
  supabase: SupabaseClient,
  memberId: string
): Promise<string[]> {
  const { data, error } = await supabase.rpc('get_member_restricted_topics', {
    p_member: memberId,
  });
  if (error) {
    console.error('getMemberRestrictedTopics failed', error);
    return [];
  }
  return (data as string[] | null) ?? [];
}
