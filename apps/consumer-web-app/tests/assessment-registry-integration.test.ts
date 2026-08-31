/**
 * End-to-end tests for the Assessment Registry framework
 * (lib/assessment-registry/*) added in the "Assessment Registry" and
 * "Questionnaires journey" tasks — status calculation, access control,
 * recommendation, and the assessment_attempts live-sync trigger, against
 * real local Supabase (real RLS, no mocked client), same philosophy as
 * tests/registry-integration.test.ts (a different, unrelated "registry" —
 * see lib/assessment-registry/types.ts's header comment on the naming
 * collision).
 *
 * Distinct from `lib/assessments/*` unit tests (assessments-*.test.ts),
 * which cover the reusable questionnaire engine itself — this file only
 * covers the metadata/status/access layer on top of it.
 */
import { describe, it, expect, afterEach, afterAll } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import {
  getAssessmentRegistryEntry,
  findAssessmentRegistryEntry,
  listAssessmentRegistryEntries,
  calculateAssessmentStatus,
  calculateLockReason,
} from '../lib/assessment-registry';
import { getMemberAssessmentFacts } from '../lib/assessment-registry/facts';
import { categorizeForCatalog } from '../lib/assessment-registry/catalog';
import { checkAssessmentAccess } from '../lib/assessment-registry/access';
import { pickRecommendation } from '../lib/assessment-registry/recommendation';
import type { AssessmentDefinition, MemberAssessmentFacts } from '../lib/assessment-registry';
import { TRIAL_LENGTH_DAYS } from '../lib/membership/access';

const memberOneId = TEST_USERS.memberOne.id;
const memberTwoId = TEST_USERS.memberTwo.id;

const FOUR_DOCTORS_ID = 'b67e32f5-ccdd-42b0-b7c2-2eb09431bc72';
const CHEK_HLC1_ID = '4305b5a8-0c0c-40b5-ab8a-7d0b2a9cb7b9';
const PRIMAL_PATTERN_ID = '524ed776-dad6-4584-8e0d-075a3ab76727';
const CVS_ID = getAssessmentRegistryEntry('core-values-snapshot').databaseId;

/**
 * THE PLAN IS THE GATE (2026-08-27). This used to write
 * `profiles.membership_tier`, the column the registry map is written in.
 * Nothing reads it for access any more, because on production it is NULL
 * for eighteen of nineteen accounts and NULL resolved to the paid tier, so
 * it gated nothing at all. The real plan is `member_subscriptions.tier`,
 * the one assigned on /admin/access, and that is what this sets. The
 * registry vocabulary each plan maps to is in
 * lib/assessment-registry/membership.ts.
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
  // trigger would have stamped, off the profile's own created_at and for
  // however long a new trial runs today (7 days since migration 198), so a
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
    trial_ends_at: new Date(
      started.getTime() + TRIAL_LENGTH_DAYS * 24 * 3600_000
    ).toISOString(),
  });
  if (insertError) throw insertError;
}

/** No plan at all, which the gate resolves to the most restrictive live one. Deliberately deletes rather than nulling: `tier` is not nullable. */
async function clearPlan(memberId: string) {
  const service = serviceRoleClient();
  await service.from('member_subscriptions').delete().eq('member_id', memberId);
}

async function cleanupMemberState(memberId: string) {
  const service = serviceRoleClient();
  await service.from('wellness_assessments').delete().eq('member_id', memberId);
  await service.from('assessment_attempts').delete().eq('member_id', memberId);
  await service.from('reassessment_schedules').delete().eq('member_id', memberId);
  await service.from('assessment_assignments').delete().eq('member_id', memberId);
  await service.from('program_enrollments').delete().eq('member_id', memberId);
  await service.from('profiles').update({ membership_tier: null }).eq('id', memberId);
  // Put the plan back to the seeded default. Tests in other files read the
  // same database and the gate now reads this column, so leaving a member
  // on a monthly plan would quietly change what those files are testing.
  await setPlan(memberId, 'trial');
}

afterEach(async () => {
  await cleanupMemberState(memberOneId);
  await cleanupMemberState(memberTwoId);
});

afterAll(async () => {
  await cleanupMemberState(memberOneId);
  await cleanupMemberState(memberTwoId);
});

describe('registry catalog', () => {
  it('every live/coming-soon registry entry has a matching, unique DB catalog row', async () => {
    const service = serviceRoleClient();
    const { data, error } = await service.from('assessment_definitions').select('id, key');
    expect(error).toBeNull();

    const entries = listAssessmentRegistryEntries();
    expect(entries).toHaveLength(12);

    const dbByKey = new Map((data ?? []).map((row) => [row.key, row.id]));
    expect(dbByKey.size).toBe((data ?? []).length); // no duplicate keys in the DB

    // Not "the same count as the registry". The catalog is allowed to hold
    // a definition the registry does not list: the Stress & Load Deep-Dive
    // (migration 190) is coach-assigned only and has no registry entry on
    // purpose. What must hold is that every registry entry resolves to a
    // real, unique row, which is what the loop below checks.

    for (const entry of entries) {
      expect(dbByKey.get(entry.key)).toBe(entry.databaseId);
    }
  });

  it('Coming Soon entries never expose a take route and are never live', () => {
    for (const key of ['readiness-to-change', 'finding-1-love'] as const) {
      const entry = findAssessmentRegistryEntry(key)!;
      expect(entry.isComingSoon).toBe(true);
      expect(entry.takeRoute).toBeNull();
      expect(entry.implementationStatus).not.toBe('live');
    }
  });

  it('short-haq has shipped: live, takeable, and no longer flagged Coming Soon', () => {
    const entry = findAssessmentRegistryEntry('short-haq')!;
    expect(entry.isComingSoon).toBe(false);
    expect(entry.implementationStatus).toBe('live');
    expect(entry.takeRoute).toBe('/assessments/short-haq/take');
    expect(entry.currentVersion).toBe(1);
  });

  it('a Coming Soon assessment always reports status coming_soon regardless of facts', () => {
    const entry = findAssessmentRegistryEntry('readiness-to-change')!;
    const generousFacts: MemberAssessmentFacts = {
      membershipKey: 'holistic_reset',
      enrollment: null,
      completionStatus: 'completed',
      latestCompletedAt: new Date().toISOString(),
      latestCompletedAttemptId: 'x',
      pendingAssignment: null,
      pendingReassessmentSchedule: null,
    };
    expect(calculateAssessmentStatus(entry, generousFacts).status).toBe('coming_soon');
  });
});

describe('plan gating (trial / monthly / 24 week program)', () => {
  // THE PLAN IS THE GATE (2026-08-27, corrected Build 2). Access is
  // decided by the member's plan, a coach assignment may ADD access for
  // one member, and nothing else opens a questionnaire: not a reassessment
  // schedule, not a draft, not a prior completion, and no longer a
  // coach-assign-only flag.
  it('trial plan, nothing assigned: every clinical questionnaire is locked, and each names the plan it needs', async () => {
    await setPlan(memberOneId, 'trial');
    const client = await signInAs(TEST_USERS.memberOne);
    const facts = await getMemberAssessmentFacts(client, memberOneId);

    const fourDoctors = calculateAssessmentStatus(
      findAssessmentRegistryEntry('four-doctors')!,
      facts.get('four-doctors')!
    );
    expect(fourDoctors.status).toBe('locked');
    expect(fourDoctors.lockReason).toEqual({
      kind: 'membership',
      requiredLevel: 'holistic_reset',
    });

    const body = calculateAssessmentStatus(
      findAssessmentRegistryEntry('body-assessment')!,
      facts.get('body-assessment')!
    );
    expect(body.status).toBe('locked');
    expect(body.lockReason).toEqual({ kind: 'membership', requiredLevel: 'holistic_reset' });

    const chek = calculateAssessmentStatus(
      findAssessmentRegistryEntry('chek-hlc1-nutrition-lifestyle')!,
      facts.get('chek-hlc1-nutrition-lifestyle')!
    );
    expect(chek.status).toBe('locked');
    expect(chek.lockReason).toEqual({ kind: 'membership', requiredLevel: 'membership' });
  });

  it('monthly plan, nothing assigned: Nutrition & Lifestyle opens on the plan alone', async () => {
    await setPlan(memberOneId, 'monthly');
    const client = await signInAs(TEST_USERS.memberOne);
    const facts = await getMemberAssessmentFacts(client, memberOneId);
    const chek = calculateAssessmentStatus(
      findAssessmentRegistryEntry('chek-hlc1-nutrition-lifestyle')!,
      facts.get('chek-hlc1-nutrition-lifestyle')!
    );
    expect(chek.status).toBe('available');
    expect(chek.lockReason).toBeNull();
  });

  it('no plan row at all fails CLOSED, to the most restrictive live plan, never to the most permissive', async () => {
    await clearPlan(memberOneId);
    const client = await signInAs(TEST_USERS.memberOne);
    const facts = await getMemberAssessmentFacts(client, memberOneId);
    expect(facts.get('chek-hlc1-nutrition-lifestyle')!.membershipKey).toBe('free_trial');
    const chek = calculateAssessmentStatus(
      findAssessmentRegistryEntry('chek-hlc1-nutrition-lifestyle')!,
      facts.get('chek-hlc1-nutrition-lifestyle')!
    );
    expect(chek.status).toBe('locked');
    expect(chek.lockReason).toEqual({ kind: 'membership', requiredLevel: 'membership' });
  });

  it('an expired plan is no plan: the tier stops counting the moment the subscription is not active', async () => {
    const service = serviceRoleClient();
    await setPlan(memberOneId, 'program');
    await service
      .from('member_subscriptions')
      .update({ status: 'expired' })
      .eq('member_id', memberOneId);

    const client = await signInAs(TEST_USERS.memberOne);
    const facts = await getMemberAssessmentFacts(client, memberOneId);
    expect(facts.get('chek-hlc1-nutrition-lifestyle')!.membershipKey).toBe('free_trial');
  });

  it('24 week program, nothing assigned: every clinical key is open on the plan alone', async () => {
    await setPlan(memberOneId, 'program');
    const client = await signInAs(TEST_USERS.memberOne);
    const facts = await getMemberAssessmentFacts(client, memberOneId);

    for (const key of [
      'four-doctors',
      'chek-hlc1-nutrition-lifestyle',
      'primal-pattern-diet-type',
      'body-assessment',
      'wbsa',
      'short-haq',
    ] as const) {
      const status = calculateAssessmentStatus(findAssessmentRegistryEntry(key)!, facts.get(key)!);
      expect(status.status).toBe('available');
      expect(status.lockReason).toBeNull();
    }
  });

  it('the legacy profiles.membership_tier column no longer decides anything', async () => {
    const service = serviceRoleClient();
    await setPlan(memberOneId, 'trial');
    await service
      .from('profiles')
      .update({ membership_tier: 'holistic_reset' })
      .eq('id', memberOneId);

    const client = await signInAs(TEST_USERS.memberOne);
    const facts = await getMemberAssessmentFacts(client, memberOneId);
    // The old column claims the top tier. Her real plan is a trial, and
    // the trial is what answers.
    expect(facts.get('chek-hlc1-nutrition-lifestyle')!.membershipKey).toBe('free_trial');
  });
});

describe('program phase gating (framework mechanism — no live assessment uses this today)', () => {
  it('a program-only, phase-gated definition locks a member not enrolled, and unlocks at the matching phase', () => {
    const phaseGated: AssessmentDefinition = {
      ...findAssessmentRegistryEntry('four-doctors')!,
      // This test's own concern is program-phase gating in isolation, so
      // the plan is set to the top tier in the facts below and the plan
      // check passes before program gating is reached.
      program: {
        programOnly: true,
        programKey: 'holistic_reset',
        programPhase: 'phase_2',
        phaseOrder: 2,
      },
    };

    const notEnrolled: MemberAssessmentFacts = {
      membershipKey: 'holistic_reset',
      enrollment: null,
      completionStatus: 'not_started',
      latestCompletedAt: null,
      latestCompletedAttemptId: null,
      pendingAssignment: null,
      pendingReassessmentSchedule: null,
    };
    expect(calculateLockReason(phaseGated, notEnrolled, new Set())).toEqual({
      kind: 'program_enrollment',
    });

    const wrongPhase: MemberAssessmentFacts = {
      ...notEnrolled,
      enrollment: {
        programKey: 'holistic_reset',
        status: 'active',
        currentPhaseKey: 'phase_1',
        enrolledAt: new Date().toISOString(),
      },
    };
    expect(calculateLockReason(phaseGated, wrongPhase, new Set())).toEqual({
      kind: 'program_phase',
      requiredPhaseKey: 'phase_2',
    });

    const rightPhase: MemberAssessmentFacts = {
      ...notEnrolled,
      enrollment: {
        programKey: 'holistic_reset',
        status: 'active',
        currentPhaseKey: 'phase_2',
        enrolledAt: new Date().toISOString(),
      },
    };
    expect(calculateLockReason(phaseGated, rightPhase, new Set())).toBeNull();
  });
});

describe('completion tracking (assessment_attempts live sync)', () => {
  it('completing Four Doctors makes it show completed in the status framework, and a retake never overwrites the first completion', async () => {
    const service = serviceRoleClient();

    const first = await service
      .from('wellness_assessments')
      .insert({
        member_id: memberOneId,
        questionnaire_id: 'four-doctors',
        status: 'completed',
        total_score: 10,
        total_max_score: 54,
        total_priority: 'low',
        started_at: new Date(Date.now() - 3_600_000).toISOString(),
        completed_at: new Date(Date.now() - 3_000_000).toISOString(),
      })
      .select('id')
      .single();
    expect(first.error).toBeNull();

    const client = await signInAs(TEST_USERS.memberOne);
    const factsAfterFirst = await getMemberAssessmentFacts(client, memberOneId);
    const statusAfterFirst = calculateAssessmentStatus(
      findAssessmentRegistryEntry('four-doctors')!,
      factsAfterFirst.get('four-doctors')!
    );
    expect(statusAfterFirst.status).toBe('completed');

    const second = await service
      .from('wellness_assessments')
      .insert({
        member_id: memberOneId,
        questionnaire_id: 'four-doctors',
        status: 'completed',
        total_score: 20,
        total_max_score: 54,
        total_priority: 'moderate',
        started_at: new Date(Date.now() - 300_000).toISOString(),
        completed_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    expect(second.error).toBeNull();

    // Both original wellness_assessments rows must still exist — no data lost, nothing overwritten.
    const { data: allAttempts } = await service
      .from('wellness_assessments')
      .select('id, total_score')
      .eq('member_id', memberOneId)
      .eq('questionnaire_id', 'four-doctors');
    expect(allAttempts).toHaveLength(2);
    expect(new Set(allAttempts!.map((r) => r.total_score))).toEqual(new Set([10, 20]));

    // The ledger has both attempts too — first tagged standard, retake tagged retake.
    const { data: ledgerRows } = await service
      .from('assessment_attempts')
      .select('attempt_type, calculated_score')
      .eq('member_id', memberOneId)
      .eq('assessment_definition_id', FOUR_DOCTORS_ID)
      .order('completed_at', { ascending: true });
    expect(ledgerRows).toHaveLength(2);
    expect(ledgerRows![0]).toMatchObject({ attempt_type: 'standard', calculated_score: 10 });
    expect(ledgerRows![1]).toMatchObject({ attempt_type: 'retake', calculated_score: 20 });

    // The framework's status reflects the latest completion.
    const factsAfterRetake = await getMemberAssessmentFacts(client, memberOneId);
    const statusAfterRetake = calculateAssessmentStatus(
      findAssessmentRegistryEntry('four-doctors')!,
      factsAfterRetake.get('four-doctors')!
    );
    expect(statusAfterRetake.status).toBe('completed');
  });

  /**
   * CHANGED 2026-08-27. This used to assert the opposite, that a draft
   * outranked a prior completion and the status read 'in_progress'. That
   * assertion was the bug written down: an empty draft created by a page
   * render made the Home card, the Questionnaires page, the Priority Card,
   * the free-arc pop-up and the prerequisite chain all forget the member
   * had ever finished, and one real member answered the whole Core Values
   * Snapshot four separate times because of it.
   *
   * The view itself still prefers the draft, because a resume affordance
   * genuinely needs to know one is open. What changed is that the framework
   * status no longer un-completes a finished assessment to say so; the open
   * draft is reported as a retake in progress instead (see
   * CatalogFlags.retakeInProgress).
   */
  it('a draft on top of a prior completion reads as completed, not in_progress', async () => {
    const service = serviceRoleClient();
    await service.from('wellness_assessments').insert({
      member_id: memberOneId,
      questionnaire_id: 'four-doctors',
      status: 'completed',
      total_score: 10,
      total_max_score: 54,
      total_priority: 'low',
      started_at: new Date(Date.now() - 7200_000).toISOString(),
      completed_at: new Date(Date.now() - 7000_000).toISOString(),
    });
    await service.from('wellness_assessments').insert({
      member_id: memberOneId,
      questionnaire_id: 'four-doctors',
      status: 'in_progress',
      started_at: new Date().toISOString(),
    });

    const client = await signInAs(TEST_USERS.memberOne);
    const facts = await getMemberAssessmentFacts(client, memberOneId);
    const status = calculateAssessmentStatus(
      findAssessmentRegistryEntry('four-doctors')!,
      facts.get('four-doctors')!
    );
    expect(status.status).toBe('completed');

    // The open draft is not lost, it is reported as what it is.
    const { flags } = categorizeForCatalog(
      findAssessmentRegistryEntry('four-doctors')!,
      facts.get('four-doctors')!
    );
    expect(flags.retakeInProgress).toBe(true);
    expect(flags.inProgress).toBe(false);
  });

  it('completing Primal Pattern (classification engine) also live-syncs into the ledger', async () => {
    const service = serviceRoleClient();
    const inserted = await service
      .from('primal_pattern_assessments')
      .insert({
        member_id: memberOneId,
        status: 'completed',
        result: 'polar',
        a_count: 10,
        b_count: 2,
        started_at: new Date(Date.now() - 600_000).toISOString(),
        completed_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    expect(inserted.error).toBeNull();

    const { data: ledgerRow } = await service
      .from('assessment_attempts')
      .select('attempt_type, status, result_classification')
      .eq('member_id', memberOneId)
      .eq('assessment_definition_id', PRIMAL_PATTERN_ID)
      .single();
    expect(ledgerRow).toMatchObject({
      attempt_type: 'standard',
      status: 'completed',
      result_classification: 'polar',
    });
  });
});

describe('coach assignment override', () => {
  it('a pending coach assignment surfaces as coach_assigned and grants access even to a member on a trial plan that does not include it', async () => {
    await setPlan(memberOneId, 'trial');
    const service = serviceRoleClient();

    const { error: assignError } = await service.from('assessment_assignments').insert({
      member_id: memberOneId,
      assessment_definition_id: CHEK_HLC1_ID,
      assigned_by: TEST_USERS.coachOne.id,
      is_required: true,
      reason: 'Coach requested a follow-up nutrition review.',
    });
    expect(assignError).toBeNull();

    const client = await signInAs(TEST_USERS.memberOne);
    const facts = await getMemberAssessmentFacts(client, memberOneId);
    const status = calculateAssessmentStatus(
      findAssessmentRegistryEntry('chek-hlc1-nutrition-lifestyle')!,
      facts.get('chek-hlc1-nutrition-lifestyle')!
    );
    expect(status.status).toBe('coach_assigned');

    const access = await checkAssessmentAccess(
      client,
      memberOneId,
      'chek-hlc1-nutrition-lifestyle'
    );
    expect(access.allowed).toBe(true);

    const recommendation = pickRecommendation(facts);
    expect(recommendation).toEqual({
      key: 'chek-hlc1-nutrition-lifestyle',
      reason: 'coach_assigned',
    });
  });

  it('the coach who is not assigned to a member cannot see or create an assignment for them (RLS)', async () => {
    // coach.one is assigned to member.one but revoked for member.two (seed data).
    const coachClient = await signInAs(TEST_USERS.coachOne);
    const { error } = await coachClient.from('assessment_assignments').insert({
      member_id: memberTwoId,
      assessment_definition_id: CHEK_HLC1_ID,
      assigned_by: TEST_USERS.coachOne.id,
      is_required: true,
    });
    expect(error).not.toBeNull();
  });
});

describe('assignment gating — DB-level enforcement (migration 144)', () => {
  it('rejects a second pending assignment for the same member/questionnaire pair (partial unique index)', async () => {
    const service = serviceRoleClient();

    const { error: firstError } = await service.from('assessment_assignments').insert({
      member_id: memberOneId,
      assessment_definition_id: CHEK_HLC1_ID,
      assigned_by: TEST_USERS.coachOne.id,
      is_required: true,
    });
    expect(firstError).toBeNull();

    const { error: secondError } = await service.from('assessment_assignments').insert({
      member_id: memberOneId,
      assessment_definition_id: CHEK_HLC1_ID,
      assigned_by: TEST_USERS.coachOne.id,
      is_required: true,
    });
    expect(secondError).not.toBeNull();
    expect(secondError!.code).toBe('23505');
  });

  it('allows a new pending assignment once the prior one for the same pair is no longer pending', async () => {
    const service = serviceRoleClient();

    const first = await service
      .from('assessment_assignments')
      .insert({
        member_id: memberOneId,
        assessment_definition_id: CHEK_HLC1_ID,
        assigned_by: TEST_USERS.coachOne.id,
        is_required: true,
      })
      .select('id')
      .single();
    expect(first.error).toBeNull();

    await service
      .from('assessment_assignments')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: TEST_USERS.coachOne.id })
      .eq('id', first.data!.id);

    const { error: secondError } = await service.from('assessment_assignments').insert({
      member_id: memberOneId,
      assessment_definition_id: CHEK_HLC1_ID,
      assigned_by: TEST_USERS.coachOne.id,
      is_required: true,
    });
    expect(secondError).toBeNull();
  });

  it('auto-completes a pending assignment the moment its questionnaire is completed (assessment_attempts trigger)', async () => {
    const service = serviceRoleClient();

    const assignment = await service
      .from('assessment_assignments')
      .insert({
        member_id: memberOneId,
        assessment_definition_id: FOUR_DOCTORS_ID,
        assigned_by: TEST_USERS.coachOne.id,
        is_required: true,
      })
      .select('id')
      .single();
    expect(assignment.error).toBeNull();

    // Completing the assigned questionnaire (via the generic engine's own
    // source table, exactly like the "completion tracking" describe block
    // above) fires the pre-existing live-sync trigger into
    // assessment_attempts, which in turn fires migration 144's own trigger
    // to close out the assignment.
    await service.from('wellness_assessments').insert({
      member_id: memberOneId,
      questionnaire_id: 'four-doctors',
      status: 'completed',
      total_score: 15,
      total_max_score: 54,
      total_priority: 'low',
      started_at: new Date(Date.now() - 600_000).toISOString(),
      completed_at: new Date().toISOString(),
    });

    const { data: updatedAssignment } = await service
      .from('assessment_assignments')
      .select('status, completed_attempt_id')
      .eq('id', assignment.data!.id)
      .single();
    expect(updatedAssignment!.status).toBe('completed');
    expect(updatedAssignment!.completed_attempt_id).not.toBeNull();

    // And the member's facts no longer show it as pending — this is what
    // makes the completed questionnaire disappear from the Home priority
    // spot and move to the ordinary Completed catalog section.
    const client = await signInAs(TEST_USERS.memberOne);
    const facts = await getMemberAssessmentFacts(client, memberOneId);
    expect(facts.get('four-doctors')!.pendingAssignment).toBeNull();
    expect(facts.get('four-doctors')!.completionStatus).toBe('completed');
  });
});

describe('server-side access enforcement (not UI-only)', () => {
  it('blocks a trial member from starting a Monthly questionnaire directly by URL', async () => {
    await setPlan(memberOneId, 'trial');
    const client = await signInAs(TEST_USERS.memberOne);
    const access = await checkAssessmentAccess(
      client,
      memberOneId,
      'chek-hlc1-nutrition-lifestyle'
    );
    expect(access.allowed).toBe(false);
    if (!access.allowed) {
      expect(access.reason).toEqual({ kind: 'membership', requiredLevel: 'membership' });
    }
  });

  it('blocks Primal Pattern directly by URL on a trial plan (a real pre-existing gap: this route had zero access enforcement at all before the gate)', async () => {
    await setPlan(memberOneId, 'trial');
    const client = await signInAs(TEST_USERS.memberOne);
    const access = await checkAssessmentAccess(client, memberOneId, 'primal-pattern-diet-type');
    expect(access.allowed).toBe(false);
    if (!access.allowed) {
      expect(access.reason).toEqual({ kind: 'membership', requiredLevel: 'membership' });
    }
  });

  /**
   * READING HER OWN RESULTS AND STARTING A NEW ONE ARE DIFFERENT QUESTIONS
   * (2026-08-27). One completion used to make a gated questionnaire
   * permanently self-serve: `checkAssessmentAccess` let through anybody
   * whose completionStatus was not 'not_started', which is right for
   * reading results and wrong for beginning a fresh attempt. The two
   * intents split it. Her history is never hidden; it is also never a key.
   */
  it('a completed attempt keeps her results reachable forever, on any plan', async () => {
    const service = serviceRoleClient();
    await service.from('wellness_assessments').insert({
      member_id: memberOneId,
      questionnaire_id: 'chek-hlc1-nutrition-lifestyle',
      status: 'completed',
      total_score: 50,
      total_max_score: 200,
      total_priority: 'moderate',
      started_at: new Date(Date.now() - 600_000).toISOString(),
      completed_at: new Date().toISOString(),
    });
    await setPlan(memberOneId, 'trial');

    const client = await signInAs(TEST_USERS.memberOne);
    const access = await checkAssessmentAccess(
      client,
      memberOneId,
      'chek-hlc1-nutrition-lifestyle',
      { intent: 'view' }
    );
    expect(access.allowed).toBe(true);
  });

  it('that same completed attempt does NOT let her start another one', async () => {
    const service = serviceRoleClient();
    await service.from('wellness_assessments').insert({
      member_id: memberOneId,
      questionnaire_id: 'chek-hlc1-nutrition-lifestyle',
      status: 'completed',
      total_score: 50,
      total_max_score: 200,
      total_priority: 'moderate',
      started_at: new Date(Date.now() - 600_000).toISOString(),
      completed_at: new Date().toISOString(),
    });
    // Her plan has since dropped back to a trial. The results stay open
    // forever (the case above); starting another one does not.
    await setPlan(memberOneId, 'trial');

    const client = await signInAs(TEST_USERS.memberOne);
    const access = await checkAssessmentAccess(
      client,
      memberOneId,
      'chek-hlc1-nutrition-lifestyle',
      { intent: 'start' }
    );
    expect(access.allowed).toBe(false);
    if (!access.allowed) {
      expect(access.reason).toEqual({ kind: 'membership', requiredLevel: 'membership' });
    }
  });

  it('an open draft does not open it either', async () => {
    const service = serviceRoleClient();
    await service.from('wellness_assessments').insert({
      member_id: memberOneId,
      questionnaire_id: 'chek-hlc1-nutrition-lifestyle',
      status: 'in_progress',
      started_at: new Date().toISOString(),
    });
    await setPlan(memberOneId, 'trial');

    const client = await signInAs(TEST_USERS.memberOne);
    const access = await checkAssessmentAccess(
      client,
      memberOneId,
      'chek-hlc1-nutrition-lifestyle',
      { intent: 'start' }
    );
    expect(access.allowed).toBe(false);
  });

  it('a pending reassessment schedule does not open it either, which is the A1 hole', async () => {
    const service = serviceRoleClient();
    await service.from('reassessment_schedules').insert({
      member_id: memberOneId,
      assessment_definition_id: CHEK_HLC1_ID,
      stage: 'finding_triggered',
      due_at: new Date(Date.now() - 86_400_000).toISOString(),
      status: 'pending',
      trigger_source: 'finding_change',
      trigger_context: { findingCodes: ['x'], confidence: 0.9 },
    });
    await setPlan(memberOneId, 'trial');

    const client = await signInAs(TEST_USERS.memberOne);
    const access = await checkAssessmentAccess(
      client,
      memberOneId,
      'chek-hlc1-nutrition-lifestyle',
      { intent: 'start' }
    );
    expect(access.allowed).toBe(false);
    if (!access.allowed) {
      expect(access.reason).toEqual({ kind: 'membership', requiredLevel: 'membership' });
    }
  });

  it("an unknown assessment key is not this function's concern (page 404s separately)", async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const access = await checkAssessmentAccess(client, memberOneId, 'not-a-real-assessment');
    expect(access.allowed).toBe(true);
  });
});

describe('reassessment schedules', () => {
  it('a future-due schedule reports status scheduled, and a past-due one is recommended as required_reassessment', async () => {
    const service = serviceRoleClient();
    const client = await signInAs(TEST_USERS.memberOne);

    // TWO THINGS HAVE TO BE TRUE (2026-08-27), and this block is about the
    // case where both are. Core Values Snapshot rather than Four Doctors,
    // because a reassessment is only ever offered for something she may
    // actually start again: Four Doctors is part of the 24 week program,
    // so on a trial plan a schedule against it is a suggestion to her
    // coach and never a button on her screen. That case has its own test
    // below.
    const { error: attemptError } = await service.from('assessment_attempts').insert({
      member_id: memberOneId,
      assessment_definition_id: CVS_ID,
      status: 'completed',
      started_at: new Date(Date.now() - 600_000).toISOString(),
      completed_at: new Date(Date.now() - 300_000).toISOString(),
      source_table: 'unified_assessment_sessions',
      source_id: crypto.randomUUID(),
      source: 'member_self_serve',
    });
    expect(attemptError).toBeNull();

    const future = new Date(Date.now() + 30 * 24 * 3600_000).toISOString();
    await service.from('reassessment_schedules').insert({
      member_id: memberOneId,
      assessment_definition_id: CVS_ID,
      stage: 'midpoint',
      due_at: future,
    });

    const factsScheduled = await getMemberAssessmentFacts(client, memberOneId);
    const scheduledStatus = calculateAssessmentStatus(
      findAssessmentRegistryEntry('core-values-snapshot')!,
      factsScheduled.get('core-values-snapshot')!
    );
    expect(scheduledStatus.status).toBe('scheduled');
    const notDueRecommendation = pickRecommendation(factsScheduled);
    expect(notDueRecommendation.reason).not.toBe('required_reassessment');

    await service.from('reassessment_schedules').delete().eq('member_id', memberOneId);
    const overdue = new Date(Date.now() - 24 * 3600_000).toISOString();
    await service.from('reassessment_schedules').insert({
      member_id: memberOneId,
      assessment_definition_id: CVS_ID,
      stage: 'midpoint',
      due_at: overdue,
    });

    const factsOverdue = await getMemberAssessmentFacts(client, memberOneId);
    const overdueRecommendation = pickRecommendation(factsOverdue);
    expect(overdueRecommendation).toEqual({
      key: 'core-values-snapshot',
      reason: 'required_reassessment',
    });
  });

  it('a schedule for something she has never completed is ignored by the card, the status and the recommendation', async () => {
    const service = serviceRoleClient();
    const client = await signInAs(TEST_USERS.memberOne);

    await service.from('reassessment_schedules').insert({
      member_id: memberOneId,
      assessment_definition_id: FOUR_DOCTORS_ID,
      stage: 'finding_triggered',
      due_at: new Date(Date.now() - 24 * 3600_000).toISOString(),
      status: 'pending',
      trigger_source: 'finding_change',
      trigger_context: { findingCodes: ['x'], confidence: 0.9 },
    });

    const facts = await getMemberAssessmentFacts(client, memberOneId);
    const fourDoctorsFacts = facts.get('four-doctors')!;
    // The row really is there. What changed is that nothing reads it as
    // history any more.
    expect(fourDoctorsFacts.pendingReassessmentSchedule).not.toBeNull();

    const status = calculateAssessmentStatus(
      findAssessmentRegistryEntry('four-doctors')!,
      fourDoctorsFacts
    );
    expect(status.status).toBe('locked');

    const catalogEntry = categorizeForCatalog(
      findAssessmentRegistryEntry('four-doctors')!,
      fourDoctorsFacts
    );
    expect(catalogEntry.flags.reassessmentDueAt).toBeNull();
    expect(catalogEntry.flags.scheduledAt).toBeNull();

    expect(pickRecommendation(facts).reason).not.toBe('required_reassessment');
  });

  it("a member cannot read another member's reassessment schedule (RLS)", async () => {
    const service = serviceRoleClient();
    await service.from('reassessment_schedules').insert({
      member_id: memberOneId,
      assessment_definition_id: FOUR_DOCTORS_ID,
      stage: 'midpoint',
      due_at: new Date().toISOString(),
    });

    const memberTwoClient = await signInAs(TEST_USERS.memberTwo);
    const { data, error } = await memberTwoClient
      .from('reassessment_schedules')
      .select('id')
      .eq('member_id', memberOneId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
