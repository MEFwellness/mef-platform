/**
 * Coach Program Builder and Workout Prescription System — shared types for
 * coach_program_templates, coach_program_template_sections, coach_program_
 * template_exercises, coach_program_assignments, coach_assigned_workouts,
 * coach_assigned_workout_sections, and coach_assigned_workout_exercises
 * (supabase/migrations/00000000000082_coach_program_builder.sql). Same
 * convention as every other *.types.ts file here: hand-authored, row/type
 * contracts only — logic lives in
 * apps/consumer-web-app/lib/coach-program-builder/.
 *
 * See the migration's own header for the core invariant: template rows are
 * mutable and evolve; assigned-workout rows are frozen copies taken at
 * assignment time and never re-read from the template afterward.
 */

import type { ExerciseLibraryProvider } from './exercise-library.types';

export type ProgramDifficulty = 'beginner' | 'intermediate' | 'advanced';
/** 'pending_coach_review' is set only by the Corrective Program Generator Engine (lib/corrective-engine/) — a coach-authored-from-scratch template never starts there and no app code ever transitions a template into it besides that engine. See migration 131. */
export type ProgramTemplateStatus = 'draft' | 'active' | 'archived' | 'pending_coach_review';

export type ProgramSectionType =
  | 'warm_up'
  | 'mobility'
  | 'activation'
  | 'corrective'
  | 'strength'
  | 'conditioning'
  | 'cardio'
  | 'core'
  | 'cooldown'
  | 'recovery'
  | 'custom';

export type ExercisePrescriptionSide = 'left' | 'right' | 'both' | 'alternating';
export type ExercisePrescriptionLoadUnit = 'lbs' | 'kg' | 'bodyweight' | 'band' | 'other';
export type ExercisePrescriptionPriority = 'high' | 'medium' | 'low';

/** One optional alternate-exercise reference — used for regression/progression/replacement. */
export interface AlternateExerciseRef {
  provider: ExerciseLibraryProvider;
  externalId: string;
  name: string;
}

export interface AlternateExercises {
  regression?: AlternateExerciseRef;
  progression?: AlternateExerciseRef;
  replacement?: AlternateExerciseRef;
}

/** The full prescription field set — identical shape on template exercises and their frozen assigned-workout copies. */
export interface ExercisePrescriptionFields {
  sets: number | null;
  reps: string | null;
  rep_range_low: number | null;
  rep_range_high: number | null;
  time_seconds: number | null;
  distance_meters: number | null;
  rest_seconds: number | null;
  tempo: string | null;
  rpe: number | null;
  load: string | null;
  load_unit: ExercisePrescriptionLoadUnit | null;
  resistance: string | null;
  band_color: string | null;
  side: ExercisePrescriptionSide | null;
  unilateral: boolean;
  hold_duration_seconds: number | null;
  frequency: string | null;
  priority: ExercisePrescriptionPriority;
  is_required: boolean;
  notes: string | null;
  coaching_cues: string | null;
  pain_modification_notes: string | null;
  alternate_exercises: AlternateExercises;
}

export interface CoachProgramTemplate {
  id: string;
  coach_id: string;
  name: string;
  description: string | null;
  goal: string | null;
  difficulty: ProgramDifficulty | null;
  estimated_duration_minutes: number | null;
  equipment: string[];
  program_tags: string[];
  corrective_tags: string[];
  movement_tags: string[];
  target_muscles: string[];
  coach_notes: string | null;
  internal_notes: string | null;
  member_instructions: string | null;
  status: ProgramTemplateStatus;
  is_favorited: boolean;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface CoachProgramTemplateSection {
  id: string;
  template_id: string;
  coach_id: string;
  name: string;
  section_type: ProgramSectionType;
  sequence_index: number;
  /** Why this block/section exists — populated only when the section came from the Prescription Intelligence Engine; null for anything a coach built from scratch. */
  block_reasoning: string | null;
  created_at: string;
  updated_at: string;
}

export interface CoachProgramTemplateExercise extends ExercisePrescriptionFields {
  id: string;
  section_id: string;
  template_id: string;
  coach_id: string;
  provider: ExerciseLibraryProvider;
  external_id: string;
  exercise_name: string;
  sequence_index: number;
  /** Why this exercise was selected — populated only when it came from the Prescription Intelligence Engine; null for anything a coach picked by hand. */
  selection_reasoning: string | null;
  /**
   * The same question answered for the MEMBER (migration 176): what the
   * movement does for her body and why it is in her plan, in her language.
   * Composed by rule in lib/programs/explain/exerciseReasoning.ts and
   * editable by a coach during review. Never a pattern name and never
   * clinical vocabulary; `selection_reasoning` above keeps all of that,
   * unchanged, for the coach screens.
   */
  member_reasoning: string | null;
  /** True only when a coach explicitly chose this via the Corrective Programs review screen's "show full library" override picker instead of the slot's engine-qualified default candidates (migration 132). Always false for anything else. */
  is_coach_override: boolean;
  /**
   * Per scheduled week prescription changes carried from a blueprint slot,
   * e.g. { "3": { sets: 4 } } (migration 174). Resolved into the frozen
   * assigned-workout rows at assignment time, never consulted at read time.
   * Empty for everything the corrective engine and the builder UI write.
   */
  week_overrides: Record<string, ProgramWeekOverride>;
  /**
   * What the blueprint slot this exercise came from was FOR (migration
   * 177), carried down so a swap can be judged against the row itself.
   * Null / false / empty on everything the corrective engine writes, which
   * is what "no recorded pattern, no lock, no extra criteria" has always
   * meant.
   */
  movement_pattern: string | null;
  is_locked: boolean;
  replacement_criteria: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** The prescription fields a per-week progression may change. Anything else would make week 3 a different program rather than a progression. */
export interface ProgramWeekOverride {
  sets?: number;
  reps?: number;
  hold_duration_seconds?: number;
  tempo?: string;
  rest_seconds?: number;
}

/** A full template hydrated with its sections and exercises, ordered — the shape the builder UI and the assignment snapshot logic both work with. */
export interface CoachProgramTemplateWithContent extends CoachProgramTemplate {
  sections: (CoachProgramTemplateSection & { exercises: CoachProgramTemplateExercise[] })[];
}

export type ProgramScheduleType =
  'single' | 'weekly' | 'multiple_weeks' | 'specific_dates' | 'repeating';

export type ProgramScheduleConfig =
  | { type: 'single'; date: string }
  | { type: 'weekly'; startDate: string; daysOfWeek: number[]; weeks: number }
  | { type: 'multiple_weeks'; startDate: string; daysOfWeek: number[]; weeks: number }
  | { type: 'specific_dates'; dates: string[] }
  | { type: 'repeating'; startDate: string; endDate: string; everyNDays: number };

export type ProgramAssignmentVisibility = 'draft' | 'published';

/**
 * The six states a program really has (migration 172). 'upcoming' and
 * 'paused' are non-terminal; 'completed', 'replaced' and 'cancelled' are
 * terminal and a program never leaves them.
 *
 * Anything that means "her program right now" must read ACTIVE_PROGRAM_
 * ASSIGNMENT_STATUSES rather than testing for 'active' by hand — a paused
 * program is still the program she is on, and a completed one is never
 * active again.
 */
export type ProgramAssignmentStatus =
  | 'upcoming'
  | 'active'
  | 'paused'
  | 'completed'
  | 'replaced'
  | 'cancelled';

/** Statuses a program can still leave. Nothing else ever transitions. */
export const LIVE_PROGRAM_ASSIGNMENT_STATUSES = [
  'upcoming',
  'active',
  'paused',
] as const satisfies readonly ProgramAssignmentStatus[];

/** Statuses a program never leaves. */
export const TERMINAL_PROGRAM_ASSIGNMENT_STATUSES = [
  'completed',
  'replaced',
  'cancelled',
] as const satisfies readonly ProgramAssignmentStatus[];

/** "The program she is on" — running now, or held by her coach and resumable. Not upcoming, which has not started. */
export const ACTIVE_PROGRAM_ASSIGNMENT_STATUSES = [
  'active',
  'paused',
] as const satisfies readonly ProgramAssignmentStatus[];

export function isTerminalProgramAssignmentStatus(status: ProgramAssignmentStatus): boolean {
  return (TERMINAL_PROGRAM_ASSIGNMENT_STATUSES as readonly string[]).includes(status);
}

export interface CoachProgramAssignment {
  id: string;
  member_id: string;
  coach_id: string;
  template_id: string | null;
  template_name_snapshot: string;
  schedule_type: ProgramScheduleType;
  schedule_config: ProgramScheduleConfig;
  visibility: ProgramAssignmentVisibility;
  published_at: string | null;
  assignment_notes: string | null;
  internal_notes: string | null;
  /**
   * Why this program, written for the member (migration 176). Composed by
   * rule at assignment time, edited by the coach before and after
   * assigning, and read by the member through member_program_lifecycle.
   * Null on every program assigned before this existed, which renders as
   * the interim composed blurb exactly as it did.
   */
  member_explanation: string | null;
  status: ProgramAssignmentStatus;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
  cancelled_by: string | null;

  // --- Lifecycle (migration 172) ---
  /** YYYY-MM-DD the program runs from. */
  start_date: string | null;
  /** YYYY-MM-DD the program's last day, inclusive. Always start_date + duration_weeks whole weeks, extended by any days paused. */
  end_date: string | null;
  duration_weeks: number | null;
  /** 1..duration_weeks. Written by the daily lifecycle job, never re-derived at read time. */
  current_week: number | null;
  /** Total days spent paused; end_date carries the same extension. */
  paused_days: number;
  started_at: string | null;
  completed_at: string | null;
  paused_at: string | null;
  resumed_at: string | null;
  replaced_at: string | null;
  /** Lineage — the program that superseded this one. Never deleted, never cascaded away. */
  replaced_by_assignment_id: string | null;
  /** Which assignments are one program. A corrective program is one assignment per weekly session; they share this key. */
  program_group_key: string | null;

  /** Lineage only (migration 174) — which blueprint version this program was materialized from. Null for a corrective or hand-built program, and never read to render a workout. */
  source_blueprint_version_id: string | null;
}

/**
 * The lifecycle columns of a member's own published program, as served by
 * the `member_program_lifecycle` view (migration 172). Deliberately a
 * narrower shape than CoachProgramAssignment: assignment_notes and
 * internal_notes are coach-only and are not in the view's select list at
 * all.
 */
export interface MemberProgramLifecycle {
  id: string;
  member_id: string;
  template_name_snapshot: string;
  program_group_key: string | null;
  status: ProgramAssignmentStatus;
  start_date: string | null;
  end_date: string | null;
  duration_weeks: number | null;
  current_week: number | null;
  paused_days: number;
  started_at: string | null;
  completed_at: string | null;
  paused_at: string | null;
  resumed_at: string | null;
  replaced_at: string | null;
  replaced_by_assignment_id: string | null;
  schedule_type: ProgramScheduleType;
  schedule_config: ProgramScheduleConfig;
  published_at: string | null;
  /** Why this program, written for her (migration 176). Null for every program assigned before the explanation layer existed. */
  member_explanation: string | null;
  created_at: string;
  updated_at: string;
}

export type AssignedWorkoutStatus =
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'skipped'
  | 'partially_completed'
  /**
   * She reported pain or discomfort on this exercise and it was stopped
   * (migration 177). Deliberately not a synonym for 'skipped': a skip is
   * "not today", a stop is "this one hurt and I am not doing it until my
   * coach has looked at it", and the coach is flagged for the second one.
   */
  | 'stopped';

export interface CoachAssignedWorkout {
  id: string;
  assignment_id: string;
  member_id: string;
  coach_id: string;
  scheduled_date: string;
  occurrence_label: string | null;
  template_name: string;
  description: string | null;
  goal: string | null;
  difficulty: ProgramDifficulty | null;
  estimated_duration_minutes: number | null;
  equipment: string[];
  program_tags: string[];
  corrective_tags: string[];
  movement_tags: string[];
  target_muscles: string[];
  member_instructions: string | null;
  coach_notes: string | null;
  internal_notes: string | null;
  status: AssignedWorkoutStatus;
  started_at: string | null;
  completed_at: string | null;
  skipped_at: string | null;
  member_feedback: string | null;
  published_at: string | null;
  /** Lineage only — the engine run this workout was materialized from, when it came from the Prescription Intelligence Engine; null for anything a coach built from scratch. Never re-read to render this workout. */
  source_prescription_snapshot_id: string | null;
  /** Which week of the program this occurrence belongs to, counted from the assignment's start date (migration 174). Written once at assignment time, alongside the resolved per-week prescription. */
  program_week: number | null;
  created_at: string;
  updated_at: string;
}

export interface CoachAssignedWorkoutSection {
  id: string;
  assigned_workout_id: string;
  member_id: string;
  coach_id: string;
  name: string;
  section_type: ProgramSectionType;
  sequence_index: number;
  /** Why this block/section exists — member-visible once the workout is published. Null for anything a coach built from scratch. */
  block_reasoning: string | null;
  created_at: string;
}

export interface CoachAssignedWorkoutExercise extends ExercisePrescriptionFields {
  id: string;
  assigned_workout_id: string;
  section_id: string;
  member_id: string;
  coach_id: string;
  provider: ExerciseLibraryProvider;
  external_id: string;
  exercise_name: string;
  sequence_index: number;
  status: AssignedWorkoutStatus;
  completed_at: string | null;
  member_notes: string | null;
  difficulty_rating: 'very_easy' | 'easy' | 'appropriate' | 'difficult' | 'very_difficult' | null;
  comfort_rating: 'comfortable' | 'slight_discomfort' | 'moderate_discomfort' | 'pain' | null;
  /** Why this exercise was selected — member-visible once the workout is published. Null for anything a coach picked by hand. */
  selection_reasoning: string | null;
  /** Frozen copy of the template exercise's member_reasoning (migration 176): why this exercise is here, in her language. What her screen renders under "Why this exercise". */
  member_reasoning: string | null;

  // --- The member's own voice on this occurrence (migration 177) ---

  /** What she says she actually used. Optional, never required to complete anything, and never the same thing as `load` above, which is what her coach prescribed. */
  logged_load: number | null;
  logged_load_unit: 'lbs' | 'kg' | null;
  /** True when the number is per side, which is how she reads it on a unilateral exercise. Stored rather than re-derived so a later reader never has to guess what the number meant. */
  logged_load_per_side: boolean;
  logged_load_at: string | null;

  /** When she reported pain on this exercise and it was stopped. */
  stopped_at: string | null;

  /** What the slot was FOR, frozen with the prescription so a swap is judged against the rules that were true when her coach approved the program. */
  movement_pattern: string | null;
  is_locked: boolean;
  replacement_criteria: Record<string, unknown>;

  /** What was here before she swapped it. The row keeps its own history so one occurrence tells the whole story. */
  swapped_from_external_id: string | null;
  swapped_from_exercise_name: string | null;
  swapped_at: string | null;

  created_at: string;
}

/** A full assigned workout hydrated with its sections and exercises, ordered — what the member's workout detail page and the coach's assignment review both render. */
export interface CoachAssignedWorkoutWithContent extends CoachAssignedWorkout {
  sections: (CoachAssignedWorkoutSection & { exercises: CoachAssignedWorkoutExercise[] })[];
}

/** Coach-facing summary for a member's assignment list — completion % and last-completed, computed from coach_assigned_workouts, never stored. */
export interface ProgramAssignmentSummary {
  assignment: CoachProgramAssignment;
  totalWorkouts: number;
  completedWorkouts: number;
  completionPercent: number;
  lastCompletedAt: string | null;
  nextScheduledDate: string | null;
}
