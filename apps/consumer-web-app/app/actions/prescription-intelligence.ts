/**
 * Server actions for the Prescription Intelligence Engine (migration 83).
 * Same convention as app/actions/coach-programs.ts: RLS is the real
 * authorization boundary (coach_read/insert/update_assigned_* +
 * is_active_coach_for throughout, no member-facing policy exists on any of
 * these tables at all — see the migration's own header) — these actions
 * don't re-check roles, they just perform the read/write and report
 * whatever Postgres allows.
 */

'use server';

import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from './auth';
import { generatePrescription } from '@/lib/prescription-intelligence/engine';
import {
  getPrescriptionSnapshotWithContent,
  listPrescriptionSnapshotsForMember,
  setBlockExerciseLocked,
  removeBlockExercise,
  removeBlock,
  replaceBlockExercise,
  reorderBlockExercises,
  reorderBlocks,
  type ReplaceBlockExerciseInput,
} from '@/lib/prescription-intelligence/data';
import { findSubstituteExercise } from '@/lib/prescription-intelligence/substitution';
import { gatherPrescriptionFacts } from '@/lib/prescription-intelligence/facts';
import {
  approvePrescriptionSnapshot,
  rejectPrescriptionSnapshot,
} from '@/lib/prescription-intelligence/approve';
import { todaysLocalDate } from '@/lib/time/localDate';
import type { BlockExerciseDraft } from '@/lib/prescription-intelligence/exerciseSelection';
import type {
  PrescriptionSnapshot,
  PrescriptionSnapshotWithContent,
} from '@mef/shared-types-contracts';

async function resolveCoachContext(): Promise<{
  supabase: ReturnType<typeof createClient>;
  coachId: string;
} | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { supabase, coachId: user.id };
}

async function resolveMemberTimezone(
  supabase: ReturnType<typeof createClient>,
  memberId: string
): Promise<string> {
  const { data } = await supabase.from('profiles').select('timezone').eq('id', memberId).single();
  return data?.timezone ?? 'America/New_York';
}

export type GeneratePrescriptionActionInput = {
  memberId: string;
  timeAvailableMinutes?: number | undefined;
  goals?: string[] | undefined;
};

/** Triggers a full engine run for one member. The coach's own session performs every insert (RLS, not a service role, is what authorizes this), same "the caller's session does the work" posture as every other action in this codebase. */
export async function generatePrescriptionAction(
  input: GeneratePrescriptionActionInput
): Promise<{ snapshotId: string } | ActionResult> {
  const context = await resolveCoachContext();
  if (!context) return { error: 'Sign in required.' };

  const memberTimezone = await resolveMemberTimezone(context.supabase, input.memberId);
  const snapshot = await generatePrescription(context.supabase, {
    memberId: input.memberId,
    coachId: context.coachId,
    requestedBy: context.coachId,
    memberTimezone,
    timeAvailableMinutes: input.timeAvailableMinutes,
    goals: input.goals,
  });
  if (!snapshot) return { error: 'Could not generate a prescription. Please try again.' };
  return { snapshotId: snapshot.id };
}

export async function getPrescriptionSnapshotAction(
  snapshotId: string
): Promise<PrescriptionSnapshotWithContent | null> {
  const context = await resolveCoachContext();
  if (!context) return null;
  return getPrescriptionSnapshotWithContent(context.supabase, snapshotId);
}

export async function listPrescriptionSnapshotsForClientAction(
  memberId: string
): Promise<PrescriptionSnapshot[]> {
  const context = await resolveCoachContext();
  if (!context) return [];
  return listPrescriptionSnapshotsForMember(context.supabase, memberId);
}

export async function lockPrescriptionExerciseAction(
  exerciseRowId: string,
  isLocked: boolean
): Promise<ActionResult> {
  const context = await resolveCoachContext();
  if (!context) return { error: 'Sign in required.' };
  const ok = await setBlockExerciseLocked(context.supabase, exerciseRowId, isLocked);
  if (!ok) return { error: 'Could not update this exercise. Please try again.' };
  return {};
}

export async function removePrescriptionExerciseAction(
  exerciseRowId: string
): Promise<ActionResult> {
  const context = await resolveCoachContext();
  if (!context) return { error: 'Sign in required.' };
  const ok = await removeBlockExercise(context.supabase, exerciseRowId);
  if (!ok) return { error: 'Could not remove this exercise. Please try again.' };
  return {};
}

export async function removePrescriptionBlockAction(blockId: string): Promise<ActionResult> {
  const context = await resolveCoachContext();
  if (!context) return { error: 'Sign in required.' };
  const ok = await removeBlock(context.supabase, blockId);
  if (!ok) return { error: 'Could not remove this block. Please try again.' };
  return {};
}

export async function reorderPrescriptionExercisesAction(
  orderedExerciseRowIds: string[]
): Promise<ActionResult> {
  const context = await resolveCoachContext();
  if (!context) return { error: 'Sign in required.' };
  const ok = await reorderBlockExercises(context.supabase, orderedExerciseRowIds);
  if (!ok) return { error: 'Could not reorder these exercises. Please try again.' };
  return {};
}

export async function reorderPrescriptionBlocksAction(
  orderedBlockIds: string[]
): Promise<ActionResult> {
  const context = await resolveCoachContext();
  if (!context) return { error: 'Sign in required.' };
  const ok = await reorderBlocks(context.supabase, orderedBlockIds);
  if (!ok) return { error: 'Could not reorder these blocks. Please try again.' };
  return {};
}

export type ReplacePrescriptionExerciseActionInput = ReplaceBlockExerciseInput;

export async function replacePrescriptionExerciseAction(
  exerciseRowId: string,
  input: ReplacePrescriptionExerciseActionInput
): Promise<ActionResult> {
  const context = await resolveCoachContext();
  if (!context) return { error: 'Sign in required.' };
  const ok = await replaceBlockExercise(context.supabase, exerciseRowId, input);
  if (!ok) return { error: 'Could not replace this exercise. Please try again.' };
  return {};
}

/** Finds one candidate substitute for a block exercise — same movement pattern/corrective purpose/difficulty/equipment matching as the original Layer 4 selection, never by name similarity. The coach still has to accept it (via replacePrescriptionExerciseAction) — this only searches. */
export async function findPrescriptionSubstituteAction(
  blockId: string,
  exerciseRowId: string
): Promise<BlockExerciseDraft | ActionResult> {
  const context = await resolveCoachContext();
  if (!context) return { error: 'Sign in required.' };

  const { data: blockRow, error: blockError } = await context.supabase
    .from('prescription_blocks')
    .select('*')
    .eq('id', blockId)
    .maybeSingle();
  if (blockError || !blockRow) return { error: 'Block not found.' };

  const { data: exerciseRow, error: exerciseError } = await context.supabase
    .from('prescription_block_exercises')
    .select('*')
    .eq('id', exerciseRowId)
    .maybeSingle();
  if (exerciseError || !exerciseRow) return { error: 'Exercise not found.' };

  const { data: siblingRows } = await context.supabase
    .from('prescription_block_exercises')
    .select('external_id')
    .eq('snapshot_id', blockRow.snapshot_id);

  const facts = await gatherPrescriptionFacts(context.supabase, blockRow.member_id);

  const block = {
    blockType: blockRow.block_type,
    primaryObjective: blockRow.primary_objective,
    secondaryObjective: blockRow.secondary_objective,
    requiredMovementTags: blockRow.required_movement_tags,
    preferredMovementTags: blockRow.preferred_movement_tags,
    excludedTags: blockRow.excluded_tags,
    equipment: blockRow.equipment,
    difficulty: blockRow.difficulty ?? 'beginner',
    movementPattern: blockRow.movement_pattern,
    timeAllocationSeconds: blockRow.time_allocation_seconds ?? 60,
    exerciseCategory: blockRow.exercise_category ?? blockRow.block_type,
    blockReasoning: blockRow.block_reasoning,
  } as const;

  const substitute = await findSubstituteExercise(
    context.supabase,
    block,
    facts,
    exerciseRow.external_id,
    (siblingRows ?? []).map((r) => r.external_id)
  );
  if (!substitute) return { error: 'No suitable substitute exercise was found.' };
  return substitute;
}

export type ApprovePrescriptionActionInput = {
  snapshotId: string;
  templateName: string;
  memberInstructions: string | null;
};

/** Approves a snapshot and assigns it to the member as a single workout for today, published immediately — the fastest path from "today's strategy" to a real assigned workout. Coach can still build a longer schedule from the resulting template via the existing Program Builder if they want to reuse it. */
export async function approvePrescriptionAction(
  input: ApprovePrescriptionActionInput
): Promise<{ templateId: string; assignmentId: string } | ActionResult> {
  const context = await resolveCoachContext();
  if (!context) return { error: 'Sign in required.' };

  const snapshot = await getPrescriptionSnapshotWithContent(context.supabase, input.snapshotId);
  if (!snapshot) return { error: 'Prescription not found.' };

  const memberTimezone = await resolveMemberTimezone(context.supabase, snapshot.member_id);
  const today = todaysLocalDate(memberTimezone);

  const result = await approvePrescriptionSnapshot(context.supabase, {
    snapshotId: input.snapshotId,
    coachId: context.coachId,
    templateName: input.templateName,
    memberInstructions: input.memberInstructions,
    scheduleType: 'single',
    scheduleConfig: { type: 'single', date: today },
    publishImmediately: true,
    memberTimezone,
  });
  if (!result) return { error: 'Could not approve this prescription. Please try again.' };
  return result;
}

export async function rejectPrescriptionAction(
  snapshotId: string,
  reason: string
): Promise<ActionResult> {
  const context = await resolveCoachContext();
  if (!context) return { error: 'Sign in required.' };

  const { data: snapshotRow } = await context.supabase
    .from('prescription_snapshots')
    .select('member_id')
    .eq('id', snapshotId)
    .maybeSingle();
  const memberTimezone = snapshotRow
    ? await resolveMemberTimezone(context.supabase, snapshotRow.member_id)
    : 'America/New_York';

  const ok = await rejectPrescriptionSnapshot(
    context.supabase,
    snapshotId,
    context.coachId,
    reason,
    memberTimezone
  );
  if (!ok) return { error: 'Could not reject this prescription. Please try again.' };
  return {};
}
