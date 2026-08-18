/**
 * A program a coach just edited, saved back as a new DRAFT blueprint for an
 * administrator to review.
 *
 * This is the return path. Blueprints go out to members through the assign
 * flow; this is how something a coach worked out in front of a real member
 * comes back and becomes a named program other members can be given. It
 * captures what the coach ended up with, not what she started from: the
 * swaps, the prescriptions as she left them, the per week plan she kept.
 *
 * WHAT IT DELIBERATELY DOES NOT DO.
 *
 * It never approves anything. What it writes is a draft, and a draft is
 * unassignable by the gate in assign.ts and unwritable-past-draft by the
 * database: migration 175 gives a coach an INSERT policy on these tables
 * and no update or delete policy at all. So a coach can put a proposal on
 * an administrator's desk and cannot do anything else with it, including
 * to her own proposal, once it is written.
 *
 * It never carries the member across. The program is saved as a program,
 * not as this member's program: no member id, no notes about her, no
 * corrective tags. What survives is the lineup and the dosing.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BlueprintPeriodization, BlueprintWithSlots, MovementProgram, MovementProgramVersion } from '@mef/shared-types-contracts';
import { getBlueprintVersion } from './data';
import { availableBlueprintKey, blueprintKeyFromName } from './versioning';
import type { PlannedSession } from './plan';

export interface SaveAsBlueprintInput {
  sessions: PlannedSession[];
  /** The name the new blueprint is filed under. Required: a proposal with no name is unfindable. */
  displayName: string;
  /** What a member would read. Defaults to the display name. */
  memberTitle?: string | null;
  memberDescription?: string | null;
  /** Coach-facing. Why this program exists and who it is for. */
  coachPurpose?: string | null;
  intendedPopulation?: string | null;
  cautions?: string | null;
  durationWeeks: number;
  equipmentMode?: 'home' | 'gym' | 'mixed';
  periodization?: BlueprintPeriodization | null;
  /** Free text an administrator reads first. */
  notes?: string | null;
  coachId: string;
}

/**
 * Writes the plan as a new program plus its version 1, in draft, with one
 * slot per exercise.
 *
 * The blueprint columns a plan has no answer for are filled the way the
 * authored blueprints fill them: rank follows the order strength and core
 * come in (the rebalance rule, so a shortened session drops the opener
 * first), nothing is locked, and no slot carries replacement criteria
 * beyond its block. An administrator tightens those when reviewing.
 */
export async function saveProgramAsBlueprintDraft(
  supabase: SupabaseClient,
  input: SaveAsBlueprintInput
): Promise<BlueprintWithSlots | null> {
  const name = input.displayName.trim();
  if (!name) {
    console.error('saveProgramAsBlueprintDraft: a blueprint needs a name');
    return null;
  }
  const sessions = input.sessions.filter((session) => session.exercises.length > 0);
  if (sessions.length === 0) {
    console.error('saveProgramAsBlueprintDraft: nothing to save');
    return null;
  }

  const key = await availableBlueprintKey(supabase, blueprintKeyFromName(name));

  const { data: program, error: programError } = await supabase
    .from('movement_programs')
    .insert({
      key,
      display_name: name,
      internal_name: `${name} (proposed from a coach's assign flow)`,
      created_by: input.coachId,
    })
    .select('*')
    .single();
  if (programError || !program) {
    console.error('saveProgramAsBlueprintDraft (program) failed', programError);
    return null;
  }
  const programId = (program as MovementProgram).id;

  const { data: version, error: versionError } = await supabase
    .from('movement_program_versions')
    .insert({
      program_id: programId,
      version_number: 1,
      display_name: `${name} v1`,
      status: 'draft',
      notes:
        input.notes ??
        'Proposed by a coach from the assign flow. Not assignable until an administrator approves it.',
      member_title: input.memberTitle ?? name,
      member_description: input.memberDescription ?? null,
      coach_purpose: input.coachPurpose ?? null,
      intended_population: input.intendedPopulation ?? null,
      cautions: input.cautions ?? null,
      duration_weeks: input.durationWeeks,
      sessions_per_week: sessions.length,
      equipment_mode: input.equipmentMode ?? 'home',
      periodization: input.periodization ?? null,
      created_by: input.coachId,
      updated_by: input.coachId,
    })
    .select('*')
    .single();
  if (versionError || !version) {
    console.error('saveProgramAsBlueprintDraft (version) failed', versionError);
    await supabase.from('movement_programs').delete().eq('id', programId);
    return null;
  }
  const versionId = (version as MovementProgramVersion).id;

  const rows = sessions.flatMap((session, sessionIndex) => {
    const designation = /^[A-Z]$/.test(session.session)
      ? session.session
      : String.fromCharCode(65 + sessionIndex);

    // Strength and core take the top ranks, in the order they appear;
    // the opener takes what is left. Same rule the authored blueprints
    // follow, so a shortened session drops the opener first.
    const ordered = session.exercises
      .map((exercise, index) => ({ exercise, index }))
      .sort((a, b) => {
        const aTop = a.exercise.block === 'strength' || a.exercise.block === 'core' ? 0 : 1;
        const bTop = b.exercise.block === 'strength' || b.exercise.block === 'core' ? 0 : 1;
        if (aTop !== bTop) return aTop - bTop;
        return a.index - b.index;
      });
    const rankByIndex = new Map(ordered.map((entry, rank) => [entry.index, rank + 1]));

    return session.exercises.map((exercise, index) => ({
      program_version_id: versionId,
      session_designation: designation,
      slot_order: index + 1,
      block: exercise.block,
      movement_pattern: null,
      purpose: exercise.purpose,
      priority_rank: rankByIndex.get(index) ?? index + 1,
      is_required: true,
      equipment_requirement: [] as string[],
      difficulty_tier: null,
      eligibility_rules: {},
      is_locked: false,
      replacement_criteria: {},
      is_per_side: exercise.isPerSide,
      sets: exercise.prescription.sets,
      reps: exercise.prescription.reps,
      hold_duration_seconds: exercise.prescription.holdSeconds,
      tempo: exercise.prescription.tempo,
      rest_seconds: exercise.prescription.restSeconds,
      week_overrides: exercise.weekOverrides ?? {},
      provider: exercise.provider,
      external_id: exercise.externalId,
      exercise_name: exercise.exerciseName,
    }));
  });

  const { error: slotError } = await supabase.from('program_blueprint_slots').insert(rows);
  if (slotError) {
    console.error('saveProgramAsBlueprintDraft (slots) failed', slotError);
    // No half a blueprint. Deleting the program cascades the version and
    // whatever slots did land.
    await supabase.from('movement_programs').delete().eq('id', programId);
    return null;
  }

  return getBlueprintVersion(supabase, versionId);
}
