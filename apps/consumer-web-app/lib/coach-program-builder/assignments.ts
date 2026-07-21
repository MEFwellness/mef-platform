/**
 * Data access for coach_program_assignments / coach_assigned_workouts /
 * coach_assigned_workout_sections / coach_assigned_workout_exercises
 * (migration 82) — the assignment and frozen-snapshot side of the Coach
 * Program Builder. See the migration's own header for the core invariant:
 * createAssignment() copies every display/prescription field off the
 * source template at the moment it's called; nothing here ever reads back
 * from coach_program_templates afterward, so a later template edit can
 * never reach an already-created assignment.
 *
 * Same "RLS is the real authorization boundary, this just performs the
 * read/write the caller's own session is allowed to do" convention as
 * app/actions/coach.ts and lib/movement-profile/data.ts — the exact same
 * functions here serve both a coach's session (sees draft + published,
 * gated by is_active_coach_for) and a member's own session (sees only
 * published rows for themselves), because RLS — not this code — decides
 * which rows come back for which caller.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AssignedWorkoutStatus,
  CoachAssignedWorkout,
  CoachAssignedWorkoutExercise,
  CoachAssignedWorkoutSection,
  CoachAssignedWorkoutWithContent,
  CoachProgramAssignment,
  CoachProgramTemplateWithContent,
  ExerciseComfortRating,
  ExerciseDifficultyRating,
  ProgramAssignmentSummary,
  ProgramScheduleConfig,
  ProgramScheduleType,
} from '@mef/shared-types-contracts';
import { generateScheduledDates } from './scheduling';

export type CreateAssignmentInput = {
  memberId: string;
  coachId: string;
  template: CoachProgramTemplateWithContent;
  scheduleType: ProgramScheduleType;
  scheduleConfig: ProgramScheduleConfig;
  assignmentNotes: string | null;
  internalNotes: string | null;
  /** Insert already published (skips the separate publish step) — used by the "assign and publish immediately" flow. */
  publishImmediately: boolean;
  /** Lineage only — set when this assignment materializes an approved Prescription Intelligence Engine snapshot. */
  sourcePrescriptionSnapshotId?: string | null;
};

/** Creates the assignment container plus one frozen coach_assigned_workouts row (with its own frozen sections/exercises) per generated scheduled date. Returns null if no occurrence dates could be generated from the given schedule. */
export async function createAssignment(
  supabase: SupabaseClient,
  input: CreateAssignmentInput
): Promise<CoachProgramAssignment | null> {
  const dates = generateScheduledDates(input.scheduleConfig);
  if (dates.length === 0) return null;

  const { data: assignment, error: assignmentError } = await supabase
    .from('coach_program_assignments')
    .insert({
      member_id: input.memberId,
      coach_id: input.coachId,
      template_id: input.template.id,
      template_name_snapshot: input.template.name,
      schedule_type: input.scheduleType,
      schedule_config: input.scheduleConfig,
      visibility: input.publishImmediately ? 'published' : 'draft',
      published_at: input.publishImmediately ? new Date().toISOString() : null,
      assignment_notes: input.assignmentNotes,
      internal_notes: input.internalNotes,
    })
    .select('*')
    .single();

  if (assignmentError || !assignment) {
    console.error('createAssignment (assignment) failed', assignmentError);
    return null;
  }

  const publishedAt = input.publishImmediately ? new Date().toISOString() : null;

  for (const date of dates) {
    const { data: workout, error: workoutError } = await supabase
      .from('coach_assigned_workouts')
      .insert({
        assignment_id: assignment.id,
        member_id: input.memberId,
        coach_id: input.coachId,
        scheduled_date: date,
        occurrence_label: dates.length > 1 ? date : null,
        template_name: input.template.name,
        description: input.template.description,
        goal: input.template.goal,
        difficulty: input.template.difficulty,
        estimated_duration_minutes: input.template.estimated_duration_minutes,
        equipment: input.template.equipment,
        program_tags: input.template.program_tags,
        corrective_tags: input.template.corrective_tags,
        movement_tags: input.template.movement_tags,
        target_muscles: input.template.target_muscles,
        member_instructions: input.template.member_instructions,
        coach_notes: input.template.coach_notes,
        internal_notes: input.template.internal_notes,
        published_at: publishedAt,
        source_prescription_snapshot_id: input.sourcePrescriptionSnapshotId ?? null,
      })
      .select('id')
      .single();

    if (workoutError || !workout) {
      console.error('createAssignment (workout) failed', workoutError);
      continue;
    }

    for (const section of input.template.sections) {
      const { data: sectionRow, error: sectionError } = await supabase
        .from('coach_assigned_workout_sections')
        .insert({
          assigned_workout_id: workout.id,
          member_id: input.memberId,
          coach_id: input.coachId,
          name: section.name,
          section_type: section.section_type,
          sequence_index: section.sequence_index,
          block_reasoning: section.block_reasoning,
        })
        .select('id')
        .single();

      if (sectionError || !sectionRow) {
        console.error('createAssignment (section) failed', sectionError);
        continue;
      }

      if (section.exercises.length === 0) continue;

      const { error: exercisesError } = await supabase
        .from('coach_assigned_workout_exercises')
        .insert(
          section.exercises.map((exercise) => ({
            assigned_workout_id: workout.id,
            section_id: sectionRow.id,
            member_id: input.memberId,
            coach_id: input.coachId,
            provider: exercise.provider,
            external_id: exercise.external_id,
            exercise_name: exercise.exercise_name,
            sequence_index: exercise.sequence_index,
            sets: exercise.sets,
            reps: exercise.reps,
            rep_range_low: exercise.rep_range_low,
            rep_range_high: exercise.rep_range_high,
            time_seconds: exercise.time_seconds,
            distance_meters: exercise.distance_meters,
            rest_seconds: exercise.rest_seconds,
            tempo: exercise.tempo,
            rpe: exercise.rpe,
            load: exercise.load,
            load_unit: exercise.load_unit,
            resistance: exercise.resistance,
            band_color: exercise.band_color,
            side: exercise.side,
            unilateral: exercise.unilateral,
            hold_duration_seconds: exercise.hold_duration_seconds,
            frequency: exercise.frequency,
            priority: exercise.priority,
            is_required: exercise.is_required,
            notes: exercise.notes,
            coaching_cues: exercise.coaching_cues,
            pain_modification_notes: exercise.pain_modification_notes,
            alternate_exercises: exercise.alternate_exercises,
            selection_reasoning: exercise.selection_reasoning,
          }))
        );

      if (exercisesError) {
        console.error('createAssignment (exercises) failed', exercisesError);
      }
    }
  }

  return assignment as CoachProgramAssignment;
}

/** Publishes a draft assignment — sets visibility/published_at on the container and, in one batched update, on every occurrence it already generated. Occurrences created after publish (there are none, by design) would need their own publish; see createAssignment's publishImmediately path for that case. */
export async function publishAssignment(
  supabase: SupabaseClient,
  assignmentId: string
): Promise<boolean> {
  const now = new Date().toISOString();
  const { error: assignmentError } = await supabase
    .from('coach_program_assignments')
    .update({ visibility: 'published', published_at: now, updated_at: now })
    .eq('id', assignmentId);
  if (assignmentError) {
    console.error('publishAssignment (assignment) failed', assignmentError);
    return false;
  }

  const { error: workoutsError } = await supabase
    .from('coach_assigned_workouts')
    .update({ published_at: now })
    .eq('assignment_id', assignmentId)
    .is('published_at', null);
  if (workoutsError) {
    console.error('publishAssignment (workouts) failed', workoutsError);
    return false;
  }
  return true;
}

export async function cancelAssignment(
  supabase: SupabaseClient,
  assignmentId: string,
  coachId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('coach_program_assignments')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by: coachId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', assignmentId);
  if (error) {
    console.error('cancelAssignment failed', error);
    return false;
  }
  return true;
}

export async function listAssignmentsForMember(
  supabase: SupabaseClient,
  memberId: string
): Promise<CoachProgramAssignment[]> {
  const { data, error } = await supabase
    .from('coach_program_assignments')
    .select('*')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('listAssignmentsForMember failed', error);
    return [];
  }
  return data as CoachProgramAssignment[];
}

/** Coach-facing rollup — completion %, last completed, next upcoming date, computed live from coach_assigned_workouts rather than stored, same "compute at read time, don't duplicate" discipline as member_movement_profiles. */
export async function listAssignmentSummariesForMember(
  supabase: SupabaseClient,
  memberId: string
): Promise<ProgramAssignmentSummary[]> {
  const assignments = await listAssignmentsForMember(supabase, memberId);
  if (assignments.length === 0) return [];

  const { data: workouts, error } = await supabase
    .from('coach_assigned_workouts')
    .select('assignment_id, status, completed_at, scheduled_date')
    .in(
      'assignment_id',
      assignments.map((a) => a.id)
    );
  if (error) {
    console.error('listAssignmentSummariesForMember failed', error);
    return assignments.map((assignment) => ({
      assignment,
      totalWorkouts: 0,
      completedWorkouts: 0,
      completionPercent: 0,
      lastCompletedAt: null,
      nextScheduledDate: null,
    }));
  }

  const today = new Date().toISOString().slice(0, 10);
  const byAssignment = new Map<
    string,
    { total: number; completed: number; lastCompletedAt: string | null; nextDate: string | null }
  >();
  for (const row of workouts ?? []) {
    const entry = byAssignment.get(row.assignment_id) ?? {
      total: 0,
      completed: 0,
      lastCompletedAt: null,
      nextDate: null,
    };
    entry.total += 1;
    if (row.status === 'completed') {
      entry.completed += 1;
      if (!entry.lastCompletedAt || row.completed_at > entry.lastCompletedAt) {
        entry.lastCompletedAt = row.completed_at;
      }
    }
    if (
      row.scheduled_date >= today &&
      row.status === 'not_started' &&
      (!entry.nextDate || row.scheduled_date < entry.nextDate)
    ) {
      entry.nextDate = row.scheduled_date;
    }
    byAssignment.set(row.assignment_id, entry);
  }

  return assignments.map((assignment) => {
    const entry = byAssignment.get(assignment.id);
    const total = entry?.total ?? 0;
    const completed = entry?.completed ?? 0;
    return {
      assignment,
      totalWorkouts: total,
      completedWorkouts: completed,
      completionPercent: total > 0 ? Math.round((completed / total) * 100) : 0,
      lastCompletedAt: entry?.lastCompletedAt ?? null,
      nextScheduledDate: entry?.nextDate ?? null,
    };
  });
}

export async function listAssignedWorkoutsForMember(
  supabase: SupabaseClient,
  memberId: string
): Promise<CoachAssignedWorkout[]> {
  const { data, error } = await supabase
    .from('coach_assigned_workouts')
    .select('*')
    .eq('member_id', memberId)
    .order('scheduled_date', { ascending: true });
  if (error) {
    console.error('listAssignedWorkoutsForMember failed', error);
    return [];
  }
  return data as CoachAssignedWorkout[];
}

export async function getAssignedWorkoutWithContent(
  supabase: SupabaseClient,
  assignedWorkoutId: string
): Promise<CoachAssignedWorkoutWithContent | null> {
  const { data: workout, error: workoutError } = await supabase
    .from('coach_assigned_workouts')
    .select('*')
    .eq('id', assignedWorkoutId)
    .maybeSingle();
  if (workoutError || !workout) {
    if (workoutError) console.error('getAssignedWorkoutWithContent (workout) failed', workoutError);
    return null;
  }

  const [{ data: sections, error: sectionsError }, { data: exercises, error: exercisesError }] =
    await Promise.all([
      supabase
        .from('coach_assigned_workout_sections')
        .select('*')
        .eq('assigned_workout_id', assignedWorkoutId)
        .order('sequence_index', { ascending: true }),
      supabase
        .from('coach_assigned_workout_exercises')
        .select('*')
        .eq('assigned_workout_id', assignedWorkoutId)
        .order('sequence_index', { ascending: true }),
    ]);

  if (sectionsError)
    console.error('getAssignedWorkoutWithContent (sections) failed', sectionsError);
  if (exercisesError)
    console.error('getAssignedWorkoutWithContent (exercises) failed', exercisesError);

  const bySection = new Map<string, CoachAssignedWorkoutExercise[]>();
  for (const exercise of (exercises as CoachAssignedWorkoutExercise[]) ?? []) {
    const list = bySection.get(exercise.section_id) ?? [];
    list.push(exercise);
    bySection.set(exercise.section_id, list);
  }

  return {
    ...(workout as CoachAssignedWorkout),
    sections: ((sections as CoachAssignedWorkoutSection[]) ?? []).map((section) => ({
      ...section,
      exercises: bySection.get(section.id) ?? [],
    })),
  };
}

export type UpdateAssignedWorkoutStatusInput = {
  status: AssignedWorkoutStatus;
  memberFeedback?: string | null | undefined;
};

/** Member self-update of their own workout's status — RLS (member_update_own_assigned_workouts) is what actually restricts this to the signed-in member's own published rows. */
export async function updateAssignedWorkoutStatus(
  supabase: SupabaseClient,
  assignedWorkoutId: string,
  input: UpdateAssignedWorkoutStatusInput
): Promise<boolean> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: input.status,
    updated_at: now,
  };
  if (input.memberFeedback !== undefined) patch.member_feedback = input.memberFeedback;
  if (input.status === 'in_progress') patch.started_at = now;
  if (input.status === 'completed' || input.status === 'partially_completed')
    patch.completed_at = now;
  if (input.status === 'skipped') patch.skipped_at = now;

  const { error } = await supabase
    .from('coach_assigned_workouts')
    .update(patch)
    .eq('id', assignedWorkoutId);
  if (error) {
    console.error('updateAssignedWorkoutStatus failed', error);
    return false;
  }
  return true;
}

export type UpdateAssignedWorkoutExerciseInput = {
  status: AssignedWorkoutStatus;
  memberNotes?: string | null | undefined;
  difficultyRating?: ExerciseDifficultyRating | null | undefined;
  comfortRating?: ExerciseComfortRating | null | undefined;
};

/** Member self-update of one exercise's completion state within an assigned workout — never touches any prescription field (there is no RLS path that would let it). */
export async function updateAssignedWorkoutExercise(
  supabase: SupabaseClient,
  exerciseRowId: string,
  input: UpdateAssignedWorkoutExerciseInput
): Promise<boolean> {
  const patch: Record<string, unknown> = { status: input.status };
  if (input.status === 'completed' || input.status === 'partially_completed') {
    patch.completed_at = new Date().toISOString();
  }
  if (input.memberNotes !== undefined) patch.member_notes = input.memberNotes;
  if (input.difficultyRating !== undefined) patch.difficulty_rating = input.difficultyRating;
  if (input.comfortRating !== undefined) patch.comfort_rating = input.comfortRating;

  const { error } = await supabase
    .from('coach_assigned_workout_exercises')
    .update(patch)
    .eq('id', exerciseRowId);
  if (error) {
    console.error('updateAssignedWorkoutExercise failed', error);
    return false;
  }
  return true;
}

export type UpdateAssignedWorkoutCoachNotesInput = {
  coachNotes: string | null;
  internalNotes: string | null;
};

/** Coach-only update of a specific occurrence's notes — RLS (coach_update_assigned_assigned_workouts) restricts this to the assigned coach; prescription fields on child exercises stay untouched (no coach UPDATE policy exists on that table at all). */
export async function updateAssignedWorkoutCoachNotes(
  supabase: SupabaseClient,
  assignedWorkoutId: string,
  input: UpdateAssignedWorkoutCoachNotesInput
): Promise<boolean> {
  const { error } = await supabase
    .from('coach_assigned_workouts')
    .update({
      coach_notes: input.coachNotes,
      internal_notes: input.internalNotes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', assignedWorkoutId);
  if (error) {
    console.error('updateAssignedWorkoutCoachNotes failed', error);
    return false;
  }
  return true;
}
