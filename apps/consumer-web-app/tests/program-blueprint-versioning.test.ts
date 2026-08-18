/**
 * Blueprint versioning against real local Supabase. No mocks.
 *
 * The rule under test: a draft is edited in place, because nobody has ever
 * been given it. An approved version is NEVER edited. Editing one produces
 * the next version, in draft, with every slot copied, and leaves the
 * approved one exactly as it was, so an assignment that recorded it still
 * describes what somebody was actually given.
 *
 * Everything here works on its own throwaway program, never on the seeded
 * Home Dumbbell Foundation, and cleans up after itself.
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { serviceRoleClient, TEST_USERS } from './setup/test-clients';
import { getBlueprintVersion, listBlueprintVersions } from '../lib/programs/blueprints/data';
import {
  approveBlueprintVersion,
  archiveBlueprintVersion,
  editBlueprintVersion,
} from '../lib/programs/blueprints/versioning';
import { blueprintAssignmentBlockedReason } from '../lib/programs/blueprints/assign';

const ADMIN = TEST_USERS.adminOne.id;
const TEST_KEY = 'test_versioning_program';

let programId: string;
let v1Id: string;

beforeAll(async () => {
  const supabase = serviceRoleClient();

  const { data: program, error } = await supabase
    .from('movement_programs')
    .insert({ key: TEST_KEY, display_name: 'Versioning Fixture' })
    .select('id')
    .single();
  if (error) throw new Error(`versioning fixture (program) failed: ${error.message}`);
  programId = program!.id;

  const { data: version, error: versionError } = await supabase
    .from('movement_program_versions')
    .insert({
      program_id: programId,
      version_number: 1,
      display_name: 'Versioning Fixture v1',
      status: 'draft',
      member_title: 'Versioning Fixture',
      member_description: 'A short program used only by the test suite.',
      coach_purpose: 'Proving the versioning rule.',
      duration_weeks: 4,
      sessions_per_week: 1,
      equipment_mode: 'home',
    })
    .select('id')
    .single();
  if (versionError) throw new Error(`versioning fixture (version) failed: ${versionError.message}`);
  v1Id = version!.id;

  // Two slots, one of them carrying a per-week override, so the copy has
  // something non-trivial to get wrong.
  const { data: exercise } = await supabase
    .from('exercise_catalog')
    .select('provider, external_id, name')
    .eq('is_client_assignable', true)
    .limit(2);

  const { error: slotError } = await supabase.from('program_blueprint_slots').insert([
    {
      program_version_id: v1Id,
      session_designation: 'A',
      slot_order: 1,
      block: 'strength',
      priority_rank: 1,
      is_required: true,
      is_locked: true,
      sets: 3,
      reps: 10,
      rest_seconds: 60,
      week_overrides: { '3': { sets: 4 } },
      provider: exercise![0]!.provider,
      external_id: exercise![0]!.external_id,
      exercise_name: exercise![0]!.name,
    },
    {
      program_version_id: v1Id,
      session_designation: 'A',
      slot_order: 2,
      block: 'core',
      priority_rank: 2,
      is_required: false,
      // Spelled out rather than defaulted: a batch insert sends every
      // column named by any row in the batch, so an omitted one arrives as
      // an explicit null and the default never applies.
      is_locked: false,
      sets: 2,
      reps: null,
      hold_duration_seconds: 30,
      rest_seconds: 30,
      week_overrides: {},
      provider: exercise![1]!.provider,
      external_id: exercise![1]!.external_id,
      exercise_name: exercise![1]!.name,
    },
  ]);
  if (slotError) throw new Error(`versioning fixture (slots) failed: ${slotError.message}`);
});

afterAll(async () => {
  const supabase = serviceRoleClient();
  // Slots cascade from the version, versions cascade from the program.
  await supabase.from('movement_programs').delete().eq('key', TEST_KEY);
});

describe('editing a blueprint', () => {
  it('changes a draft in place, and never adds a version', async () => {
    const supabase = serviceRoleClient();
    const edited = await editBlueprintVersion(
      supabase,
      v1Id,
      { memberDescription: 'A short program used only by the test suite. Now edited.' },
      ADMIN
    );

    expect(edited).not.toBeNull();
    expect(edited!.id).toBe(v1Id);
    expect(edited!.version_number).toBe(1);
    expect(edited!.member_description).toContain('Now edited');

    const versions = await listBlueprintVersions(supabase, programId);
    expect(versions).toHaveLength(1);
  });

  it('an approved version is never edited: the edit becomes version 2, in draft', async () => {
    const supabase = serviceRoleClient();
    expect(await approveBlueprintVersion(supabase, v1Id, ADMIN)).toBe(true);

    const approved = await getBlueprintVersion(supabase, v1Id);
    expect(approved!.status).toBe('approved');
    expect(approved!.approved_by).toBe(ADMIN);
    expect(approved!.approved_at).not.toBeNull();

    const next = await editBlueprintVersion(
      supabase,
      v1Id,
      { memberTitle: 'Versioning Fixture, Second Pass' },
      ADMIN
    );

    expect(next).not.toBeNull();
    expect(next!.id).not.toBe(v1Id);
    expect(next!.version_number).toBe(2);
    expect(next!.status).toBe('draft');
    expect(next!.member_title).toBe('Versioning Fixture, Second Pass');
    // Everything the edit did not mention is carried forward.
    expect(next!.duration_weeks).toBe(4);
    expect(next!.coach_purpose).toBe('Proving the versioning rule.');

    // And v1 is untouched, which is the whole point.
    const stillApproved = await getBlueprintVersion(supabase, v1Id);
    expect(stillApproved!.status).toBe('approved');
    expect(stillApproved!.member_title).toBe('Versioning Fixture');
  });

  it('copies every slot into the new version, including per-week overrides', async () => {
    const supabase = serviceRoleClient();
    const versions = await listBlueprintVersions(supabase, programId);
    const v2 = versions.find((v) => v.version_number === 2)!;

    const v1 = await getBlueprintVersion(supabase, v1Id);
    const copy = await getBlueprintVersion(supabase, v2.id);

    expect(copy!.slots).toHaveLength(v1!.slots.length);

    const strip = (slots: typeof copy extends null ? never : NonNullable<typeof copy>['slots']) =>
      slots.map((s) => ({
        session_designation: s.session_designation,
        slot_order: s.slot_order,
        block: s.block,
        priority_rank: s.priority_rank,
        is_required: s.is_required,
        is_locked: s.is_locked,
        sets: s.sets,
        reps: s.reps,
        hold_duration_seconds: s.hold_duration_seconds,
        rest_seconds: s.rest_seconds,
        week_overrides: s.week_overrides,
        provider: s.provider,
        external_id: s.external_id,
        exercise_name: s.exercise_name,
      }));

    expect(strip(copy!.slots)).toEqual(strip(v1!.slots));
    // Copies, not shared rows.
    const v1SlotIds = new Set(v1!.slots.map((s) => s.id));
    expect(copy!.slots.some((s) => v1SlotIds.has(s.id))).toBe(false);
  });

  it('an archived version is not editable and starts nothing new', async () => {
    const supabase = serviceRoleClient();
    const versions = await listBlueprintVersions(supabase, programId);
    const v2 = versions.find((v) => v.version_number === 2)!;

    expect(await archiveBlueprintVersion(supabase, v2.id, ADMIN)).toBe(true);
    const archived = await getBlueprintVersion(supabase, v2.id);
    expect(archived!.status).toBe('archived');
    expect(archived!.archived_at).not.toBeNull();

    expect(await editBlueprintVersion(supabase, v2.id, { memberTitle: 'Revived' }, ADMIN)).toBeNull();

    // And the slots it kept are still there: archiving is not deleting.
    expect(archived!.slots.length).toBeGreaterThan(0);
  });

  it('approving is only ever a draft becoming approved', async () => {
    const supabase = serviceRoleClient();
    const versions = await listBlueprintVersions(supabase, programId);
    const v2 = versions.find((v) => v.version_number === 2)!;

    // Already archived: the guarded update matches no row, so nothing moves.
    await approveBlueprintVersion(supabase, v2.id, ADMIN);
    const stillArchived = await getBlueprintVersion(supabase, v2.id);
    expect(stillArchived!.status).toBe('archived');
  });
});

describe('what may be given to a member', () => {
  it('an approved blueprint may be published', () => {
    expect(blueprintAssignmentBlockedReason({ status: 'approved', publish: true })).toBeNull();
  });

  it('a draft may be materialized for review but never published', () => {
    expect(blueprintAssignmentBlockedReason({ status: 'draft', publish: false })).toBeNull();
    expect(blueprintAssignmentBlockedReason({ status: 'draft', publish: true })).toContain(
      'approved'
    );
  });

  it('an archived blueprint starts nothing at all', () => {
    expect(blueprintAssignmentBlockedReason({ status: 'archived', publish: false })).toContain(
      'retired'
    );
    expect(blueprintAssignmentBlockedReason({ status: 'archived', publish: true })).toContain(
      'retired'
    );
  });
});
