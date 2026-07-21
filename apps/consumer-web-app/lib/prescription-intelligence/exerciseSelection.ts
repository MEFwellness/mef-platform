/**
 * Layer 4 — "Which exercises best fit each block?" Only reached after the
 * Layer 3 strategy has already decided which blocks exist and why. Reuses
 * the exact matching primitives lib/coach-program-builder/recommendations.ts
 * already established for Movement-Profile-informed suggestions
 * (normalize/tagsOverlap — same free-text, coach-curated tag vocabulary,
 * same matching problem), searching mef_exercise_metadata (migration 80)
 * by program_section, then scoring candidates by overlap with the block's
 * required/preferred movement tags, then hydrating the top picks' real
 * names from the Exercise Library provider (same
 * buildExerciseApiClientFromEnv + getExercise pattern
 * app/actions/coach-programs.ts already uses) — mef_exercise_metadata
 * itself has no name column, only ExerciseAPI.dev does.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { MefExerciseMetadata } from '@mef/shared-types-contracts';
import { normalize, tagsOverlap } from '../coach-program-builder/recommendations';
import { buildExerciseApiClientFromEnv } from '../exercise-library/apiClient';
import type { PrescriptionFacts } from './facts';
import type { StrategyBlockDraft } from './strategy';

export type BlockExerciseDraft = {
  provider: string;
  externalId: string;
  exerciseName: string;
  sets: number | null;
  reps: string | null;
  repRangeLow: number | null;
  repRangeHigh: number | null;
  timeSeconds: number | null;
  restSeconds: number | null;
  tempo: string | null;
  holdDurationSeconds: number | null;
  unilateral: boolean;
  selectionReasoning: string;
  correctivePurpose: string | null;
  confidence: number;
};

type PrescriptionDefaults = {
  sets: number | null;
  reps: string | null;
  repRangeLow: number | null;
  repRangeHigh: number | null;
  timeSeconds: number | null;
  restSeconds: number | null;
  tempo: string | null;
  holdDurationSeconds: number | null;
  unilateral: boolean;
};

const DEFAULT_PRESCRIPTION: Record<StrategyBlockDraft['blockType'], PrescriptionDefaults> = {
  preparation: {
    sets: 1,
    reps: null,
    repRangeLow: null,
    repRangeHigh: null,
    timeSeconds: 60,
    restSeconds: 0,
    tempo: null,
    holdDurationSeconds: null,
    unilateral: false,
  },
  breathing: {
    sets: 1,
    reps: null,
    repRangeLow: null,
    repRangeHigh: null,
    timeSeconds: 90,
    restSeconds: 0,
    tempo: null,
    holdDurationSeconds: null,
    unilateral: false,
  },
  mobility: {
    sets: 2,
    reps: null,
    repRangeLow: null,
    repRangeHigh: null,
    timeSeconds: null,
    restSeconds: 15,
    tempo: null,
    holdDurationSeconds: 30,
    unilateral: false,
  },
  activation: {
    sets: 2,
    reps: '12-15',
    repRangeLow: 12,
    repRangeHigh: 15,
    timeSeconds: null,
    restSeconds: 30,
    tempo: null,
    holdDurationSeconds: null,
    unilateral: false,
  },
  stability: {
    sets: 2,
    reps: null,
    repRangeLow: null,
    repRangeHigh: null,
    timeSeconds: null,
    restSeconds: 30,
    tempo: null,
    holdDurationSeconds: 20,
    unilateral: false,
  },
  strength: {
    sets: 3,
    reps: '8-12',
    repRangeLow: 8,
    repRangeHigh: 12,
    timeSeconds: null,
    restSeconds: 60,
    tempo: null,
    holdDurationSeconds: null,
    unilateral: false,
  },
  power: {
    sets: 3,
    reps: '5',
    repRangeLow: 5,
    repRangeHigh: 5,
    timeSeconds: null,
    restSeconds: 90,
    tempo: 'explosive',
    holdDurationSeconds: null,
    unilateral: false,
  },
  conditioning: {
    sets: 1,
    reps: null,
    repRangeLow: null,
    repRangeHigh: null,
    timeSeconds: 300,
    restSeconds: 0,
    tempo: null,
    holdDurationSeconds: null,
    unilateral: false,
  },
  recovery: {
    sets: 1,
    reps: null,
    repRangeLow: null,
    repRangeHigh: null,
    timeSeconds: 120,
    restSeconds: 0,
    tempo: null,
    holdDurationSeconds: null,
    unilateral: false,
  },
};

function equipmentCompatible(exerciseEquipment: string[], available: string[]): boolean {
  if (exerciseEquipment.length === 0) return true;
  return exerciseEquipment.every((eq) => {
    const normalized = normalize(eq);
    if (normalized === 'none' || normalized === 'bodyweight' || normalized === '') return true;
    return available.some((have) => normalize(have) === normalized);
  });
}

type ScoredCandidate = { metadata: MefExerciseMetadata; score: number; reasons: string[] };

function scoreCandidate(metadata: MefExerciseMetadata, block: StrategyBlockDraft): ScoredCandidate {
  const reasons: string[] = [];
  let score = 0;

  if (
    block.requiredMovementTags.length > 0 &&
    tagsOverlap(block.requiredMovementTags, metadata.corrective_focus)
  ) {
    score += 3;
    reasons.push('addresses this block’s required corrective focus');
  }
  const focusTags = [
    ...metadata.mobility_focus,
    ...metadata.stability_focus,
    ...metadata.strength_focus,
  ];
  if (
    block.preferredMovementTags.length > 0 &&
    tagsOverlap(block.preferredMovementTags, focusTags)
  ) {
    score += 2;
    reasons.push('matches this block’s preferred focus');
  }
  if (metadata.difficulty === block.difficulty) {
    score += 1;
  }

  return { metadata, score, reasons };
}

/** Layer 4 candidate search + selection for one block — relaxes constraints in a fixed order (exclude-recent, then program_section, in that priority) if the coach-curated catalog can't satisfy every constraint at once, mirroring lib/movement/rules/engine.ts's selectExercisesForSection. Equipment and contraindication/restriction exclusion are never relaxed — never surfacing an exercise the member can't safely perform outweighs filling every slot. */
export async function selectExercisesForBlock(
  supabase: SupabaseClient,
  block: StrategyBlockDraft,
  facts: PrescriptionFacts,
  excludeExternalIds: string[],
  count: number
): Promise<BlockExerciseDraft[]> {
  const { data, error } = await supabase.from('mef_exercise_metadata').select('*').limit(500);
  if (error || !data) {
    console.error('selectExercisesForBlock (catalog fetch) failed', error);
    return [];
  }
  const catalog = data as MefExerciseMetadata[];

  const restrictions = [
    ...(facts.movementProfile?.exercise_restrictions ?? []),
    ...(facts.movementProfile?.contraindications ?? []),
    ...(facts.movementProfile?.medical_restrictions ?? []),
  ];

  const programSectionAttempts =
    block.blockType === 'power' ? [block.exerciseCategory, 'strength'] : [block.exerciseCategory];

  let picked: ScoredCandidate[] = [];
  outer: for (const programSection of programSectionAttempts) {
    for (const excludeRecent of [true, false]) {
      const candidates = catalog.filter((ex) => {
        if (ex.program_section !== programSection) return false;
        if (restrictions.length > 0 && tagsOverlap(restrictions, ex.contraindications))
          return false;
        if (excludeRecent && excludeExternalIds.includes(ex.external_id)) return false;
        if (!equipmentCompatible(ex.equipment, block.equipment)) return false;
        return true;
      });
      if (candidates.length === 0) continue;

      picked = candidates
        .map((ex) => scoreCandidate(ex, block))
        .sort((a, b) => b.score - a.score)
        .slice(0, count);
      break outer;
    }
  }

  if (picked.length === 0) return [];

  const client = buildExerciseApiClientFromEnv();
  if (!client) {
    console.error('selectExercisesForBlock: exercise API client not configured');
    return [];
  }

  const defaults = DEFAULT_PRESCRIPTION[block.blockType];
  const hydrated = await Promise.all(
    picked.map(async ({ metadata, reasons }): Promise<BlockExerciseDraft | null> => {
      try {
        const raw = await client.getExercise(metadata.external_id);
        const reasonText =
          reasons.length > 0
            ? `Selected because it ${reasons.join(' and ')}.`
            : `Selected as a ${block.difficulty} ${block.blockType} exercise compatible with the equipment on file.`;
        return {
          provider: metadata.provider,
          externalId: metadata.external_id,
          exerciseName: raw.name,
          ...defaults,
          selectionReasoning: reasonText,
          correctivePurpose: metadata.corrective_focus[0] ?? null,
          confidence: reasons.length > 0 ? 0.7 : 0.4,
        };
      } catch (err) {
        console.error('selectExercisesForBlock: failed to hydrate', metadata.external_id, err);
        return null;
      }
    })
  );

  return hydrated.filter((d): d is BlockExerciseDraft => d !== null);
}
