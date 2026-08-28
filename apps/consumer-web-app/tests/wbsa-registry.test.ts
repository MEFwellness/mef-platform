/**
 * WBSA — Assessment Registry wiring. Confirms the registry entry, the DB
 * catalog row (migration 100), the unified_assessment_definitions bridge
 * (migration 101's catalog_definition_id), and the plan-gating decision
 * (membership + holistic_reset only, no free_trial) are all real and
 * consistent — not just present in code, per the same discipline
 * tests/assessment-registry-integration.test.ts already applies to every
 * other assessment.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import { findAssessmentRegistryEntry, calculateAssessmentStatus } from '../lib/assessment-registry';
import { checkAssessmentAccess } from '../lib/assessment-registry/access';
import { getMemberAssessmentFacts } from '../lib/assessment-registry/facts';
import { getUnifiedAssessmentDefinitionByKey } from '../lib/assessment-foundation/repository';

const memberOneId = TEST_USERS.memberOne.id;

/**
 * THE PLAN IS THE GATE (2026-08-27). Writes the real plan
 * (member_subscriptions.tier, the one assigned on /admin/access) rather
 * than the legacy profiles.membership_tier column, which nothing reads for
 * access any more.
 */
async function setPlan(memberId: string, tier: 'trial' | 'monthly' | 'annual' | 'program') {
  const service = serviceRoleClient();
  // UPDATE, never upsert. The seeded trial_started_at/trial_ends_at are
  // themselves asserted by tests/membership-access-integration.test.ts, so
  // rewriting them here would break a test in another file that has
  // nothing to do with assessment gating.
  const { data, error } = await service
    .from('member_subscriptions')
    .update({ tier, status: 'active' })
    .eq('member_id', memberId)
    .select('member_id');
  if (error) throw error;
  if (data && data.length > 0) return;

  // Re-created rows carry the same trial window the account-creation
  // trigger would have stamped, off the profile's own created_at, so a
  // delete-and-recreate here cannot change what
  // tests/membership-access-integration.test.ts measures.
  const { data: profile } = await service
    .from('profiles')
    .select('created_at')
    .eq('id', memberId)
    .single();
  const started = new Date((profile?.created_at as string) ?? new Date().toISOString());
  const { error: insertError } = await service.from('member_subscriptions').insert({
    member_id: memberId,
    tier,
    source: 'system',
    status: 'active',
    trial_started_at: started.toISOString(),
    trial_ends_at: new Date(started.getTime() + 30 * 24 * 3600_000).toISOString(),
  });
  if (insertError) throw insertError;
}

afterEach(async () => {
  const service = serviceRoleClient();
  await service.from('profiles').update({ membership_tier: null }).eq('id', memberOneId);
  await setPlan(memberOneId, 'trial');
});

describe('WBSA registry entry', () => {
  it('is registered under key "wbsa" and matches the DB catalog row exactly', async () => {
    const entry = findAssessmentRegistryEntry('wbsa');
    expect(entry).not.toBeNull();
    expect(entry!.key).toBe('wbsa');
    expect(entry!.databaseId).toBe('bfb52589-7566-4347-95aa-03d696a1041e');
    expect(entry!.implementationStatus).toBe('live');
    expect(entry!.isComingSoon).toBe(false);
    expect(entry!.takeRoute).toBe('/assessments/wbsa/take');
    expect(entry!.route).toBe('/assessments/wbsa');

    const service = serviceRoleClient();
    const { data: catalogRow } = await service
      .from('assessment_definitions')
      .select('id, key')
      .eq('key', 'wbsa')
      .single();
    expect(catalogRow!.id).toBe(entry!.databaseId);
  });

  it('bridges to its unified_assessment_definitions content row via catalog_definition_id', async () => {
    const service = serviceRoleClient();
    const definition = await getUnifiedAssessmentDefinitionByKey(service, 'wbsa');
    const entry = findAssessmentRegistryEntry('wbsa')!;
    expect(definition).not.toBeNull();
    expect(definition!.catalog_definition_id).toBe(entry.databaseId);
    expect(definition!.active).toBe(true);
  });

  it('is gated to membership and holistic_reset only, no free_trial (the chosen launch rule)', () => {
    const entry = findAssessmentRegistryEntry('wbsa')!;
    expect(entry.membership.allowedLevels.sort()).toEqual(['holistic_reset', 'membership']);
    expect(entry.membership.allowedLevels).not.toContain('free_trial');
  });

  it('a trial plan cannot start WBSA; a monthly plan clears the plan rule and still cannot without a coach assignment', async () => {
    const client = await signInAs(TEST_USERS.memberOne);

    await setPlan(memberOneId, 'trial');
    const lockedAccess = await checkAssessmentAccess(client, memberOneId, 'wbsa');
    expect(lockedAccess.allowed).toBe(false);
    if (!lockedAccess.allowed) {
      // On a trial plan the FIRST thing that is missing is the plan, and
      // that is what she is told, because it is the one she can act on.
      expect(lockedAccess.reason).toEqual({ kind: 'membership', requiredLevel: 'membership' });
    }

    const lockedFacts = await getMemberAssessmentFacts(client, memberOneId);
    const lockedStatus = calculateAssessmentStatus(findAssessmentRegistryEntry('wbsa')!, lockedFacts.get('wbsa')!);
    expect(lockedStatus.status).toBe('locked');

    // Assignment-Gated Questionnaires task: WBSA is now requiresAssignment:
    // true, so reaching the right membership tier alone no longer unlocks
    // it — it stays locked (as not_assigned now, not a membership reason)
    // until a coach actually assigns it. See
    // tests/assessment-registry-integration.test.ts's "coach assignment
    // override" describe block for the assigned-and-unlocked case.
    await setPlan(memberOneId, 'monthly');
    const stillLockedAccess = await checkAssessmentAccess(client, memberOneId, 'wbsa');
    expect(stillLockedAccess.allowed).toBe(false);
    if (!stillLockedAccess.allowed) {
      expect(stillLockedAccess.reason).toEqual({ kind: 'not_assigned' });
    }
  });

  it('a coach-assigned WBSA is reachable even for a member at the correct tier, and the assignment is what unlocks it', async () => {
    const service = serviceRoleClient();
    await setPlan(memberOneId, 'monthly');
    const entry = findAssessmentRegistryEntry('wbsa')!;

    const { error: assignError } = await service.from('assessment_assignments').insert({
      member_id: memberOneId,
      assessment_definition_id: entry.databaseId,
      assigned_by: TEST_USERS.coachOne.id,
      is_required: true,
    });
    expect(assignError).toBeNull();

    const client = await signInAs(TEST_USERS.memberOne);
    const access = await checkAssessmentAccess(client, memberOneId, 'wbsa');
    expect(access.allowed).toBe(true);

    await service.from('assessment_assignments').delete().eq('member_id', memberOneId);
  });
});
