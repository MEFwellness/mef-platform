/**
 * Dashboard Evolution (Prompt 5), requirement 7 — real-DB proof that the
 * day-3 contrast callback (built and pure-tested in Prompt 4, but never
 * wired to a real data fetch until now) actually reaches real rows, not
 * just hand-built fixture contexts. Same real-RLS-real-rows philosophy
 * as tests/lifestyle-experiments-integration.test.ts. The finding
 * callback's own data layer (fetchFindingCallbackContext) reuses
 * lib/case-view/findings.ts's buildFindings verbatim — already exercised
 * against real member_pattern_states rows by
 * tests/correlation-engine-integration.test.ts and
 * tests/discovery-moments-select.test.ts, so it isn't re-proven here.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import { fetchDay3ContrastCallbackContext } from '../lib/memory-callback/data';
import { buildDay3ContrastCallback } from '../lib/memory-callback/copy';

const memberId = TEST_USERS.memberOne.id;

afterEach(async () => {
  const service = serviceRoleClient();
  await service.from('lifestyle_experiments').delete().eq('member_id', memberId).eq('title', 'Memory-callback test fixture');
});

describe('fetchDay3ContrastCallbackContext — real rows, not a hand-built fixture', () => {
  it('returns null for a member with no real day-3 response logged (nothing to remember yet)', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    // No fixture experiment inserted in this test — whatever the shared
    // fixture account already has (if anything) is real either way, so
    // this only asserts the shape of a genuinely absent case by using a
    // member with none logged: memberTwo, whose sparse local-seed state
    // never runs any real experiments (per root-presence-integration's
    // own "brand-new member" precedent).
    const otherMember = await signInAs(TEST_USERS.memberTwo);
    void member;
    const context = await fetchDay3ContrastCallbackContext(otherMember, TEST_USERS.memberTwo.id);
    expect(context).toBeNull();
  });

  it('is non-vacuous: a real experiment with a real day-3 response produces a real, honest callback sentence', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    const service = serviceRoleClient();

    const { data: experiment, error: experimentError } = await service
      .from('lifestyle_experiments')
      .insert({
        member_id: memberId,
        title: 'Memory-callback test fixture',
        protocol: 'A consistent bedtime routine.',
        start_date: '2026-01-01',
        duration_days: 7,
        source_experience_key: 'core-values-snapshot',
      })
      .select('id')
      .single();
    expect(experimentError).toBeNull();

    const { error: logError } = await service.from('cvs_experiment_daily_logs').insert({
      experiment_id: experiment!.id,
      member_id: memberId,
      local_date: '2026-01-03',
      day3_response: 'going_well',
    });
    expect(logError).toBeNull();

    const context = await fetchDay3ContrastCallbackContext(member, memberId);
    expect(context).not.toBeNull();
    expect(context!.day3Response).toBe('going_well');
    expect(context!.experienceLabel).toBe('Core Values Snapshot experiment');

    const sentence = buildDay3ContrastCallback(context);
    expect(sentence).toBe('On day 3 of your Core Values Snapshot experiment, you told me it was going well.');

    await service.from('lifestyle_experiments').delete().eq('id', experiment!.id);
  });
});
