/**
 * Coach-Assign-Only Gating task (2026-08-04) — real, end-to-end proof
 * (real local Supabase, real RLS, no mocked client — same philosophy as
 * tests/assessment-registry-integration.test.ts) that a brand-new free
 * member is blocked, server-side, from every one of the eight proprietary
 * coaching tools this task gates: Four Doctors, Nutrition & Lifestyle
 * (CHEK HLC1), Primal Pattern, Whole-Body Systems Assessment, Short-HAQ
 * (the health check-in questionnaire), Readiness to Change, Finding 1
 * Love, and the camera-based Body Assessment.
 *
 * Every case below is non-vacuous by construction, not just by
 * inspection: each item is asserted denied *and then* asserted allowed
 * once a real assignment row is inserted — a broken gate would fail one
 * half or the other (a gate that's always open fails the "denied"
 * assertion; a gate that never unlocks fails the "allowed" one), so both
 * halves passing together is real proof the gate does what it claims.
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

/** All eight items named in the task, by their registry key. */
const COACH_ASSIGN_ONLY_KEYS: AssessmentKey[] = [
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

describe('registry: every one of the eight is requiresAssignment: true', () => {
  it.each(COACH_ASSIGN_ONLY_KEYS)('%s has requiresAssignment: true', (key) => {
    const entry = findAssessmentRegistryEntry(key)!;
    expect(entry.requiresAssignment).toBe(true);
  });

  it('the onboarding questionnaire, daily check-in, and the three free conversations stay ungated', () => {
    for (const key of [
      'onboarding-health-history',
      'core-values-snapshot',
      'life-signal-check',
      'readiness-pulse',
    ] as const) {
      expect(findAssessmentRegistryEntry(key)!.requiresAssignment).toBe(false);
    }
  });
});

describe('server-side blocking: a brand-new member on a trial plan with zero assignments', () => {
  // Denied is the point. WHICH lock she meets depends on whether her plan
  // reaches the questionnaire at all: on a trial plan the four
  // membership-tier keys are outside the plan, and the plan is reported
  // first because it is the thing she can act on. The four free-tier keys
  // clear the plan and stop at the coach gate underneath it.
  const PLAN_LOCKED_ON_TRIAL = new Set([
    'chek-hlc1-nutrition-lifestyle',
    'wbsa',
    'readiness-to-change',
    'finding-1-love',
  ]);

  it.each(COACH_ASSIGN_ONLY_KEYS)('is denied access to %s', async (key) => {
    const client = await signInAs(TEST_USERS.memberOne);
    const access = await checkAssessmentAccess(client, memberOneId, key);
    expect(access.allowed).toBe(false);
    if (!access.allowed) {
      expect(access.reason).toEqual(
        PLAN_LOCKED_ON_TRIAL.has(key)
          ? { kind: 'membership', requiredLevel: 'membership' }
          : { kind: 'not_assigned' }
      );
    }
  });

  it.each(COACH_ASSIGN_ONLY_KEYS)(
    'is still denied access to %s on a plan that does include it, with reason not_assigned',
    async (key) => {
      const service = serviceRoleClient();
      await service
        .from('member_subscriptions')
        .update({ tier: 'program', status: 'active' })
        .eq('member_id', memberOneId);

      const client = await signInAs(TEST_USERS.memberOne);
      const access = await checkAssessmentAccess(client, memberOneId, key);
      expect(access.allowed).toBe(false);
      if (!access.allowed) expect(access.reason).toEqual({ kind: 'not_assigned' });
    }
  );
});

describe('server-side unlocking: a real coach assignment grants access, per item', () => {
  it.each(COACH_ASSIGN_ONLY_KEYS)('assigning %s unlocks it for that member', async (key) => {
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
  it('is now assignable from the coach platform (was previously deliberately excluded)', () => {
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
  it('an in-progress capture does not by itself let her start a new one', async () => {
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
    if (!access.allowed) expect(access.reason).toEqual({ kind: 'not_assigned' });
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
