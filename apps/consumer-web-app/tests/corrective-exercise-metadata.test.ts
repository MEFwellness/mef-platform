/**
 * Guard tests for the corrective metadata layer (migration 127/128,
 * lib/exercise-library/correctiveClassification.ts) — real local Supabase,
 * no mocks, same philosophy as the other *-integration tests in this
 * directory (see tests/setup/test-clients.ts).
 *
 * Three invariants:
 *   1. Every exercise_catalog row has a mef_exercise_metadata row with a
 *      non-empty corrective_roles.
 *   2. No exercise has the same muscle in both muscles_stretched and
 *      muscles_strengthened.
 *   3. No spinal_flexion_core exercise carries the stability or
 *      core_stability role.
 *
 * (3) is also enforced by a database check constraint
 * (mef_exercise_metadata_spinal_flexion_not_stability_check, migration
 * 127) and (2) by mef_exercise_metadata_no_muscle_overlap_check — the
 * "planted bad row" test below proves that constraint actually rejects a
 * violating row (not just that today's data happens to be clean).
 */
import { describe, it, expect } from 'vitest';
import { serviceRoleClient } from './setup/test-clients';

const CORRECTIVE_ROLES = ['release', 'stretch', 'mobility', 'stability', 'strength', 'power', 'core_stability'];

describe('corrective exercise metadata', () => {
  it('every exercise_catalog row has a mef_exercise_metadata row with corrective_roles', async () => {
    const supabase = serviceRoleClient();

    const { count: catalogCount, error: catalogError } = await supabase
      .from('exercise_catalog')
      .select('*', { count: 'exact', head: true });
    expect(catalogError).toBeNull();
    expect(catalogCount).toBeGreaterThan(0);

    const { count: taggedCount, error: metadataError } = await supabase
      .from('mef_exercise_metadata')
      .select('*', { count: 'exact', head: true })
      .not('corrective_roles', 'eq', '{}');
    expect(metadataError).toBeNull();
    expect(taggedCount).toBe(catalogCount);
  });

  it('every corrective_roles entry is one of the 7 defined roles', async () => {
    const supabase = serviceRoleClient();
    const { data, error } = await supabase.from('mef_exercise_metadata').select('external_id, corrective_roles');
    expect(error).toBeNull();

    const rows = (data ?? []) as { external_id: string; corrective_roles: string[] }[];
    for (const row of rows) {
      for (const role of row.corrective_roles) {
        expect(CORRECTIVE_ROLES, `${row.external_id} has unknown role ${role}`).toContain(role);
      }
    }
  });

  it('no exercise has the same muscle in both muscles_stretched and muscles_strengthened', async () => {
    const supabase = serviceRoleClient();
    const { data, error } = await supabase
      .from('mef_exercise_metadata')
      .select('external_id, muscles_stretched, muscles_strengthened');
    expect(error).toBeNull();

    const rows = (data ?? []) as {
      external_id: string;
      muscles_stretched: string[];
      muscles_strengthened: string[];
    }[];

    const violations = rows.filter((row) => row.muscles_stretched.some((m) => row.muscles_strengthened.includes(m)));
    expect(violations.map((v) => v.external_id)).toEqual([]);
  });

  it('no spinal_flexion_core exercise carries the stability or core_stability role', async () => {
    const supabase = serviceRoleClient();
    const { data, error } = await supabase
      .from('mef_exercise_metadata')
      .select('external_id, corrective_roles')
      .eq('spinal_flexion_core', true);
    expect(error).toBeNull();

    const rows = (data ?? []) as { external_id: string; corrective_roles: string[] }[];
    expect(rows.length).toBeGreaterThan(0); // sanity: the catalog does contain crunch-type exercises

    const violations = rows.filter(
      (row) => row.corrective_roles.includes('stability') || row.corrective_roles.includes('core_stability')
    );
    expect(violations.map((v) => v.external_id)).toEqual([]);
  });

  it('the database rejects a planted bad row (spinal_flexion_core + core_stability)', async () => {
    // Proves mef_exercise_metadata_spinal_flexion_not_stability_check (migration
    // 127) actually rejects the violation the test above checks for, rather
    // than the test above merely happening to pass on today's clean data.
    const supabase = serviceRoleClient();
    const { error } = await supabase.from('mef_exercise_metadata').insert({
      provider: 'your_move',
      external_id: 'test-corrective-guard-bad-row',
      corrective_roles: ['core_stability'],
      spinal_flexion_core: true,
    });

    expect(error).not.toBeNull();
    expect(error?.message ?? '').toMatch(/spinal_flexion_not_stability_check/);

    // Nothing to clean up — the insert never committed.
    const { data: shouldNotExist } = await supabase
      .from('mef_exercise_metadata')
      .select('id')
      .eq('external_id', 'test-corrective-guard-bad-row')
      .maybeSingle();
    expect(shouldNotExist).toBeNull();
  });

  it('the database rejects a planted bad row (muscle in both stretched and strengthened)', async () => {
    // Proves mef_exercise_metadata_no_muscle_overlap_check (migration 127).
    const supabase = serviceRoleClient();
    const { error } = await supabase.from('mef_exercise_metadata').insert({
      provider: 'your_move',
      external_id: 'test-corrective-guard-bad-row-2',
      muscles_stretched: ['glutes'],
      muscles_strengthened: ['glutes'],
    });

    expect(error).not.toBeNull();
    expect(error?.message ?? '').toMatch(/no_muscle_overlap_check/);
  });
});
