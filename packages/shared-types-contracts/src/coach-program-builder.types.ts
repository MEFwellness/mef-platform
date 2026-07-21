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
export type ProgramTemplateStatus = 'draft' | 'active' | 'archived';

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
  created_at: string;
  updated_at: string;
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
export type ProgramAssignmentStatus = 'active' | 'completed' | 'cancelled';

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
  status: ProgramAssignmentStatus;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
  cancelled_by: string | null;
}

export type AssignedWorkoutStatus =
  'not_started' | 'in_progress' | 'completed' | 'skipped' | 'partially_completed';

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
