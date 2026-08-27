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

const memberOneId = TEST_USERS.memberOne.id;
const memberTwoId = TEST_USERS.memberTwo.id;

const FOUR_DOCTORS_ID = 'b67e32f5-ccdd-42b0-b7c2-2eb09431bc72';
const CHEK_HLC1_ID = '4305b5a8-0c0c-40b5-ab8a-7d0b2a9cb7b9';
const PRIMAL_PATTERN_ID = '524ed776-dad6-4584-8e0d-075a3ab76727';

async function setMembership(memberId: string, tier: string | null) {
  const service = serviceRoleClient();
  const { error } = await service
    .from('profiles')
    .update({ membership_tier: tier })
    .eq('id', memberId);
  if (error) throw error;
}

async function cleanupMemberState(memberId: string) {
  const service = serviceRoleClient();
  await service.from('wellness_assessments').delete().eq('member_id', memberId);
  await service.from('assessment_attempts').delete().eq('member_id', memberId);
  await service.from('reassessment_schedules').delete().eq('member_id', memberId);
  await service.from('assessment_assignments').delete().eq('member_id', memberId);
  await service.from('program_enrollments').delete().eq('member_id', memberId);
  await service.from('profiles').update({ membership_tier: null }).eq('id', memberId);
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
    expect(dbByKey.size).toBe(entries.length); // no duplicate keys in the DB

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

describe('membership-tier gating (free / monthly / reset)', () => {
  // Assignment-Gated Questionnaires task: Four Doctors, Nutrition &
  // Lifestyle, and Primal Pattern moved from tier-gated (available to any
  // member, or locked behind a membership upgrade) to assignment-gated
  // (invisible/locked until a coach assigns them, regardless of tier) —
  // see requiresAssignment in lib/assessment-registry/registry.ts.
  // Coach-Assign-Only Gating task (2026-08-04): Body Assessment joined
  // that same group (requiresAssignment: true) — a free member must never
  // reach the camera-based capture flow on their own either — so it's no
  // longer the one key in this describe block governed by tier rules
  // alone; it's now locked as not_assigned right alongside the other
  // three, regardless of tier.
  it('free_trial member with nothing assigned: Four Doctors, Nutrition & Lifestyle, and Body Assessment are all locked as not_assigned', async () => {
    await setMembership(memberOneId, 'free_trial');
    const client = await signInAs(TEST_USERS.memberOne);
    const facts = await getMemberAssessmentFacts(client, memberOneId);

    const fourDoctors = calculateAssessmentStatus(
      findAssessmentRegistryEntry('four-doctors')!,
      facts.get('four-doctors')!
    );
    expect(fourDoctors.status).toBe('locked');
    expect(fourDoctors.lockReason).toEqual({ kind: 'not_assigned' });

    const body = calculateAssessmentStatus(
      findAssessmentRegistryEntry('body-assessment')!,
      facts.get('body-assessment')!
    );
    expect(body.status).toBe('locked');
    expect(body.lockReason).toEqual({ kind: 'not_assigned' });

    const chek = calculateAssessmentStatus(
      findAssessmentRegistryEntry('chek-hlc1-nutrition-lifestyle')!,
      facts.get('chek-hlc1-nutrition-lifestyle')!
    );
    expect(chek.status).toBe('locked');
    expect(chek.lockReason).toEqual({ kind: 'not_assigned' });
  });

  it('membership-tier member with nothing assigned: Nutrition & Lifestyle stays locked as not_assigned (tier alone no longer unlocks it)', async () => {
    await setMembership(memberOneId, 'membership');
    const client = await signInAs(TEST_USERS.memberOne);
    const facts = await getMemberAssessmentFacts(client, memberOneId);
    const chek = calculateAssessmentStatus(
      findAssessmentRegistryEntry('chek-hlc1-nutrition-lifestyle')!,
      facts.get('chek-hlc1-nutrition-lifestyle')!
    );
    expect(chek.status).toBe('locked');
    expect(chek.lockReason).toEqual({ kind: 'not_assigned' });
  });

  it('a member with no profile row (default fallback) still sees an unassigned Nutrition & Lifestyle as locked, not available', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const facts = await getMemberAssessmentFacts(client, memberOneId);
    const chek = calculateAssessmentStatus(
      findAssessmentRegistryEntry('chek-hlc1-nutrition-lifestyle')!,
      facts.get('chek-hlc1-nutrition-lifestyle')!
    );
    expect(chek.status).toBe('locked');
    expect(chek.lockReason).toEqual({ kind: 'not_assigned' });
  });

  it('holistic_reset member with nothing assigned: all four assignment-gated keys, including Body Assessment, stay locked regardless of tier', async () => {
    await setMembership(memberOneId, 'holistic_reset');
    const client = await signInAs(TEST_USERS.memberOne);
    const facts = await getMemberAssessmentFacts(client, memberOneId);

    for (const key of [
      'four-doctors',
      'chek-hlc1-nutrition-lifestyle',
      'primal-pattern-diet-type',
      'body-assessment',
    ] as const) {
      const status = calculateAssessmentStatus(findAssessmentRegistryEntry(key)!, facts.get(key)!);
      expect(status.status).toBe('locked');
      expect(status.lockReason).toEqual({ kind: 'not_assigned' });
    }
  });
});

describe('program phase gating (framework mechanism — no live assessment uses this today)', () => {
  it('a program-only, phase-gated definition locks a member not enrolled, and unlocks at the matching phase', () => {
    const phaseGated: AssessmentDefinition = {
      ...findAssessmentRegistryEntry('four-doctors')!,
      // This test's own concern is program-phase gating in isolation —
      // four-doctors' real requiresAssignment: true (Assignment-Gated
      // Questionnaires task) would otherwise shadow every assertion below
      // behind a not_assigned lock reason before program gating is ever
      // reached.
      requiresAssignment: false,
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
  it('a pending coach assignment surfaces as coach_assigned and grants access even to a locked (free_trial) member', async () => {
    await setMembership(memberOneId, 'free_trial');
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
  it('blocks a member from starting an assignment-gated assessment directly by URL, even at a qualifying membership tier, with no assignment or prior progress', async () => {
    // membership tier (not free_trial) so this genuinely isolates the
    // Assignment-Gated Questionnaires task's own gate from the older,
    // separate membership-tier gate this same assessment used to be
    // blocked by (see the "membership-tier gating" describe block above).
    await setMembership(memberOneId, 'membership');
    const client = await signInAs(TEST_USERS.memberOne);
    const access = await checkAssessmentAccess(
      client,
      memberOneId,
      'chek-hlc1-nutrition-lifestyle'
    );
    expect(access.allowed).toBe(false);
    if (!access.allowed) {
      expect(access.reason).toEqual({ kind: 'not_assigned' });
    }
  });

  it('blocks Primal Pattern directly by URL with no assignment (a real pre-existing gap: this route had zero access enforcement at all before this task)', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const access = await checkAssessmentAccess(client, memberOneId, 'primal-pattern-diet-type');
    expect(access.allowed).toBe(false);
    if (!access.allowed) {
      expect(access.reason).toEqual({ kind: 'not_assigned' });
    }
  });

  it('a free_trial member who already has a completed attempt keeps access regardless of current tier (grandfathering)', async () => {
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
    await setMembership(memberOneId, 'free_trial');

    const client = await signInAs(TEST_USERS.memberOne);
    const access = await checkAssessmentAccess(
      client,
      memberOneId,
      'chek-hlc1-nutrition-lifestyle'
    );
    expect(access.allowed).toBe(true);
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

    const future = new Date(Date.now() + 30 * 24 * 3600_000).toISOString();
    await service.from('reassessment_schedules').insert({
      member_id: memberOneId,
      assessment_definition_id: FOUR_DOCTORS_ID,
      stage: 'midpoint',
      due_at: future,
    });

    const factsScheduled = await getMemberAssessmentFacts(client, memberOneId);
    const scheduledStatus = calculateAssessmentStatus(
      findAssessmentRegistryEntry('four-doctors')!,
      factsScheduled.get('four-doctors')!
    );
    expect(scheduledStatus.status).toBe('scheduled');
    const notDueRecommendation = pickRecommendation(factsScheduled);
    expect(notDueRecommendation.reason).not.toBe('required_reassessment');

    await service.from('reassessment_schedules').delete().eq('member_id', memberOneId);
    const overdue = new Date(Date.now() - 24 * 3600_000).toISOString();
    await service.from('reassessment_schedules').insert({
      member_id: memberOneId,
      assessment_definition_id: FOUR_DOCTORS_ID,
      stage: 'midpoint',
      due_at: overdue,
    });

    const factsOverdue = await getMemberAssessmentFacts(client, memberOneId);
    const overdueRecommendation = pickRecommendation(factsOverdue);
    expect(overdueRecommendation).toEqual({ key: 'four-doctors', reason: 'required_reassessment' });
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
