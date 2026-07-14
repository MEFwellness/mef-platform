/**
 * End-to-end tests for the Personal Health Timeline architecture
 * (lib/timeline/*) against real local Supabase — real RLS, no mocked
 * client. No UI reads this yet; these tests exist to prove the
 * architecture itself (append-only, RLS-scoped) is sound before any
 * timeline page is built.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import { recordTimelineEvent, listTimelineEvents } from '../lib/timeline/data';

const memberId = TEST_USERS.memberOne.id;

afterAll(async () => {
  const service = serviceRoleClient();
  await service.from('health_timeline_events').delete().eq('member_id', memberId);
});

describe('Personal Health Timeline — record/list, RLS, append-only', () => {
  it('recordTimelineEvent writes a row a member can read back via listTimelineEvents', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);

    const event = await recordTimelineEvent(memberClient, {
      memberId,
      eventType: 'checkin_submitted',
      localDate: '2021-06-02',
      title: 'Submitted a daily check-in',
      sourceFeature: 'daily_checkins',
      sourceRecordId: null,
    });
    expect(event).not.toBeNull();
    expect(event!.event_type).toBe('checkin_submitted');

    const events = await listTimelineEvents(memberClient, memberId, { limit: 10 });
    expect(events.some((e) => e.id === event!.id)).toBe(true);
  }, 30_000);

  it('RLS: coach-inserted, member_visible=false events are hidden from the member but visible to the assigned coach', async () => {
    const coachClient = await signInAs(TEST_USERS.coachOne);
    const memberClient = await signInAs(TEST_USERS.memberOne);

    const hidden = await recordTimelineEvent(coachClient, {
      memberId,
      eventType: 'assessment_published',
      localDate: '2021-06-02',
      title: 'Coach-internal timeline note',
      memberVisible: false,
    });
    expect(hidden).not.toBeNull();

    const { data: memberView } = await memberClient
      .from('health_timeline_events')
      .select('id')
      .eq('id', hidden!.id);
    expect(memberView).toEqual([]);

    const { data: coachView } = await coachClient.from('health_timeline_events').select('id').eq('id', hidden!.id);
    expect(coachView).toHaveLength(1);
  }, 30_000);

  it("RLS: an unassigned member (memberTwo) cannot read memberOne's timeline events", async () => {
    const memberTwoClient = await signInAs(TEST_USERS.memberTwo);
    const { data, error } = await memberTwoClient
      .from('health_timeline_events')
      .select('*')
      .eq('member_id', memberId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  }, 30_000);

  it('append-only: no update policy exists for a member, so a member update attempt affects zero rows', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);

    const event = await recordTimelineEvent(memberClient, {
      memberId,
      eventType: 'checkin_submitted',
      localDate: '2021-06-03',
      title: 'Another check-in',
    });

    const { data, error } = await memberClient
      .from('health_timeline_events')
      .update({ title: 'Tampered title' })
      .eq('id', event!.id)
      .select('*');
    expect(error).toBeNull();
    expect(data).toEqual([]); // RLS silently matches zero rows — no update policy grants this

    const { data: unchanged } = await memberClient
      .from('health_timeline_events')
      .select('title')
      .eq('id', event!.id)
      .single();
    expect(unchanged!.title).toBe('Another check-in');
  }, 30_000);
});
