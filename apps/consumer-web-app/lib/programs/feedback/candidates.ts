/**
 * What could stand in for one exercise in one member's program, read from
 * the database.
 *
 * TWO KINDS OF PROGRAM, TWO EXISTING ANSWERS, NEITHER REWRITTEN HERE.
 *
 *   a generated program   the corrective engine chose the exercise from
 *                         her own findings, so the question "what else
 *                         belongs in this block" is
 *                         lib/corrective-engine/blockQualification.ts's
 *                         qualifiesForBlock, run against her own detected
 *                         patterns. That is the same predicate the
 *                         coach's own swap picker uses.
 *
 *   an authored program   a slot was written for a job, so the question is
 *                         lib/programs/blueprints/candidates.ts's
 *                         loadBlockCandidates, which reads corrective
 *                         ROLE against the MEF block.
 *
 * Which one applies is read off the program: a workout carrying corrective
 * tags was generated, anything else was authored. Both paths end in the
 * same SwapCandidate shape, and ./offers.ts then applies the rules that do
 * not depend on where the candidate came from.
 *
 * EVERYTHING RETURNED IS CLIENT ASSIGNABLE, because everything returned is
 * a candidate for a real member's real program. Migration 170's rule is
 * enforced in both loaders and again in ./offers.ts.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BlueprintBlock, ProgramDifficulty } from '@mef/shared-types-contracts';
import type { SwapCandidate } from '../blueprints/swap';
import { loadBlockCandidates } from '../blueprints/candidates';
import { qualifiesForBlock } from '../../corrective-engine/blockQualification';
import { loadCorrectiveExercisePool } from '../../corrective-engine/exercisePool';
import { CORRECTIVE_BLUEPRINTS } from '../../corrective-engine/blueprints';
import type { BlueprintKey, DetectedPattern, SessionBlockType } from '../../corrective-engine/types';

/** The MEF block a frozen section sits in, from the section_type the materializer wrote. */
export const BLOCK_BY_SECTION_TYPE: Record<string, BlueprintBlock> = {
  corrective: 'release',
  mobility: 'mobility',
  activation: 'stability',
  strength: 'strength',
  core: 'core',
};

export function blockForSectionType(sectionType: string | null | undefined): BlueprintBlock {
  return BLOCK_BY_SECTION_TYPE[(sectionType ?? '').trim()] ?? 'strength';
}

/**
 * The corrective engine's own answer, for a program it generated.
 *
 * Severity is irrelevant to qualification (it only ever decides how many
 * exercises a block gets, never which ones are eligible), which is why the
 * patterns are synthesized at one tier from the workout's own corrective
 * tags rather than re-derived from her assessment.
 */
async function correctiveCandidates(
  supabase: SupabaseClient,
  correctiveTags: readonly string[],
  block: BlueprintBlock,
  equipment: readonly string[]
): Promise<SwapCandidate[]> {
  const patterns: DetectedPattern[] = correctiveTags
    .filter((tag): tag is BlueprintKey => tag in CORRECTIVE_BLUEPRINTS)
    .map((blueprint) => ({ blueprint, severity: 'moderate', supportingFindingIds: [] }));
  if (patterns.length === 0) return [];

  // Already client-assignable only: the pool loader drops anything the
  // catalog does not mark assignable (migration 170), which is why that
  // rule is not restated here.
  const pool = await loadCorrectiveExercisePool(supabase, [...equipment]);
  const qualified = pool.filter((exercise) =>
    qualifiesForBlock(exercise, block as SessionBlockType, patterns)
  );
  if (qualified.length === 0) return [];

  // The pool carries the muscle facts the ENGINE selects on. It does not
  // carry the two facts a member's swap is judged on, difficulty and the
  // single equipment token, so those come from the catalog for exactly the
  // exercises that already qualified. Without them "too difficult" has no
  // way to tell a regression from a sideways move.
  const grading = await loadCatalogGrading(
    supabase,
    qualified.map((exercise) => exercise.externalId)
  );

  return qualified.map((exercise) => {
    const graded = grading.get(exercise.externalId);
    return {
      provider: exercise.provider,
      externalId: exercise.externalId,
      name: exercise.name,
      isClientAssignable: true,
      block,
      movementPattern: null,
      equipment: graded?.equipment ?? exercise.equipment[0] ?? null,
      difficulty: graded?.difficulty ?? null,
    };
  });
}

/** Difficulty and the single equipment token, per exercise, from the catalog. */
async function loadCatalogGrading(
  supabase: SupabaseClient,
  externalIds: string[]
): Promise<Map<string, { equipment: string | null; difficulty: ProgramDifficulty | null }>> {
  const grading = new Map<string, { equipment: string | null; difficulty: ProgramDifficulty | null }>();
  const PAGE = 200;
  for (let offset = 0; offset < externalIds.length; offset += PAGE) {
    const { data, error } = await supabase
      .from('exercise_catalog')
      .select('external_id, equipment, difficulty')
      .in('external_id', externalIds.slice(offset, offset + PAGE));
    if (error) {
      console.error('loadCatalogGrading failed', error);
      return grading;
    }
    for (const row of data ?? []) {
      grading.set(row.external_id as string, {
        equipment: (row.equipment as string | null) ?? null,
        difficulty: (row.difficulty as ProgramDifficulty | null) ?? null,
      });
    }
  }
  return grading;
}

/**
 * Everything that could do this exercise's job, for this member, in this
 * program. The caller filters; this only gathers.
 */
export async function loadSwapCandidates(
  supabase: SupabaseClient,
  input: {
    block: BlueprintBlock;
    correctiveTags: readonly string[];
    equipment: readonly string[];
  }
): Promise<SwapCandidate[]> {
  const generated = input.correctiveTags.some((tag) => tag in CORRECTIVE_BLUEPRINTS);
  if (generated) {
    const candidates = await correctiveCandidates(
      supabase,
      input.correctiveTags,
      input.block,
      input.equipment
    );
    // A generated program whose pool came back empty still gets the
    // authored program's answer rather than nothing: an empty list would
    // tell her there is no alternative when the truth is that one read
    // found none.
    if (candidates.length > 0) return candidates;
  }
  return loadBlockCandidates(supabase, input.block);
}

/** The exercises she must never be offered again. Her own rows; RLS decides, this only asks. */
export async function loadAvoidedExternalIds(
  supabase: SupabaseClient,
  memberId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from('member_exercise_avoidance')
    .select('external_id')
    .eq('member_id', memberId)
    .is('released_at', null);
  if (error) {
    // A read that failed must not quietly widen what she is offered. An
    // empty list here would mean "nothing to avoid", which is the opposite
    // of what a failure means, so the caller is told by the throw.
    console.error('loadAvoidedExternalIds failed', error);
    throw new Error('Could not read the avoidance list.');
  }
  return (data ?? []).map((row) => row.external_id as string);
}

/** What she owns, when her movement profile says. An empty list means "unknown", and unknown excludes nothing. */
export async function loadMemberEquipment(
  supabase: SupabaseClient,
  memberId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from('member_movement_profiles')
    .select('equipment_access')
    .eq('member_id', memberId)
    .maybeSingle();
  if (error) return [];
  return ((data?.equipment_access as string[] | null) ?? []).map((item) => item.toLowerCase());
}
