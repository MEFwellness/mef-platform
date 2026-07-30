/**
 * Guard test: exercise_catalog must never contain two rows whose names are
 * the same once normalized (exact match, or a case/spacing/punctuation-only
 * near-match) — the exact bug that let "Barbell Sumo Squat" show up twice
 * in a member's search results (Your Move's own vendor catalog contained
 * real duplicate rows under different external_ids; see
 * lib/exercise-library/catalogDedupe.ts and migration 121
 * (dedupe_exercise_catalog) for the one-time cleanup).
 *
 * Proven non-vacuous below: a real duplicate is inserted via the
 * service-role client, the exact same detection this test relies on is
 * shown to catch it, then it's cleaned up.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { serviceRoleClient } from './setup/test-clients';
import { findDuplicateGroups } from '../lib/exercise-library/catalogDedupe';

const TEST_EXTERNAL_ID_A = `test-dupe-guard-a-${Date.now()}`;
const TEST_EXTERNAL_ID_B = `test-dupe-guard-b-${Date.now()}`;

async function fetchCatalogNames() {
  const supabase = serviceRoleClient();
  const { data, error } = await supabase.from('exercise_catalog').select('external_id, name');
  if (error) throw new Error(`exercise_catalog read failed: ${error.message}`);
  return (data ?? []) as { external_id: string; name: string }[];
}

describe('guard test: exercise_catalog has no duplicate-named active exercises', () => {
  afterEach(async () => {
    const supabase = serviceRoleClient();
    await supabase.from('exercise_catalog').delete().in('external_id', [TEST_EXTERNAL_ID_A, TEST_EXTERNAL_ID_B]);
  });

  it('scans a non-trivial number of real catalog rows (proves this is not vacuously passing on an empty table)', async () => {
    const rows = await fetchCatalogNames();
    expect(rows.length).toBeGreaterThan(500);
  });

  it('the real production catalog has zero duplicate-normalized-name groups', async () => {
    const rows = await fetchCatalogNames();
    const duplicateGroups = findDuplicateGroups(rows);
    if (duplicateGroups.length > 0) {
      // Surface exactly which names collided, not just a bare count.
      throw new Error(
        `Found ${duplicateGroups.length} duplicate-name group(s): ` +
          duplicateGroups.map((g) => g.map((r) => `${r.name} (${r.external_id})`).join(' / ')).join('; ')
      );
    }
    expect(duplicateGroups).toEqual([]);
  });

  it('is proven non-vacuous: inserting a real spacing/casing duplicate makes the same check fail', async () => {
    const supabase = serviceRoleClient();
    const { error: insertError } = await supabase.from('exercise_catalog').insert([
      { provider: 'your_move', external_id: TEST_EXTERNAL_ID_A, name: 'Guard Test Squat' },
      // Differs only by case + double spacing + trailing punctuation —
      // exactly the class of near-duplicate this guard exists to catch.
      { provider: 'your_move', external_id: TEST_EXTERNAL_ID_B, name: 'guard  test squat!' },
    ]);
    expect(insertError).toBeNull();

    const rows = await fetchCatalogNames();
    const duplicateGroups = findDuplicateGroups(rows);
    const injectedGroup = duplicateGroups.find((g) => g.some((r) => r.external_id === TEST_EXTERNAL_ID_A));

    expect(injectedGroup).toBeDefined();
    expect(injectedGroup?.map((r) => r.external_id).sort()).toEqual(
      [TEST_EXTERNAL_ID_A, TEST_EXTERNAL_ID_B].sort()
    );
  });
});
