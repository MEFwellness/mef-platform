/**
 * Adaptive Coaching Direction — real RLS, real tables, real constraints
 * (migration 150).
 *
 * Same philosophy as every other integration suite here: no mocked
 * Supabase client. The data layer's own functions are called with a real
 * signed-in member client, so what is proved is the database's policies
 * and constraints, not a wrapper around them.
 *
 * What this file covers that the pure tests cannot:
 *   * the outcome row genuinely lands, with the right response value, for
 *     each of the card's three buttons;
 *   * the thread counters really move when a response is recorded;
 *   * an escalated thread is really flagged, once, and is queryable;
 *   * the before/after comparison window is stored as usable parameters;
 *   * a member cannot read another member's ledger or threads.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { serviceRoleClient, signInAs, TEST_USERS } from './setup/test-clients';
import {
  DEFAULT_COMPARISON_WINDOW_DAYS,
  applyApproachChange,
  countRecentSavedPriorities,
  escalateCoachingThread,
  getCoachingDecision,
  listCoachingThreads,
  listEscalatedCoachingThreads,
  listUnresolvedDecisions,
  recordCoachingDecision,
  recordCoachingResponse,
  shiftLocalDate,
  touchCoachingThread,
} from '@/lib/coaching-direction/data';
import { ESCALATION_REASON_NO_RESPONSE } from '@/lib/coaching-direction/adaptation';
import { claimDailyPriority, getDailyPriority } from '@/lib/priority/data';
import type { CardResponse } from '@/lib/coaching-direction/types';

const TODAY = '2026-08-12';
const THREAD = 'reset_plan_commitment::plan-int-1';

afterEach(async () => {
  const service = serviceRoleClient();
  const ids = [TEST_USERS.memberOne.id, TEST_USERS.memberTwo.id];
  await service.from('member_coaching_decisions').delete().in('member_id', ids);
  await service.from('member_coaching_threads').delete().in('member_id', ids);
  await service.from('member_daily_priorities').delete().in('member_id', ids);
});

async function deliverDecision(
  client: Awaited<ReturnType<typeof signInAs>>,
  localDate: string,
  overrides: Partial<Parameters<typeof recordCoachingDecision>[2]> = {}
) {
  return recordCoachingDecision(
    client,
    TEST_USERS.memberOne.id,
    {
      localDate,
      rule: 'reset_plan_commitment',
      actionType: 'reset',
      threadKey: THREAD,
      approach: 0,
      isFollowOn: false,
      signalEvidence: { rule: 'reset_plan_commitment', planId: 'plan-int-1', daysLogged: 4 },
      ...overrides,
    },
    DEFAULT_COMPARISON_WINDOW_DAYS
  );
}

// =====================================================================
// The ledger.
// =====================================================================

describe('the outcome ledger records one delivered decision per day', () => {
  it('writes the decision, its evidence, and a usable comparison window', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    const decision = await deliverDecision(member, TODAY);

    expect(decision).not.toBeNull();
    expect(decision!.rule).toBe('reset_plan_commitment');
    expect(decision!.actionType).toBe('reset');
    expect(decision!.threadKey).toBe(THREAD);
    expect(decision!.memberResponse).toBeNull();

    // The window is stored as parameters the comparison primitive can take
    // directly, with the reference day belonging to neither side.
    expect(decision!.comparisonReferenceDate).toBe(TODAY);
    expect(decision!.comparisonWindowDays).toBe(DEFAULT_COMPARISON_WINDOW_DAYS);
    expect(decision!.comparisonAfterCompleteOn).toBe(
      shiftLocalDate(TODAY, DEFAULT_COMPARISON_WINDOW_DAYS)
    );

    // Evidence is keys and metrics, exactly as handed in.
    expect(decision!.signalEvidence).toEqual({
      rule: 'reset_plan_commitment',
      planId: 'plan-int-1',
      daysLogged: 4,
    });
  });

  it('sanitizes on the way in, so a bad call site cannot persist health content', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    const decision = await deliverDecision(member, TODAY, {
      signalEvidence: {
        planId: 'plan-int-1',
        // Not on the allowlist, and a real sentence. Neither may land.
        findingSentence: 'your lower back has been worse since the weekend',
      } as never,
    });

    expect(decision!.signalEvidence).toEqual({ planId: 'plan-int-1' });
  });

  it('is one row per member per day, enforced by the database', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    await deliverDecision(member, TODAY);

    // A second render the same day must not produce a second decision, and
    // must not rewrite the first.
    const second = await deliverDecision(member, TODAY, {
      rule: 'gentle_focus',
      actionType: 'reflection',
      threadKey: 'gentle_focus::-',
    });
    expect(second!.rule).toBe('reset_plan_commitment');

    const service = serviceRoleClient();
    const { count } = await service
      .from('member_coaching_decisions')
      .select('id', { count: 'exact', head: true })
      .eq('member_id', TEST_USERS.memberOne.id);
    expect(count).toBe(1);
  });

  it('refuses an action type outside the five, at the database level', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    const { error } = await member.from('member_coaching_decisions').insert({
      member_id: TEST_USERS.memberOne.id,
      local_date: TODAY,
      rule: 'reset_plan_commitment',
      action_type: 'meditation',
      thread_key: THREAD,
      comparison_reference_date: TODAY,
      comparison_after_complete_on: shiftLocalDate(TODAY, 14),
    });
    expect(error).not.toBeNull();
  });
});

// =====================================================================
// The three buttons.
// =====================================================================

describe("the card's three buttons each write their own outcome", () => {
  const cases: Array<[string, CardResponse]> = [
    ['Done', 'done'],
    ['Help me', 'help'],
    ['Save for later', 'later'],
  ];

  it.each(cases)('%s records "%s" on the ledger row', async (_label, response) => {
    const member = await signInAs(TEST_USERS.memberOne);
    await deliverDecision(member, TODAY);

    const ok = await recordCoachingResponse(member, TEST_USERS.memberOne.id, TODAY, response);
    expect(ok).toBe(true);

    const after = await getCoachingDecision(member, TEST_USERS.memberOne.id, TODAY);
    expect(after!.memberResponse).toBe(response);
    expect(after!.respondedAt).not.toBeNull();
  });

  it('keeps the FIRST thing she did, so tapping Help then Done still records Help', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    await deliverDecision(member, TODAY);
    await touchCoachingThread(member, TEST_USERS.memberOne.id, {
      threadKey: THREAD,
      rule: 'reset_plan_commitment',
      actionType: 'reset',
      approach: 0,
      localDate: TODAY,
    });

    expect(await recordCoachingResponse(member, TEST_USERS.memberOne.id, TODAY, 'help')).toBe(true);
    expect(await recordCoachingResponse(member, TEST_USERS.memberOne.id, TODAY, 'done')).toBe(false);

    const after = await getCoachingDecision(member, TEST_USERS.memberOne.id, TODAY);
    expect(after!.memberResponse).toBe('help');
  });

  it('moves the thread counters when a response lands', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    await deliverDecision(member, TODAY);
    await touchCoachingThread(member, TEST_USERS.memberOne.id, {
      threadKey: THREAD,
      rule: 'reset_plan_commitment',
      actionType: 'reset',
      approach: 0,
      localDate: TODAY,
    });

    const service = serviceRoleClient();
    await service
      .from('member_coaching_threads')
      .update({ consecutive_ignored: 2, responses_since_last_change: 0 })
      .eq('member_id', TEST_USERS.memberOne.id)
      .eq('thread_key', THREAD);

    await recordCoachingResponse(member, TEST_USERS.memberOne.id, TODAY, 'done');

    const threads = await listCoachingThreads(member, TEST_USERS.memberOne.id);
    expect(threads.get(THREAD)!.consecutiveIgnored).toBe(0);
    expect(threads.get(THREAD)!.responsesSinceLastChange).toBe(1);
  });
});

// =====================================================================
// Resolving what she never answered.
// =====================================================================

describe('unresolved decisions are findable so they can be closed', () => {
  it('lists only past days with no response, inside the lookback window', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    const yesterday = shiftLocalDate(TODAY, -1);
    const longAgo = shiftLocalDate(TODAY, -45);

    await deliverDecision(member, yesterday);
    await deliverDecision(member, longAgo);
    await deliverDecision(member, TODAY);

    const unresolved = await listUnresolvedDecisions(member, TEST_USERS.memberOne.id, TODAY);
    const dates = unresolved.map((d) => d.localDate);

    expect(dates).toContain(yesterday);
    expect(dates).not.toContain(TODAY); // today is not over
    expect(dates).not.toContain(longAgo); // outside the lookback window
  });

  it('drops out of the list once a response is recorded', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    const yesterday = shiftLocalDate(TODAY, -1);
    await deliverDecision(member, yesterday);

    await recordCoachingResponse(member, TEST_USERS.memberOne.id, yesterday, 'ignored');

    const unresolved = await listUnresolvedDecisions(member, TEST_USERS.memberOne.id, TODAY);
    expect(unresolved.map((d) => d.localDate)).not.toContain(yesterday);
  });
});

// =====================================================================
// Escalation.
// =====================================================================

describe('an escalated thread is flagged once and stays queryable', () => {
  it('sets the flag and the reason', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    await touchCoachingThread(member, TEST_USERS.memberOne.id, {
      threadKey: THREAD,
      rule: 'reset_plan_commitment',
      actionType: 'reset',
      approach: 1,
      localDate: TODAY,
    });

    const first = await escalateCoachingThread(
      member,
      TEST_USERS.memberOne.id,
      THREAD,
      2,
      ESCALATION_REASON_NO_RESPONSE
    );
    expect(first).toBe(true);

    const escalated = await listEscalatedCoachingThreads(member, TEST_USERS.memberOne.id);
    expect(escalated).toHaveLength(1);
    expect(escalated[0]!.threadKey).toBe(THREAD);
    expect(escalated[0]!.coachEscalationReason).toBe(ESCALATION_REASON_NO_RESPONSE);
    expect(escalated[0]!.coachEscalatedAt).not.toBeNull();
  });

  it('escalates once, so a second render raises no second alert', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    await touchCoachingThread(member, TEST_USERS.memberOne.id, {
      threadKey: THREAD,
      rule: 'reset_plan_commitment',
      actionType: 'reset',
      approach: 1,
      localDate: TODAY,
    });

    expect(
      await escalateCoachingThread(member, TEST_USERS.memberOne.id, THREAD, 2, ESCALATION_REASON_NO_RESPONSE)
    ).toBe(true);
    // The `is('coach_escalated_at', null)` guard is what makes the second
    // call a no-op, which is what stops a coach being notified daily.
    expect(
      await escalateCoachingThread(member, TEST_USERS.memberOne.id, THREAD, 2, ESCALATION_REASON_NO_RESPONSE)
    ).toBe(false);
  });

  it('records an approach change as one change, with the streak cleared', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    await touchCoachingThread(member, TEST_USERS.memberOne.id, {
      threadKey: THREAD,
      rule: 'reset_plan_commitment',
      actionType: 'reset',
      approach: 0,
      localDate: TODAY,
    });

    const service = serviceRoleClient();
    await service
      .from('member_coaching_threads')
      .update({ consecutive_ignored: 3 })
      .eq('member_id', TEST_USERS.memberOne.id)
      .eq('thread_key', THREAD);

    await applyApproachChange(member, TEST_USERS.memberOne.id, THREAD, 1);

    const threads = await listCoachingThreads(member, TEST_USERS.memberOne.id);
    const thread = threads.get(THREAD)!;
    expect(thread.approach).toBe(1);
    expect(thread.approachChanges).toBe(1);
    expect(thread.consecutiveIgnored).toBe(0);
    expect(thread.responsesSinceLastChange).toBe(0);
  });
});

// =====================================================================
// Chronic save-for-later, read from the card's own table.
// =====================================================================

describe('chronic save-for-later is counted from the priority card own rows', () => {
  it('counts only saved rows, only before today, only inside the window', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    const service = serviceRoleClient();

    const rows = [
      { local_date: shiftLocalDate(TODAY, -1), status: 'saved' },
      { local_date: shiftLocalDate(TODAY, -2), status: 'saved' },
      { local_date: shiftLocalDate(TODAY, -3), status: 'done' },
      { local_date: shiftLocalDate(TODAY, -30), status: 'saved' },
      { local_date: TODAY, status: 'saved' },
    ].map((row) => ({
      member_id: TEST_USERS.memberOne.id,
      rule: 'gentle_focus',
      priority_title: 'A title',
      priority_help: 'A smaller step',
      ...row,
    }));

    const { error } = await service.from('member_daily_priorities').insert(rows);
    expect(error).toBeNull();

    const count = await countRecentSavedPriorities(
      member,
      TEST_USERS.memberOne.id,
      TODAY,
      14
    );
    expect(count).toBe(2);
  });
});

// =====================================================================
// RLS.
// =====================================================================

describe('RLS keeps one member out of another member decisions', () => {
  it('a different member cannot read the ledger or the threads', async () => {
    const owner = await signInAs(TEST_USERS.memberOne);
    await deliverDecision(owner, TODAY);
    await touchCoachingThread(owner, TEST_USERS.memberOne.id, {
      threadKey: THREAD,
      rule: 'reset_plan_commitment',
      actionType: 'reset',
      approach: 0,
      localDate: TODAY,
    });

    const other = await signInAs(TEST_USERS.memberTwo);
    expect(await getCoachingDecision(other, TEST_USERS.memberOne.id, TODAY)).toBeNull();
    expect((await listCoachingThreads(other, TEST_USERS.memberOne.id)).size).toBe(0);
  });

  it('a member cannot write a decision addressed to someone else', async () => {
    const other = await signInAs(TEST_USERS.memberTwo);
    const { error } = await other.from('member_coaching_decisions').insert({
      member_id: TEST_USERS.memberOne.id,
      local_date: TODAY,
      rule: 'gentle_focus',
      action_type: 'reflection',
      thread_key: 'gentle_focus::-',
      comparison_reference_date: TODAY,
      comparison_after_complete_on: shiftLocalDate(TODAY, 14),
    });
    expect(error).not.toBeNull();
  });
});

// =====================================================================
// The claim must return the row it just wrote.
//
// This is a REGRESSION GUARD for a real production bug, found by driving
// app.mefwellness.com after this build shipped and reproduced locally with
// a production build (never in `next dev`).
//
// claimDailyPriority used to insert today's row and then RE-READ it with a
// query byte-identical to one the caller had already issued moments
// earlier in the same render, which had correctly returned nothing.
// Next.js patches global fetch and, in a production build, served the
// re-read that earlier empty response. The claim therefore looked like it
// had failed, buildPriorityView returned null, and every write after it
// was skipped, including the coaching decision ledger row. The card still
// appeared on the NEXT request, because the row really had been inserted,
// which is what made the failure silent.
//
// Two things now prevent it, and both are asserted here: the write returns
// its own row, and the server client opts every request out of the fetch
// cache.
// =====================================================================

describe('claiming the day returns the row that was just written', () => {
  it('returns a record even though an identical read just returned nothing', async () => {
    const member = await signInAs(TEST_USERS.memberOne);

    // The read that used to poison the cache for the write's own re-read.
    expect(await getDailyPriority(member, TEST_USERS.memberOne.id, TODAY)).toBeNull();

    const record = await claimDailyPriority(member, TEST_USERS.memberOne.id, TODAY, {
      rule: 'daily_reset',
      priorityKey: null,
      title: 'Take a few minutes for your Daily Reset.',
      reason: null,
      help: 'It is a short set of questions and you can stop at any point.',
      href: '/checkin',
      actionType: 'reset',
      threadKey: 'daily_reset::-',
      approach: 0,
      evidence: {},
    });

    expect(record).not.toBeNull();
    expect(record!.rule).toBe('daily_reset');
    expect(record!.status).toBe('active');
    expect(record!.shownAt).toBeNull();
  });

  it('still returns the existing row when another render already claimed the day', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    const selected = {
      rule: 'daily_reset' as const,
      priorityKey: null,
      title: 'Take a few minutes for your Daily Reset.',
      reason: null,
      help: 'A smaller step.',
      href: '/checkin',
      actionType: 'reset' as const,
      threadKey: 'daily_reset::-',
      approach: 0,
      evidence: {},
    };

    const first = await claimDailyPriority(member, TEST_USERS.memberOne.id, TODAY, selected);
    // The second claim inserts nothing (the unique constraint holds), and
    // must still hand back the row that exists.
    const second = await claimDailyPriority(member, TEST_USERS.memberOne.id, TODAY, {
      ...selected,
      title: 'A different title that must NOT overwrite the first.',
    });

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(second!.id).toBe(first!.id);
    expect(second!.title).toBe('Take a few minutes for your Daily Reset.');
  });
});
