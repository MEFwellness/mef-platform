/**
 * The coach's unified assign flow and the administrator's blueprint
 * library, against real local Supabase. No mocks.
 *
 * Server actions cannot be called from here (they use next/headers), so
 * these exercise the layer underneath them: the same pure rules and the
 * same data functions the actions call, plus the RLS the database enforces
 * whatever the actions do.
 *
 * What this proves:
 *   1. Approve and archive are the administrator's. A coach reads
 *      blueprints and cannot approve one, including one she proposed.
 *   2. Assign from an approved blueprint goes end to end through the
 *      existing pipeline, and the frozen weeks carry the progression.
 *   3. Save as template round trips: a coach-edited plan becomes a draft
 *      blueprint whose slots read back as the plan she had.
 *   4. The swap picker honours the slot's replacement criteria, and a
 *      locked slot refuses everything.
 *
 * Everything works on its own throwaway program and cleans up after
 * itself. The seeded Home Dumbbell Foundation is never written to.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceRoleClient, signInAs, TEST_USERS } from './setup/test-clients';
import { getBlueprintVersion } from '../lib/programs/blueprints/data';
import {
  approveBlueprintVersion,
  archiveBlueprintVersion,
  availableBlueprintKey,
  blueprintKeyFromName,
  duplicateBlueprint,
} from '../lib/programs/blueprints/versioning';
import {
  assignBlueprintToMember,
  blueprintAssignmentBlockedReason,
  discardBlueprintDraft,
} from '../lib/programs/blueprints/assign';
import { saveProgramAsBlueprintDraft } from '../lib/programs/blueprints/saveAsTemplate';
import { planFromBlueprint, plannedSessionSections } from '../lib/programs/blueprints/plan';
import { candidatesForSlot, describeSlotCriteria, slotSwapBlockedReason } from '../lib/programs/blueprints/swap';
import type { ProgramBlueprintSlot } from '@mef/shared-types-contracts';

const ADMIN = TEST_USERS.adminOne.id;
const COACH = TEST_USERS.coachOne.id;
const MEMBER = TEST_USERS.memberOne.id;
const TEST_KEY = 'test_assign_flow_program';

let programId: string;
let versionId: string;
/** Every movement_programs row any test here created, torn down at the end. */
const createdProgramIds: string[] = [];

/**
 * A two session program with a locked main lift, an unlocked accessory
 * carrying a replacement criteria, and a week 2 progression. Small enough
 * to read, awkward enough to catch something.
 */
beforeAll(async () => {
  const supabase = serviceRoleClient();

  const { data: program, error } = await supabase
    .from('movement_programs')
    .insert({ key: TEST_KEY, display_name: 'Assign Flow Fixture' })
    .select('id')
    .single();
  if (error) throw new Error(`assign flow fixture (program) failed: ${error.message}`);
  programId = program!.id;
  createdProgramIds.push(programId);

  const { data: version, error: versionError } = await supabase
    .from('movement_program_versions')
    .insert({
      program_id: programId,
      version_number: 1,
      display_name: 'Assign Flow Fixture v1',
      status: 'draft',
      member_title: 'Assign Flow Fixture',
      member_description: 'A short program used only by the test suite.',
      coach_purpose: 'Proving the assign flow.',
      duration_weeks: 4,
      sessions_per_week: 2,
      equipment_mode: 'home',
      periodization: 'linear',
    })
    .select('id')
    .single();
  if (versionError) throw new Error(`assign flow fixture (version) failed: ${versionError.message}`);
  versionId = version!.id;

  // Real, client-assignable exercises, looked up by name the same way the
  // migrations do, so this fixture cannot drift from the catalog.
  const { data: catalog } = await supabase
    .from('exercise_catalog')
    .select('provider, external_id, name')
    .in('name', ['Dumbbell Goblet Squat', 'Plank', 'Dumbbell floor chest press', 'Dead Bug']);
  const byName = new Map((catalog ?? []).map((c) => [c.name as string, c]));
  const pick = (name: string) => {
    const row = byName.get(name);
    if (!row) throw new Error(`assign flow fixture: ${name} is not in the catalog`);
    return row;
  };

  const squat = pick('Dumbbell Goblet Squat');
  const plank = pick('Plank');
  const press = pick('Dumbbell floor chest press');
  const deadBug = pick('Dead Bug');

  const { error: slotError } = await supabase.from('program_blueprint_slots').insert([
    {
      program_version_id: versionId,
      session_designation: 'A',
      slot_order: 1,
      block: 'strength',
      priority_rank: 1,
      is_locked: true,
      is_per_side: false,
      replacement_criteria: {},
      equipment_requirement: ['dumbbell'],
      sets: 3,
      reps: 10,
      tempo: '2-0-2',
      rest_seconds: 75,
      week_overrides: { '2': { sets: 4 } },
      provider: squat.provider,
      external_id: squat.external_id,
      exercise_name: squat.name,
    },
    {
      program_version_id: versionId,
      session_designation: 'A',
      slot_order: 2,
      block: 'core',
      priority_rank: 2,
      is_locked: false,
      is_per_side: false,
      // A criteria that actually narrows: beginner or easier, core block.
      replacement_criteria: { max_difficulty: 'beginner' },
      equipment_requirement: [],
      sets: 2,
      hold_duration_seconds: 30,
      rest_seconds: 30,
      week_overrides: {},
      provider: plank.provider,
      external_id: plank.external_id,
      exercise_name: plank.name,
    },
    {
      program_version_id: versionId,
      session_designation: 'B',
      slot_order: 1,
      block: 'strength',
      priority_rank: 1,
      is_locked: false,
      is_per_side: true,
      replacement_criteria: {},
      equipment_requirement: ['dumbbell'],
      sets: 3,
      reps: 10,
      rest_seconds: 60,
      week_overrides: {},
      provider: press.provider,
      external_id: press.external_id,
      exercise_name: press.name,
    },
    {
      program_version_id: versionId,
      session_designation: 'B',
      slot_order: 2,
      block: 'core',
      priority_rank: 2,
      is_locked: false,
      is_per_side: false,
      replacement_criteria: {},
      equipment_requirement: [],
      sets: 2,
      reps: 8,
      rest_seconds: 30,
      week_overrides: {},
      provider: deadBug.provider,
      external_id: deadBug.external_id,
      exercise_name: deadBug.name,
    },
  ]);
  if (slotError) throw new Error(`assign flow fixture (slots) failed: ${slotError.message}`);
});

afterAll(async () => {
  const supabase = serviceRoleClient();
  if (createdProgramIds.length > 0) {
    await supabase.from('movement_programs').delete().in('id', createdProgramIds);
  }
});

// ---------------------------------------------------------------------
// 1) Who may approve
// ---------------------------------------------------------------------

describe('approve and archive belong to the administrator', () => {
  it('a coach cannot approve a draft, and the draft stays a draft', async () => {
    const coach = await signInAs(TEST_USERS.coachOne);
    const approved = await approveBlueprintVersion(coach, versionId, COACH);
    // The update itself does not error: RLS filters the row out, so zero
    // rows change. What matters is that the status did not move.
    expect(approved).toBe(true);

    const after = await getBlueprintVersion(serviceRoleClient(), versionId);
    expect(after!.status).toBe('draft');
    expect(after!.approved_at).toBeNull();
    expect(after!.approved_by).toBeNull();
  });

  it('a coach cannot archive one either', async () => {
    const coach = await signInAs(TEST_USERS.coachOne);
    await archiveBlueprintVersion(coach, versionId, COACH);
    const after = await getBlueprintVersion(serviceRoleClient(), versionId);
    expect(after!.status).toBe('draft');
    expect(after!.archived_at).toBeNull();
  });

  it('an administrator can, and approval is attributed', async () => {
    const admin = await signInAs(TEST_USERS.adminOne);
    const ok = await approveBlueprintVersion(admin, versionId, ADMIN);
    expect(ok).toBe(true);

    const after = await getBlueprintVersion(serviceRoleClient(), versionId);
    expect(after!.status).toBe('approved');
    expect(after!.approved_by).toBe(ADMIN);
    expect(after!.approved_at).not.toBeNull();
  });

  it('and approving twice does nothing, because only a draft can be approved', async () => {
    const admin = await signInAs(TEST_USERS.adminOne);
    const before = await getBlueprintVersion(serviceRoleClient(), versionId);
    await approveBlueprintVersion(admin, versionId, ADMIN);
    const after = await getBlueprintVersion(serviceRoleClient(), versionId);
    expect(after!.approved_at).toBe(before!.approved_at);
  });
});

// ---------------------------------------------------------------------
// 2) Assign, end to end
// ---------------------------------------------------------------------

describe('assigning an approved blueprint', () => {
  it('refuses a draft and refuses an archived version, in words', () => {
    expect(blueprintAssignmentBlockedReason({ status: 'draft', publish: true })).toContain(
      'approved'
    );
    expect(blueprintAssignmentBlockedReason({ status: 'archived', publish: true })).toContain(
      'retired'
    );
    expect(blueprintAssignmentBlockedReason({ status: 'approved', publish: true })).toBeNull();
    // A draft may still be materialized for inspection, unpublished. That
    // is what makes it reviewable at all.
    expect(blueprintAssignmentBlockedReason({ status: 'draft', publish: false })).toBeNull();
  });

  it('writes one assignment per weekly session, with the week 2 progression frozen into week 2', async () => {
    const supabase = serviceRoleClient();
    const blueprint = await getBlueprintVersion(supabase, versionId);

    const assigned = await assignBlueprintToMember(supabase, {
      blueprint: blueprint!,
      coachId: COACH,
      memberId: MEMBER,
      startDate: '2030-01-07',
      today: '2030-01-01',
      timezone: 'America/New_York',
      publish: false,
    });
    expect(assigned).not.toBeNull();
    expect(assigned!.templateIds).toHaveLength(2);
    expect(assigned!.assignmentIds).toHaveLength(2);
    // Nothing published means nothing superseded.
    expect(assigned!.replacedAssignmentIds).toEqual([]);

    // Lineage recorded on every assignment.
    const { data: assignments } = await supabase
      .from('coach_program_assignments')
      .select('id, source_blueprint_version_id, visibility, published_at, duration_weeks, program_group_key')
      .in('id', assigned!.assignmentIds);
    for (const row of assignments ?? []) {
      expect(row.source_blueprint_version_id).toBe(versionId);
      expect(row.visibility).not.toBe('published');
      expect(row.published_at).toBeNull();
      expect(row.duration_weeks).toBe(4);
      expect(row.program_group_key).toBe(assigned!.programGroupTag);
    }

    // The frozen weeks. Session A's squat is 3 sets everywhere except
    // week 2, where the blueprint said 4.
    const { data: workouts } = await supabase
      .from('coach_assigned_workouts')
      .select('id, program_week')
      .in('assignment_id', assigned!.assignmentIds);
    const workoutIds = (workouts ?? []).map((w) => w.id as string);
    const weekById = new Map((workouts ?? []).map((w) => [w.id as string, w.program_week as number]));

    const { data: exercises } = await supabase
      .from('coach_assigned_workout_exercises')
      .select('assigned_workout_id, exercise_name, sets, unilateral')
      .in('assigned_workout_id', workoutIds)
      .eq('exercise_name', 'Dumbbell Goblet Squat');

    const setsByWeek = new Map<number, Set<number>>();
    for (const row of exercises ?? []) {
      const week = weekById.get(row.assigned_workout_id as string)!;
      const set = setsByWeek.get(week) ?? new Set<number>();
      set.add(row.sets as number);
      setsByWeek.set(week, set);
    }
    expect(Array.from(setsByWeek.get(1) ?? [])).toEqual([3]);
    expect(Array.from(setsByWeek.get(2) ?? [])).toEqual([4]);
    expect(Array.from(setsByWeek.get(3) ?? [])).toEqual([3]);
    expect(Array.from(setsByWeek.get(4) ?? [])).toEqual([3]);

    // Per side travelled from the slot to the frozen row.
    const { data: perSide } = await supabase
      .from('coach_assigned_workout_exercises')
      .select('exercise_name, unilateral')
      .in('assigned_workout_id', workoutIds)
      .eq('exercise_name', 'Dumbbell floor chest press');
    expect((perSide ?? []).length).toBeGreaterThan(0);
    for (const row of perSide ?? []) expect(row.unilateral).toBe(true);

    const { data: notPerSide } = await supabase
      .from('coach_assigned_workout_exercises')
      .select('unilateral')
      .in('assigned_workout_id', workoutIds)
      .eq('exercise_name', 'Plank');
    for (const row of notPerSide ?? []) expect(row.unilateral).toBe(false);

    // And it is discardable, because it was never published.
    const discarded = await discardBlueprintDraft(supabase, {
      assignmentIds: assigned!.assignmentIds,
      templateIds: assigned!.templateIds,
    });
    expect(discarded).toBe(true);

    const { data: leftBehind } = await supabase
      .from('coach_program_assignments')
      .select('id')
      .in('id', assigned!.assignmentIds);
    expect(leftBehind ?? []).toEqual([]);
  });

  it('cannot be published from an archived version', async () => {
    const supabase = serviceRoleClient();
    const admin = await signInAs(TEST_USERS.adminOne);

    const duplicated = await duplicateBlueprint(
      admin,
      versionId,
      `Assign Flow Archived ${Date.now()}`,
      ADMIN
    );
    expect(duplicated).not.toBeNull();
    createdProgramIds.push(duplicated!.program_id);

    await approveBlueprintVersion(admin, duplicated!.id, ADMIN);
    await archiveBlueprintVersion(admin, duplicated!.id, ADMIN);
    const archived = await getBlueprintVersion(supabase, duplicated!.id);
    expect(archived!.status).toBe('archived');

    const assigned = await assignBlueprintToMember(supabase, {
      blueprint: archived!,
      coachId: COACH,
      memberId: MEMBER,
      startDate: '2030-02-04',
      today: '2030-02-01',
      timezone: 'America/New_York',
      publish: false,
    });
    expect(assigned).toBeNull();
  });
});

// ---------------------------------------------------------------------
// 3) Duplicate
// ---------------------------------------------------------------------

describe('duplicating a blueprint', () => {
  it('starts a separate program at version 1, in draft, with every slot copied', async () => {
    const admin = await signInAs(TEST_USERS.adminOne);
    const source = await getBlueprintVersion(serviceRoleClient(), versionId);

    const copy = await duplicateBlueprint(admin, versionId, `Assign Flow Copy ${Date.now()}`, ADMIN);
    expect(copy).not.toBeNull();
    createdProgramIds.push(copy!.program_id);

    expect(copy!.program_id).not.toBe(source!.program_id);
    expect(copy!.version_number).toBe(1);
    expect(copy!.status).toBe('draft');
    expect(copy!.periodization).toBe(source!.periodization);
    expect(copy!.slots).toHaveLength(source!.slots.length);

    // Slot by slot, everything that makes a slot a slot.
    const key = (s: ProgramBlueprintSlot) => `${s.session_designation}${s.slot_order}`;
    const sourceByKey = new Map(source!.slots.map((s) => [key(s), s]));
    for (const slot of copy!.slots) {
      const original = sourceByKey.get(key(slot))!;
      expect(slot.external_id).toBe(original.external_id);
      expect(slot.priority_rank).toBe(original.priority_rank);
      expect(slot.is_locked).toBe(original.is_locked);
      expect(slot.is_per_side).toBe(original.is_per_side);
      expect(slot.week_overrides).toEqual(original.week_overrides);
      expect(slot.replacement_criteria).toEqual(original.replacement_criteria);
    }

    // The original is untouched, including its approved status.
    const after = await getBlueprintVersion(serviceRoleClient(), versionId);
    expect(after!.status).toBe('approved');
  });

  it('never collides on a key, however many copies share a name', async () => {
    const supabase = serviceRoleClient();
    const name = `Key Collision ${Date.now()}`;
    const first = await availableBlueprintKey(supabase, blueprintKeyFromName(name));
    await supabase.from('movement_programs').insert({ key: first, display_name: name });
    const { data: created } = await supabase
      .from('movement_programs')
      .select('id')
      .eq('key', first)
      .single();
    createdProgramIds.push(created!.id);

    const second = await availableBlueprintKey(supabase, blueprintKeyFromName(name));
    expect(second).not.toBe(first);
  });
});

// ---------------------------------------------------------------------
// 4) Save as template
// ---------------------------------------------------------------------

describe('save as template', () => {
  it('round trips a coach-edited plan into a new draft blueprint', async () => {
    const supabase = serviceRoleClient();
    const coach = await signInAs(TEST_USERS.coachOne);
    const blueprint = await getBlueprintVersion(supabase, versionId);

    // The coach's edit: a different core exercise in session A, and a
    // heavier main lift.
    const sessions = planFromBlueprint(blueprint!);
    const edited = sessions.map((session) => ({
      ...session,
      exercises: session.exercises.map((exercise) =>
        exercise.exerciseName === 'Plank'
          ? { ...exercise, exerciseName: 'Reverse Plank', externalId: 'swapped-in' }
          : exercise.block === 'strength'
            ? { ...exercise, prescription: { ...exercise.prescription, sets: 5 } }
            : exercise
      ),
    }));
    // The swapped exercise has to be real, so it is looked up rather than
    // invented: a blueprint slot pointing at nothing is the failure this
    // whole feature exists to avoid.
    const { data: reversePlank } = await supabase
      .from('exercise_catalog')
      .select('provider, external_id')
      .eq('name', 'Reverse Plank')
      .single();
    for (const session of edited) {
      for (const exercise of session.exercises) {
        if (exercise.externalId === 'swapped-in') {
          exercise.provider = reversePlank!.provider as string;
          exercise.externalId = reversePlank!.external_id as string;
        }
      }
    }

    const saved = await saveProgramAsBlueprintDraft(coach, {
      sessions: edited,
      displayName: `Coach Proposal ${Date.now()}`,
      memberDescription: 'Saved from an assign flow by the test suite.',
      durationWeeks: 4,
      equipmentMode: 'home',
      periodization: 'linear',
      coachId: COACH,
    });
    expect(saved).not.toBeNull();
    createdProgramIds.push(saved!.program_id);

    // A DRAFT, unassignable, and not approved by anyone.
    expect(saved!.status).toBe('draft');
    expect(saved!.version_number).toBe(1);
    expect(saved!.approved_at).toBeNull();
    expect(saved!.approved_by).toBeNull();
    expect(saved!.sessions_per_week).toBe(2);
    expect(blueprintAssignmentBlockedReason({ status: saved!.status, publish: true })).not.toBeNull();

    // The edits are in it.
    const names = saved!.slots.map((s) => s.exercise_name);
    expect(names).toContain('Reverse Plank');
    expect(names).not.toContain('Plank');
    for (const slot of saved!.slots.filter((s) => s.block === 'strength')) {
      expect(slot.sets).toBe(5);
    }

    // The per week plan and the per side marks came across.
    const squat = saved!.slots.find((s) => s.exercise_name === 'Dumbbell Goblet Squat')!;
    expect(squat.week_overrides).toEqual({ '2': { sets: 4 } });
    const press = saved!.slots.find((s) => s.exercise_name === 'Dumbbell floor chest press')!;
    expect(press.is_per_side).toBe(true);

    // Strength and core hold the top ranks, so a shortened session drops
    // the opener first, exactly like an authored blueprint.
    for (const slot of saved!.slots.filter((s) => s.priority_rank <= 2)) {
      expect(['strength', 'core']).toContain(slot.block);
    }

    // And it round trips: reading the saved blueprint back as a plan gives
    // the same lineup the coach had.
    const replanned = planFromBlueprint(saved!);
    expect(replanned.flatMap((s) => s.exercises.map((e) => e.exerciseName))).toEqual(
      edited.flatMap((s) => s.exercises.map((e) => e.exerciseName))
    );
  });

  it('refuses to save nothing, and refuses to save without a name', async () => {
    const coach = await signInAs(TEST_USERS.coachOne);
    expect(
      await saveProgramAsBlueprintDraft(coach, {
        sessions: [],
        displayName: 'Empty',
        durationWeeks: 4,
        coachId: COACH,
      })
    ).toBeNull();

    const blueprint = await getBlueprintVersion(serviceRoleClient(), versionId);
    expect(
      await saveProgramAsBlueprintDraft(coach, {
        sessions: planFromBlueprint(blueprint!),
        displayName: '   ',
        durationWeeks: 4,
        coachId: COACH,
      })
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------
// 5) The swap picker's rules
// ---------------------------------------------------------------------

describe('the swap picker honours the slot', () => {
  const candidate = (over: Partial<Parameters<typeof slotSwapBlockedReason>[1]> = {}) => ({
    provider: 'your_move',
    externalId: 'candidate-1',
    name: 'Some Exercise',
    isClientAssignable: true,
    ...over,
  });

  it('refuses everything on a locked slot', async () => {
    const blueprint = await getBlueprintVersion(serviceRoleClient(), versionId);
    const locked = blueprint!.slots.find((s) => s.is_locked)!;
    expect(slotSwapBlockedReason(locked, candidate())).toContain('locked');
    expect(candidatesForSlot(locked, [candidate(), candidate({ externalId: 'x' })])).toEqual([]);
    expect(describeSlotCriteria(locked)).toContain('Locked');
  });

  it('refuses an exercise with no video, whatever else is true about it', async () => {
    const blueprint = await getBlueprintVersion(serviceRoleClient(), versionId);
    const core = blueprint!.slots.find((s) => s.block === 'core' && !s.is_locked)!;
    expect(
      slotSwapBlockedReason(core, candidate({ isClientAssignable: false, block: 'core' }))
    ).toContain('no video');
  });

  it('refuses another block, even with an empty criteria object', async () => {
    const blueprint = await getBlueprintVersion(serviceRoleClient(), versionId);
    const press = blueprint!.slots.find((s) => s.session_designation === 'B' && s.block === 'strength')!;
    expect(press.replacement_criteria).toEqual({});
    expect(slotSwapBlockedReason(press, candidate({ block: 'core' }))).toContain('strength');
    expect(slotSwapBlockedReason(press, candidate({ block: 'strength' }))).toBeNull();
  });

  it('enforces a max difficulty when the slot states one', async () => {
    const blueprint = await getBlueprintVersion(serviceRoleClient(), versionId);
    const plank = blueprint!.slots.find(
      (s) => s.session_designation === 'A' && s.block === 'core'
    )!;
    expect(plank.replacement_criteria).toEqual({ max_difficulty: 'beginner' });
    expect(
      slotSwapBlockedReason(plank, candidate({ block: 'core', difficulty: 'intermediate' }))
    ).toContain('beginner');
    expect(
      slotSwapBlockedReason(plank, candidate({ block: 'core', difficulty: 'beginner' }))
    ).toBeNull();
    expect(describeSlotCriteria(plank)).toContain('beginner or easier');
  });

  it("enforces the slot's equipment, and always lets bodyweight through", async () => {
    const blueprint = await getBlueprintVersion(serviceRoleClient(), versionId);
    const squatSlot = blueprint!.slots.find(
      (s) => s.session_designation === 'B' && s.block === 'strength'
    )!;
    expect(squatSlot.equipment_requirement).toEqual(['dumbbell']);
    expect(
      slotSwapBlockedReason(squatSlot, candidate({ block: 'strength', equipment: 'barbell' }))
    ).toContain('dumbbell');
    expect(
      slotSwapBlockedReason(squatSlot, candidate({ block: 'strength', equipment: 'dumbbell' }))
    ).toBeNull();
    // Dropping to bodyweight makes the slot easier, never impossible.
    expect(
      slotSwapBlockedReason(squatSlot, candidate({ block: 'strength', equipment: 'bodyweight' }))
    ).toBeNull();
  });

  it('ignores junk in the criteria column rather than trusting it', async () => {
    const blueprint = await getBlueprintVersion(serviceRoleClient(), versionId);
    const core = blueprint!.slots.find(
      (s) => s.session_designation === 'B' && s.block === 'core'
    )!;
    const junk = {
      ...core,
      replacement_criteria: {
        max_difficulty: 'impossible',
        equipment: 'not an array',
        exclude_external_ids: [42],
      } as unknown as Record<string, unknown>,
    };
    expect(slotSwapBlockedReason(junk, candidate({ block: 'core' }))).toBeNull();
  });
});

// ---------------------------------------------------------------------
// 6) The plan, back out to the materializer
// ---------------------------------------------------------------------

describe('a plan converts back into the same sections the materializer takes', () => {
  it('keeps one section per block, in MEF order, carrying per side and the week plan', async () => {
    const blueprint = await getBlueprintVersion(serviceRoleClient(), versionId);
    const [sessionA] = planFromBlueprint(blueprint!);
    const sections = plannedSessionSections(sessionA!);

    expect(sections.map((s) => s.name)).toEqual(['Strength', 'Core']);
    expect(sections[0]!.exercises[0]!.weekOverrides).toEqual({ '2': { sets: 4 } });
    expect(sections[0]!.exercises[0]!.unilateral).toBe(false);
    // A blueprint never prescribes a weight.
    for (const section of sections) {
      for (const exercise of section.exercises) {
        expect(exercise.load).toBeNull();
        expect(exercise.rpe).toBeNull();
      }
    }
  });
});
