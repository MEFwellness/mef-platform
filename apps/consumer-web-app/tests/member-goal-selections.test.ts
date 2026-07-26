/**
 * End-to-end tests for member_goal_selections (migration 104) against real
 * local Supabase — real RLS, no mocked client, same philosophy as
 * tests/investigation-router-decision-integration.test.ts. Covers the
 * table's two properties: it's the member's own, insert-only history (no
 * update policy at all), and lib/member-goals/data.ts reads the most
 * recent row as "current."
 */
import { describe, it, expect, afterEach } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import { fetchLatestMemberGoalSelection, insertMemberGoalSelection } from '../lib/member-goals/data';

const memberId = TEST_USERS.memberOne.id;
const otherMemberId = TEST_USERS.memberTwo.id;

async function cleanup() {
  const service = serviceRoleClient();
  await service.from('member_goal_selections').delete().eq('member_id', memberId);
  await service.from('member_goal_selections').delete().eq('member_id', otherMemberId);
}

describe('member_goal_selections (migration 104)', () => {
  afterEach(cleanup);

  it('a member can insert their own goal selection and read it back as the latest', async () => {
    const client = await signInAs(TEST_USERS.memberOne);

    const { error } = await insertMemberGoalSelection(client, {
      memberId,
      goals: ['sleep_better', 'reduce_stress'],
      primaryGoal: 'sleep_better',
      goalsOther: null,
      source: 'welcome_flow',
    });
    expect(error).toBeNull();

    const latest = await fetchLatestMemberGoalSelection(client, memberId);
    expect(latest).not.toBeNull();
    expect(latest!.goals).toEqual(['sleep_better', 'reduce_stress']);
    expect(latest!.primaryGoal).toBe('sleep_better');
    expect(latest!.source).toBe('welcome_flow');
  });

  it('a later change is a new row, not an overwrite — both stay queryable, latest wins as current', async () => {
    const client = await signInAs(TEST_USERS.memberOne);

    await insertMemberGoalSelection(client, {
      memberId,
      goals: ['sleep_better', 'reduce_stress'],
      primaryGoal: 'sleep_better',
      goalsOther: null,
      source: 'welcome_flow',
    });

    // A real clock tick so created_at ordering is unambiguous.
    await new Promise((resolve) => setTimeout(resolve, 10));

    await insertMemberGoalSelection(client, {
      memberId,
      goals: ['sleep_better', 'reduce_stress'],
      primaryGoal: 'reduce_stress',
      goalsOther: null,
      source: 'onboarding_confirmation',
    });

    const service = serviceRoleClient();
    const { data: allRows } = await service
      .from('member_goal_selections')
      .select('primary_goal')
      .eq('member_id', memberId)
      .order('created_at', { ascending: true });

    expect(allRows).toHaveLength(2);
    expect(allRows![0]!.primary_goal).toBe('sleep_better');
    expect(allRows![1]!.primary_goal).toBe('reduce_stress');

    const latest = await fetchLatestMemberGoalSelection(client, memberId);
    expect(latest!.primaryGoal).toBe('reduce_stress');
    expect(latest!.source).toBe('onboarding_confirmation');
  });

  it('preserves free-text "something else" wording verbatim', async () => {
    const client = await signInAs(TEST_USERS.memberOne);

    await insertMemberGoalSelection(client, {
      memberId,
      goals: ['something_else'],
      primaryGoal: 'something_else',
      goalsOther: 'A nagging shoulder issue from an old injury',
      source: 'welcome_flow',
    });

    const latest = await fetchLatestMemberGoalSelection(client, memberId);
    expect(latest!.goalsOther).toBe('A nagging shoulder issue from an old injury');
  });

  it('a member cannot insert a goal selection for a different member', async () => {
    const client = await signInAs(TEST_USERS.memberOne);

    const { error } = await client.from('member_goal_selections').insert({
      member_id: otherMemberId,
      goals: ['sleep_better'],
      primary_goal: 'sleep_better',
    });

    expect(error).not.toBeNull();
  });

  it("a member cannot read another member's goal selections", async () => {
    const ownerClient = await signInAs(TEST_USERS.memberOne);
    await insertMemberGoalSelection(ownerClient, {
      memberId,
      goals: ['sleep_better'],
      primaryGoal: 'sleep_better',
      goalsOther: null,
      source: 'welcome_flow',
    });

    const otherClient = await signInAs(TEST_USERS.memberTwo);
    const latest = await fetchLatestMemberGoalSelection(otherClient, memberId);
    expect(latest).toBeNull();
  });

  it('has no update policy — a member cannot edit a past row, only add a new one', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    await insertMemberGoalSelection(client, {
      memberId,
      goals: ['sleep_better'],
      primaryGoal: 'sleep_better',
      goalsOther: null,
      source: 'welcome_flow',
    });

    const { data } = await client
      .from('member_goal_selections')
      .update({ primary_goal: 'reduce_stress' })
      .eq('member_id', memberId)
      .select();

    // No update policy at all means RLS filters every row out of the
    // update's own USING clause — zero rows affected, not an error.
    expect(data ?? []).toHaveLength(0);

    const service = serviceRoleClient();
    const { data: actual } = await service
      .from('member_goal_selections')
      .select('primary_goal')
      .eq('member_id', memberId)
      .single();
    expect(actual?.primary_goal).toBe('sleep_better');
  });
});
