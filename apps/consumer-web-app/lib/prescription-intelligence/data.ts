/**
 * Data access for prescription_snapshots / prescription_blocks /
 * prescription_block_exercises / prescription_constraints (migration 83).
 * Same shape as every other data.ts in this codebase: pure functions
 * taking a SupabaseClient, RLS is the real authorization boundary — coach-
 * only throughout, no member SELECT policy exists on any of these four
 * tables (see the migration's own header). Coach edit/lock/remove
 * mutations here only succeed while the parent snapshot's status is
 * 'pending_coach_review'; RLS enforces that too, this file just performs
 * the read/write the caller's own session is allowed to do.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  PrescriptionBlock,
  PrescriptionBlockExercise,
  PrescriptionConstraint,
  PrescriptionSnapshot,
  PrescriptionSnapshotWithContent,
} from '@mef/shared-types-contracts';

export async function getPrescriptionSnapshotWithContent(
  supabase: SupabaseClient,
  snapshotId: string
): Promise<PrescriptionSnapshotWithContent | null> {
  const { data: snapshot, error: snapshotError } = await supabase
    .from('prescription_snapshots')
    .select('*')
    .eq('id', snapshotId)
    .maybeSingle();
  if (snapshotError || !snapshot) {
    if (snapshotError)
      console.error('getPrescriptionSnapshotWithContent (snapshot) failed', snapshotError);
    return null;
  }

  const [
    { data: blocks, error: blocksError },
    { data: exercises, error: exercisesError },
    { data: constraints, error: constraintsError },
  ] = await Promise.all([
    supabase
      .from('prescription_blocks')
      .select('*')
      .eq('snapshot_id', snapshotId)
      .order('sequence_index', { ascending: true }),
    supabase
      .from('prescription_block_exercises')
      .select('*')
      .eq('snapshot_id', snapshotId)
      .order('sequence_index', { ascending: true }),
    supabase.from('prescription_constraints').select('*').eq('snapshot_id', snapshotId),
  ]);

  if (blocksError) console.error('getPrescriptionSnapshotWithContent (blocks) failed', blocksError);
  if (exercisesError)
    console.error('getPrescriptionSnapshotWithContent (exercises) failed', exercisesError);
  if (constraintsError)
    console.error('getPrescriptionSnapshotWithContent (constraints) failed', constraintsError);

  const byBlock = new Map<string, PrescriptionBlockExercise[]>();
  for (const exercise of (exercises as PrescriptionBlockExercise[]) ?? []) {
    const list = byBlock.get(exercise.block_id) ?? [];
    list.push(exercise);
    byBlock.set(exercise.block_id, list);
  }

  return {
    ...(snapshot as PrescriptionSnapshot),
    blocks: ((blocks as PrescriptionBlock[]) ?? []).map((block) => ({
      ...block,
      exercises: byBlock.get(block.id) ?? [],
    })),
    constraints: (constraints as PrescriptionConstraint[]) ?? [],
  };
}

export async function listPrescriptionSnapshotsForMember(
  supabase: SupabaseClient,
  memberId: string
): Promise<PrescriptionSnapshot[]> {
  const { data, error } = await supabase
    .from('prescription_snapshots')
    .select('*')
    .eq('member_id', memberId)
    .order('generated_at', { ascending: false });
  if (error) {
    console.error('listPrescriptionSnapshotsForMember failed', error);
    return [];
  }
  return data as PrescriptionSnapshot[];
}

/** Coach edit surface — sets is_locked (Coach Authority: "Lock"). A locked exercise is skipped by any future re-run's substitution pass. */
export async function setBlockExerciseLocked(
  supabase: SupabaseClient,
  exerciseRowId: string,
  isLocked: boolean
): Promise<boolean> {
  const { error } = await supabase
    .from('prescription_block_exercises')
    .update({ is_locked: isLocked })
    .eq('id', exerciseRowId);
  if (error) {
    console.error('setBlockExerciseLocked failed', error);
    return false;
  }
  return true;
}

/** Coach edit surface — "Remove" an exercise from a block before approval. */
export async function removeBlockExercise(
  supabase: SupabaseClient,
  exerciseRowId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('prescription_block_exercises')
    .delete()
    .eq('id', exerciseRowId);
  if (error) {
    console.error('removeBlockExercise failed', error);
    return false;
  }
  return true;
}

/** Coach edit surface — "Replace" one exercise with another (e.g. a Substitution Engine result, or a manual pick from the existing Exercise Picker). Preserves the original pick for substitution-history purposes. */
export type ReplaceBlockExerciseInput = {
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
  selectionReasoning: string;
  substitutionReason: string;
};

export async function replaceBlockExercise(
  supabase: SupabaseClient,
  exerciseRowId: string,
  input: ReplaceBlockExerciseInput
): Promise<boolean> {
  const { data: current, error: currentError } = await supabase
    .from('prescription_block_exercises')
    .select('provider, external_id, exercise_name, is_coach_modified')
    .eq('id', exerciseRowId)
    .maybeSingle();
  if (currentError || !current) {
    console.error('replaceBlockExercise (lookup) failed', currentError);
    return false;
  }

  const { error } = await supabase
    .from('prescription_block_exercises')
    .update({
      provider: input.provider,
      external_id: input.externalId,
      exercise_name: input.exerciseName,
      sets: input.sets,
      reps: input.reps,
      rep_range_low: input.repRangeLow,
      rep_range_high: input.repRangeHigh,
      time_seconds: input.timeSeconds,
      rest_seconds: input.restSeconds,
      tempo: input.tempo,
      hold_duration_seconds: input.holdDurationSeconds,
      selection_reasoning: input.selectionReasoning,
      is_coach_modified: true,
      original_provider: current.is_coach_modified ? undefined : current.provider,
      original_external_id: current.is_coach_modified ? undefined : current.external_id,
      original_exercise_name: current.is_coach_modified ? undefined : current.exercise_name,
      substitution_reason: input.substitutionReason,
    })
    .eq('id', exerciseRowId);
  if (error) {
    console.error('replaceBlockExercise (update) failed', error);
    return false;
  }
  return true;
}

/** Coach edit surface — "Reorder" exercises within a block. Takes the full ordered list of exercise row ids for one block. */
export async function reorderBlockExercises(
  supabase: SupabaseClient,
  orderedExerciseRowIds: string[]
): Promise<boolean> {
  const results = await Promise.all(
    orderedExerciseRowIds.map((id, index) =>
      supabase.from('prescription_block_exercises').update({ sequence_index: index }).eq('id', id)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    console.error('reorderBlockExercises failed', failed.error);
    return false;
  }
  return true;
}

/** Coach edit surface — "Reorder" blocks within a snapshot. Takes the full ordered list of block row ids. */
export async function reorderBlocks(
  supabase: SupabaseClient,
  orderedBlockIds: string[]
): Promise<boolean> {
  const results = await Promise.all(
    orderedBlockIds.map((id, index) =>
      supabase.from('prescription_blocks').update({ sequence_index: index }).eq('id', id)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    console.error('reorderBlocks failed', failed.error);
    return false;
  }
  return true;
}

/** Coach edit surface — "Remove" an entire block (and its exercises, via cascade) before approval. */
export async function removeBlock(supabase: SupabaseClient, blockId: string): Promise<boolean> {
  const { error } = await supabase.from('prescription_blocks').delete().eq('id', blockId);
  if (error) {
    console.error('removeBlock failed', error);
    return false;
  }
  return true;
}
