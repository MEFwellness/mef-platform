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

async function setMembership(memberId: string, tier: string | null) {
  const service = serviceRoleClient();
  const { error } = await service.from('profiles').update({ membership_tier: tier }).eq('id', memberId);
  if (error) throw error;
}

afterEach(async () => {
  await setMembership(memberOneId, null);
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

  it('a free_trial member cannot start WBSA; a membership-tier member can', async () => {
    const client = await signInAs(TEST_USERS.memberOne);

    await setMembership(memberOneId, 'free_trial');
    const lockedAccess = await checkAssessmentAccess(client, memberOneId, 'wbsa');
    expect(lockedAccess.allowed).toBe(false);

    const lockedFacts = await getMemberAssessmentFacts(client, memberOneId);
    const lockedStatus = calculateAssessmentStatus(findAssessmentRegistryEntry('wbsa')!, lockedFacts.get('wbsa')!);
    expect(lockedStatus.status).toBe('locked');

    await setMembership(memberOneId, 'membership');
    const allowedAccess = await checkAssessmentAccess(client, memberOneId, 'wbsa');
    expect(allowedAccess.allowed).toBe(true);
  });
});
