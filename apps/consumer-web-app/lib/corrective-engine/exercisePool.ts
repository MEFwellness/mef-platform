/**
 * Loads the corrective-classified exercise pool the session builder
 * selects from — mef_exercise_metadata (migration 127/128/130) joined to
 * exercise_catalog for display name, filtered to only exercises buildable
 * with the member's available equipment. Zero Your Move API calls — reads
 * already-classified local DB rows only.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CorrectiveExercise } from './types';

/** Default equipment assumption per the task: bodyweight, foam roller, small ball — every generated session must remain buildable with just these. Matches the equipment vocabulary actually used by mef_exercise_metadata.equipment ('bodyweight' / 'foam roller' / 'ball'). */
export const DEFAULT_EQUIPMENT: readonly string[] = ['bodyweight', 'foam roller', 'ball'];

const PAGE_SIZE = 500;

interface MetadataRow {
  provider: string;
  external_id: string;
  corrective_roles: string[];
  muscles_stretched: string[];
  muscles_strengthened: string[];
  strain_level: 'low' | 'moderate' | 'high';
  spinal_flexion_core: boolean;
  equipment: string[];
  coaching_cues: string[];
}

/**
 * mef_exercise_metadata has no foreign key to exercise_catalog — it's keyed
 * by the same (provider, external_id) natural key exercise_catalog uses
 * (see migration 80's header), not a Postgres relationship PostgREST can
 * embed. Every other reader in this codebase (metadata.ts, normalize.ts)
 * fetches the two tables separately and joins in application code; this
 * does the same. Reads the whole catalog page-by-page (range(), not a
 * `.in(external_id, [...])` filter) — the full ~850-row catalog's ids
 * alone exceed PostgREST's URL length limit as a single `.in()` filter, and
 * paging that filter too just trades one edge case for a smaller one; a
 * full-table read of two skinny columns is the same "load the whole
 * catalog for a name comparison" precedent already used by
 * dedupe-exercise-catalog.ts and the Your Move generation mapping.
 */
async function fetchAllCatalogNames(supabase: SupabaseClient): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('exercise_catalog')
      .select('external_id, name')
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`loadCorrectiveExercisePool (catalog) failed: ${error.message}`);
    const rows = (data ?? []) as { external_id: string; name: string }[];
    for (const row of rows) names.set(row.external_id, row.name);
    if (rows.length < PAGE_SIZE) break;
  }
  return names;
}

/**
 * Loads every non-spinal-flexion exercise whose equipment is fully covered
 * by `allowedEquipment` (Postgres array containment — the exercise's own
 * equipment array must be a subset of what's available, so a 'towel' or
 * 'wall' exercise is excluded when the caller only offers the default
 * bodyweight/foam-roller/ball set).
 */
export async function loadCorrectiveExercisePool(
  supabase: SupabaseClient,
  allowedEquipment: readonly string[] = DEFAULT_EQUIPMENT
): Promise<CorrectiveExercise[]> {
  const metadataRows: MetadataRow[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('mef_exercise_metadata')
      .select(
        'provider, external_id, corrective_roles, muscles_stretched, muscles_strengthened, ' +
          'strain_level, spinal_flexion_core, equipment, coaching_cues'
      )
      .eq('spinal_flexion_core', false)
      .containedBy('equipment', allowedEquipment as string[])
      .not('corrective_roles', 'eq', '{}')
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(`loadCorrectiveExercisePool failed: ${error.message}`);
    const rows = (data ?? []) as unknown as MetadataRow[];
    metadataRows.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }

  const catalogNames = await fetchAllCatalogNames(supabase);

  const pool: CorrectiveExercise[] = [];
  for (const row of metadataRows) {
    const name = catalogNames.get(row.external_id);
    if (!name) continue;
    pool.push({
      provider: row.provider,
      externalId: row.external_id,
      name,
      correctiveRoles: (row.corrective_roles ?? []) as CorrectiveExercise['correctiveRoles'],
      musclesStretched: row.muscles_stretched ?? [],
      musclesStrengthened: row.muscles_strengthened ?? [],
      strainLevel: row.strain_level ?? 'moderate',
      spinalFlexionCore: row.spinal_flexion_core,
      equipment: row.equipment ?? [],
      coachingCues: row.coaching_cues ?? [],
    });
  }

  return pool;
}
