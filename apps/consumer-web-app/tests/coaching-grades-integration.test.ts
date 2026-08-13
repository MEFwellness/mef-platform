/**
 * Adaptive Coaching Direction Part 3 — real RLS, real constraints, the real
 * SECURITY DEFINER resolve function (migration 152).
 *
 * Same philosophy as every other integration suite here: no mocked Supabase
 * client. The data layer's own functions are called with a real signed-in
 * member or coach client, so what is proved is the database's policies and
 * functions, not a wrapper around them.
 *
 * What this file covers that the pure tests cannot:
 *   * a grade row genuinely lands, with its check constraints enforced;
 *   * a second pass supersedes the first rather than duplicating it;
 *   * one member cannot read another member's grades, and an assigned
 *     coach can;
 *   * the comparison outcome is cached once and never overwritten;
 *   * the resolve function clears the flag, resets the counters, sets the
 *     cooldown, and refuses a coach who is not assigned;
 *   * all three new event types are accepted by the real constraint and
 *     reach the product_analytics_events view.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { serviceRoleClient, signInAs, TEST_USERS } from './setup/test-clients';
import {
  DEFAULT_COMPARISON_WINDOW_DAYS,
  escalateCoachingThread,
  recordCoachingDecision,
  touchCoachingThread,
} from '@/lib/coaching-direction/data';
import { ESCALATION_REASON_NO_RESPONSE } from '@/lib/coaching-direction/adaptation';
import {
  actionTypeGradeMap,
  listCoachingGrades,
  listLedgerRowsForGrading,
  recordComparisonOutcome,
  upsertCoachingGrades,
} from '@/lib/coaching-direction/gradesData';
import {
  ESCALATION_COOLDOWN_DAYS,
  getThreadActionType,
  incrementEscalationCount,
  listDecisionsForThreads,
  listEscalatedThreadRows,
  listThreadCooldowns,
  resolveCoachingEscalation,
} from '@/lib/coaching-direction/escalationData';
import { buildEscalationView } from '@/lib/coaching-direction/escalation';
import { gradeDecisions } from '@/lib/coaching-direction/grading';
import type { CoachingGrade } from '@/lib/coaching-direction/grading';
import { trackProductEvent } from '@/lib/analytics/track';

const TODAY = '2026-08-12';
const THREAD = 'behavioral_friction::daily_reset_incomplete';

afterEach(async () => {
  const service = serviceRoleClient();
  const ids = [TEST_USERS.memberOne.id, TEST_USERS.memberTwo.id];
  await service.from('member_coaching_grades').delete().in('member_id', ids);
  await service.from('member_coaching_decisions').delete().in('member_id', ids);
  await service.from('member_coaching_threads').delete().in('member_id', ids);
  await service
    .from('member_wellness_events')
    .delete()
    .in('member_id', ids)
    .in('event_type', [
      'coaching_thread_escalated',
      'coaching_escalation_resolved',
      'coaching_grades_computed',
    ]);
});

function grade(overrides: Partial<CoachingGrade> = {}): CoachingGrade {
  return {
    scope: 'action_type',
    key: 'reset',
    actionType: 'reset',
    deliveredCount: 8,
    actedCount: 6,
    ignoredCount: 2,
    notSeenCount: 1,
    comparedCount: 4,
    movedCount: 2,
    verdict: 'landing',
    evidenceLevel: 'strong',
    spanDays: 30,
    lastDeliveredLocalDate: '2026-08-11',
    ...overrides,
  };
}

// =====================================================================
// The grades table.
// =====================================================================

describe('member_coaching_grades stores a grade and reads it back intact', () => {
  it('writes both scopes and reads them back with every count preserved', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    const wrote = await upsertCoachingGrades(member, TEST_USERS.memberOne.id, [
      grade(),
      grade({ scope: 'thread', key: THREAD, actionType: 'reset', verdict: 'dead', actedCount: 0 }),
    ]);
    expect(wrote).toBe(true);

    const grades = await listCoachingGrades(member, TEST_USERS.memberOne.id);
    expect(grades).toHaveLength(2);

    const actionType = grades.find((g) => g.scope === 'action_type')!;
    expect(actionType.key).toBe('reset');
    expect(actionType.deliveredCount).toBe(8);
    expect(actionType.actedCount).toBe(6);
    expect(actionType.ignoredCount).toBe(2);
    expect(actionType.notSeenCount).toBe(1);
    expect(actionType.comparedCount).toBe(4);
    expect(actionType.movedCount).toBe(2);
    expect(actionType.verdict).toBe('landing');
    expect(actionType.evidenceLevel).toBe('strong');
    expect(actionType.lastDeliveredLocalDate).toBe('2026-08-11');
  });

  it('a second pass supersedes the first rather than producing a second row', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    await upsertCoachingGrades(member, TEST_USERS.memberOne.id, [grade()]);
    await upsertCoachingGrades(member, TEST_USERS.memberOne.id, [
      grade({ actedCount: 9, verdict: 'landed_no_change' }),
    ]);

    const grades = await listCoachingGrades(member, TEST_USERS.memberOne.id);
    expect(grades).toHaveLength(1);
    expect(grades[0]!.actedCount).toBe(9);
    expect(grades[0]!.verdict).toBe('landed_no_change');
  });

  it('the action-type accessor returns only action-type grades, keyed by type', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    await upsertCoachingGrades(member, TEST_USERS.memberOne.id, [
      grade(),
      grade({ scope: 'thread', key: THREAD }),
    ]);
    const map = actionTypeGradeMap(await listCoachingGrades(member, TEST_USERS.memberOne.id));
    expect([...map.keys()]).toEqual(['reset']);
  });

  it('the real check constraints refuse a verdict, a scope and an evidence level outside their sets', async () => {
    const service = serviceRoleClient();
    for (const patch of [
      { verdict: 'excellent' },
      { grade_scope: 'member' },
      { evidence_level: 'certain' },
      { action_type: 'meditation' },
    ]) {
      const { error } = await service.from('member_coaching_grades').insert({
        member_id: TEST_USERS.memberOne.id,
        grade_scope: 'action_type',
        grade_key: 'reset',
        action_type: 'reset',
        verdict: 'neutral',
        evidence_level: 'thin',
        ...patch,
      });
      expect(error).not.toBeNull();
    }
  });

  it('the database refuses a grade claiming more movement than it compared', async () => {
    const service = serviceRoleClient();
    const { error } = await service.from('member_coaching_grades').insert({
      member_id: TEST_USERS.memberOne.id,
      grade_scope: 'action_type',
      grade_key: 'reset',
      action_type: 'reset',
      verdict: 'landing',
      evidence_level: 'strong',
      compared_count: 2,
      moved_count: 5,
    });
    expect(error).not.toBeNull();
  });
});

describe('RLS keeps one member out of another member’s grades, and lets her coach in', () => {
  it('a member cannot read another member’s grades', async () => {
    const owner = await signInAs(TEST_USERS.memberOne);
    await upsertCoachingGrades(owner, TEST_USERS.memberOne.id, [grade()]);

    const other = await signInAs(TEST_USERS.memberTwo);
    expect(await listCoachingGrades(other, TEST_USERS.memberOne.id)).toEqual([]);
  });

  it('a member cannot write a grade onto another member', async () => {
    const other = await signInAs(TEST_USERS.memberTwo);
    const { error } = await other.from('member_coaching_grades').insert({
      member_id: TEST_USERS.memberOne.id,
      grade_scope: 'action_type',
      grade_key: 'reset',
      action_type: 'reset',
      verdict: 'landing',
      evidence_level: 'strong',
    });
    expect(error).not.toBeNull();
  });

  it('an actively assigned coach can read them', async () => {
    const owner = await signInAs(TEST_USERS.memberOne);
    await upsertCoachingGrades(owner, TEST_USERS.memberOne.id, [grade()]);

    const coach = await signInAs(TEST_USERS.coachOne);
    const grades = await listCoachingGrades(coach, TEST_USERS.memberOne.id);
    expect(grades).toHaveLength(1);
  });

  it('a coach whose assignment was revoked cannot', async () => {
    const owner = await signInAs(TEST_USERS.memberTwo);
    await upsertCoachingGrades(owner, TEST_USERS.memberTwo.id, [grade()]);

    const coach = await signInAs(TEST_USERS.coachOne);
    expect(await listCoachingGrades(coach, TEST_USERS.memberTwo.id)).toEqual([]);
  });
});

// =====================================================================
// The cached comparison outcome.
// =====================================================================

describe('the comparison outcome is computed once and never overwritten', () => {
  async function deliver(client: Awaited<ReturnType<typeof signInAs>>, localDate: string) {
    return recordCoachingDecision(
      client,
      TEST_USERS.memberOne.id,
      {
        localDate,
        rule: 'behavioral_friction',
        actionType: 'reset',
        threadKey: THREAD,
        approach: 0,
        isFollowOn: false,
        signalEvidence: { rule: 'behavioral_friction', frictionKind: 'daily_reset_incomplete' },
      },
      DEFAULT_COMPARISON_WINDOW_DAYS
    );
  }

  it('records an outcome and reads it back through the grading reader', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    await deliver(member, '2026-07-01');

    expect(await recordComparisonOutcome(member, TEST_USERS.memberOne.id, '2026-07-01', 'moved'))
      .toBe(true);

    const { ok, rows } = await listLedgerRowsForGrading(
      member,
      TEST_USERS.memberOne.id,
      '2026-06-01',
      TODAY
    );
    expect(ok).toBe(true);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.comparisonOutcome).toBe('moved');
    // The window parameters migration 150 stored are what the grader reads.
    expect(rows[0]!.comparisonWindowDays).toBe(DEFAULT_COMPARISON_WINDOW_DAYS);
    expect(rows[0]!.comparisonAfterCompleteOn).toBe('2026-07-15');
  });

  it('a second attempt does not overwrite the first, because a completed window cannot change', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    await deliver(member, '2026-07-01');
    await recordComparisonOutcome(member, TEST_USERS.memberOne.id, '2026-07-01', 'moved');

    expect(await recordComparisonOutcome(member, TEST_USERS.memberOne.id, '2026-07-01', 'flat'))
      .toBe(false);

    const { rows } = await listLedgerRowsForGrading(
      member,
      TEST_USERS.memberOne.id,
      '2026-06-01',
      TODAY
    );
    expect(rows[0]!.comparisonOutcome).toBe('moved');
  });

  it('the real check constraint refuses an outcome outside the closed set', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    await deliver(member, '2026-07-01');
    const { error } = await member
      .from('member_coaching_decisions')
      .update({ comparison_outcome: 'improved' })
      .eq('member_id', TEST_USERS.memberOne.id)
      .eq('local_date', '2026-07-01');
    expect(error).not.toBeNull();
  });

  it('grading a real ledger read produces the verdict the pure math says it should', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    for (const date of ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04']) {
      await deliver(member, date);
      await member
        .from('member_coaching_decisions')
        .update({ member_response: 'done', comparison_outcome: 'moved' })
        .eq('member_id', TEST_USERS.memberOne.id)
        .eq('local_date', date);
    }

    const { rows } = await listLedgerRowsForGrading(
      member,
      TEST_USERS.memberOne.id,
      '2026-06-01',
      TODAY
    );
    const computed = gradeDecisions('action_type', 'reset', 'reset', rows);
    expect(computed.actedCount).toBe(4);
    expect(computed.movedCount).toBe(4);
    expect(computed.verdict).toBe('landing');
  });
});

// =====================================================================
// The escalation lifecycle.
// =====================================================================

async function seedEscalatedThread(client: Awaited<ReturnType<typeof signInAs>>) {
  await touchCoachingThread(client, TEST_USERS.memberOne.id, {
    threadKey: THREAD,
    rule: 'behavioral_friction',
    actionType: 'reset',
    approach: 2,
    localDate: '2026-08-10',
  });
  await recordCoachingDecision(
    client,
    TEST_USERS.memberOne.id,
    {
      localDate: '2026-08-10',
      rule: 'behavioral_friction',
      actionType: 'reset',
      threadKey: THREAD,
      approach: 2,
      isFollowOn: false,
      signalEvidence: { rule: 'behavioral_friction', frictionKind: 'daily_reset_incomplete' },
    },
    DEFAULT_COMPARISON_WINDOW_DAYS
  );
  await client
    .from('member_coaching_decisions')
    .update({ member_response: 'ignored' })
    .eq('member_id', TEST_USERS.memberOne.id)
    .eq('local_date', '2026-08-10');

  const escalated = await escalateCoachingThread(
    client,
    TEST_USERS.memberOne.id,
    THREAD,
    2,
    ESCALATION_REASON_NO_RESPONSE
  );
  expect(escalated).toBe(true);
  await incrementEscalationCount(client, TEST_USERS.memberOne.id, THREAD);
}

describe('the coach escalation surface reads a real flagged thread', () => {
  it('lists the flagged thread with its counters and its ledger rows', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    await seedEscalatedThread(member);

    const coach = await signInAs(TEST_USERS.coachOne);
    const threads = await listEscalatedThreadRows(coach, TEST_USERS.memberOne.id);
    expect(threads).toHaveLength(1);
    expect(threads[0]!.threadKey).toBe(THREAD);
    expect(threads[0]!.escalationCount).toBe(1);

    const decisions = await listDecisionsForThreads(coach, TEST_USERS.memberOne.id, [THREAD]);
    const view = buildEscalationView(threads[0]!, decisions);
    expect(view.approachesTried).toBe(3);
    expect(view.deliveredCount).toBe(1);
    expect(view.responses.find((r) => r.response === 'ignored')?.count).toBe(1);
    expect(view.signalKeys.map((s) => s.key)).toContain('frictionKind');
  });

  it('a coach whose assignment was revoked sees nothing', async () => {
    const owner = await signInAs(TEST_USERS.memberTwo);
    await touchCoachingThread(owner, TEST_USERS.memberTwo.id, {
      threadKey: THREAD,
      rule: 'behavioral_friction',
      actionType: 'reset',
      approach: 2,
      localDate: '2026-08-10',
    });
    await escalateCoachingThread(
      owner,
      TEST_USERS.memberTwo.id,
      THREAD,
      2,
      ESCALATION_REASON_NO_RESPONSE
    );

    const coach = await signInAs(TEST_USERS.coachOne);
    expect(await listEscalatedThreadRows(coach, TEST_USERS.memberTwo.id)).toEqual([]);
  });

  it('reads the thread action type server side, for the resolve event', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    await seedEscalatedThread(member);
    const coach = await signInAs(TEST_USERS.coachOne);
    expect(await getThreadActionType(coach, TEST_USERS.memberOne.id, THREAD)).toBe('reset');
  });
});

describe('resolve_coaching_escalation clears the flag and hands back a cooldown', () => {
  it('an assigned coach resolves it, and the thread leaves the flagged list', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    await seedEscalatedThread(member);

    const coach = await signInAs(TEST_USERS.coachOne);
    const result = await resolveCoachingEscalation(coach, TEST_USERS.memberOne.id, THREAD);
    expect(result.error).toBeNull();
    expect(result.resolved).toBe(true);

    expect(await listEscalatedThreadRows(coach, TEST_USERS.memberOne.id)).toEqual([]);
  });

  it('sets a cooldown the member’s own engine can read, dated by the declared number of days', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    await seedEscalatedThread(member);

    const coach = await signInAs(TEST_USERS.coachOne);
    await resolveCoachingEscalation(coach, TEST_USERS.memberOne.id, THREAD);

    const cooldowns = await listThreadCooldowns(member, TEST_USERS.memberOne.id);
    const until = cooldowns.get(THREAD);
    expect(until).toBeDefined();

    const expected = new Date();
    expected.setUTCDate(expected.getUTCDate() + ESCALATION_COOLDOWN_DAYS);
    expect(until).toBe(expected.toISOString().slice(0, 10));
  });

  it('resets the counters, so the retry starts from the beginning rather than one day from re-escalating', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    await seedEscalatedThread(member);
    // Put the thread in the exact state that escalated it in the first place.
    await member
      .from('member_coaching_threads')
      .update({ consecutive_ignored: 3, approach_changes: 2, responses_since_last_change: 0 })
      .eq('member_id', TEST_USERS.memberOne.id)
      .eq('thread_key', THREAD);

    const coach = await signInAs(TEST_USERS.coachOne);
    await resolveCoachingEscalation(coach, TEST_USERS.memberOne.id, THREAD);

    const { data } = await member
      .from('member_coaching_threads')
      .select('approach, approach_changes, consecutive_ignored, coach_escalated_at, escalation_resolved_at')
      .eq('member_id', TEST_USERS.memberOne.id)
      .eq('thread_key', THREAD)
      .single();

    expect(data!.approach).toBe(0);
    expect(data!.approach_changes).toBe(0);
    expect(data!.consecutive_ignored).toBe(0);
    expect(data!.coach_escalated_at).toBeNull();
    expect(data!.escalation_resolved_at).not.toBeNull();
  });

  it('a second resolve reports false rather than pushing the cooldown forward', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    await seedEscalatedThread(member);

    const coach = await signInAs(TEST_USERS.coachOne);
    expect((await resolveCoachingEscalation(coach, TEST_USERS.memberOne.id, THREAD)).resolved).toBe(
      true
    );
    expect((await resolveCoachingEscalation(coach, TEST_USERS.memberOne.id, THREAD)).resolved).toBe(
      false
    );
  });

  it('refuses a coach who is not actively assigned to this member', async () => {
    const owner = await signInAs(TEST_USERS.memberTwo);
    await touchCoachingThread(owner, TEST_USERS.memberTwo.id, {
      threadKey: THREAD,
      rule: 'behavioral_friction',
      actionType: 'reset',
      approach: 2,
      localDate: '2026-08-10',
    });
    await escalateCoachingThread(
      owner,
      TEST_USERS.memberTwo.id,
      THREAD,
      2,
      ESCALATION_REASON_NO_RESPONSE
    );

    const coach = await signInAs(TEST_USERS.coachOne);
    const result = await resolveCoachingEscalation(coach, TEST_USERS.memberTwo.id, THREAD);
    expect(result.resolved).toBe(false);
    expect(result.error).not.toBeNull();
  });

  it('refuses a member trying to clear her own flag, which is the coach’s decision to make', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    await seedEscalatedThread(member);

    const result = await resolveCoachingEscalation(member, TEST_USERS.memberOne.id, THREAD);
    expect(result.resolved).toBe(false);
    expect(result.error).not.toBeNull();
  });

  it('refuses a signed-out caller', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    await seedEscalatedThread(member);

    const { anonClient } = await import('./setup/test-clients');
    const result = await resolveCoachingEscalation(
      anonClient(),
      TEST_USERS.memberOne.id,
      THREAD
    );
    expect(result.resolved).toBe(false);
  });

  it('refuses a cooldown outside the allowed range', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    await seedEscalatedThread(member);

    const coach = await signInAs(TEST_USERS.coachOne);
    expect((await resolveCoachingEscalation(coach, TEST_USERS.memberOne.id, THREAD, -1)).error)
      .not.toBeNull();
    expect((await resolveCoachingEscalation(coach, TEST_USERS.memberOne.id, THREAD, 9999)).error)
      .not.toBeNull();
  });
});

// =====================================================================
// The three analytics event types.
// =====================================================================

describe('the three new event types are accepted and reach the analytics view', () => {
  it('the real constraint accepts all three', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    for (const eventType of [
      'coaching_thread_escalated',
      'coaching_escalation_resolved',
      'coaching_grades_computed',
    ] as const) {
      const wrote = await trackProductEvent(member, {
        memberId: TEST_USERS.memberOne.id,
        eventType,
        timezone: 'America/New_York',
        payload: { actionType: 'reset', gradeCount: '4' },
      });
      expect(wrote).toBe(true);
    }
  });

  it('all three are classified as product analytics, so existing rollups pick them up', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    for (const eventType of [
      'coaching_thread_escalated',
      'coaching_escalation_resolved',
      'coaching_grades_computed',
    ] as const) {
      await trackProductEvent(member, {
        memberId: TEST_USERS.memberOne.id,
        eventType,
        timezone: 'America/New_York',
        payload: { gradeCount: '4' },
      });
    }

    const service = serviceRoleClient();
    const { data } = await service
      .from('product_analytics_events')
      .select('event_type')
      .eq('member_id', TEST_USERS.memberOne.id)
      .in('event_type', [
        'coaching_thread_escalated',
        'coaching_escalation_resolved',
        'coaching_grades_computed',
      ]);
    expect(new Set((data ?? []).map((row) => row.event_type)).size).toBe(3);
  });

  it('a grades event stores counts and nothing that could describe her', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    await trackProductEvent(member, {
      memberId: TEST_USERS.memberOne.id,
      eventType: 'coaching_grades_computed',
      timezone: 'America/New_York',
      payload: { gradeCount: '7', landingCount: '2', deadCount: '1' },
    });

    const service = serviceRoleClient();
    const { data } = await service
      .from('member_wellness_events')
      .select('payload')
      .eq('member_id', TEST_USERS.memberOne.id)
      .eq('event_type', 'coaching_grades_computed')
      .single();

    expect(data!.payload).toEqual({ gradeCount: '7', landingCount: '2', deadCount: '1' });
  });

  it('a coach-sourced resolve event is distinguishable from something she did herself', async () => {
    const service = serviceRoleClient();
    await trackProductEvent(service, {
      memberId: TEST_USERS.memberOne.id,
      eventType: 'coaching_escalation_resolved',
      timezone: 'America/New_York',
      source: 'coach',
      payload: { actionType: 'reset' },
    });

    const { data } = await service
      .from('member_wellness_events')
      .select('source')
      .eq('member_id', TEST_USERS.memberOne.id)
      .eq('event_type', 'coaching_escalation_resolved')
      .single();

    expect(data!.source).toBe('coach');
  });
});
