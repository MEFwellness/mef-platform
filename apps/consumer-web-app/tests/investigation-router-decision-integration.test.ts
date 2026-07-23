/**
 * End-to-end tests for investigation_router_decisions' member self-insert
 * policy (migration 90, Prompt 10) against real local Supabase — real RLS,
 * no mocked client, same philosophy as tests/registry-integration.test.ts.
 * Migration 89 shipped this table with no member insert policy because
 * recordRouterDecision() had no caller yet; Prompt 10 gives it one
 * (getMyTakeAssessmentState) and this migration the policy that write
 * needs. This file proves the policy, not the classifier logic (covered by
 * tests/root-router-outcome.test.ts).
 */
import { describe, it, expect, afterAll } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import { recordRouterDecision, type RootRouterDecision } from '../lib/investigation-engine/rootRouter';

const memberId = TEST_USERS.memberOne.id;
const otherMemberId = TEST_USERS.memberTwo.id;

function decisionFor(key: string | null): RootRouterDecision {
  return {
    safetyGated: false,
    recommendation: key
      ? { key: key as never, reason: 'recommended_next' as never }
      : { key: null, reason: 'upgrade_invitation' },
    findingBasedSuggestions: [],
  };
}

afterAll(async () => {
  const service = serviceRoleClient();
  await service.from('investigation_router_decisions').delete().eq('member_id', memberId);
});

describe('investigation_router_decisions — member self-insert (migration 90)', () => {
  it('a member can log their own Root Router decision', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);

    await recordRouterDecision(memberClient, memberId, decisionFor('short-haq'), 'short-haq');

    const service = serviceRoleClient();
    const { data, error } = await service
      .from('investigation_router_decisions')
      .select('recommended_key, chosen_key')
      .eq('member_id', memberId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0]!.recommended_key).toBe('short-haq');
    expect(data![0]!.chosen_key).toBe('short-haq');
  });

  it('no-ops (inserts nothing) when nothing was actually recommended', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);
    const service = serviceRoleClient();

    await service.from('investigation_router_decisions').delete().eq('member_id', memberId);
    await recordRouterDecision(memberClient, memberId, decisionFor(null), null);

    const { data } = await service
      .from('investigation_router_decisions')
      .select('id')
      .eq('member_id', memberId);
    expect(data).toHaveLength(0);
  });

  it('a member cannot log a Root Router decision for a different member', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);

    // member_insert_own's WITH CHECK (member_id = auth.uid()) must reject
    // this — recordRouterDecision itself only logs the error, so assert
    // directly against the underlying insert instead of the helper.
    const { error } = await memberClient.from('investigation_router_decisions').insert({
      member_id: otherMemberId,
      recommended_key: 'short-haq',
      recommended_reason: 'recommended_next',
      chosen_key: 'short-haq',
    });

    expect(error).not.toBeNull();
  });

  it('a member cannot read another member’s logged decisions', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);
    await recordRouterDecision(memberClient, memberId, decisionFor('short-haq'), 'short-haq');

    const otherMemberClient = await signInAs(TEST_USERS.memberTwo);
    const { data, error } = await otherMemberClient
      .from('investigation_router_decisions')
      .select('id')
      .eq('member_id', memberId);

    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });
});
