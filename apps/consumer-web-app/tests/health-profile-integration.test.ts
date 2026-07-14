/**
 * End-to-end tests for the persisted Longitudinal Health Profile
 * (member_health_profiles / upsert_member_health_profile) against real
 * local Supabase — real RLS and RPC authorization, no mocked client.
 * Exercises the RPC directly, separate from the full publish cascade
 * covered by tests/health-profile-orchestration-integration.test.ts.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';

const memberId = TEST_USERS.memberOne.id;

async function upsert(
  client: Awaited<ReturnType<typeof signInAs>>,
  overrides: Partial<{ summary: Record<string, unknown>; trigger: string; targetMemberId: string }> = {}
) {
  return client.rpc('upsert_member_health_profile', {
    p_member: overrides.targetMemberId ?? memberId,
    p_summary: overrides.summary ?? { topPriorities: [], activeRegistryFindingsBySeverity: {}, wellnessInsightHighlights: [], identityHighlights: [], lastAssessmentPublishedAt: null },
    p_latest_snapshot_id: null,
    p_wellness_insight_count: 0,
    p_registry_finding_count: 0,
    p_overall_confidence: null,
    p_trigger: overrides.trigger ?? 'manual',
  });
}

afterAll(async () => {
  const service = serviceRoleClient();
  await service.from('member_health_profiles').delete().eq('member_id', memberId);
});

describe('member_health_profiles — atomic upsert, RLS, one row per member', () => {
  it('a member can upsert their own health profile', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);
    const { error } = await upsert(memberClient, { trigger: 'check_in' });
    expect(error).toBeNull();

    const { data } = await memberClient.from('member_health_profiles').select('*').eq('member_id', memberId).single();
    expect(data!.last_recalculated_trigger).toBe('check_in');
  }, 30_000);

  it('re-upserting updates the same row rather than inserting a second one', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);
    await upsert(memberClient, { trigger: 'onboarding' });
    await upsert(memberClient, { trigger: 'reassessment' });

    const { data } = await memberClient.from('member_health_profiles').select('*').eq('member_id', memberId);
    expect(data).toHaveLength(1);
    expect(data![0]!.last_recalculated_trigger).toBe('reassessment');
  }, 30_000);

  it('an assigned coach can upsert on behalf of their client', async () => {
    const coachClient = await signInAs(TEST_USERS.coachOne);
    const { error } = await upsert(coachClient, { trigger: 'assessment_published' });
    expect(error).toBeNull();
  }, 30_000);

  it('an unassigned member (memberTwo) cannot upsert memberOne\'s health profile — the RPC raises', async () => {
    const memberTwoClient = await signInAs(TEST_USERS.memberTwo);
    const { error } = await upsert(memberTwoClient, { targetMemberId: memberId });
    expect(error).not.toBeNull();
  }, 30_000);

  it('RLS: an unassigned member cannot read another member\'s health profile row directly', async () => {
    const memberTwoClient = await signInAs(TEST_USERS.memberTwo);
    const { data, error } = await memberTwoClient
      .from('member_health_profiles')
      .select('*')
      .eq('member_id', memberId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  }, 30_000);
});
