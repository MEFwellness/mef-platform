/**
 * End-to-end integration tests for the Prescription Intelligence Engine
 * (migration 83) against real local Supabase — real RLS, no mocked client,
 * same philosophy as tests/movement-profile-integration.test.ts. Fixture
 * trees are seeded via the service-role client to stand in for what
 * generatePrescription() itself would have written (that function also
 * calls the external Exercise Library provider to hydrate exercise names,
 * which — like every other ExerciseAPI.dev-dependent path in this
 * codebase — has no integration test coverage; see
 * lib/exercise-library/apiClient.ts). These tests instead prove the part
 * that matters most for safety: RLS on the four new tables, the coach
 * edit surface, and that approving/rejecting a snapshot behaves exactly
 * as the migration's header promises.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import {
  getPrescriptionSnapshotWithContent,
  listPrescriptionSnapshotsForMember,
  setBlockExerciseLocked,
  removeBlockExercise,
  removeBlock,
  reorderBlockExercises,
} from '../lib/prescription-intelligence/data';
import {
  approvePrescriptionSnapshot,
  rejectPrescriptionSnapshot,
} from '../lib/prescription-intelligence/approve';

const memberOneId = TEST_USERS.memberOne.id;
const memberTwoId = TEST_USERS.memberTwo.id;
const coachOneId = TEST_USERS.coachOne.id;

const createdTemplateIds: string[] = [];
const createdAssignmentIds: string[] = [];

async function seedSnapshot(overrides: { memberId?: string; status?: string } = {}) {
  const service = serviceRoleClient();
  const memberId = overrides.memberId ?? memberOneId;

  const { data: snapshot, error: snapshotError } = await service
    .from('prescription_snapshots')
    .insert({
      member_id: memberId,
      coach_id: coachOneId,
      requested_by: coachOneId,
      movement_profile_snapshot: { goals: ['general fitness'] },
      readiness_snapshot: { painLevel: 0 },
      assessment_snapshot: { activeFindings: [] },
      corrective_priorities: ['forward head'],
      goals: ['general fitness'],
      equipment: [],
      time_available_minutes: 30,
      strategy_summary: 'Today’s strategy: Mobility, Strength, Recovery.',
      confidence: 0.75,
      confidence_level: 'moderate',
      confidence_reasons: [{ label: 'Movement Profile on file', detail: 'x' }],
      status: overrides.status ?? 'pending_coach_review',
    })
    .select('*')
    .single();
  if (snapshotError || !snapshot) throw new Error(`seedSnapshot failed: ${snapshotError?.message}`);

  const { data: block, error: blockError } = await service
    .from('prescription_blocks')
    .insert({
      snapshot_id: snapshot.id,
      member_id: memberId,
      coach_id: coachOneId,
      block_type: 'mobility',
      sequence_index: 0,
      primary_objective: 'Restore thoracic mobility before loading.',
      required_movement_tags: ['forward head'],
      preferred_movement_tags: [],
      excluded_tags: [],
      equipment: [],
      difficulty: 'beginner',
      time_allocation_seconds: 300,
      exercise_category: 'mobility',
      block_reasoning:
        'Mobility was prioritized because your corrective priorities include forward head.',
    })
    .select('*')
    .single();
  if (blockError || !block) throw new Error(`seedSnapshot (block) failed: ${blockError?.message}`);

  const { data: exercise, error: exerciseError } = await service
    .from('prescription_block_exercises')
    .insert({
      block_id: block.id,
      snapshot_id: snapshot.id,
      member_id: memberId,
      coach_id: coachOneId,
      provider: 'exercise_api_dev',
      external_id: 'test-rx-thoracic-rotation',
      exercise_name: 'Thoracic Rotation',
      sequence_index: 0,
      sets: 2,
      hold_duration_seconds: 30,
      selection_reasoning: 'Selected because it addresses this block’s required corrective focus.',
      corrective_purpose: 'forward head',
      confidence: 0.7,
    })
    .select('*')
    .single();
  if (exerciseError || !exercise)
    throw new Error(`seedSnapshot (exercise) failed: ${exerciseError?.message}`);

  await service.from('prescription_constraints').insert({
    snapshot_id: snapshot.id,
    member_id: memberId,
    coach_id: coachOneId,
    constraint_type: 'limited_mobility',
    description: 'Active posture finding: forward head.',
    severity: 'moderate',
    evidence_refs: [],
  });

  return {
    snapshotId: snapshot.id as string,
    blockId: block.id as string,
    exerciseId: exercise.id as string,
  };
}

afterAll(async () => {
  const service = serviceRoleClient();
  if (createdAssignmentIds.length > 0) {
    await service.from('coach_program_assignments').delete().in('id', createdAssignmentIds);
  }
  if (createdTemplateIds.length > 0) {
    await service.from('coach_program_templates').delete().in('id', createdTemplateIds);
  }
  await service.from('prescription_snapshots').delete().in('member_id', [memberOneId, memberTwoId]);
  await service
    .from('mef_exercise_metadata')
    .delete()
    .eq('external_id', 'test-power-taxonomy-check');
});

describe('prescription_snapshots — coach-only INSERT, gated by is_active_coach_for', () => {
  it('the assigned coach (coachOne) can insert a snapshot for their own client (memberOne)', async () => {
    const coachClient = await signInAs(TEST_USERS.coachOne);
    const { data, error } = await coachClient
      .from('prescription_snapshots')
      .insert({
        member_id: memberOneId,
        coach_id: coachOneId,
        requested_by: coachOneId,
        status: 'pending_coach_review',
      })
      .select('id');
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    await serviceRoleClient().from('prescription_snapshots').delete().eq('id', data![0]!.id);
  }, 30_000);

  it('coachOne CANNOT insert a snapshot for memberTwo — no active coach_client_assignments row', async () => {
    const coachClient = await signInAs(TEST_USERS.coachOne);
    const { data, error } = await coachClient
      .from('prescription_snapshots')
      .insert({
        member_id: memberTwoId,
        coach_id: coachOneId,
        requested_by: coachOneId,
        status: 'pending_coach_review',
      })
      .select('id');
    expect(error).not.toBeNull();
    expect(data ?? []).toEqual([]);
  }, 30_000);
});

describe('prescription_snapshots / blocks / exercises / constraints — no member SELECT policy anywhere', () => {
  it('memberOne cannot read their own prescription_snapshots row at all', async () => {
    const { snapshotId } = await seedSnapshot();
    const memberClient = await signInAs(TEST_USERS.memberOne);
    const { data } = await memberClient
      .from('prescription_snapshots')
      .select('id')
      .eq('id', snapshotId);
    expect(data).toEqual([]);
  }, 30_000);

  it('the assigned coach (coachOne) reads the full hydrated snapshot — blocks, exercises, and constraints', async () => {
    const { snapshotId } = await seedSnapshot();
    const coachClient = await signInAs(TEST_USERS.coachOne);
    const snapshot = await getPrescriptionSnapshotWithContent(coachClient, snapshotId);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.blocks).toHaveLength(1);
    expect(snapshot!.blocks[0]!.exercises).toHaveLength(1);
    expect(snapshot!.blocks[0]!.exercises[0]!.exercise_name).toBe('Thoracic Rotation');
    expect(snapshot!.constraints).toHaveLength(1);

    const list = await listPrescriptionSnapshotsForMember(coachClient, memberOneId);
    expect(list.some((s) => s.id === snapshotId)).toBe(true);
  }, 30_000);
});

describe('coach edit surface — allowed while pending_coach_review, blocked once frozen', () => {
  it('the coach can lock, then unlock, an exercise while the snapshot is pending review', async () => {
    const { exerciseId } = await seedSnapshot();
    const coachClient = await signInAs(TEST_USERS.coachOne);

    expect(await setBlockExerciseLocked(coachClient, exerciseId, true)).toBe(true);
    const { data: locked } = await coachClient
      .from('prescription_block_exercises')
      .select('is_locked')
      .eq('id', exerciseId)
      .single();
    expect(locked!.is_locked).toBe(true);

    expect(await setBlockExerciseLocked(coachClient, exerciseId, false)).toBe(true);
  }, 30_000);

  it('the coach can remove an exercise and remove a block while pending review', async () => {
    const { blockId, exerciseId } = await seedSnapshot();
    const coachClient = await signInAs(TEST_USERS.coachOne);

    expect(await removeBlockExercise(coachClient, exerciseId)).toBe(true);
    const { data: afterRemoveExercise } = await coachClient
      .from('prescription_block_exercises')
      .select('id')
      .eq('id', exerciseId);
    expect(afterRemoveExercise).toEqual([]);

    expect(await removeBlock(coachClient, blockId)).toBe(true);
    const { data: afterRemoveBlock } = await coachClient
      .from('prescription_blocks')
      .select('id')
      .eq('id', blockId);
    expect(afterRemoveBlock).toEqual([]);
  }, 30_000);

  it('reorderBlockExercises updates sequence_index for the given ids', async () => {
    const { blockId, exerciseId: firstId } = await seedSnapshot();
    const coachClient = await signInAs(TEST_USERS.coachOne);
    const service = serviceRoleClient();

    const { data: secondExercise } = await service
      .from('prescription_block_exercises')
      .insert({
        block_id: blockId,
        snapshot_id: (
          await service.from('prescription_blocks').select('snapshot_id').eq('id', blockId).single()
        ).data!.snapshot_id,
        member_id: memberOneId,
        coach_id: coachOneId,
        provider: 'exercise_api_dev',
        external_id: 'test-rx-second',
        exercise_name: 'Second Exercise',
        sequence_index: 1,
        selection_reasoning: 'x',
        confidence: 0.5,
      })
      .select('id')
      .single();

    expect(await reorderBlockExercises(coachClient, [secondExercise!.id, firstId])).toBe(true);
    const { data: reordered } = await coachClient
      .from('prescription_block_exercises')
      .select('id, sequence_index')
      .eq('block_id', blockId)
      .order('sequence_index', { ascending: true });
    expect(reordered!.map((r) => r.id)).toEqual([secondExercise!.id, firstId]);
  }, 30_000);

  it('once approved, the coach can no longer edit the snapshot or its blocks — RLS, not just discipline', async () => {
    const { snapshotId, exerciseId } = await seedSnapshot();
    const coachClient = await signInAs(TEST_USERS.coachOne);

    const result = await approvePrescriptionSnapshot(coachClient, {
      snapshotId,
      coachId: coachOneId,
      templateName: 'RLS Freeze Test Template',
      memberInstructions: null,
      scheduleType: 'single',
      scheduleConfig: { type: 'single', date: '2026-07-21' },
      publishImmediately: true,
      memberTimezone: 'America/New_York',
    });
    expect(result).not.toBeNull();
    createdTemplateIds.push(result!.templateId);
    createdAssignmentIds.push(result!.assignmentId);

    const { data: updateAttempt, error: updateError } = await coachClient
      .from('prescription_snapshots')
      .update({ strategy_summary: 'tampered' })
      .eq('id', snapshotId)
      .select('id');
    expect(updateError).toBeNull();
    expect(updateAttempt).toEqual([]);

    // setBlockExerciseLocked reports success whenever Postgres returns no
    // error — same convention as every other mutation wrapper in this
    // codebase (e.g. updateAssignedWorkoutStatus) — so a silent RLS no-op
    // must be observed via the raw row count, not the wrapper's boolean.
    const { data: lockAttempt, error: lockError } = await coachClient
      .from('prescription_block_exercises')
      .update({ is_locked: true })
      .eq('id', exerciseId)
      .select('id');
    expect(lockError).toBeNull();
    expect(lockAttempt).toEqual([]);
  }, 30_000);
});

describe('approvePrescriptionSnapshot — materializes into the real Program Builder pipeline', () => {
  it('creates a coach_program_template + assignment + published assigned workout carrying block/selection reasoning, and marks the snapshot approved', async () => {
    const { snapshotId } = await seedSnapshot();
    const coachClient = await signInAs(TEST_USERS.coachOne);

    const result = await approvePrescriptionSnapshot(coachClient, {
      snapshotId,
      coachId: coachOneId,
      templateName: 'Integration Test Prescription',
      memberInstructions: 'Take it easy today.',
      scheduleType: 'single',
      scheduleConfig: { type: 'single', date: '2026-07-21' },
      publishImmediately: true,
      memberTimezone: 'America/New_York',
    });
    expect(result).not.toBeNull();
    createdTemplateIds.push(result!.templateId);
    createdAssignmentIds.push(result!.assignmentId);

    const { data: template } = await coachClient
      .from('coach_program_templates')
      .select('*')
      .eq('id', result!.templateId)
      .single();
    expect(template!.name).toBe('Integration Test Prescription');
    expect(template!.corrective_tags).toEqual(['forward head']);

    const { data: sections } = await coachClient
      .from('coach_program_template_sections')
      .select('*')
      .eq('template_id', result!.templateId);
    expect(sections).toHaveLength(1);
    expect(sections![0]!.block_reasoning).toContain('Mobility was prioritized');

    const { data: assignedWorkouts } = await coachClient
      .from('coach_assigned_workouts')
      .select('*')
      .eq('assignment_id', result!.assignmentId);
    expect(assignedWorkouts).toHaveLength(1);
    expect(assignedWorkouts![0]!.published_at).not.toBeNull();
    expect(assignedWorkouts![0]!.source_prescription_snapshot_id).toBe(snapshotId);

    const { data: assignedExercises } = await coachClient
      .from('coach_assigned_workout_exercises')
      .select('*')
      .eq('assigned_workout_id', assignedWorkouts![0]!.id);
    expect(assignedExercises).toHaveLength(1);
    expect(assignedExercises![0]!.exercise_name).toBe('Thoracic Rotation');
    expect(assignedExercises![0]!.selection_reasoning).toContain(
      'addresses this block’s required corrective focus'
    );

    const { data: updatedSnapshot } = await coachClient
      .from('prescription_snapshots')
      .select('status, resulting_template_id, resulting_assignment_id')
      .eq('id', snapshotId)
      .single();
    expect(updatedSnapshot!.status).toBe('approved');
    expect(updatedSnapshot!.resulting_template_id).toBe(result!.templateId);
    expect(updatedSnapshot!.resulting_assignment_id).toBe(result!.assignmentId);
  }, 30_000);

  it('refuses to approve a snapshot that is not pending_coach_review', async () => {
    const { snapshotId } = await seedSnapshot({ status: 'approved' });
    const coachClient = await signInAs(TEST_USERS.coachOne);
    const result = await approvePrescriptionSnapshot(coachClient, {
      snapshotId,
      coachId: coachOneId,
      templateName: 'Should Not Be Created',
      memberInstructions: null,
      scheduleType: 'single',
      scheduleConfig: { type: 'single', date: '2026-07-21' },
      publishImmediately: true,
      memberTimezone: 'America/New_York',
    });
    expect(result).toBeNull();
  }, 30_000);
});

describe('rejectPrescriptionSnapshot', () => {
  it('marks a pending snapshot rejected with a reason, and it stays that way', async () => {
    const { snapshotId } = await seedSnapshot();
    const coachClient = await signInAs(TEST_USERS.coachOne);

    const ok = await rejectPrescriptionSnapshot(
      coachClient,
      snapshotId,
      coachOneId,
      'Member reported new knee pain since generation.',
      'America/New_York'
    );
    expect(ok).toBe(true);

    const { data: snapshot } = await coachClient
      .from('prescription_snapshots')
      .select('status, rejection_reason, reviewed_by')
      .eq('id', snapshotId)
      .single();
    expect(snapshot!.status).toBe('rejected');
    expect(snapshot!.rejection_reason).toBe('Member reported new knee pain since generation.');
    expect(snapshot!.reviewed_by).toBe(coachOneId);
  }, 30_000);
});

describe('Program Section taxonomy — widened additively to include "power"', () => {
  it('mef_exercise_metadata accepts program_section = "power"', async () => {
    const service = serviceRoleClient();
    const { error } = await service.from('mef_exercise_metadata').insert({
      provider: 'exercise_api_dev',
      external_id: 'test-power-taxonomy-check',
      program_section: 'power',
    });
    expect(error).toBeNull();
  }, 30_000);
});
