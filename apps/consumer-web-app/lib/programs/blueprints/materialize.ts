/**
 * The named-program half of the materializer: a filled blueprint version
 * in, the same coach_program_templates rows a corrective draft produces
 * out.
 *
 * This file decides what a NAMED program says. It does not write a single
 * row itself: it builds the same MaterializeProgramInput the corrective
 * engine builds and hands it to lib/programs/materialize.ts, which is the
 * only thing in the app that creates a program template. That is why a
 * blueprint-born program and a corrective-born program are the same shape
 * downstream, and why they stay the same shape when either one changes.
 *
 * WHERE THE NUMBERS COME FROM. A slot's own prescription wins wherever it
 * is set. Where a slot says nothing, the corrective dosing table
 * (lib/corrective-engine/dosing.ts) fills the gap for that block, which is
 * the same table and the same conventions a generated program is dosed
 * from. A blueprint therefore cannot produce an exercise with no
 * prescription on it, which is the failure the polish prompt found on
 * production and fixed for the corrective path.
 *
 * The tier the gaps are filled at is 'mild', the general-population column
 * of that table: it is the one written for someone with no severity
 * driving the plan, which is exactly who a named program is for. It is an
 * input rather than a constant so a future blueprint written for a more
 * cautious population can choose otherwise.
 *
 * WHAT A MEMBER MAY READ FROM HERE. The member-facing title and
 * description are AUTHORED on the blueprint and copied straight through.
 * They are not mapped from anything: lib/programs/memberPresentation.ts's
 * name mapping exists because the corrective engine names a program after
 * a finding, and a named program has no finding to name itself after. The
 * coach-facing fields on a blueprint (purpose, intended population,
 * cautions, and every slot's own purpose) go into internal_notes, which is
 * coach-only, and into nothing else. Nothing coach-facing is written into
 * description, coach_notes, member_instructions, block_reasoning or
 * selection_reasoning, all five of which reach a member once a workout is
 * published.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  BlueprintWithSlots,
  ExercisePrescriptionPriority,
  ProgramBlueprintSlot,
  ProgramSectionType,
} from '@mef/shared-types-contracts';
import type {
  TemplateContentExerciseInput,
  TemplateContentSectionInput,
  TemplateMetaInput,
} from '../../coach-program-builder/templates';
import { SECTION_TYPE_BY_BLOCK } from '../../corrective-engine/save';
import { blockPrescription } from '../../corrective-engine/dosing';
import type { CorrectiveSeverity } from '../../corrective-engine/types';
import { materializeProgram, type MaterializeSessionInput } from '../materialize';
import { memberExerciseReasoning } from '../explain/exerciseReasoning';
import { sessionDesignationsOf, slotsForSession } from './data';

/** The `named-program:<uuid>` tag every template of one materialized blueprint shares, and the assignment's program_group_key. Deliberately not the word "blueprint": program tags are copied onto the frozen workouts a member can read. */
export const NAMED_PROGRAM_GROUP_TAG_PREFIX = 'named-program:';
/** Marks a template as blueprint-born, the way `corrective-generated` marks a generated one. */
export const NAMED_PROGRAM_TAG = 'named-program';
export const NAMED_PROGRAM_VERSION_TAG_PREFIX = 'named-program-version:';

/**
 * The member-facing label for each block of the MEF sequence. The block
 * keys are the corrective engine's own (SessionBlockType), so there is one
 * sequence in this system; these are the words a member reads for them in
 * an authored program, and every one of them is plain English with nothing
 * clinical in it.
 */
export const BLUEPRINT_BLOCK_SECTION_NAME: Record<ProgramBlueprintSlot['block'], string> = {
  release: 'Preparation',
  mobility: 'Mobility',
  stability: 'Activation',
  strength: 'Strength',
  core: 'Core',
};

/** The dosing tier a blueprint's gaps are filled at. See this file's header. */
export const BLUEPRINT_DEFAULT_DOSING_TIER: CorrectiveSeverity = 'mild';

/**
 * How important this slot is, in the vocabulary
 * coach_program_template_exercises already has. Derived from the rank the
 * blueprint author gave it rather than stored twice: the top three of a
 * session are its high-priority work, the next three are its middle, and
 * everything after that is what a shortened session drops first.
 */
export function priorityForRank(rank: number): ExercisePrescriptionPriority {
  if (rank <= 3) return 'high';
  if (rank <= 6) return 'medium';
  return 'low';
}

/** One slot as a template exercise. Slot prescription wins; the dosing table fills the gaps. */
export function slotToExercise(
  slot: ProgramBlueprintSlot,
  tier: CorrectiveSeverity = BLUEPRINT_DEFAULT_DOSING_TIER
): TemplateContentExerciseInput | null {
  if (!slot.provider || !slot.external_id || !slot.exercise_name) return null;

  const fallback = blockPrescription(slot.block, tier);

  // A prescription is EITHER a hold OR a rep count, never both — the same
  // rule movement_session_template_slots enforces in the database
  // (migration 153) and the same one the dosing table follows. So once a
  // slot has said which of the two it is, the other is left alone rather
  // than borrowed from the fallback: filling a gap must never turn a
  // 12-rep set into a 12-rep set held for 30 seconds.
  const slotStatesVolume = slot.reps !== null || slot.hold_duration_seconds !== null;
  const reps = slotStatesVolume
    ? slot.reps === null
      ? null
      : String(slot.reps)
    : fallback.reps;
  const repRange = slotStatesVolume ? slot.reps : fallback.rep_range_low;
  const hold = slotStatesVolume ? slot.hold_duration_seconds : fallback.hold_duration_seconds;

  return {
    provider: slot.provider,
    externalId: slot.external_id,
    exerciseName: slot.exercise_name,

    sets: slot.sets ?? fallback.sets,
    reps,
    rep_range_low: repRange,
    rep_range_high: repRange,
    time_seconds: null,
    distance_meters: null,
    rest_seconds: slot.rest_seconds ?? fallback.rest_seconds,
    tempo: slot.tempo ?? fallback.tempo,
    hold_duration_seconds: hold,

    // The fields no authored program has an opinion about. A coach fills
    // these in, and a fabricated number would be worse than a blank —
    // the same rule the corrective engine follows (save.ts).
    rpe: null,
    load: null,
    load_unit: null,
    resistance: null,
    band_color: null,
    // Which side she starts on is hers to choose, so `side` stays null.
    // Whether the set is per side at all is the blueprint's to say
    // (migration 175), and it says so here.
    side: null,
    unilateral: slot.is_per_side === true,
    frequency: null,

    priority: priorityForRank(slot.priority_rank),
    is_required: slot.is_required,

    notes: null,
    coaching_cues: null,
    pain_modification_notes: null,
    alternate_exercises: {},

    // Coach-facing. selection_reasoning is member-visible once published
    // (migration 82), so the slot's purpose is NOT put here; it goes into
    // the template's internal_notes instead.
    selectionReasoning: null,

    // Member-facing, and composed rather than copied for exactly the same
    // reason: the slot's purpose is written for a coach. This says what
    // the movement does for HER, in her words, from the slot's block,
    // movement pattern, per-side mark and rank (migration 176).
    memberReasoning: memberExerciseReasoning({
      block: slot.block,
      movementPattern: slot.movement_pattern,
      isPerSide: slot.is_per_side === true,
      priorityRank: slot.priority_rank,
    }),

    weekOverrides: slot.week_overrides ?? {},
  };
}

/** One weekly session's blocks, in MEF sequence order, with their member-facing labels. */
export function sessionSections(
  blueprint: BlueprintWithSlots,
  session: string,
  tier: CorrectiveSeverity = BLUEPRINT_DEFAULT_DOSING_TIER
): TemplateContentSectionInput[] {
  const slots = slotsForSession(blueprint.slots, session);
  const sections: TemplateContentSectionInput[] = [];

  for (const slot of slots) {
    const exercise = slotToExercise(slot, tier);
    if (!exercise) continue;

    const name = BLUEPRINT_BLOCK_SECTION_NAME[slot.block];
    const last = sections[sections.length - 1];
    if (last && last.name === name) {
      last.exercises.push(exercise);
      continue;
    }
    sections.push({
      name,
      sectionType: SECTION_TYPE_BY_BLOCK[slot.block] as ProgramSectionType,
      // Member-visible once published. An authored program explains
      // itself in its own description, so nothing coach-facing is put
      // here.
      blockReasoning: null,
      exercises: [exercise],
    });
  }

  return sections;
}

/** The equipment a blueprint actually needs, from its own slots rather than from its equipment mode. */
export function blueprintEquipment(blueprint: BlueprintWithSlots): string[] {
  return Array.from(
    new Set(blueprint.slots.flatMap((slot) => slot.equipment_requirement))
  ).sort();
}

/** The coach-only record of what this program is and who it is for. Never member-visible. */
export function blueprintInternalNotes(blueprint: BlueprintWithSlots, session: string): string {
  const lines = [
    `Named program: ${blueprint.program.display_name}, version ${blueprint.version_number} (${blueprint.status}). Weekly session ${session}.`,
  ];
  if (blueprint.coach_purpose) lines.push(`Purpose: ${blueprint.coach_purpose}`);
  if (blueprint.intended_population) lines.push(`Intended for: ${blueprint.intended_population}`);
  if (blueprint.cautions) lines.push(`Cautions: ${blueprint.cautions}`);

  const slotNotes = slotsForSession(blueprint.slots, session)
    .filter((slot) => slot.purpose && slot.exercise_name)
    .map((slot) => `  ${slot.slot_order}. ${slot.exercise_name}: ${slot.purpose}`);
  if (slotNotes.length > 0) lines.push('Slot notes:', ...slotNotes);

  return lines.join('\n');
}

export interface BlueprintMaterializationInput {
  blueprint: BlueprintWithSlots;
  coachId: string;
  memberId: string;
  /** Defaults to a fresh `named-program:<uuid>`. Passed in only where a caller needs to know it before the write. */
  programGroupTag?: string;
  /** Which column of the dosing table fills gaps. See this file's header. */
  dosingTier?: CorrectiveSeverity;
}

/** The sessions of a blueprint, ready for the shared materializer. Pure: builds the input, writes nothing. */
export function blueprintSessions(
  input: BlueprintMaterializationInput,
  programGroupTag: string
): MaterializeSessionInput[] {
  const { blueprint, memberId } = input;
  const tier = input.dosingTier ?? BLUEPRINT_DEFAULT_DOSING_TIER;
  const title = blueprint.member_title ?? blueprint.program.display_name;
  const equipment = blueprintEquipment(blueprint);

  return sessionDesignationsOf(blueprint.slots).map((session) => {
    const meta: TemplateMetaInput = {
      name: `${title}: Session ${session}`,
      // Authored on the blueprint, copied through unchanged. Not composed
      // and not mapped: an authored program says what it is in its own
      // words.
      description: blueprint.member_description,
      goal: 'strength',
      difficulty: 'beginner',
      estimatedDurationMinutes: null,
      equipment,
      programTags: [
        programGroupTag,
        NAMED_PROGRAM_TAG,
        `${NAMED_PROGRAM_VERSION_TAG_PREFIX}${blueprint.id}`,
        `named-program-member:${memberId}`,
      ],
      // A named program is not a corrective one. Leaving this empty is
      // what stops lib/programs/memberPresentation.ts renaming it after a
      // postural pattern it does not have.
      correctiveTags: [],
      movementTags: [blueprint.program.key],
      targetMuscles: [],
      // Member-visible; a coach writes in it on review.
      coachNotes: null,
      internalNotes: blueprintInternalNotes(blueprint, session),
      memberInstructions: null,
    };

    return { templateMeta: meta, sections: sessionSections(blueprint, session, tier) };
  });
}

export interface MaterializedBlueprintProgram {
  programGroupTag: string;
  templateIds: string[];
  blueprintVersionId: string;
}

/**
 * Materializes a blueprint into templates for one member, through the
 * shared materializer. Creates nothing else: no assignment, no occurrence,
 * nothing member-visible. The templates land in 'pending_coach_review',
 * exactly where a generated corrective draft lands, and a human takes it
 * from there.
 */
export async function materializeBlueprint(
  supabase: SupabaseClient,
  input: BlueprintMaterializationInput
): Promise<MaterializedBlueprintProgram> {
  const programGroupTag =
    input.programGroupTag ?? `${NAMED_PROGRAM_GROUP_TAG_PREFIX}${crypto.randomUUID()}`;

  const { templateIds } = await materializeProgram(supabase, {
    coachId: input.coachId,
    status: 'pending_coach_review',
    sessions: blueprintSessions(input, programGroupTag),
  });

  return { programGroupTag, templateIds, blueprintVersionId: input.blueprint.id };
}
