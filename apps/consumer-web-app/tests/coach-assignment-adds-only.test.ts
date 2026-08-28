/**
 * A COACH ASSIGNMENT ONLY EVER ADDS (Build 2, 2026-08-27) — real,
 * end-to-end proof (real local Supabase, real RLS, no mocked client, same
 * philosophy as tests/assessment-registry-integration.test.ts).
 *
 * This file was `coach-assign-only-gating.test.ts` and tested the opposite
 * rule: that a `requiresAssignment` flag held eight questionnaires shut
 * until a coach opened them. That flag is deleted. It could only ever
 * subtract access, it sat underneath the plan where no screen printed it,
 * and it is why the plan map written down and the map enforced were two
 * different maps.
 *
 * What is tested now, against the same eight clinical items:
 *
 *   1. A trial member is blocked from every one of them, server side, and
 *      the reason names her plan.
 *   2. A 24 week program member reaches all of them with no assignment
 *      anywhere, which is the half the old flag broke.
 *   3. An assignment still opens one item for one member, even BELOW the
 *      plan minimum, which is the only thing assignment does now.
 *
 * Every case is non-vacuous by construction: each item is asserted denied
 * and then asserted allowed under a different condition, so a gate that is
 * always open fails one half and a gate that never opens fails the other.
 */
import { describe, it, expect, afterEach, afterAll } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import {
  findAssessmentRegistryEntry,
  listAssignableAssessments,
} from '../lib/assessment-registry/registry';
import { checkAssessmentAccess } from '../lib/assessment-registry/access';
import { getMemberAssessmentFacts } from '../lib/assessment-registry/facts';
import type { AssessmentKey } from '../lib/assessment-registry/types';

const memberOneId = TEST_USERS.memberOne.id;

/** The eight clinical items: everything the plan map puts above trial. */
const CLINICAL_KEYS: AssessmentKey[] = [
  'four-doctors',
  'chek-hlc1-nutrition-lifestyle',
  'primal-pattern-diet-type',
  'wbsa',
  'short-haq',
  'readiness-to-change',
  'finding-1-love',
  'body-assessment',
];

async function cleanupMemberState(memberId: string) {
  const service = serviceRoleClient();
  await service.from('wellness_assessments').delete().eq('member_id', memberId);
  await service.from('primal_pattern_assessments').delete().eq('member_id', memberId);
  await service.from('body_assessments').delete().eq('member_id', memberId);
  await service.from('assessment_attempts').delete().eq('member_id', memberId);
  await service.from('assessment_assignments').delete().eq('member_id', memberId);
  await service.from('profiles').update({ membership_tier: null }).eq('id', memberId);
  // Put the plan back to the seeded default. The gate reads this column
  // now, and other test files read the same database.
  await service
    .from('member_subscriptions')
    .update({ tier: 'trial', status: 'active' })
    .eq('member_id', memberId);
}

afterEach(async () => {
  await cleanupMemberState(memberOneId);
});

afterAll(async () => {
  await cleanupMemberState(memberOneId);
});

describe('registry: the plan is what separates the eight from the four', () => {
  it.each(CLINICAL_KEYS)('%s sits above trial', (key) => {
    const entry = findAssessmentRegistryEntry(key)!;
    expect(entry.membership.minLevel).not.toBe('free_trial');
  });

  it('the onboarding questionnaire and the three free conversations stay at trial', () => {
    for (const key of [
      'onboarding-health-history',
      'core-values-snapshot',
      'life-signal-check',
      'readiness-pulse',
    ] as const) {
      expect(findAssessmentRegistryEntry(key)!.membership.minLevel).toBe('free_trial');
    }
  });

  it('and the flag that used to gate them is gone from the type, not merely unset', () => {
    for (const key of CLINICAL_KEYS) {
      expect(findAssessmentRegistryEntry(key)!).not.toHaveProperty('requiresAssignment');
    }
  });
});

describe('server-side blocking: a member on a trial plan with zero assignments', () => {
  it.each(CLINICAL_KEYS)('is denied access to %s, and the reason names her plan', async (key) => {
    const client = await signInAs(TEST_USERS.memberOne);
    const access = await checkAssessmentAccess(client, memberOneId, key);
    expect(access.allowed).toBe(false);
    if (!access.allowed) {
      expect(access.reason).toEqual({
        kind: 'membership',
        requiredLevel: findAssessmentRegistryEntry(key)!.membership.minLevel,
      });
    }
  });
});

describe('server-side opening: a 24 week program member, still with zero assignments', () => {
  it.each(CLINICAL_KEYS)('reaches %s on the plan alone', async (key) => {
    const service = serviceRoleClient();
    await service
      .from('member_subscriptions')
      .update({ tier: 'program', status: 'active' })
      .eq('member_id', memberOneId);

    const client = await signInAs(TEST_USERS.memberOne);
    const access = await checkAssessmentAccess(client, memberOneId, key);
    expect(access.allowed).toBe(true);
  });

  it('and a monthly member reaches the Monthly three but not the program three', async () => {
    const service = serviceRoleClient();
    await service
      .from('member_subscriptions')
      .update({ tier: 'monthly', status: 'active' })
      .eq('member_id', memberOneId);
    const client = await signInAs(TEST_USERS.memberOne);

    for (const key of [
      'short-haq',
      'primal-pattern-diet-type',
      'chek-hlc1-nutrition-lifestyle',
    ] as AssessmentKey[]) {
      const access = await checkAssessmentAccess(client, memberOneId, key);
      expect(access.allowed).toBe(true);
    }

    for (const key of ['four-doctors', 'wbsa', 'body-assessment'] as AssessmentKey[]) {
      const access = await checkAssessmentAccess(client, memberOneId, key);
      expect(access.allowed).toBe(false);
      if (!access.allowed) {
        expect(access.reason).toEqual({ kind: 'membership', requiredLevel: 'holistic_reset' });
      }
    }
  });
});

describe('server-side unlocking: an assignment opens one item for one member, below her plan', () => {
  it.each(CLINICAL_KEYS)('assigning %s opens it for a trial member', async (key) => {
    const service = serviceRoleClient();
    const entry = findAssessmentRegistryEntry(key)!;

    const client = await signInAs(TEST_USERS.memberOne);
    const before = await checkAssessmentAccess(client, memberOneId, key);
    expect(before.allowed).toBe(false);

    const { error } = await service.from('assessment_assignments').insert({
      member_id: memberOneId,
      assessment_definition_id: entry.databaseId,
      assigned_by: TEST_USERS.coachOne.id,
      is_required: true,
      reason: 'Test assignment.',
    });
    expect(error).toBeNull();

    const after = await checkAssessmentAccess(client, memberOneId, key);
    expect(after.allowed).toBe(true);
  });
});

describe('Body Assessment specifically', () => {
  it('is assignable from the coach platform, so an assignment can reach it at all', () => {
    const assignable = listAssignableAssessments().map((e) => e.key);
    expect(assignable).toContain('body-assessment');
  });

  /**
   * A DRAFT IS NOT A KEY (2026-08-27). An open capture used to grant full
   * access, on the reading that a draft is "existing progress" and existing
   * progress is never hidden. It is not hidden: she can still reach the
   * screen that shows it. What a half-finished capture is not is permission
   * to start a fresh one that no coach asked for, which is what this used
   * to allow, and which is how the camera Body Assessment came to be open
   * on an account nobody had assigned it to.
   */
  it('an in-progress capture does not by itself let a trial member start a new one', async () => {
    const service = serviceRoleClient();
    await service.from('body_assessments').insert({
      member_id: memberOneId,
      assessment_type: 'static_posture',
      status: 'in_progress',
      timezone: 'America/New_York',
      local_date: new Date().toISOString().slice(0, 10),
      started_at: new Date().toISOString(),
    });

    const client = await signInAs(TEST_USERS.memberOne);
    const access = await checkAssessmentAccess(client, memberOneId, 'body-assessment', {
      intent: 'start',
    });
    expect(access.allowed).toBe(false);
    if (!access.allowed) {
      expect(access.reason).toEqual({ kind: 'membership', requiredLevel: 'holistic_reset' });
    }
  });

  it('but the screen holding that capture stays reachable, which is what "never hides her progress" means', async () => {
    const service = serviceRoleClient();
    await service.from('body_assessments').insert({
      member_id: memberOneId,
      assessment_type: 'static_posture',
      status: 'in_progress',
      timezone: 'America/New_York',
      local_date: new Date().toISOString().slice(0, 10),
      started_at: new Date().toISOString(),
    });

    const client = await signInAs(TEST_USERS.memberOne);
    const access = await checkAssessmentAccess(client, memberOneId, 'body-assessment', {
      intent: 'view',
    });
    expect(access.allowed).toBe(true);
  });

  it('completing a real capture (assessment_attempts live-sync trigger) auto-completes a pending assignment, same as every other assignable questionnaire', async () => {
    const service = serviceRoleClient();
    const entry = findAssessmentRegistryEntry('body-assessment')!;

    const assignment = await service
      .from('assessment_assignments')
      .insert({
        member_id: memberOneId,
        assessment_definition_id: entry.databaseId,
        assigned_by: TEST_USERS.coachOne.id,
        is_required: true,
      })
      .select('id')
      .single();
    expect(assignment.error).toBeNull();

    await service.from('body_assessments').insert({
      member_id: memberOneId,
      assessment_type: 'static_posture',
      status: 'analyzed',
      timezone: 'America/New_York',
      local_date: new Date().toISOString().slice(0, 10),
      started_at: new Date(Date.now() - 600_000).toISOString(),
      completed_at: new Date().toISOString(),
    });

    const { data: updatedAssignment } = await service
      .from('assessment_assignments')
      .select('status')
      .eq('id', assignment.data!.id)
      .single();
    expect(updatedAssignment!.status).toBe('completed');

    const client = await signInAs(TEST_USERS.memberOne);
    const facts = await getMemberAssessmentFacts(client, memberOneId);
    expect(facts.get('body-assessment')!.pendingAssignment).toBeNull();
    expect(facts.get('body-assessment')!.completionStatus).toBe('completed');
  });
});
