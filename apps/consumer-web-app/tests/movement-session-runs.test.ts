/**
 * Root Movement, Level 1 — the session player's data layer and its four
 * analytics events, against real local Supabase with real RLS (migration
 * 153). No mocked Supabase client, same philosophy as every other
 * integration test in this suite.
 *
 * Server actions themselves cannot be called here (they use cookies()
 * from next/headers, which throws outside a Next.js request scope), so
 * these exercise the exact functions those actions call, with a client
 * authenticated as a real seeded member. What that proves is the part
 * the app actually depends on: the database's own policies and the
 * shape of what gets written.
 *
 * Covered:
 *   - reading the six templates and one session's resolved lineup
 *   - starting a run, skipping, completing
 *   - a mid-session exit leaving an ordinary, uncompleted row
 *   - repeating the same session the same day, as many times as she likes
 *   - one member cannot see or touch another's runs
 *   - all four analytics events, with their real payloads
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import {
  appendSessionRunSkip,
  completeSessionRun,
  getSessionDetail,
  getSessionRun,
  insertSessionRun,
  listActiveSessionTemplates,
  listSessionSummaries,
} from '../lib/movement-sessions/data';
import { trackProductEvent } from '../lib/analytics/track';

const memberId = TEST_USERS.memberOne.id;
const otherMemberId = TEST_USERS.memberTwo.id;
const SESSION_KEY = 'morning_mobility';

let member: SupabaseClient;
let otherMember: SupabaseClient;

beforeAll(async () => {
  member = await signInAs(TEST_USERS.memberOne);
  otherMember = await signInAs(TEST_USERS.memberTwo);
  // Also clean BEFORE the suite, not only after each test: driving the
  // real app locally with Playwright leaves runs and events behind for
  // these same seeded accounts, and the row-count assertions below would
  // otherwise fail for a reason that has nothing to do with the code.
  await clearMovementRows();
});

async function clearMovementRows() {
  const service = serviceRoleClient();
  await service.from('member_movement_session_runs').delete().eq('member_id', memberId);
  await service.from('member_movement_session_runs').delete().eq('member_id', otherMemberId);
  await service
    .from('member_wellness_events')
    .delete()
    .in('member_id', [memberId, otherMemberId])
    .in('event_type', [
      'movement_session_viewed',
      'movement_session_started',
      'movement_session_completed',
      'movement_exercise_skipped',
    ]);
}

afterEach(clearMovementRows);

describe('Root Movement — every member reads the same six sessions', () => {
  it('lists the six templates for a signed-in member', async () => {
    const templates = await listActiveSessionTemplates(member);
    expect(templates.map((t) => t.session_key)).toEqual([
      'morning_mobility',
      'desk_reset',
      'hip_back_reset',
      'shoulder_neck_reset',
      'core_foundation',
      'recovery_day',
    ]);
  });

  it('gives two different members the identical list, because these are global', async () => {
    const mine = await listActiveSessionTemplates(member);
    const theirs = await listActiveSessionTemplates(otherMember);
    expect(theirs.map((t) => t.session_key)).toEqual(mine.map((t) => t.session_key));
  });

  it('counts each session’s exercises for the list screen', async () => {
    const summaries = await listSessionSummaries(member);
    expect(summaries).toHaveLength(6);
    expect(summaries.every((s) => s.exerciseCount >= 8)).toBe(true);
  });

  it('resolves one session to a playable lineup with names, posters and prescriptions', async () => {
    const detail = await getSessionDetail(member, SESSION_KEY);
    expect(detail).not.toBeNull();
    expect(detail!.template.session_key).toBe(SESSION_KEY);
    expect(detail!.slots.length).toBeGreaterThanOrEqual(8);
    expect(detail!.estimatedSeconds).toBeGreaterThan(0);

    for (const slot of detail!.slots) {
      expect(slot.name.length).toBeGreaterThan(0);
      expect(['time', 'reps']).toContain(slot.prescription_type);
    }
    // Slots come back in the order the member walks them.
    expect(detail!.slots.map((s) => s.slot_order)).toEqual(
      detail!.slots.map((_, i) => i + 1)
    );
  });

  it('returns null for an unknown session key rather than throwing', async () => {
    expect(await getSessionDetail(member, 'not_a_real_session')).toBeNull();
  });
});

describe('Root Movement — walking a session records what happened', () => {
  it('records a start, a skip and a completion', async () => {
    const detail = await getSessionDetail(member, SESSION_KEY);
    const run = await insertSessionRun(member, memberId, SESSION_KEY);
    expect(run).not.toBeNull();
    expect(run!.session_key).toBe(SESSION_KEY);
    expect(run!.started_at).toBeTruthy();
    expect(run!.completed_at).toBeNull();
    expect(run!.skipped_exercise_ids).toEqual([]);

    const skippedId = detail!.slots[2]!.external_id;
    const afterSkip = await appendSessionRunSkip(member, memberId, run!.id, skippedId);
    expect(afterSkip).toEqual([skippedId]);

    const completed = await completeSessionRun(member, memberId, run!.id);
    expect(completed).not.toBeNull();
    expect(completed!.completed_at).toBeTruthy();
    expect(completed!.skipped_exercise_ids).toEqual([skippedId]);
  });

  it('records the same exercise skipped twice as one skip, not two', async () => {
    const detail = await getSessionDetail(member, SESSION_KEY);
    const run = await insertSessionRun(member, memberId, SESSION_KEY);
    const id = detail!.slots[0]!.external_id;

    await appendSessionRunSkip(member, memberId, run!.id, id);
    const second = await appendSessionRunSkip(member, memberId, run!.id, id);
    expect(second).toEqual([id]);
  });

  it('leaves a mid-session exit as an ordinary uncompleted row, with nothing marking it a failure', async () => {
    const run = await insertSessionRun(member, memberId, SESSION_KEY);
    // She closes the app here. Nothing else is called.
    const stored = await getSessionRun(member, memberId, run!.id);
    expect(stored).not.toBeNull();
    expect(stored!.completed_at).toBeNull();

    // The row carries no abandonment flag, no reason and no note: there
    // is nowhere for a judgment about her to live.
    expect(Object.keys(stored!).sort()).toEqual(
      ['completed_at', 'id', 'member_id', 'session_key', 'skipped_exercise_ids', 'started_at'].sort()
    );
  });

  it('lets a member repeat the same session as many times in one day as she likes', async () => {
    const first = await insertSessionRun(member, memberId, SESSION_KEY);
    await completeSessionRun(member, memberId, first!.id);
    const second = await insertSessionRun(member, memberId, SESSION_KEY);
    await completeSessionRun(member, memberId, second!.id);
    const third = await insertSessionRun(member, memberId, SESSION_KEY);

    expect(new Set([first!.id, second!.id, third!.id]).size).toBe(3);

    const service = serviceRoleClient();
    const { data } = await service
      .from('member_movement_session_runs')
      .select('id')
      .eq('member_id', memberId);
    expect(data).toHaveLength(3);
  });

  it('completes a run exactly once, so a double submit cannot fire a second completion', async () => {
    const run = await insertSessionRun(member, memberId, SESSION_KEY);
    const first = await completeSessionRun(member, memberId, run!.id);
    const second = await completeSessionRun(member, memberId, run!.id);
    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it('keeps one member out of another member’s runs', async () => {
    const run = await insertSessionRun(member, memberId, SESSION_KEY);
    expect(await getSessionRun(otherMember, otherMemberId, run!.id)).toBeNull();
    expect(await appendSessionRunSkip(otherMember, otherMemberId, run!.id, 'anything')).toBeNull();
    expect(await completeSessionRun(otherMember, otherMemberId, run!.id)).toBeNull();
  });

  it('refuses a session key that is not one of the six', async () => {
    expect(await insertSessionRun(member, memberId, 'invented_session')).toBeNull();
  });
});

describe('Root Movement — the four analytics events', () => {
  async function readEvents(eventType: string) {
    const service = serviceRoleClient();
    const { data } = await service
      .from('member_wellness_events')
      .select('event_type, payload, source')
      .eq('member_id', memberId)
      .eq('event_type', eventType);
    return data ?? [];
  }

  it('records movement_session_viewed with the session key and an exercise count', async () => {
    const written = await trackProductEvent(member, {
      memberId,
      eventType: 'movement_session_viewed',
      timezone: 'America/New_York',
      payload: { sessionKey: SESSION_KEY, exerciseCount: '11' },
    });
    expect(written).toBe(true);

    const events = await readEvents('movement_session_viewed');
    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toEqual({ sessionKey: SESSION_KEY, exerciseCount: '11' });
    expect(events[0]!.source).toBe('member');
  });

  it('records movement_session_started with the session key alone', async () => {
    await trackProductEvent(member, {
      memberId,
      eventType: 'movement_session_started',
      timezone: 'America/New_York',
      payload: { sessionKey: SESSION_KEY },
    });
    const events = await readEvents('movement_session_started');
    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toEqual({ sessionKey: SESSION_KEY });
  });

  it('records movement_exercise_skipped with the session key and the exercise id', async () => {
    const detail = await getSessionDetail(member, SESSION_KEY);
    const exerciseId = detail!.slots[1]!.external_id;

    await trackProductEvent(member, {
      memberId,
      eventType: 'movement_exercise_skipped',
      timezone: 'America/New_York',
      payload: { sessionKey: SESSION_KEY, exerciseId },
    });
    const events = await readEvents('movement_exercise_skipped');
    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toEqual({ sessionKey: SESSION_KEY, exerciseId });
  });

  it('records movement_session_completed with a skip COUNT and never which ones', async () => {
    await trackProductEvent(member, {
      memberId,
      eventType: 'movement_session_completed',
      timezone: 'America/New_York',
      payload: { sessionKey: SESSION_KEY, skipCount: '2' },
    });
    const events = await readEvents('movement_session_completed');
    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toEqual({ sessionKey: SESSION_KEY, skipCount: '2' });
  });

  it('surfaces all four through the product analytics view, so they reach the existing rollups', async () => {
    for (const eventType of [
      'movement_session_viewed',
      'movement_session_started',
      'movement_session_completed',
      'movement_exercise_skipped',
    ] as const) {
      await trackProductEvent(member, {
        memberId,
        eventType,
        timezone: 'America/New_York',
        payload: { sessionKey: SESSION_KEY },
      });
    }

    const service = serviceRoleClient();
    const { data } = await service
      .from('product_analytics_events')
      .select('event_type')
      .eq('member_id', memberId)
      .like('event_type', 'movement_%');
    expect((data ?? []).map((r) => r.event_type).sort()).toEqual([
      'movement_exercise_skipped',
      'movement_session_completed',
      'movement_session_started',
      'movement_session_viewed',
    ]);
  });
});
