/**
 * End-to-end integration tests for the Member Exercise Experience +
 * Movement Profile foundation (migration 81) against real local Supabase —
 * real RLS and real security-definer RPCs, no mocked client, same
 * philosophy as tests/timeline-integration.test.ts and
 * tests/body-assessment-integration.test.ts. Server actions can't be
 * called directly here (they use cookies() from next/headers); these
 * tests call the same lib/*.ts functions the actions call, which is what
 * actually proves the database's own trust boundaries.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import {
  recordExerciseCompletion,
  listMyExerciseCompletions,
  listExerciseCompletionHistory,
  listClientExerciseCompletions,
} from '../lib/exercise-library/completions';
import { recordExerciseView, listMyRecentlyViewedExercises } from '../lib/exercise-library/recentViews';
import {
  getMovementProfile,
  upsertMovementProfileMemberFields,
  upsertMovementProfileCoachFields,
} from '../lib/movement-profile/data';
import {
  createMovementProfileReviewItem,
  listMovementProfileReviewItemsForClient,
  resolveMovementProfileReviewItem,
} from '../lib/movement-profile/reviewItems';

const memberOneId = TEST_USERS.memberOne.id;
const memberTwoId = TEST_USERS.memberTwo.id;

const emptyMemberFields = {
  goals: [] as string[],
  equipmentAccess: [] as string[],
  favoriteMovementTypes: [] as string[],
  mobilityPriorities: [] as string[],
  stabilityPriorities: [] as string[],
  strengthPriorities: [] as string[],
  assessmentReferences: [],
  programHistoryReferences: [],
};

const emptyCoachFields = {
  movementLimitations: [] as string[],
  exerciseRestrictions: [] as string[],
  contraindications: [] as string[],
  medicalRestrictions: [] as string[],
  correctivePriorities: [] as string[],
  capabilitySummary: null,
  exerciseClearance: null,
  assessmentInterpretation: null,
  coachObservations: null,
};

afterAll(async () => {
  const service = serviceRoleClient();
  for (const table of [
    'member_exercise_completions',
    'member_exercise_recent_views',
    'member_movement_profiles',
    'movement_profile_review_items',
  ]) {
    await service.from(table).delete().in('member_id', [memberOneId, memberTwoId]);
  }
});

describe('member_exercise_completions — insert-own, coach read, append-only', () => {
  it('a member can record a completion and read it back under their own session', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);

    const completion = await recordExerciseCompletion(memberClient, {
      memberId: memberOneId,
      provider: 'exercise_api_dev',
      externalId: 'test-ex-1',
      exerciseName: 'Bird Dog',
      status: 'completed',
      difficultyRating: 'appropriate',
      comfortRating: 'comfortable',
    });
    expect(completion).not.toBeNull();
    expect(completion!.status).toBe('completed');

    const history = await listExerciseCompletionHistory(memberClient, memberOneId, 'exercise_api_dev', 'test-ex-1');
    expect(history.some((h) => h.id === completion!.id)).toBe(true);

    const all = await listMyExerciseCompletions(memberClient, memberOneId, 10);
    expect(all.some((h) => h.id === completion!.id)).toBe(true);
  }, 30_000);

  it("RLS: an unassigned member (memberTwo) cannot read memberOne's completions", async () => {
    const memberTwoClient = await signInAs(TEST_USERS.memberTwo);
    const history = await listExerciseCompletionHistory(memberTwoClient, memberOneId, 'exercise_api_dev', 'test-ex-1');
    expect(history).toEqual([]);
  }, 30_000);

  it("RLS: the assigned coach (coachOne) can read memberOne's completions", async () => {
    const coachClient = await signInAs(TEST_USERS.coachOne);
    const history = await listClientExerciseCompletions(coachClient, memberOneId, 10);
    expect(history.some((h) => h.external_id === 'test-ex-1')).toBe(true);
  }, 30_000);

  it('append-only: no update policy exists, so a member update attempt affects zero rows', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);
    const completion = await recordExerciseCompletion(memberClient, {
      memberId: memberOneId,
      provider: 'exercise_api_dev',
      externalId: 'test-ex-2',
      exerciseName: 'Dead Bug',
      status: 'skipped',
    });

    const { data, error } = await memberClient
      .from('member_exercise_completions')
      .update({ status: 'completed' })
      .eq('id', completion!.id)
      .select('*');
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const { data: unchanged } = await memberClient
      .from('member_exercise_completions')
      .select('status')
      .eq('id', completion!.id)
      .single();
    expect(unchanged!.status).toBe('skipped');
  }, 30_000);
});

describe('member_exercise_recent_views — upsert pointer, not history', () => {
  it('viewing the same exercise twice updates one row rather than creating a second', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);

    await recordExerciseView(memberClient, memberOneId, 'exercise_api_dev', 'test-ex-3', 'Plank');
    await recordExerciseView(memberClient, memberOneId, 'exercise_api_dev', 'test-ex-3', 'Plank');

    const { data } = await memberClient
      .from('member_exercise_recent_views')
      .select('id')
      .eq('member_id', memberOneId)
      .eq('external_id', 'test-ex-3');
    expect(data).toHaveLength(1);

    const recent = await listMyRecentlyViewedExercises(memberClient, memberOneId, 10);
    expect(recent.some((v) => v.external_id === 'test-ex-3')).toBe(true);
  }, 30_000);
});

describe('member_movement_profiles — two-tier write boundary', () => {
  it('a member can write their own member-controlled fields via the RPC', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);

    const ok = await upsertMovementProfileMemberFields(memberClient, memberOneId, {
      ...emptyMemberFields,
      goals: ['Reduce low back pain'],
      equipmentAccess: ['mat', 'resistance_band'],
    });
    expect(ok).toBe(true);

    const profile = await getMovementProfile(memberClient, memberOneId);
    expect(profile!.goals).toEqual(['Reduce low back pain']);
    expect(profile!.equipment_access).toEqual(['mat', 'resistance_band']);
  }, 30_000);

  it('a member CANNOT write coach-controlled fields for themselves — the RPC rejects it', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);

    const ok = await upsertMovementProfileCoachFields(memberClient, memberOneId, {
      ...emptyCoachFields,
      movementLimitations: ['No overhead loading'],
    });
    expect(ok).toBe(false);

    const profile = await getMovementProfile(memberClient, memberOneId);
    expect(profile!.movement_limitations).toEqual([]);
  }, 30_000);

  it('the assigned coach (coachOne) CAN write coach-controlled fields for memberOne', async () => {
    const coachClient = await signInAs(TEST_USERS.coachOne);

    const ok = await upsertMovementProfileCoachFields(coachClient, memberOneId, {
      ...emptyCoachFields,
      movementLimitations: ['No overhead loading'],
      exerciseClearance: 'Cleared for low-impact work only',
    });
    expect(ok).toBe(true);

    const profile = await getMovementProfile(coachClient, memberOneId);
    expect(profile!.movement_limitations).toEqual(['No overhead loading']);
    expect(profile!.exercise_clearance).toBe('Cleared for low-impact work only');
    // The member-controlled fields written in the earlier test survive —
    // the coach RPC's insert-if-missing path doesn't blank them out.
    expect(profile!.goals).toEqual(['Reduce low back pain']);
  }, 30_000);

  it('an unassigned coach relationship (coachOne <-> memberTwo, revoked) CANNOT write coach fields', async () => {
    const coachClient = await signInAs(TEST_USERS.coachOne);

    const ok = await upsertMovementProfileCoachFields(coachClient, memberTwoId, {
      ...emptyCoachFields,
      movementLimitations: ['Should never be written'],
    });
    expect(ok).toBe(false);
  }, 30_000);

  it('a member cannot write another member’s member-controlled fields', async () => {
    const memberTwoClient = await signInAs(TEST_USERS.memberTwo);

    const ok = await upsertMovementProfileMemberFields(memberTwoClient, memberOneId, {
      ...emptyMemberFields,
      goals: ['Should never be written'],
    });
    expect(ok).toBe(false);
  }, 30_000);

  it('no direct UPDATE policy exists — a member table-level update attempt affects zero rows', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);

    const { data, error } = await memberClient
      .from('member_movement_profiles')
      .update({ goals: ['Tampered'] })
      .eq('member_id', memberOneId)
      .select('*');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  }, 30_000);
});

describe('movement_profile_review_items — coach-only worklist', () => {
  it('a member can raise a review item under their own session, but cannot read it back', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);

    const item = await createMovementProfileReviewItem(memberClient, {
      memberId: memberOneId,
      reviewType: 'new_pain_report',
      summary: 'New pain report on Bird Dog',
      detail: 'Test fixture',
    });
    expect(item).not.toBeNull();

    const { data } = await memberClient
      .from('movement_profile_review_items')
      .select('id')
      .eq('id', item!.id);
    expect(data).toEqual([]); // no member select policy — coach-only, by design
  }, 30_000);

  it('the assigned coach can read and resolve the review item', async () => {
    const coachClient = await signInAs(TEST_USERS.coachOne);

    const queue = await listMovementProfileReviewItemsForClient(coachClient, memberOneId);
    const item = queue.find((i) => i.summary === 'New pain report on Bird Dog');
    expect(item).toBeTruthy();
    expect(item!.status).toBe('pending');

    const resolved = await resolveMovementProfileReviewItem(
      coachClient,
      item!.id,
      TEST_USERS.coachOne.id,
      'actioned',
      'Adjusted program'
    );
    expect(resolved).toBe(true);

    const queueAfter = await listMovementProfileReviewItemsForClient(coachClient, memberOneId);
    const updated = queueAfter.find((i) => i.id === item!.id);
    expect(updated!.status).toBe('actioned');
    expect(updated!.resolution_notes).toBe('Adjusted program');
  }, 30_000);

  it("an unassigned coach relationship cannot read memberTwo's review items", async () => {
    const memberTwoClient = await signInAs(TEST_USERS.memberTwo);
    await createMovementProfileReviewItem(memberTwoClient, {
      memberId: memberTwoId,
      reviewType: 'new_pain_report',
      summary: 'Should be invisible to coachOne',
    });

    const coachClient = await signInAs(TEST_USERS.coachOne);
    const queue = await listMovementProfileReviewItemsForClient(coachClient, memberTwoId);
    expect(queue).toEqual([]);
  }, 30_000);
});
