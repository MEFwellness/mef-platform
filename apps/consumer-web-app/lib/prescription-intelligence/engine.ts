/**
 * The Prescription Intelligence Engine orchestrator. Composes, in order:
 * Layer 1/2 fact-gathering (facts.ts), the Constraint Engine
 * (constraints.ts), the "When Not To Prescribe" gate (gate.ts),
 * Prescription Confidence (confidence.ts), Layer 3 strategy block
 * composition (strategy.ts), and Layer 4 exercise selection
 * (exerciseSelection.ts) into one permanent prescription_snapshots row
 * (plus its blocks/exercises/constraints) — never re-derived, never
 * silently changed by a later profile edit. Same "deterministic logic
 * first" philosophy as lib/movement/rules/engine.ts: strategy is decided
 * before a single exercise is searched for.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  PrescriptionAssessmentSnapshot,
  PrescriptionBlock,
  PrescriptionBlockExercise,
  PrescriptionConstraint,
  PrescriptionMovementProfileSnapshot,
  PrescriptionReadinessSnapshot,
  PrescriptionSnapshot,
  PrescriptionSnapshotWithContent,
  PrescriptionTriggerSource,
} from '@mef/shared-types-contracts';
import { MOVEMENT_SESSION_SECTION_LABEL } from '@mef/shared-types-contracts';
import { gatherPrescriptionFacts, type PrescriptionFacts } from './facts';
import { deriveConstraints, type PrescriptionConstraintDraft } from './constraints';
import { evaluatePrescriptionGate } from './gate';
import { computeConfidence } from './confidence';
import { buildStrategyBlocks, EXERCISE_COUNT_BY_BLOCK, type StrategyBlockDraft } from './strategy';
import { selectExercisesForBlock } from './exerciseSelection';
import { recordTimelineEvent } from '../timeline/data';
import { todaysLocalDate } from '../time/localDate';

export type GeneratePrescriptionInput = {
  memberId: string;
  coachId: string;
  requestedBy: string;
  memberTimezone: string;
  triggerSource?: PrescriptionTriggerSource | undefined;
  timeAvailableMinutes?: number | undefined;
  /** Overrides the Movement Profile's own goals for this one run, if the coach wants to bias today's prescription differently. Defaults to the member's Movement Profile goals. */
  goals?: string[] | undefined;
};

function buildMovementProfileSnapshot(
  facts: PrescriptionFacts
): PrescriptionMovementProfileSnapshot {
  const profile = facts.movementProfile;
  return {
    goals: profile?.goals ?? [],
    equipmentAccess: profile?.equipment_access ?? [],
    movementLimitations: profile?.movement_limitations ?? [],
    exerciseRestrictions: profile?.exercise_restrictions ?? [],
    contraindications: profile?.contraindications ?? [],
    medicalRestrictions: profile?.medical_restrictions ?? [],
    correctivePriorities: profile?.corrective_priorities ?? [],
    mobilityPriorities: profile?.mobility_priorities ?? [],
    stabilityPriorities: profile?.stability_priorities ?? [],
    strengthPriorities: profile?.strength_priorities ?? [],
  };
}

function buildReadinessSnapshot(facts: PrescriptionFacts): PrescriptionReadinessSnapshot {
  return {
    localDate: facts.latestCheckin?.localDate ?? null,
    painLevel: facts.latestCheckin?.painLevel ?? null,
    stressLevel: facts.latestCheckin?.stressLevel ?? null,
    sleepQuality: facts.latestCheckin?.sleepQuality ?? null,
    sleepDuration: facts.latestCheckin?.sleepDuration ?? null,
    energyLevel: facts.latestCheckin?.energyLevel ?? null,
    newOrWorseningConcern: facts.latestCheckin?.newOrWorseningConcern ?? null,
    wearableRecoveryScore: facts.wearableSnapshot?.recoveryScore ?? null,
    wearableReadinessScore: facts.wearableSnapshot?.readinessScore ?? null,
    wearableHrvMs: facts.wearableSnapshot?.hrvMs ?? null,
    wearableRestingHeartRate: facts.wearableSnapshot?.restingHeartRate ?? null,
  };
}

function buildAssessmentSnapshot(facts: PrescriptionFacts): PrescriptionAssessmentSnapshot {
  return {
    activeFindings: facts.activeFindings,
    hasBaselineAssessment: facts.hasBaselineAssessment,
    hasMovementAssessment: facts.hasMovementAssessment,
  };
}

function buildStrategySummary(
  blocks: StrategyBlockDraft[],
  constraints: PrescriptionConstraintDraft[]
): string {
  const blockNames = blocks.map((b) => MOVEMENT_SESSION_SECTION_LABEL[b.blockType]).join(', ');
  const leadingConstraint =
    constraints.find((c) => c.severity === 'high' || c.severity === 'blocking') ?? constraints[0];
  const base = `Today's strategy: ${blockNames}.`;
  return leadingConstraint ? `${base} ${leadingConstraint.description}` : base;
}

async function insertConstraints(
  supabase: SupabaseClient,
  snapshotId: string,
  memberId: string,
  coachId: string,
  drafts: PrescriptionConstraintDraft[]
): Promise<PrescriptionConstraint[]> {
  if (drafts.length === 0) return [];
  const { data, error } = await supabase
    .from('prescription_constraints')
    .insert(
      drafts.map((d) => ({
        snapshot_id: snapshotId,
        member_id: memberId,
        coach_id: coachId,
        constraint_type: d.constraintType,
        description: d.description,
        severity: d.severity,
        evidence_refs: d.evidenceRefs,
      }))
    )
    .select('*');
  if (error || !data) {
    console.error('insertConstraints failed', error);
    return [];
  }
  return data as PrescriptionConstraint[];
}

/** Runs the full engine for one member and permanently records the result. Returns null only on an unexpected write failure — a legitimate "decline to prescribe" outcome still returns a snapshot (status: 'blocked'), never null. */
export async function generatePrescription(
  supabase: SupabaseClient,
  input: GeneratePrescriptionInput
): Promise<PrescriptionSnapshotWithContent | null> {
  const facts = await gatherPrescriptionFacts(supabase, input.memberId);
  const constraints = deriveConstraints(facts);
  const gateResult = evaluatePrescriptionGate(facts, constraints);
  const { confidence, confidenceLevel, confidenceReasons } = computeConfidence(facts);

  const goals = input.goals ?? facts.movementProfile?.goals ?? [];
  const correctivePriorities = facts.movementProfile?.corrective_priorities ?? [];
  const equipment = facts.movementProfile?.equipment_access ?? [];

  const baseRow = {
    member_id: input.memberId,
    coach_id: input.coachId,
    trigger_source: input.triggerSource ?? 'coach_manual',
    requested_by: input.requestedBy,
    movement_profile_snapshot: buildMovementProfileSnapshot(facts),
    readiness_snapshot: buildReadinessSnapshot(facts),
    assessment_snapshot: buildAssessmentSnapshot(facts),
    corrective_priorities: correctivePriorities,
    goals,
    equipment,
    time_available_minutes: input.timeAvailableMinutes ?? null,
    confidence,
    confidence_level: confidenceLevel,
    confidence_reasons: confidenceReasons,
  };

  const localDate = todaysLocalDate(input.memberTimezone);

  if (gateResult.blocked) {
    const { data: snapshot, error } = await supabase
      .from('prescription_snapshots')
      .insert({
        ...baseRow,
        status: 'blocked',
        block_reason: gateResult.blockReason,
        recommended_alternative: gateResult.recommendedAlternative,
        strategy_summary: null,
      })
      .select('*')
      .single();
    if (error || !snapshot) {
      console.error('generatePrescription (blocked insert) failed', error);
      return null;
    }

    const insertedConstraints = await insertConstraints(
      supabase,
      snapshot.id,
      input.memberId,
      input.coachId,
      constraints
    );

    await recordTimelineEvent(supabase, {
      memberId: input.memberId,
      eventType: 'prescription_generated',
      localDate,
      title: 'A prescription run declined to prescribe',
      detail: `Reason: ${gateResult.blockReason}. Recommended: ${gateResult.recommendedAlternative}.`,
      sourceFeature: 'prescription_snapshot',
      sourceRecordId: snapshot.id,
      memberVisible: false,
    });

    return { ...(snapshot as PrescriptionSnapshot), blocks: [], constraints: insertedConstraints };
  }

  const timeAvailableMinutes = input.timeAvailableMinutes ?? 30;
  const strategyBlocks = buildStrategyBlocks(
    facts,
    constraints,
    goals,
    correctivePriorities,
    equipment,
    timeAvailableMinutes
  );
  const strategySummary = buildStrategySummary(strategyBlocks, constraints);

  const { data: snapshot, error: snapshotError } = await supabase
    .from('prescription_snapshots')
    .insert({ ...baseRow, status: 'pending_coach_review', strategy_summary: strategySummary })
    .select('*')
    .single();
  if (snapshotError || !snapshot) {
    console.error('generatePrescription (snapshot insert) failed', snapshotError);
    return null;
  }

  const insertedConstraints = await insertConstraints(
    supabase,
    snapshot.id,
    input.memberId,
    input.coachId,
    constraints
  );

  const blocksWithExercises: (PrescriptionBlock & { exercises: PrescriptionBlockExercise[] })[] =
    [];
  const usedExternalIds: string[] = [...facts.recentlyCompletedExternalIds];
  let blockSequence = 0;

  for (const block of strategyBlocks) {
    const { data: blockRow, error: blockError } = await supabase
      .from('prescription_blocks')
      .insert({
        snapshot_id: snapshot.id,
        member_id: input.memberId,
        coach_id: input.coachId,
        block_type: block.blockType,
        sequence_index: blockSequence++,
        primary_objective: block.primaryObjective,
        secondary_objective: block.secondaryObjective,
        required_movement_tags: block.requiredMovementTags,
        preferred_movement_tags: block.preferredMovementTags,
        excluded_tags: block.excludedTags,
        equipment: block.equipment,
        difficulty: block.difficulty,
        movement_pattern: block.movementPattern,
        time_allocation_seconds: block.timeAllocationSeconds,
        exercise_category: block.exerciseCategory,
        block_reasoning: block.blockReasoning,
      })
      .select('*')
      .single();
    if (blockError || !blockRow) {
      console.error('generatePrescription (block insert) failed', blockError);
      continue;
    }

    const exerciseCount = EXERCISE_COUNT_BY_BLOCK[block.blockType];
    const drafts = await selectExercisesForBlock(
      supabase,
      block,
      facts,
      usedExternalIds,
      exerciseCount
    );

    const exerciseRows: PrescriptionBlockExercise[] = [];
    let exerciseSequence = 0;
    for (const draft of drafts) {
      usedExternalIds.push(draft.externalId);
      const { data: exerciseRow, error: exerciseError } = await supabase
        .from('prescription_block_exercises')
        .insert({
          block_id: blockRow.id,
          snapshot_id: snapshot.id,
          member_id: input.memberId,
          coach_id: input.coachId,
          provider: draft.provider,
          external_id: draft.externalId,
          exercise_name: draft.exerciseName,
          sequence_index: exerciseSequence++,
          sets: draft.sets,
          reps: draft.reps,
          rep_range_low: draft.repRangeLow,
          rep_range_high: draft.repRangeHigh,
          time_seconds: draft.timeSeconds,
          rest_seconds: draft.restSeconds,
          tempo: draft.tempo,
          hold_duration_seconds: draft.holdDurationSeconds,
          unilateral: draft.unilateral,
          selection_reasoning: draft.selectionReasoning,
          corrective_purpose: draft.correctivePurpose,
          confidence: draft.confidence,
        })
        .select('*')
        .single();
      if (exerciseError || !exerciseRow) {
        console.error('generatePrescription (exercise insert) failed', exerciseError);
        continue;
      }
      exerciseRows.push(exerciseRow as PrescriptionBlockExercise);
    }

    blocksWithExercises.push({ ...(blockRow as PrescriptionBlock), exercises: exerciseRows });
  }

  await recordTimelineEvent(supabase, {
    memberId: input.memberId,
    eventType: 'prescription_generated',
    localDate,
    title: 'A new prescription is ready for coach review',
    detail: strategySummary,
    sourceFeature: 'prescription_snapshot',
    sourceRecordId: snapshot.id,
    memberVisible: false,
  });

  return {
    ...(snapshot as PrescriptionSnapshot),
    blocks: blocksWithExercises,
    constraints: insertedConstraints,
  };
}
