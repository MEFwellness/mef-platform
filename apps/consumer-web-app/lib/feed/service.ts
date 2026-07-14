/**
 * The Daily Coaching Feed's orchestrating service — one primary feed per
 * member per local_date (idempotent: re-reads instead of regenerating if
 * one already exists for today), plus the engagement/analytics
 * functions app/actions/feed.ts exposes to the UI.
 *
 * Every selected item passes through Milestone 1's safety classifier as
 * a defense-in-depth check (content library items are pre-authored at a
 * safe classification level and contraindication-filtered already, so
 * this should essentially never fire in practice — same "almost always a
 * no-op, but real" posture as lib/safety/outputGuard.ts's guard on AI
 * agent output) before ever being persisted.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DailyFeedItem, DailyFeedEventType } from '@mef/shared-types-contracts';
import { listNarrativeItems } from '../narrative/data';
import { classifyConcern } from '../safety/classifier';
import { evaluateConcern } from '../safety/service';
import { gatherCoachingSignals } from '../brain/service';
import { buildCoachingDecision } from '../brain/decision';
import { isWellnessMetricFocus } from '../brain/priorityEngine';
import {
  listPublishedContent,
  getFeedItemForDate,
  getFeedItemById,
  listFeedHistory,
  insertFeedItem,
  updateFeedItem,
  insertFeedEvent,
  getMemberRestrictedTopics,
} from './data';
import { selectContentItem } from './selector';
import { buildFocusText, buildWhyText, selectionReasonsToJson, type SelectionReason } from './copy';

/** Idempotent — returns the existing row for (memberId, localDate) if one exists, otherwise selects and persists a new one. Never changes the current day's content once generated, per the milestone's "avoid changing the current day's content repeatedly" requirement. */
export async function getOrCreateTodaysFeed(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string
): Promise<DailyFeedItem | null> {
  const existing = await getFeedItemForDate(supabase, memberId, localDate);
  if (existing) return existing;

  const [library, restrictedTopics, recentHistory, narrativeItems, signals] = await Promise.all([
    listPublishedContent(supabase),
    getMemberRestrictedTopics(supabase, memberId),
    listFeedHistory(supabase, memberId, 30),
    listNarrativeItems(supabase, memberId, { statusFilter: ['active'] }),
    gatherCoachingSignals(supabase, memberId, localDate),
  ]);

  if (library.length === 0) return null; // honest empty state — no published content yet

  // Milestone 5: content selection asks the Coaching Brain for today's
  // focus rather than computing a Daily Wellness Index priority itself —
  // see lib/brain/. Only the 8 metric-driven focus areas map onto a
  // content item's own priorityMetric tag; 'consistency' / 'reflection' /
  // 'education' fall through to the narrative-match/rotation logic below,
  // same as no priority metric at all.
  const focus = buildCoachingDecision(signals).focus;
  const priorityMetric = isWellnessMetricFocus(focus) ? focus : null;

  const selection = selectContentItem({
    library,
    restrictedTopics,
    recentHistory,
    asOfLocalDate: localDate,
    priorityMetric,
    narrativeItems,
    coachAssignedContentItemId: null,
  });
  if (!selection) return null;

  let contentItem = selection.contentItem;
  let reason: SelectionReason = selection.reason;
  let focusText = buildFocusText(contentItem, reason);
  let whyText = buildWhyText(reason);
  let safetyClassificationId: string | null = null;

  // Defense-in-depth safety gate (Milestone 1 integration, requirement:
  // "every selected lesson... must pass through the Milestone 1 safety
  // system"). Fast-pathed exactly like lib/safety/outputGuard.ts.
  const quickCheck = classifyConcern({
    text: `${contentItem.title} ${contentItem.summary} ${focusText} ${whyText}`,
  });
  if (quickCheck.classificationLevel !== 'standard_coaching') {
    const safeFallback =
      library.find((item) => item.contraindication_tags.length === 0) ?? library[0]!;
    contentItem = safeFallback;
    reason = { kind: 'goal_rotation' };
    focusText = buildFocusText(contentItem, reason);
    whyText = buildWhyText(reason);

    const evaluation = await evaluateConcern(supabase, {
      memberId,
      sourceFeature: 'daily_feed',
      sourceRecordType: 'mef_content_item',
      sourceRecordId: selection.contentItem.id,
      text: `${selection.contentItem.title} ${selection.contentItem.summary}`,
      actorType: 'system',
    });
    safetyClassificationId = evaluation?.classification.id ?? null;
  }

  const created = await insertFeedItem(supabase, {
    memberId,
    localDate,
    contentItemId: contentItem.id,
    focusText,
    whyText,
    selectionReasons: selectionReasonsToJson(reason),
    safetyClassificationId,
    coachAssignedBy: null,
    coachNote: null,
  });

  const feedItem = created ?? (await getFeedItemForDate(supabase, memberId, localDate)); // handles a concurrent-request race on the unique constraint
  if (feedItem) {
    await insertFeedEvent(supabase, { feedItemId: feedItem.id, memberId, eventType: 'impression' });
  }
  return feedItem;
}

async function logEngagement(
  supabase: SupabaseClient,
  feedItemId: string,
  memberId: string,
  eventType: DailyFeedEventType,
  metadata?: Record<string, unknown>
): Promise<void> {
  await insertFeedEvent(supabase, { feedItemId, memberId, eventType, metadata });
}

export async function markFeedOpened(
  supabase: SupabaseClient,
  feedItemId: string,
  memberId: string
): Promise<void> {
  await logEngagement(supabase, feedItemId, memberId, 'opened');
}

export async function completeFeedAction(
  supabase: SupabaseClient,
  feedItemId: string,
  memberId: string
): Promise<boolean> {
  const ok = await updateFeedItem(supabase, feedItemId, { completed_at: new Date().toISOString() });
  if (ok) {
    await logEngagement(supabase, feedItemId, memberId, 'completed');
    await logEngagement(supabase, feedItemId, memberId, 'action_completed');
  }
  return ok;
}

export async function saveFeedItem(
  supabase: SupabaseClient,
  feedItemId: string,
  memberId: string
): Promise<boolean> {
  const ok = await updateFeedItem(supabase, feedItemId, { saved_at: new Date().toISOString() });
  if (ok) await logEngagement(supabase, feedItemId, memberId, 'saved');
  return ok;
}

export async function dismissFeedItem(
  supabase: SupabaseClient,
  feedItemId: string,
  memberId: string
): Promise<boolean> {
  const ok = await updateFeedItem(supabase, feedItemId, { dismissed_at: new Date().toISOString() });
  if (ok) await logEngagement(supabase, feedItemId, memberId, 'dismissed');
  return ok;
}

export async function submitFeedReflection(
  supabase: SupabaseClient,
  feedItemId: string,
  memberId: string,
  response: string
): Promise<boolean> {
  const ok = await updateFeedItem(supabase, feedItemId, {
    reflection_response: response,
    reflection_submitted_at: new Date().toISOString(),
  });
  if (ok) await logEngagement(supabase, feedItemId, memberId, 'reflection_submitted');
  return ok;
}

export async function rateFeedHelpfulness(
  supabase: SupabaseClient,
  feedItemId: string,
  memberId: string,
  helpful: boolean
): Promise<boolean> {
  const ok = await updateFeedItem(supabase, feedItemId, { helpful });
  if (ok) await logEngagement(supabase, feedItemId, memberId, helpful ? 'helpful' : 'not_helpful');
  return ok;
}

/** A coach replacing today's (or a future/past) feed item with a different content item — records what was replaced and why, and logs the coach_replacement analytics signal. */
export async function coachReplaceFeedItem(
  supabase: SupabaseClient,
  feedItemId: string,
  coachId: string,
  newContentItemId: string,
  note: string | null
): Promise<boolean> {
  const existing = await getFeedItemById(supabase, feedItemId);
  if (!existing) return false;

  const ok = await updateFeedItem(supabase, feedItemId, {
    content_item_id: newContentItemId,
    replaced_content_item_id: existing.content_item_id,
    coach_assigned_by: coachId,
    coach_note: note,
    focus_text: 'Your coach chose today’s lesson for you.',
    why_text: 'Your coach selected this for you directly.',
  });
  if (ok)
    await logEngagement(supabase, feedItemId, existing.member_id, 'coach_replacement', {
      newContentItemId,
    });
  return ok;
}
