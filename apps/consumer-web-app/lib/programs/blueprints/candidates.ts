/**
 * What a blueprint slot's swap picker offers.
 *
 * A corrective program's picker asks "what would the engine have chosen
 * here", because the engine chose the exercise in the first place
 * (lib/corrective-engine/blockQualification.ts). A blueprint slot was
 * authored, not generated, so the question is different: what else does
 * the same job in the same place in the session.
 *
 * The answer is the exercise's corrective ROLE, which every classified
 * exercise already carries (migration 127), mapped onto the MEF block the
 * slot sits in. Roles are the vocabulary this system already uses for
 * "what kind of work is this", so a blueprint does not need a second one.
 *
 * Everything returned is client assignable, because everything returned is
 * a candidate for a real member's program. The full library override on the
 * picker is the deliberate way past this list, and it is still not a way
 * past migration 170: an exercise with no video cannot be picked from
 * either list.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BlueprintBlock, ProgramDifficulty } from '@mef/shared-types-contracts';
import type { SwapCandidate } from './swap';

/**
 * Which corrective roles do the job of each MEF block. The same mapping
 * the corrective engine's own block rules use, reduced to the part that
 * does not depend on a member's muscle findings: a blueprint slot has no
 * findings behind it, so the muscle half of those rules has nothing to
 * match against.
 */
export const ROLES_BY_BLOCK: Record<BlueprintBlock, string[]> = {
  release: ['release'],
  mobility: ['stretch', 'mobility'],
  stability: ['stability'],
  strength: ['strength', 'power'],
  core: ['core_stability'],
};

interface MetadataRow {
  provider: string;
  external_id: string;
  corrective_roles: string[];
}

interface CatalogRow {
  provider: string;
  external_id: string;
  name: string;
  equipment: string | null;
  difficulty: ProgramDifficulty | null;
  is_client_assignable: boolean;
}

const PAGE_SIZE = 500;

/**
 * Every client-assignable exercise whose role does the job of `block`.
 *
 * Note the core block's extra condition: never a spinal flexion movement.
 * That is the MEF rule the corrective engine enforces at the pool level
 * and it holds for an authored program too. A crunch is not a swap for a
 * plank.
 */
export async function loadBlockCandidates(
  supabase: SupabaseClient,
  block: BlueprintBlock
): Promise<SwapCandidate[]> {
  const roles = ROLES_BY_BLOCK[block];

  const metadata: MetadataRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = supabase
      .from('mef_exercise_metadata')
      .select('provider, external_id, corrective_roles')
      .overlaps('corrective_roles', roles);
    if (block === 'core') query = query.eq('spinal_flexion_core', false);

    const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      console.error('loadBlockCandidates (metadata) failed', error);
      return [];
    }
    const rows = (data ?? []) as unknown as MetadataRow[];
    metadata.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  if (metadata.length === 0) return [];

  const ids = metadata.map((row) => row.external_id);
  const catalog: CatalogRow[] = [];
  for (let offset = 0; offset < ids.length; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('exercise_catalog')
      .select('provider, external_id, name, equipment, difficulty, is_client_assignable')
      .eq('is_client_assignable', true)
      .in('external_id', ids.slice(offset, offset + PAGE_SIZE));
    if (error) {
      console.error('loadBlockCandidates (catalog) failed', error);
      return [];
    }
    catalog.push(...((data ?? []) as unknown as CatalogRow[]));
  }

  const roleByKey = new Map(metadata.map((row) => [`${row.provider}:${row.external_id}`, row]));

  return catalog
    .filter((row) => roleByKey.has(`${row.provider}:${row.external_id}`))
    .map((row) => ({
      provider: row.provider,
      externalId: row.external_id,
      name: row.name,
      isClientAssignable: row.is_client_assignable === true,
      block,
      movementPattern: null,
      equipment: row.equipment,
      difficulty: row.difficulty,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
