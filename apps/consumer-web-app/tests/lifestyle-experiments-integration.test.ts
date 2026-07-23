/**
 * End-to-end tests for lifestyle_experiments (migration 92) against real
 * local Supabase — real RLS, no mocked client, same philosophy as
 * tests/recommendation-engine-integration.test.ts. Exercises
 * lib/lifestyle-experiments/data.ts directly.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import {
  startLifestyleExperiment,
  closeLifestyleExperiment,
  listMyLifestyleExperiments,
} from '../lib/lifestyle-experiments/data';

const memberId = TEST_USERS.memberOne.id;

afterAll(async () => {
  const service = serviceRoleClient();
  await service.from('lifestyle_experiments').delete().eq('member_id', memberId);
});

describe('lifestyle_experiments — start, reflect/close, RLS (migration 92)', () => {
  it('starting an experiment copies title/protocol verbatim and creates an active row', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);

    const experiment = await startLifestyleExperiment(memberClient, memberId, {
      recommendationId: null,
      title: 'Wind-down routine',
      protocol: 'Try a consistent bedtime routine for two weeks.',
      startDate: '2026-06-01',
      durationDays: 14,
    });

    expect(experiment).not.toBeNull();
    expect(experiment!.title).toBe('Wind-down routine');
    expect(experiment!.protocol).toBe('Try a consistent bedtime routine for two weeks.');
    expect(experiment!.status).toBe('active');
    expect(experiment!.durationDays).toBe(14);
  });

  it('reflecting and closing persists the outcome and reflection, and sets closed_at', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);
    const service = serviceRoleClient();
    await service.from('lifestyle_experiments').delete().eq('member_id', memberId);

    const experiment = await startLifestyleExperiment(memberClient, memberId, {
      recommendationId: null,
      title: 'Morning walk',
      protocol: 'A 10 minute walk each morning.',
      startDate: '2026-06-01',
      durationDays: 7,
    });

    const ok = await closeLifestyleExperiment(memberClient, memberId, experiment!.id, {
      reflectionText: 'Felt more energized by the end of the week.',
      outcome: 'worked',
    });
    expect(ok).toBe(true);

    const [closed] = await listMyLifestyleExperiments(memberClient, memberId);
    expect(closed!.status).toBe('completed');
    expect(closed!.outcome).toBe('worked');
    expect(closed!.reflectionText).toBe('Felt more energized by the end of the week.');
    expect(closed!.closedAt).not.toBeNull();
  });

  it('an assigned coach can read but not write, and a member cannot read another member’s experiments', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);
    const service = serviceRoleClient();
    await service.from('lifestyle_experiments').delete().eq('member_id', memberId);

    await startLifestyleExperiment(memberClient, memberId, {
      recommendationId: null,
      title: 'Hydration habit',
      protocol: 'Drink a glass of water before each meal.',
      startDate: '2026-06-01',
      durationDays: 7,
    });

    const coachClient = await signInAs(TEST_USERS.coachOne);
    const asCoach = await listMyLifestyleExperiments(coachClient, memberId);
    expect(asCoach.length).toBeGreaterThan(0);

    // No coach update policy exists on this table (migration 92) — RLS
    // makes zero rows match for that role, so the update reports no error
    // but genuinely changes nothing (never a bypass).
    await coachClient.from('lifestyle_experiments').update({ status: 'completed' }).eq('member_id', memberId);
    const stillActive = await listMyLifestyleExperiments(memberClient, memberId);
    expect(stillActive[0]!.status).toBe('active');

    const otherMemberClient = await signInAs(TEST_USERS.memberTwo);
    const asOtherMember = await listMyLifestyleExperiments(otherMemberClient, memberId);
    expect(asOtherMember).toHaveLength(0);
  });
});
