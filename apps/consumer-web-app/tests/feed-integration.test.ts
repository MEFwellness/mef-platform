/**
 * End-to-end integration test for the Daily Coaching Feed
 * (lib/feed/service.ts, app/actions/feed.ts) against real local Supabase
 * — real RLS, no mocked Supabase client.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import {
  getOrCreateTodaysFeed,
  completeFeedAction,
  saveFeedItem,
  dismissFeedItem,
  submitFeedReflection,
  rateFeedHelpfulness,
  coachReplaceFeedItem,
} from '../lib/feed/service';
import {
  getMemberRestrictedTopics,
  listPublishedContent,
  clearContentCacheForTests,
} from '../lib/feed/data';

const memberIds = [TEST_USERS.memberOne.id, TEST_USERS.memberTwo.id];
const TEST_DATE = '2020-06-01'; // far-past date dedicated to this suite, avoids seed collisions
const TEST_DATE_2 = '2020-06-02';

afterAll(async () => {
  const service = serviceRoleClient();
  await service
    .from('daily_feed_events')
    .delete()
    .in(
      'feed_item_id',
      (await service.from('daily_feed_items').select('id').in('member_id', memberIds)).data?.map(
        (r) => r.id
      ) ?? []
    );
  await service.from('daily_feed_items').delete().in('member_id', memberIds);
  await service.from('safety_review_queue').delete().in('member_id', memberIds);
  await service.from('safety_classifications').delete().in('member_id', memberIds);
});

describe('mef_content_items — published library is readable, drafts are not', () => {
  it('an authenticated member can read every published item', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const { data, error } = await client
      .from('mef_content_items')
      .select('id')
      .eq('status', 'published');
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThanOrEqual(20);
  });

  it('a member cannot see a draft content item', async () => {
    const service = serviceRoleClient();
    const { data: draft } = await service
      .from('mef_content_items')
      .insert({
        content_key: 'draft-test-item',
        title: 'Unpublished Draft',
        summary: 'Not ready yet.',
        body: 'Draft body.',
        estimated_reading_minutes: 1,
        four_doctors_category: 'doctor_quiet',
        status: 'draft',
        suggested_action: 'N/A',
        reflection_prompt: 'N/A',
      })
      .select('id')
      .single();

    const client = await signInAs(TEST_USERS.memberOne);
    const { data } = await client.from('mef_content_items').select('id').eq('id', draft!.id);
    expect(data).toEqual([]);

    await service.from('mef_content_items').delete().eq('id', draft!.id);
  });
});

describe('getOrCreateTodaysFeed — creation, idempotency, historical preservation', () => {
  it('creates exactly one feed item per (member, date), with an impression event', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    clearContentCacheForTests();

    const first = await getOrCreateTodaysFeed(client, TEST_USERS.memberOne.id, TEST_DATE);
    expect(first).not.toBeNull();
    expect(first!.local_date).toBe(TEST_DATE);
    expect(first!.content_item_id).toBeTruthy();

    const { data: events } = await client
      .from('daily_feed_events')
      .select('event_type')
      .eq('feed_item_id', first!.id);
    expect((events ?? []).map((e) => e.event_type)).toContain('impression');
  });

  it('does not regenerate — a second call on the same date returns the identical row', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const again = await getOrCreateTodaysFeed(client, TEST_USERS.memberOne.id, TEST_DATE);

    const { data: allForDate } = await client
      .from('daily_feed_items')
      .select('id')
      .eq('member_id', TEST_USERS.memberOne.id)
      .eq('local_date', TEST_DATE);
    expect(allForDate).toHaveLength(1);
    expect(again!.local_date).toBe(TEST_DATE);
  });

  it('preserves history — a different local_date creates a second, independent row', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const day2 = await getOrCreateTodaysFeed(client, TEST_USERS.memberOne.id, TEST_DATE_2);
    expect(day2).not.toBeNull();
    expect(day2!.local_date).toBe(TEST_DATE_2);

    const { data: history } = await client
      .from('daily_feed_items')
      .select('local_date')
      .eq('member_id', TEST_USERS.memberOne.id)
      .order('local_date', { ascending: true });
    expect((history ?? []).map((h) => h.local_date)).toEqual([TEST_DATE, TEST_DATE_2]);
  });
});

describe('Engagement states + analytics signals', () => {
  it('completing, saving, and rating helpfulness each set state and log an event', async () => {
    const client = await signInAs(TEST_USERS.memberTwo);
    const feedItem = await getOrCreateTodaysFeed(client, TEST_USERS.memberTwo.id, TEST_DATE);

    expect(await completeFeedAction(client, feedItem!.id, TEST_USERS.memberTwo.id)).toBe(true);
    expect(await saveFeedItem(client, feedItem!.id, TEST_USERS.memberTwo.id)).toBe(true);
    expect(
      await submitFeedReflection(client, feedItem!.id, TEST_USERS.memberTwo.id, 'It went well.')
    ).toBe(true);
    expect(await rateFeedHelpfulness(client, feedItem!.id, TEST_USERS.memberTwo.id, true)).toBe(
      true
    );

    const { data: updated } = await client
      .from('daily_feed_items')
      .select('*')
      .eq('id', feedItem!.id)
      .single();
    expect(updated.completed_at).not.toBeNull();
    expect(updated.saved_at).not.toBeNull();
    expect(updated.reflection_response).toBe('It went well.');
    expect(updated.helpful).toBe(true);

    const { data: events } = await client
      .from('daily_feed_events')
      .select('event_type')
      .eq('feed_item_id', feedItem!.id);
    const types = (events ?? []).map((e) => e.event_type);
    expect(types).toEqual(
      expect.arrayContaining([
        'impression',
        'completed',
        'action_completed',
        'saved',
        'reflection_submitted',
        'helpful',
      ])
    );
  });

  it('dismissing sets dismissed_at and logs a dismissed event', async () => {
    const client = await signInAs(TEST_USERS.memberTwo);
    const feedItem = await getOrCreateTodaysFeed(client, TEST_USERS.memberTwo.id, TEST_DATE_2);
    expect(await dismissFeedItem(client, feedItem!.id, TEST_USERS.memberTwo.id)).toBe(true);

    const { data: updated } = await client
      .from('daily_feed_items')
      .select('dismissed_at')
      .eq('id', feedItem!.id)
      .single();
    expect(updated!.dismissed_at).not.toBeNull();
  });
});

describe('Milestone 1 safety integration — get_member_restricted_topics', () => {
  it('reflects an open review case and clears once it is closed', async () => {
    const service = serviceRoleClient();
    const { data: classification } = await service
      .from('safety_classifications')
      .insert({
        member_id: TEST_USERS.memberOne.id,
        source_feature: 'daily_checkin',
        classification_level: 'coach_review_required',
        urgency: 'medium',
        coaching_allowed: true,
        coach_review_required: true,
        acknowledgment_required: true,
        escalation_action: 'coach_review_queue',
        policy_version: 'test-v1',
      })
      .select('id')
      .single();

    const { data: review } = await service
      .from('safety_review_queue')
      .insert({
        member_id: TEST_USERS.memberOne.id,
        classification_id: classification!.id,
        source_feature: 'daily_checkin',
        classification_level: 'coach_review_required',
        urgency: 'medium',
        status: 'new',
        restrictions_applied: { restrictedTopics: ['medication'] },
      })
      .select('id')
      .single();

    const memberClient = await signInAs(TEST_USERS.memberOne);
    const openTopics = await getMemberRestrictedTopics(memberClient, TEST_USERS.memberOne.id);
    expect(openTopics).toContain('medication');

    await service.from('safety_review_queue').update({ status: 'closed' }).eq('id', review!.id);

    const closedTopics = await getMemberRestrictedTopics(memberClient, TEST_USERS.memberOne.id);
    expect(closedTopics).not.toContain('medication');
  });
});

describe('Coach controls — preview, replace', () => {
  it('coachOne (assigned to memberOne) can replace a feed item and the replacement is recorded', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);
    const original = await getOrCreateTodaysFeed(memberClient, TEST_USERS.memberOne.id, TEST_DATE);

    const coachClient = await signInAs(TEST_USERS.coachOne);
    const library = await listPublishedContent(coachClient);
    const replacement = library.find((item) => item.id !== original!.content_item_id)!;

    const ok = await coachReplaceFeedItem(
      coachClient,
      original!.id,
      TEST_USERS.coachOne.id,
      replacement.id,
      'Better fit.'
    );
    expect(ok).toBe(true);

    const { data: updated } = await coachClient
      .from('daily_feed_items')
      .select('*')
      .eq('id', original!.id)
      .single();
    expect(updated.content_item_id).toBe(replacement.id);
    expect(updated.replaced_content_item_id).toBe(original!.content_item_id);
    expect(updated.coach_assigned_by).toBe(TEST_USERS.coachOne.id);
    expect(updated.coach_note).toBe('Better fit.');

    const { data: events } = await coachClient
      .from('daily_feed_events')
      .select('event_type')
      .eq('feed_item_id', original!.id)
      .eq('event_type', 'coach_replacement');
    expect(events).toHaveLength(1);
  });
});

describe('RLS — authorization boundaries', () => {
  it("a member cannot read another member's feed item", async () => {
    const client = await signInAs(TEST_USERS.memberTwo);
    const { data } = await client
      .from('daily_feed_items')
      .select('*')
      .eq('member_id', TEST_USERS.memberOne.id);
    expect(data).toEqual([]);
  });

  it("an unassigned coach cannot read or replace memberTwo's feed", async () => {
    const memberClient = await signInAs(TEST_USERS.memberTwo);
    const item = await getOrCreateTodaysFeed(memberClient, TEST_USERS.memberTwo.id, '2020-06-03');

    // coachOne is not actively assigned to memberTwo in the seed data.
    const coachClient = await signInAs(TEST_USERS.coachOne);
    const { data } = await coachClient.from('daily_feed_items').select('*').eq('id', item!.id);
    expect(data).toEqual([]);

    const ok = await coachReplaceFeedItem(
      coachClient,
      item!.id,
      TEST_USERS.coachOne.id,
      item!.content_item_id,
      null
    );
    expect(ok).toBe(false);
  });
});
