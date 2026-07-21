/**
 * The Substitution Engine — finds a replacement for an exercise that's
 * become unavailable or unsuitable. Reuses selectExercisesForBlock (same
 * program_section + required/preferred tag + equipment + contraindication
 * matching Layer 4 already does), so a substitute is guaranteed to share
 * the original's movement pattern, corrective purpose, difficulty, and
 * equipment compatibility — never matched by name similarity alone, since
 * name is never part of the matching criteria here at all.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PrescriptionFacts } from './facts';
import type { StrategyBlockDraft } from './strategy';
import { selectExercisesForBlock, type BlockExerciseDraft } from './exerciseSelection';

/** Returns a single substitute for `currentExternalId` within `block`, excluding the current pick and anything already used elsewhere in this prescription — or null if the catalog has nothing else that fits. */
export async function findSubstituteExercise(
  supabase: SupabaseClient,
  block: StrategyBlockDraft,
  facts: PrescriptionFacts,
  currentExternalId: string,
  alreadyUsedExternalIds: string[]
): Promise<BlockExerciseDraft | null> {
  const exclude = Array.from(new Set([currentExternalId, ...alreadyUsedExternalIds]));
  const candidates = await selectExercisesForBlock(supabase, block, facts, exclude, 1);
  return candidates[0] ?? null;
}
