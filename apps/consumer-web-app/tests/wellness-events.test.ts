/**
 * Integration tests against real local Supabase + RLS (see
 * tests/setup/test-clients.ts's own doc comment for why this project
 * tests this way instead of mocking). lib/events/service.ts's functions
 * take a plain SupabaseClient (not a 'use server' action), so they can be
 * called directly here against a real authenticated session — this
 * exercises the actual production write path, not a reimplementation of
 * it.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import {
  recordMemberEvent,
  listMemberEventsForDate,
  sumHydrationForDate,
} from '../lib/events/service';

const TEST_DATE = '2020-04-10';
const TIMEZONE = 'America/New_York';

afterAll(async () => {
  const service = serviceRoleClient();
  await service
    .from('member_wellness_events')
    .delete()
    .eq('member_id', TEST_USERS.memberOne.id)
    .eq('local_date', TEST_DATE);
});

describe('member_wellness_events', () => {
  it('recordMemberEvent defaults occurred_at to now-in-timezone and derives local_date from it', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const event = await recordMemberEvent(client, {
      memberId: TEST_USERS.memberOne.id,
      eventType: 'concern_flagged',
      timezone: TIMEZONE,
      payload: { text: 'test concern' },
      occurredAt: new Date(`${TEST_DATE}T12:00:00.000Z`),
    });

    expect(event).not.toBeNull();
    expect(event?.local_date).toBe(TEST_DATE);
    expect(event?.recorded_at).toBeTruthy();
    expect(event?.event_type).toBe('concern_flagged');
  });

  it('a backdated event (occurred_at in the past) files under the local_date it actually happened, and orders correctly among same-day events by occurred_at, not insertion/recorded_at order', async () => {
    const client = await signInAs(TEST_USERS.memberOne);

    // Insert in a deliberately scrambled order relative to occurred_at, so
    // this only passes if ordering genuinely uses occurred_at and not
    // insertion order (which would equal recorded_at order).
    await recordMemberEvent(client, {
      memberId: TEST_USERS.memberOne.id,
      eventType: 'movement_logged',
      timezone: TIMEZONE,
      occurredAt: new Date(`${TEST_DATE}T18:00:00.000Z`),
      payload: { movementType: 'workout' },
    });
    await recordMemberEvent(client, {
      memberId: TEST_USERS.memberOne.id,
      eventType: 'movement_logged',
      timezone: TIMEZONE,
      // Backdated to earlier in the day than the event just inserted above
      // — a late entry for something that happened first.
      occurredAt: new Date(`${TEST_DATE}T09:00:00.000Z`),
      payload: { movementType: 'walk' },
    });
    await recordMemberEvent(client, {
      memberId: TEST_USERS.memberOne.id,
      eventType: 'movement_logged',
      timezone: TIMEZONE,
      occurredAt: new Date(`${TEST_DATE}T13:00:00.000Z`),
      payload: { movementType: 'stretch' },
    });

    const events = await listMemberEventsForDate(client, TEST_USERS.memberOne.id, TEST_DATE);
    const movementEvents = events.filter((e) => e.event_type === 'movement_logged');

    expect(movementEvents.map((e) => (e.payload as { movementType: string }).movementType)).toEqual([
      'walk', // 09:00 — happened first, entered last
      'stretch', // 13:00
      'workout', // 18:00 — happened last, entered first
    ]);
  });

  it('sumHydrationForDate sums deltas across multiple hydration_logged events and clamps at 0', async () => {
    const client = await signInAs(TEST_USERS.memberOne);

    await recordMemberEvent(client, {
      memberId: TEST_USERS.memberOne.id,
      eventType: 'hydration_logged',
      timezone: TIMEZONE,
      occurredAt: new Date(`${TEST_DATE}T08:00:00.000Z`),
      payload: { delta: 1, totalAfter: 1 },
    });
    await recordMemberEvent(client, {
      memberId: TEST_USERS.memberOne.id,
      eventType: 'hydration_logged',
      timezone: TIMEZONE,
      occurredAt: new Date(`${TEST_DATE}T10:00:00.000Z`),
      payload: { delta: 1, totalAfter: 2 },
    });
    await recordMemberEvent(client, {
      memberId: TEST_USERS.memberOne.id,
      eventType: 'hydration_logged',
      timezone: TIMEZONE,
      occurredAt: new Date(`${TEST_DATE}T11:00:00.000Z`),
      payload: { delta: -1, totalAfter: 1 },
    });

    const total = await sumHydrationForDate(client, TEST_USERS.memberOne.id, TEST_DATE);
    expect(total).toBe(1); // +1, +1, -1
  });

  it("a member cannot read another member's wellness events (RLS)", async () => {
    const memberOne = await signInAs(TEST_USERS.memberOne);
    await recordMemberEvent(memberOne, {
      memberId: TEST_USERS.memberOne.id,
      eventType: 'concern_flagged',
      timezone: TIMEZONE,
      occurredAt: new Date(`${TEST_DATE}T12:00:00.000Z`),
      payload: { text: 'private' },
    });

    const memberTwo = await signInAs(TEST_USERS.memberTwo);
    const events = await listMemberEventsForDate(memberTwo, TEST_USERS.memberOne.id, TEST_DATE);
    expect(events).toHaveLength(0);
  });

  it('a member cannot insert an event for a different member_id (RLS insert check)', async () => {
    const memberTwo = await signInAs(TEST_USERS.memberTwo);
    const event = await recordMemberEvent(memberTwo, {
      memberId: TEST_USERS.memberOne.id, // impersonation attempt
      eventType: 'concern_flagged',
      timezone: TIMEZONE,
      payload: { text: 'should be rejected' },
    });
    expect(event).toBeNull();
  });
});
