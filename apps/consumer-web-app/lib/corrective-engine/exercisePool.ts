/**
 * Loads the corrective-classified exercise pool the session builder
 * selects from — mef_exercise_metadata (migration 127/128/130) joined to
 * exercise_catalog for display name, filtered to only exercises buildable
 * with the member's available equipment. Zero Your Move API calls — reads
 * already-classified local DB rows only.
 *
 * CLIENT-ASSIGNABLE ONLY. Everything this function returns is destined for
 * a member's program, so it drops any exercise the catalog does not mark
 * `is_client_assignable` (migration 170) — today the 28 MEF-authored
 * corrective exercises with no video, plus one Your Move row with none.
 * The rule itself is not restated here: this reads the generated column
 * and believes it, so the day those exercises are given videos they enter
 * this pool with no change to this file. Coach and admin tooling that
 * plans rather than assigns still sees the whole catalog, by not calling
 * this function.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CorrectiveExercise } from './types';
import { listAssignableCatalogNames } from '../exercise-library/assignable';

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

  // mef_exercise_metadata has no foreign key to exercise_catalog — it is
  // keyed by the same (provider, external_id) natural key (migration 80's
  // header), not a Postgres relationship PostgREST can embed, so the two
  // tables are read separately and joined here, exactly as metadata.ts and
  // normalize.ts already do. The map holds client-assignable exercises
  // only, so a non-assignable one has no name to join to and drops out of
  // the pool below however well its metadata row qualifies.
  const catalogNames = await listAssignableCatalogNames(supabase);

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
