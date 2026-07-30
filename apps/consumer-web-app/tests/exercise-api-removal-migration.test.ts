/**
 * Guard test for the ExerciseAPI.dev removal data migration
 * (scripts/exercise-media/migrate-legacy-exercise-references.ts): every
 * existing exercise reference must either remap to its confident Your
 * Move match or get legacy-flagged — member history/rows are never
 * deleted. Runs the real exported migration functions against real seeded
 * rows in local Supabase (member.one), no mocks.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { serviceRoleClient, TEST_USERS } from './setup/test-clients';
import {
  migrateFavorites,
  migrateSimpleReferenceTable,
  isPureCueArtifact,
} from '../scripts/exercise-media/migrate-legacy-exercise-references';

const MATCHED_OLD_ID = `test-legacy-matched-${Date.now()}`;
const UNMATCHED_OLD_ID = `test-legacy-unmatched-${Date.now()}`;
const YOUR_MOVE_TARGET_ID = `test-your-move-target-${Date.now()}`;

const matchMap = new Map([
  [
    MATCHED_OLD_ID,
    { ourId: MATCHED_OLD_ID, ourName: 'Old Matched Exercise', yourMoveId: YOUR_MOVE_TARGET_ID, yourMoveTitle: 'New Exercise' },
  ],
]);
const nameMap = new Map([[UNMATCHED_OLD_ID, 'Old Unmatched Exercise Name']]);

async function cleanup() {
  const supabase = serviceRoleClient();
  await supabase
    .from('member_exercise_favorites')
    .delete()
    .in('external_id', [MATCHED_OLD_ID, UNMATCHED_OLD_ID, YOUR_MOVE_TARGET_ID])
    .eq('member_id', TEST_USERS.memberOne.id);
  await supabase
    .from('member_exercise_completions')
    .delete()
    .in('external_id', [MATCHED_OLD_ID, UNMATCHED_OLD_ID, YOUR_MOVE_TARGET_ID])
    .eq('member_id', TEST_USERS.memberOne.id);
}

describe('ExerciseAPI.dev removal: remap-or-legacy-flag, never delete', () => {
  afterEach(cleanup);

  it('remaps a favorite with a confident Your Move match to the new provider/external_id', async () => {
    const supabase = serviceRoleClient();
    await supabase.from('member_exercise_favorites').insert({
      member_id: TEST_USERS.memberOne.id,
      provider: 'exercise_api_dev',
      external_id: MATCHED_OLD_ID,
    });

    const counts = await migrateFavorites(supabase, matchMap, nameMap);
    expect(counts.remapped).toBeGreaterThanOrEqual(1);
    expect(counts.legacyFlagged).toBe(0);

    const { data } = await supabase
      .from('member_exercise_favorites')
      .select('*')
      .eq('member_id', TEST_USERS.memberOne.id)
      .eq('external_id', YOUR_MOVE_TARGET_ID)
      .single();
    expect(data?.provider).toBe('your_move');
    expect(data?.is_legacy).toBe(false);
  });

  it('legacy-flags a favorite with no confident match — row is never deleted, name is preserved', async () => {
    const supabase = serviceRoleClient();
    await supabase.from('member_exercise_favorites').insert({
      member_id: TEST_USERS.memberOne.id,
      provider: 'exercise_api_dev',
      external_id: UNMATCHED_OLD_ID,
    });

    const counts = await migrateFavorites(supabase, matchMap, nameMap);
    expect(counts.legacyFlagged).toBeGreaterThanOrEqual(1);

    const { data } = await supabase
      .from('member_exercise_favorites')
      .select('*')
      .eq('member_id', TEST_USERS.memberOne.id)
      .eq('external_id', UNMATCHED_OLD_ID)
      .single();
    // Never deleted — still there, provider left as the legacy marker.
    expect(data).not.toBeNull();
    expect(data?.provider).toBe('exercise_api_dev');
    expect(data?.is_legacy).toBe(true);
    expect(data?.legacy_exercise_name).toBe('Old Unmatched Exercise Name');
  });

  it('generic table remap (member_exercise_completions): matched rows remap, unmatched rows are legacy-flagged and never deleted', async () => {
    const supabase = serviceRoleClient();
    await supabase.from('member_exercise_completions').insert([
      {
        member_id: TEST_USERS.memberOne.id,
        provider: 'exercise_api_dev',
        external_id: MATCHED_OLD_ID,
        exercise_name: 'Old Matched Exercise',
        status: 'completed',
      },
      {
        member_id: TEST_USERS.memberOne.id,
        provider: 'exercise_api_dev',
        external_id: UNMATCHED_OLD_ID,
        exercise_name: 'Old Unmatched Exercise Name',
        status: 'completed',
      },
    ]);

    const counts = await migrateSimpleReferenceTable(supabase, 'member_exercise_completions', matchMap);
    expect(counts.remapped).toBeGreaterThanOrEqual(1);
    expect(counts.legacyFlagged).toBeGreaterThanOrEqual(1);

    const { data: rows } = await supabase
      .from('member_exercise_completions')
      .select('*')
      .eq('member_id', TEST_USERS.memberOne.id)
      .in('external_id', [YOUR_MOVE_TARGET_ID, UNMATCHED_OLD_ID]);

    const remapped = rows!.find((r) => r.external_id === YOUR_MOVE_TARGET_ID);
    const legacy = rows!.find((r) => r.external_id === UNMATCHED_OLD_ID);
    expect(remapped?.provider).toBe('your_move');
    expect(remapped?.is_legacy).toBe(false);
    // Never deleted, exercise_name preserved verbatim, marked legacy.
    expect(legacy).not.toBeUndefined();
    expect(legacy?.exercise_name).toBe('Old Unmatched Exercise Name');
    expect(legacy?.is_legacy).toBe(true);
  });

  it('isPureCueArtifact: true only when every curation column is at its schema default (proven non-vacuous both ways)', () => {
    const pureCueRow = {
      program_section: null,
      movement_category: null,
      difficulty: null,
      coach_notes: null,
      body_region: [],
      equipment: [],
      corrective_focus: [],
      mobility_focus: [],
      strength_focus: [],
      stability_focus: [],
      contraindications: [],
      regressions: [],
      progressions: [],
      goal_tags: [],
      limitation_tags: [],
    };
    expect(isPureCueArtifact(pureCueRow)).toBe(true);

    // A single real curation field flips it to false — the row must be
    // preserved, not deleted, by migrateMefExerciseMetadata.
    expect(isPureCueArtifact({ ...pureCueRow, program_section: 'strength' })).toBe(false);
    expect(isPureCueArtifact({ ...pureCueRow, corrective_focus: ['posture'] })).toBe(false);
    expect(isPureCueArtifact({ ...pureCueRow, coach_notes: 'Good for beginners' })).toBe(false);
  });
});
