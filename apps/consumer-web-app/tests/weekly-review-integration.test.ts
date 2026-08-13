/**
 * The Weekly Root Review — real RLS, real tables, real constraints
 * (migration 151).
 *
 * Same philosophy as every other integration suite here: no mocked Supabase
 * client. The data layer's own functions are called with a real signed-in
 * member client, so what is proved is the database's policies and
 * constraints, not a wrapper around them.
 *
 * What this file covers that the pure tests cannot:
 *   * one review row and one week focus row per member per local week, even
 *     under a second concurrent claim;
 *   * each of the three atomic claims (delivered, viewed, acknowledged)
 *     genuinely wins exactly once;
 *   * an answer is written only for a question THIS review asked, and only
 *     with an option that question offers;
 *   * the week focus reaches the daily engine's own read path and comes back
 *     readable;
 *   * a member cannot read or write another member's review or focus;
 *   * the two check constraints really refuse what they say they refuse.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { serviceRoleClient, signInAs, TEST_USERS } from './setup/test-clients';
import {
  claimWeekFocus,
  claimWeeklyReview,
  claimWeeklyReviewAcknowledged,
  claimWeeklyReviewViewed,
  deleteWeeklyReviewForWeek,
  fetchWeeklyReview,
  getWeekFocus,
  getWeeklyReview,
  recordWeeklyReviewAnswer,
} from '@/lib/weekly-review/data';
import { composeWeeklyReview } from '@/lib/weekly-review/compose';
import type { ReviewPlan } from '@/lib/weekly-review/types';
import { richWeek, conflictingWeek, WEEK_START } from './helpers/weeklyReviewFixtures';

const MEMBER = TEST_USERS.memberOne.id;
const OTHER = TEST_USERS.memberTwo.id;

afterEach(async () => {
  const service = serviceRoleClient();
  const ids = [MEMBER, OTHER];
  await service.from('member_weekly_reviews').delete().in('member_id', ids);
  await service.from('member_week_focus').delete().in('member_id', ids);
  await service.from('profiles').update({ is_test: false }).in('id', ids);
});

function plan(): ReviewPlan {
  return composeWeeklyReview(richWeek());
}

describe('one review per member per local week', () => {
  it('claims the week, and a second claim returns the first row without overwriting it', async () => {
    const client = await signInAs(TEST_USERS.memberOne);

    const first = await claimWeeklyReview(client, MEMBER, WEEK_START, plan());
    expect(first.created).toBe(true);
    expect(first.record).not.toBeNull();
    expect(first.record!.shape).toBe('full');
    expect(first.record!.deliveredAt).not.toBeNull();

    // A different plan, deliberately, so an overwrite would be visible.
    const second = await claimWeeklyReview(
      client,
      MEMBER,
      WEEK_START,
      composeWeeklyReview(conflictingWeek())
    );
    expect(second.created).toBe(false);
    expect(second.record!.id).toBe(first.record!.id);
    expect(second.record!.plan.questionKeys).toEqual([]);

    const service = serviceRoleClient();
    const { count } = await service
      .from('member_weekly_reviews')
      .select('id', { count: 'exact', head: true })
      .eq('member_id', MEMBER);
    expect(count).toBe(1);
  });

  it('a different week is a genuinely different row', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    await claimWeeklyReview(client, MEMBER, WEEK_START, plan());
    await claimWeeklyReview(client, MEMBER, '2026-08-17', plan());

    const service = serviceRoleClient();
    const { count } = await service
      .from('member_weekly_reviews')
      .select('id', { count: 'exact', head: true })
      .eq('member_id', MEMBER);
    expect(count).toBe(2);
  });

  it('tells a caller apart: no row yet, versus a read that did not work', async () => {
    const client = await signInAs(TEST_USERS.memberOne);

    // No row: ok, so the caller may compose one.
    expect(await fetchWeeklyReview(client, MEMBER, WEEK_START)).toEqual({
      ok: true,
      record: null,
    });

    // A read RLS refuses is not "no row": another member's week comes back
    // as an empty result under RLS, which is genuinely ok-and-absent from
    // this client's point of view, so the interesting case is a read against
    // a table that cannot be reached at all.
    const broken = await fetchWeeklyReview(
      client,
      MEMBER,
      // A malformed date makes PostgREST return a real error rather than an
      // empty result, which is the shape a missing table also produces.
      'not-a-date'
    );
    expect(broken.ok).toBe(false);
    expect(broken.record).toBeNull();
  });

  it('reads the stored plan back through the sanitizer, unchanged', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const written = plan();
    await claimWeeklyReview(client, MEMBER, WEEK_START, written);

    const read = await getWeeklyReview(client, MEMBER, WEEK_START);
    expect(read!.plan.observations).toEqual(written.observations);
    expect(read!.plan.worked).toEqual(written.worked);
    expect(read!.plan.focus).toEqual(written.focus);
    expect(read!.answers).toEqual({});
  });
});

describe('the three atomic claims', () => {
  it('viewed is won exactly once', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    await claimWeeklyReview(client, MEMBER, WEEK_START, plan());

    expect(await claimWeeklyReviewViewed(client, MEMBER, WEEK_START)).toBe(true);
    expect(await claimWeeklyReviewViewed(client, MEMBER, WEEK_START)).toBe(false);
    expect((await getWeeklyReview(client, MEMBER, WEEK_START))!.viewedAt).not.toBeNull();
  });

  it('acknowledged is won exactly once, so a double tap records one completion', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    await claimWeeklyReview(client, MEMBER, WEEK_START, plan());

    expect(await claimWeeklyReviewAcknowledged(client, MEMBER, WEEK_START)).toBe(true);
    expect(await claimWeeklyReviewAcknowledged(client, MEMBER, WEEK_START)).toBe(false);
    expect((await getWeeklyReview(client, MEMBER, WEEK_START))!.acknowledgedAt).not.toBeNull();
  });

  it('viewed and acknowledged are independent facts', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    await claimWeeklyReview(client, MEMBER, WEEK_START, plan());
    await claimWeeklyReviewAcknowledged(client, MEMBER, WEEK_START);

    const record = await getWeeklyReview(client, MEMBER, WEEK_START);
    expect(record!.acknowledgedAt).not.toBeNull();
    // Never seen as a pop-up, acknowledged from Home's entry: a real state.
    expect(record!.viewedAt).toBeNull();
  });
});

describe('answers', () => {
  it('records an answer to a question this review actually asked', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const asking = composeWeeklyReview(conflictingWeek());
    expect(asking.questionKeys).toEqual(['mixed_picture']);
    await claimWeeklyReview(client, MEMBER, WEEK_START, asking);

    expect(
      await recordWeeklyReviewAnswer(client, MEMBER, WEEK_START, 'mixed_picture', 'both_true')
    ).toBe(true);
    expect((await getWeeklyReview(client, MEMBER, WEEK_START))!.answers).toEqual({
      mixed_picture: 'both_true',
    });
  });

  it('refuses a question this review did NOT ask', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const asking = composeWeeklyReview(conflictingWeek());
    await claimWeeklyReview(client, MEMBER, WEEK_START, asking);

    expect(
      await recordWeeklyReviewAnswer(
        client,
        MEMBER,
        WEEK_START,
        'mixed_response',
        'it_is_landing'
      )
    ).toBe(false);
    expect((await getWeeklyReview(client, MEMBER, WEEK_START))!.answers).toEqual({});
  });

  it('refuses an option that question does not offer, and stores nothing', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    await claimWeeklyReview(client, MEMBER, WEEK_START, composeWeeklyReview(conflictingWeek()));

    expect(
      await recordWeeklyReviewAnswer(
        client,
        MEMBER,
        WEEK_START,
        'mixed_picture',
        'my lower back was bad on Tuesday'
      )
    ).toBe(false);
    expect((await getWeeklyReview(client, MEMBER, WEEK_START))!.answers).toEqual({});
  });

  it('refuses an answer for a week with no review at all', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    expect(
      await recordWeeklyReviewAnswer(client, MEMBER, WEEK_START, 'mixed_picture', 'both_true')
    ).toBe(false);
  });
});

describe('the week focus', () => {
  it('is written once and read back by the daily engine own accessor', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const composed = plan();
    expect(await claimWeekFocus(client, MEMBER, composed.focus)).toBe(true);

    const focus = await getWeekFocus(client, MEMBER, WEEK_START, composed.focus.reason);
    expect(focus).not.toBeNull();
    expect(focus!.actionType).toBe(composed.focus.actionType);
    expect(focus!.threadKey).toBe(composed.focus.threadKey);
    expect(focus!.reason).toBe(composed.focus.reason);
    expect(focus!.sourceEvidence).toEqual(composed.focus.sourceEvidence);
  });

  it('is one row per week, and a second claim does not overwrite it', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    await claimWeekFocus(client, MEMBER, { ...plan().focus, actionType: 'reflection' });
    await claimWeekFocus(client, MEMBER, { ...plan().focus, actionType: 'nutrition' });

    const focus = await getWeekFocus(client, MEMBER, WEEK_START);
    expect(focus!.actionType).toBe('reflection');

    const service = serviceRoleClient();
    const { count } = await service
      .from('member_week_focus')
      .select('id', { count: 'exact', head: true })
      .eq('member_id', MEMBER);
    expect(count).toBe(1);
  });

  it('returns null for a week with no focus, which leaves the daily engine unbiased', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    expect(await getWeekFocus(client, MEMBER, '2026-07-06')).toBeNull();
  });
});

describe('the check constraints really refuse', () => {
  it('refuses a focus that names nothing', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const { error } = await client.from('member_week_focus').insert({
      member_id: MEMBER,
      week_start: WEEK_START,
      focus_action_type: null,
      focus_thread_key: null,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain('member_week_focus_names_something');
  });

  it('refuses an action type outside the five the ledger uses', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const { error } = await client.from('member_week_focus').insert({
      member_id: MEMBER,
      week_start: WEEK_START,
      focus_action_type: 'breathing',
    });
    expect(error).not.toBeNull();
  });

  it('refuses a shape outside full and thin', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const { error } = await client.from('member_weekly_reviews').insert({
      member_id: MEMBER,
      week_start: WEEK_START,
      shape: 'partial',
      plan: {},
    });
    expect(error).not.toBeNull();
  });
});

describe('row level security', () => {
  it('keeps one member out of another member review', async () => {
    const owner = await signInAs(TEST_USERS.memberOne);
    await claimWeeklyReview(owner, MEMBER, WEEK_START, plan());

    const intruder = await signInAs(TEST_USERS.memberTwo);
    expect(await getWeeklyReview(intruder, MEMBER, WEEK_START)).toBeNull();
    expect(await getWeekFocus(intruder, MEMBER, WEEK_START)).toBeNull();
  });

  it('stops one member writing a review for another', async () => {
    const intruder = await signInAs(TEST_USERS.memberTwo);
    const { error } = await intruder.from('member_weekly_reviews').insert({
      member_id: MEMBER,
      week_start: WEEK_START,
      shape: 'full',
      plan: {},
    });
    expect(error).not.toBeNull();
  });

  it('stops one member writing a week focus for another', async () => {
    const intruder = await signInAs(TEST_USERS.memberTwo);
    const { error } = await intruder.from('member_week_focus').insert({
      member_id: MEMBER,
      week_start: WEEK_START,
      focus_action_type: 'reset',
    });
    expect(error).not.toBeNull();
  });

  it('refuses a delete to a member who is not flagged is_test, in the database itself', async () => {
    const service = serviceRoleClient();
    await service.from('profiles').update({ is_test: false }).eq('id', MEMBER);

    const client = await signInAs(TEST_USERS.memberOne);
    await claimWeeklyReview(client, MEMBER, WEEK_START, plan());
    await claimWeekFocus(client, MEMBER, plan().focus);

    const deleted = await deleteWeeklyReviewForWeek(client, MEMBER, WEEK_START);
    // Zero rows AND no error: the policy silently matched nothing, which is
    // how PostgREST reports a delete RLS refused. The error field is what
    // tells this apart from a delete that could not run at all.
    expect(deleted).toEqual({ reviews: 0, focus: 0, error: null });
    // Still there, which is the whole point.
    expect(await getWeeklyReview(client, MEMBER, WEEK_START)).not.toBeNull();
  });

  it('allows the delete for a member who IS flagged is_test', async () => {
    const service = serviceRoleClient();
    await service.from('profiles').update({ is_test: true }).eq('id', MEMBER);

    const client = await signInAs(TEST_USERS.memberOne);
    await claimWeeklyReview(client, MEMBER, WEEK_START, plan());
    await claimWeekFocus(client, MEMBER, plan().focus);

    const deleted = await deleteWeeklyReviewForWeek(client, MEMBER, WEEK_START);
    expect(deleted).toEqual({ reviews: 1, focus: 1, error: null });
    expect(await getWeeklyReview(client, MEMBER, WEEK_START)).toBeNull();
    expect(await getWeekFocus(client, MEMBER, WEEK_START)).toBeNull();
  });
});

describe('the four analytics event types are accepted by the database', () => {
  it('inserts all four through the real events table constraint', async () => {
    const service = serviceRoleClient();
    const types = [
      'weekly_review_delivered',
      'weekly_review_viewed',
      'weekly_review_completed',
      'weekly_review_question_answered',
    ];

    for (const eventType of types) {
      const { error } = await service.from('member_wellness_events').insert({
        member_id: MEMBER,
        event_type: eventType,
        timezone: 'America/New_York',
        local_date: WEEK_START,
        payload: eventType.endsWith('answered')
          ? { questionKey: 'mixed_picture' }
          : { shape: 'full' },
        source: 'member',
      });
      expect(error, eventType).toBeNull();
    }

    // And all four are recognised as ANALYTICS events, so they reach the
    // product_analytics_events view rather than sitting in the wellness
    // half of the table.
    const { data } = await service
      .from('product_analytics_events')
      .select('event_type')
      .eq('member_id', MEMBER)
      .in('event_type', types);
    expect(new Set((data ?? []).map((row) => row.event_type as string))).toEqual(new Set(types));

    await service
      .from('member_wellness_events')
      .delete()
      .eq('member_id', MEMBER)
      .in('event_type', types);
  });
});
