/**
 * End-to-end tests for lib/correlation-engine/service.ts against real
 * local Supabase — real RLS, no mocked client, same philosophy as
 * tests/investigation-router-decision-integration.test.ts. Exercises the
 * whole pipeline: real daily_checkins history -> Spearman correlation ->
 * member_correlation_findings (this engine's own evidence record) ->
 * member_pattern_states (the existing three-tier system, signal_kind
 * 'correlation_finding').
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import { runCorrelationEngineForMember } from '../lib/correlation-engine/service';
import { insertMemberGoalSelection } from '../lib/member-goals/data';

const memberId = TEST_USERS.memberOne.id;
const otherMemberId = TEST_USERS.memberTwo.id;

// A distinctive, far-past date range no other test's fixtures should ever touch.
const START_DATE = '2020-02-01';
const NUM_DAYS = 30;
const AS_OF_DATE = '2020-03-02'; // START_DATE + 30 days

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function seedCorrelatedCheckins(memberId: string) {
  const service = serviceRoleClient();
  const rows = Array.from({ length: NUM_DAYS }, (_, i) => {
    const cycle = i % 5;
    return {
      user_id: memberId,
      timezone: 'America/New_York',
      local_date: addDays(START_DATE, i),
      // pain (0-5) rises and falls in lockstep with stress (1-5) — a real,
      // strong, positive same-day relationship.
      pain_discomfort_level: cycle,
      stress_level: cycle + 1,
    };
  });
  const { error } = await service.from('daily_checkins').insert(rows);
  if (error) throw new Error(`Seed failed: ${error.message}`);
}

async function cleanup(memberId: string) {
  const service = serviceRoleClient();
  await service
    .from('daily_checkins')
    .delete()
    .eq('user_id', memberId)
    .gte('local_date', START_DATE)
    .lte('local_date', addDays(START_DATE, NUM_DAYS));
  await service.from('member_correlation_findings').delete().eq('member_id', memberId);
  await service.from('member_pattern_states').delete().eq('member_id', memberId).like('signal_key', 'correlation::%');
  await service.from('member_goal_selections').delete().eq('member_id', memberId);
}

describe('correlation engine — end to end (migration 105)', () => {
  beforeAll(async () => {
    await cleanup(memberId);
    await cleanup(otherMemberId);
  });

  afterEach(async () => {
    await cleanup(memberId);
    await cleanup(otherMemberId);
  });

  afterAll(async () => {
    await cleanup(memberId);
    await cleanup(otherMemberId);
  });

  it('computes a real Spearman correlation from real check-in history and persists both tables', async () => {
    await seedCorrelatedCheckins(memberId);
    const service = serviceRoleClient();

    const result = await runCorrelationEngineForMember(service, memberId, AS_OF_DATE);
    expect(result.pairsEvaluated).toBeGreaterThan(0);

    const painStress = result.findings.find((f) => f.pairKey === 'pain_stress');
    expect(painStress).toBeDefined();
    expect(painStress!.direction).toBe('positive');
    expect(painStress!.rho).toBeGreaterThan(0.3);
    expect(painStress!.observationCount).toBe(NUM_DAYS);
    expect(painStress!.lag).toBe('same_day');

    const { data: findingRows } = await service
      .from('member_correlation_findings')
      .select('*')
      .eq('member_id', memberId)
      .eq('pair_key', 'pain_stress')
      .single();
    expect(findingRows).toBeTruthy();
    expect(findingRows!.rho).toBeGreaterThan(0.3);

    const { data: signalRows } = await service
      .from('member_pattern_states')
      .select('*')
      .eq('member_id', memberId)
      .eq('signal_key', 'correlation::pain_stress')
      .single();
    expect(signalRows).toBeTruthy();
    expect(signalRows!.signal_kind).toBe('correlation_finding');
    expect(signalRows!.state).toBe('one_time_observation'); // first run, occurrence 1
    expect(signalRows!.tier).toBe(1);
  }, 30000);

  it('grows occurrence count and tier on a second consecutive confirming run', async () => {
    await seedCorrelatedCheckins(memberId);
    const service = serviceRoleClient();

    await runCorrelationEngineForMember(service, memberId, AS_OF_DATE);
    await runCorrelationEngineForMember(service, memberId, AS_OF_DATE);

    const { data: signalRow } = await service
      .from('member_pattern_states')
      .select('*')
      .eq('member_id', memberId)
      .eq('signal_key', 'correlation::pain_stress')
      .single();

    expect(signalRow!.occurrence_count).toBe(2);
    expect(signalRow!.state).toBe('repeated_signal');
    expect(signalRow!.tier).toBe(2);
  }, 30000);

  it('records insufficient_data for a member with no real check-in history', async () => {
    const service = serviceRoleClient();
    const result = await runCorrelationEngineForMember(service, otherMemberId, AS_OF_DATE);
    expect(result.pairsEvaluated).toBeGreaterThan(0);
    for (const finding of result.findings) {
      expect(finding.state).toBe('insufficient_data');
      expect(finding.observationCount).toBe(0);
    }
  }, 30000);

  it("narrows candidate pairs to the member's recorded goals", async () => {
    const service = serviceRoleClient();
    await seedCorrelatedCheckins(memberId);
    const { error } = await insertMemberGoalSelection(service, {
      memberId,
      goals: ['reduce_pain'],
      primaryGoal: 'reduce_pain',
      goalsOther: null,
      source: 'welcome_flow',
    });
    expect(error).toBeNull();

    const result = await runCorrelationEngineForMember(service, memberId, AS_OF_DATE);

    // Every seeded pair for 'reduce_pain' should be present...
    expect(result.findings.some((f) => f.pairKey === 'pain_stress')).toBe(true);
    // ...but a pair scoped only to a different goal (e.g. digestion) should not.
    expect(result.findings.some((f) => f.pairKey === 'digestion_bowel')).toBe(false);
  }, 30000);

  it('RLS: a member can read their own correlation findings but not another member’s', async () => {
    const service = serviceRoleClient();
    await seedCorrelatedCheckins(memberId);
    await runCorrelationEngineForMember(service, memberId, AS_OF_DATE);

    const ownClient = await signInAs(TEST_USERS.memberOne);
    const { data: own, error: ownError } = await ownClient
      .from('member_correlation_findings')
      .select('id')
      .eq('member_id', memberId);
    expect(ownError).toBeNull();
    expect((own ?? []).length).toBeGreaterThan(0);

    const otherClient = await signInAs(TEST_USERS.memberTwo);
    const { data: other, error: otherError } = await otherClient
      .from('member_correlation_findings')
      .select('id')
      .eq('member_id', memberId);
    expect(otherError).toBeNull();
    expect(other ?? []).toHaveLength(0);
  }, 30000);

  it('RLS: any authenticated member can read the reference candidate-pair catalog', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const { data, error } = await client.from('correlation_candidate_pairs').select('pair_key').eq('active', true);
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });
});
