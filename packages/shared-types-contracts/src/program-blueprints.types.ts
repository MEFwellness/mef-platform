/**
 * Named program blueprints — shared types for movement_programs,
 * movement_program_versions and program_blueprint_slots
 * (supabase/migrations/00000000000174_named_program_blueprints.sql).
 *
 * Same convention as every other *.types.ts here: hand-authored row
 * contracts only. The logic lives in
 * apps/consumer-web-app/lib/programs/blueprints/.
 *
 * A blueprint is MEF-authored content, not a coach's or a member's. None
 * of these rows is ever readable by a member: she reads the frozen
 * coach_assigned_workouts an assignment materialized for her, exactly as
 * she does for a corrective program.
 */

import type { ExerciseLibraryProvider } from './exercise-library.types';
import type { ProgramDifficulty, ProgramWeekOverride } from './coach-program-builder.types';

/** draft is authored and unassignable, approved is assignable, archived keeps its history and starts nothing new. */
export type BlueprintStatus = 'draft' | 'approved' | 'archived';

export type BlueprintEquipmentMode = 'home' | 'gym' | 'mixed';

/**
 * The MEF session sequence, shared with the corrective engine
 * (lib/corrective-engine/types.ts SessionBlockType) rather than restated,
 * so one program sequence exists in this system instead of two.
 */
export type BlueprintBlock = 'release' | 'mobility' | 'stability' | 'strength' | 'core';

/** Identity only. The content lives on the version. */
export interface MovementProgram {
  id: string;
  key: string;
  display_name: string;
  internal_name: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MovementProgramVersion {
  id: string;
  program_id: string;
  version_number: number;
  display_name: string;
  status: BlueprintStatus;
  notes: string | null;

  /** What a member reads. Authored, never derived from a finding. */
  member_title: string | null;
  member_description: string | null;

  /** Coach-facing. Never rendered to a member by any code path. */
  coach_purpose: string | null;
  intended_population: string | null;
  cautions: string | null;

  duration_weeks: number | null;
  sessions_per_week: number | null;
  equipment_mode: BlueprintEquipmentMode | null;

  created_by: string | null;
  updated_by: string | null;
  approved_at: string | null;
  approved_by: string | null;
  archived_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * What a per-week override may change, keyed by week number as a string,
 * e.g. { "3": { sets: 4 } }. The override shape is ProgramWeekOverride
 * from coach-program-builder.types, not a second copy of it: the blueprint
 * slot and the template exercise it materializes into have to agree on
 * exactly what is overridable, so they share one type.
 */
export type BlueprintWeekOverrides = Record<string, ProgramWeekOverride>;

export interface ProgramBlueprintSlot {
  id: string;
  program_version_id: string;

  /** 'A' | 'B' | 'C' ... which weekly session this slot belongs to. */
  session_designation: string;
  slot_order: number;
  block: BlueprintBlock;

  movement_pattern: string | null;
  /** Coach-facing. Deliberately never written into a member-visible field. */
  purpose: string | null;

  /** 1 = most important. Unique and contiguous within a session. */
  priority_rank: number;
  is_required: boolean;

  equipment_requirement: string[];
  difficulty_tier: ProgramDifficulty | null;

  /** Reserved for readiness and eligibility work. Empty on every slot today. */
  eligibility_rules: Record<string, unknown>;

  is_locked: boolean;
  replacement_criteria: Record<string, unknown>;

  sets: number | null;
  reps: number | null;
  hold_duration_seconds: number | null;
  tempo: string | null;
  rest_seconds: number | null;

  week_overrides: BlueprintWeekOverrides;

  /** Null while a slot is authored but not yet filled. All three or none. */
  provider: ExerciseLibraryProvider | null;
  external_id: string | null;
  exercise_name: string | null;

  created_at: string;
  updated_at: string;
}

/** A blueprint version hydrated with its slots, ordered by session then slot order. */
export interface BlueprintWithSlots extends MovementProgramVersion {
  program: MovementProgram;
  slots: ProgramBlueprintSlot[];
}
