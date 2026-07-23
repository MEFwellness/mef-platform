/**
 * End-to-end tests for member_recommendations (migration 91) against real
 * local Supabase — real RLS, no mocked client, same philosophy as
 * tests/investigation-router-decision-integration.test.ts. Exercises
 * lib/recommendation-engine/data.ts directly (server actions use
 * `cookies()` and can't be called outside a Next.js request scope — see
 * tests/setup/test-clients.ts's own docblock).
 */
import { describe, it, expect, afterAll } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import {
  upsertMemberRecommendation,
  listMemberRecommendations,
  completeRecommendation,
  ignoreRecommendation,
} from '../lib/recommendation-engine/data';
import type { MemberRecommendation } from '../lib/recommendation-engine/types';

const memberId = TEST_USERS.memberOne.id;

function draft(overrides: Partial<MemberRecommendation> = {}): MemberRecommendation {
  return {
    recommendationId: 'sleep_sleep_optimization_test-recommendation',
    category: 'sleep_optimization',
    sourceDomain: 'sleep',
    title: 'Improve your wind-down routine',
    explanation: 'A consistent bedtime routine can help.',
    whyThisWasSelected: 'This traces back to a high-priority pattern in your recent activity.',
    supportingFindings: ['Sleep trend: declining (80% confidence).'],
    confidence: 0.8,
    priority: 'high',
    recommendedDuration: 'daily',
    reassessmentTrigger: null,
    completionTracking: true,
    status: 'shown',
    ...overrides,
  };
}

afterAll(async () => {
  const service = serviceRoleClient();
  await service.from('member_recommendations').delete().eq('member_id', memberId);
});

describe('member_recommendations — dedup, lifecycle protection, RLS (migration 91)', () => {
  it('upserting the same key twice touches one row rather than duplicating it', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);

    await upsertMemberRecommendation(memberClient, memberId, draft());
    await upsertMemberRecommendation(memberClient, memberId, draft({ confidence: 0.85 }));

    const rows = await listMemberRecommendations(memberClient, memberId, { statusFilter: ['shown'] });
    const matching = rows.filter((r) => r.recommendationId === draft().recommendationId);
    expect(matching).toHaveLength(1);
    expect(matching[0]!.confidence).toBe(0.85); // touched with the fresh value
  });

  it('never reopens a completed recommendation on recompute', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);
    const service = serviceRoleClient();
    await service.from('member_recommendations').delete().eq('member_id', memberId);

    await upsertMemberRecommendation(memberClient, memberId, draft());
    const [shown] = await listMemberRecommendations(memberClient, memberId, { statusFilter: ['shown'] });
    const ok = await completeRecommendation(memberClient, shown!.id, memberId);
    expect(ok).toBe(true);

    // Recompute with the same key — must not reopen the completed row.
    await upsertMemberRecommendation(memberClient, memberId, draft());
    const stillCompleted = await listMemberRecommendations(memberClient, memberId, {
      statusFilter: ['completed'],
    });
    expect(stillCompleted).toHaveLength(1);
    const reopened = await listMemberRecommendations(memberClient, memberId, { statusFilter: ['shown'] });
    expect(reopened).toHaveLength(0);
  });

  it('a member can ignore their own recommendation', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);
    const service = serviceRoleClient();
    await service.from('member_recommendations').delete().eq('member_id', memberId);

    await upsertMemberRecommendation(memberClient, memberId, draft());
    const [shown] = await listMemberRecommendations(memberClient, memberId, { statusFilter: ['shown'] });
    const ok = await ignoreRecommendation(memberClient, shown!.id, memberId, 'not relevant');
    expect(ok).toBe(true);

    const ignored = await listMemberRecommendations(memberClient, memberId, { statusFilter: ['ignored'] });
    expect(ignored).toHaveLength(1);
    expect(ignored[0]!.ignoredReason).toBe('not relevant');
  });

  it('an assigned coach can read but a member cannot read another member’s recommendations', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);
    const service = serviceRoleClient();
    await service.from('member_recommendations').delete().eq('member_id', memberId);
    await upsertMemberRecommendation(memberClient, memberId, draft());

    const coachClient = await signInAs(TEST_USERS.coachOne);
    const asCoach = await listMemberRecommendations(coachClient, memberId);
    expect(asCoach.length).toBeGreaterThan(0);

    const otherMemberClient = await signInAs(TEST_USERS.memberTwo);
    const asOtherMember = await listMemberRecommendations(otherMemberClient, memberId);
    expect(asOtherMember).toHaveLength(0);
  });
});
