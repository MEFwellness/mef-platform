/**
 * How a blueprint changes over time.
 *
 * THE RULE. A draft is edited in place, because nobody has ever been given
 * it. An approved version is never edited: editing one produces the NEXT
 * version, in draft, with the current version's slots copied into it. An
 * assignment records the version id it was materialized from
 * (coach_program_assignments.source_blueprint_version_id), so the exact
 * content somebody was given is always still there to read, even after the
 * program has moved on three versions.
 *
 * Archiving is the end of a version's assignable life and nothing more.
 * An archived version starts nothing new; every assignment already made
 * from it keeps running, keeps its frozen snapshot, and keeps pointing at
 * it. Nothing is deleted, ever.
 *
 * Writes here need the platform_administrator role: movement_program_
 * versions and program_blueprint_slots have exactly one write policy each
 * and it is the admin one (migration 174). A coach reads blueprints and
 * assigns from them; a coach does not author them.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  BlueprintEquipmentMode,
  BlueprintPeriodization,
  BlueprintWithSlots,
  MovementProgram,
  MovementProgramVersion,
  ProgramBlueprintSlot,
} from '@mef/shared-types-contracts';
import { getBlueprintVersion } from './data';

/** The version fields an edit may change. Anything absent is left as it is. */
export interface BlueprintVersionEdits {
  displayName?: string;
  notes?: string | null;
  memberTitle?: string | null;
  memberDescription?: string | null;
  coachPurpose?: string | null;
  intendedPopulation?: string | null;
  cautions?: string | null;
  durationWeeks?: number | null;
  sessionsPerWeek?: number | null;
  equipmentMode?: BlueprintEquipmentMode | null;
  periodization?: BlueprintPeriodization | null;
}

function editsToColumns(edits: BlueprintVersionEdits): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (edits.displayName !== undefined) patch.display_name = edits.displayName;
  if (edits.notes !== undefined) patch.notes = edits.notes;
  if (edits.memberTitle !== undefined) patch.member_title = edits.memberTitle;
  if (edits.memberDescription !== undefined) patch.member_description = edits.memberDescription;
  if (edits.coachPurpose !== undefined) patch.coach_purpose = edits.coachPurpose;
  if (edits.intendedPopulation !== undefined) patch.intended_population = edits.intendedPopulation;
  if (edits.cautions !== undefined) patch.cautions = edits.cautions;
  if (edits.durationWeeks !== undefined) patch.duration_weeks = edits.durationWeeks;
  if (edits.sessionsPerWeek !== undefined) patch.sessions_per_week = edits.sessionsPerWeek;
  if (edits.equipmentMode !== undefined) patch.equipment_mode = edits.equipmentMode;
  if (edits.periodization !== undefined) patch.periodization = edits.periodization;
  return patch;
}

/** Copies one version's slots onto another version, unchanged apart from which version they belong to. */
async function copySlots(
  supabase: SupabaseClient,
  slots: ProgramBlueprintSlot[],
  toVersionId: string
): Promise<boolean> {
  if (slots.length === 0) return true;
  const { error } = await supabase.from('program_blueprint_slots').insert(
    slots.map((slot) => ({
      program_version_id: toVersionId,
      session_designation: slot.session_designation,
      slot_order: slot.slot_order,
      block: slot.block,
      movement_pattern: slot.movement_pattern,
      purpose: slot.purpose,
      priority_rank: slot.priority_rank,
      is_required: slot.is_required,
      equipment_requirement: slot.equipment_requirement,
      difficulty_tier: slot.difficulty_tier,
      eligibility_rules: slot.eligibility_rules,
      is_locked: slot.is_locked,
      replacement_criteria: slot.replacement_criteria,
      is_per_side: slot.is_per_side,
      sets: slot.sets,
      reps: slot.reps,
      hold_duration_seconds: slot.hold_duration_seconds,
      tempo: slot.tempo,
      rest_seconds: slot.rest_seconds,
      week_overrides: slot.week_overrides,
      provider: slot.provider,
      external_id: slot.external_id,
      exercise_name: slot.exercise_name,
    }))
  );
  if (error) {
    console.error('copySlots failed', error);
    return false;
  }
  return true;
}

/**
 * Edits a blueprint. A draft changes in place; an approved version gets a
 * successor. Returns the version that now holds the edit, which is the
 * caller's cue for which one to keep working on.
 *
 * An archived version is not editable: reviving one would quietly make an
 * assignment's recorded lineage mean something other than what it meant
 * when it was recorded.
 */
export async function editBlueprintVersion(
  supabase: SupabaseClient,
  versionId: string,
  edits: BlueprintVersionEdits,
  editorId: string
): Promise<BlueprintWithSlots | null> {
  const current = await getBlueprintVersion(supabase, versionId);
  if (!current) return null;

  if (current.status === 'archived') {
    console.error('editBlueprintVersion: an archived version is not editable', versionId);
    return null;
  }

  if (current.status === 'draft') {
    const { error } = await supabase
      .from('movement_program_versions')
      .update({
        ...editsToColumns(edits),
        updated_by: editorId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', versionId);
    if (error) {
      console.error('editBlueprintVersion (draft update) failed', error);
      return null;
    }
    return getBlueprintVersion(supabase, versionId);
  }

  return createNextVersion(supabase, current, edits, editorId);
}

/**
 * The next version of an approved blueprint: a fresh draft carrying the
 * current content plus the edit, and a copy of every slot. The approved
 * version is not touched, so anything already assigned from it still reads
 * exactly what it was given.
 */
export async function createNextVersion(
  supabase: SupabaseClient,
  current: BlueprintWithSlots,
  edits: BlueprintVersionEdits,
  editorId: string
): Promise<BlueprintWithSlots | null> {
  const { data: siblings, error: siblingError } = await supabase
    .from('movement_program_versions')
    .select('version_number')
    .eq('program_id', current.program_id)
    .order('version_number', { ascending: false })
    .limit(1);
  if (siblingError) {
    console.error('createNextVersion (max version) failed', siblingError);
    return null;
  }
  const nextNumber = ((siblings as { version_number: number }[] | null)?.[0]?.version_number ?? 0) + 1;

  const base = {
    program_id: current.program_id,
    version_number: nextNumber,
    display_name: current.display_name,
    status: 'draft',
    notes: current.notes,
    member_title: current.member_title,
    member_description: current.member_description,
    coach_purpose: current.coach_purpose,
    intended_population: current.intended_population,
    cautions: current.cautions,
    duration_weeks: current.duration_weeks,
    sessions_per_week: current.sessions_per_week,
    equipment_mode: current.equipment_mode,
    periodization: current.periodization,
    created_by: editorId,
    updated_by: editorId,
  };

  const { data: created, error } = await supabase
    .from('movement_program_versions')
    .insert({ ...base, ...editsToColumns(edits) })
    .select('*')
    .single();
  if (error || !created) {
    console.error('createNextVersion (insert) failed', error);
    return null;
  }

  const copied = await copySlots(supabase, current.slots, (created as MovementProgramVersion).id);
  if (!copied) {
    // No half a blueprint: a version with some of its slots would look
    // like an authored program with holes in it.
    await supabase
      .from('movement_program_versions')
      .delete()
      .eq('id', (created as MovementProgramVersion).id);
    return null;
  }

  return getBlueprintVersion(supabase, (created as MovementProgramVersion).id);
}

/** Draft to approved. Approval is attributable by database constraint: approved_at and approved_by are not optional once the status is. */
export async function approveBlueprintVersion(
  supabase: SupabaseClient,
  versionId: string,
  approverId: string
): Promise<boolean> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('movement_program_versions')
    .update({
      status: 'approved',
      approved_at: now,
      approved_by: approverId,
      updated_by: approverId,
      updated_at: now,
    })
    .eq('id', versionId)
    .eq('status', 'draft');
  if (error) {
    console.error('approveBlueprintVersion failed', error);
    return false;
  }
  return true;
}

/**
 * A key from a display name: lowercase, words joined by underscores. The
 * same shape the seeded blueprints use (`home_dumbbell_foundation`), so a
 * duplicated program looks like an authored one rather than like a copy.
 */
export function blueprintKeyFromName(displayName: string): string {
  const base = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return base || 'blueprint';
}

/** A key nothing else is using, by adding `_2`, `_3` and so on until one is free. */
export async function availableBlueprintKey(
  supabase: SupabaseClient,
  desired: string
): Promise<string> {
  const { data, error } = await supabase
    .from('movement_programs')
    .select('key')
    .like('key', `${desired}%`);
  if (error) {
    console.error('availableBlueprintKey failed', error);
    return `${desired}_${Date.now()}`;
  }
  const taken = new Set(((data as { key: string }[] | null) ?? []).map((r) => r.key));
  if (!taken.has(desired)) return desired;
  for (let suffix = 2; suffix < 1000; suffix++) {
    const candidate = `${desired}_${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${desired}_${Date.now()}`;
}

/**
 * A whole new named program under a new name, carrying a copy of an
 * existing version's content as its own version 1, in draft.
 *
 * Not the same thing as createNextVersion. That one keeps the program and
 * moves it forward; this one starts a separate program that happens to
 * begin from the same lineup. Nothing about the original changes, and an
 * assignment made from the original still points at the original.
 */
export async function duplicateBlueprint(
  supabase: SupabaseClient,
  sourceVersionId: string,
  newDisplayName: string,
  actorId: string
): Promise<BlueprintWithSlots | null> {
  const source = await getBlueprintVersion(supabase, sourceVersionId);
  if (!source) return null;

  const name = newDisplayName.trim();
  if (!name) {
    console.error('duplicateBlueprint: a duplicate needs a name of its own');
    return null;
  }

  const key = await availableBlueprintKey(supabase, blueprintKeyFromName(name));

  const { data: program, error: programError } = await supabase
    .from('movement_programs')
    .insert({
      key,
      display_name: name,
      internal_name: `${name} (duplicated from ${source.program.display_name} v${source.version_number})`,
      created_by: actorId,
    })
    .select('*')
    .single();
  if (programError || !program) {
    console.error('duplicateBlueprint (program) failed', programError);
    return null;
  }

  const { data: version, error: versionError } = await supabase
    .from('movement_program_versions')
    .insert({
      program_id: (program as MovementProgram).id,
      version_number: 1,
      display_name: `${name} v1`,
      status: 'draft',
      notes: `Duplicated from ${source.program.display_name} v${source.version_number}.`,
      member_title: name,
      member_description: source.member_description,
      coach_purpose: source.coach_purpose,
      intended_population: source.intended_population,
      cautions: source.cautions,
      duration_weeks: source.duration_weeks,
      sessions_per_week: source.sessions_per_week,
      equipment_mode: source.equipment_mode,
      periodization: source.periodization,
      created_by: actorId,
      updated_by: actorId,
    })
    .select('*')
    .single();
  if (versionError || !version) {
    console.error('duplicateBlueprint (version) failed', versionError);
    await supabase.from('movement_programs').delete().eq('id', (program as MovementProgram).id);
    return null;
  }

  const copied = await copySlots(supabase, source.slots, (version as MovementProgramVersion).id);
  if (!copied) {
    // Same rule as createNextVersion: no half a blueprint.
    await supabase.from('movement_programs').delete().eq('id', (program as MovementProgram).id);
    return null;
  }

  return getBlueprintVersion(supabase, (version as MovementProgramVersion).id);
}

/** Retires a version. Starts nothing new; changes nothing already running. */
export async function archiveBlueprintVersion(
  supabase: SupabaseClient,
  versionId: string,
  actorId: string
): Promise<boolean> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('movement_program_versions')
    .update({ status: 'archived', archived_at: now, updated_by: actorId, updated_at: now })
    .eq('id', versionId);
  if (error) {
    console.error('archiveBlueprintVersion failed', error);
    return false;
  }
  return true;
}
