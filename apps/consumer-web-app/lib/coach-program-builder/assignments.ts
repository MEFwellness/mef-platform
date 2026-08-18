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
  MemberProgramLifecycle,
  ProgramAssignmentSummary,
  ProgramAssignmentStatus,
  ProgramScheduleConfig,
  ProgramScheduleType,
} from '@mef/shared-types-contracts';
import { LIVE_PROGRAM_ASSIGNMENT_STATUSES } from '@mef/shared-types-contracts';
import { generateScheduledDates } from './scheduling';
import {
  DEFAULT_PROGRAM_DURATION_WEEKS,
  daysBetween,
  endDateFor,
  resumedStatus,
  weekOn,
} from '../program-lifecycle/transitions';

/** The `corrective-program:<uuid>` tag a corrective program's session templates already share (lib/corrective-engine/save.ts). Reused as the assignment's program_group_key rather than a second grouping identity being invented — see migration 172. */
const CORRECTIVE_GROUP_TAG_PREFIX = 'corrective-program:';

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
  /** Lifecycle (migration 172). Omit and the program's own schedule decides: the first scheduled date, and `weeks` from the schedule config. */
  lifecycle?: {
    startDate?: string;
    durationWeeks?: number;
    /** Which assignments are one program. Defaults to the source template's `corrective-program:` tag, then to the assignment's own id. */
    programGroupKey?: string;
    /** The member's local date, so a program starting today opens 'active' rather than sitting 'upcoming' until the job runs. */
    today: string;
  };
};

/**
 * A new assignment's opening lifecycle state, derived from the dates it is
 * about to be created with. Deliberately not "always upcoming, let the job
 * fix it": a coach who assigns a program starting today should see it
 * active immediately, not tomorrow.
 */
export function initialLifecycleState(input: {
  startDate: string;
  durationWeeks: number;
  today: string;
}): { status: ProgramAssignmentStatus; endDate: string; currentWeek: number } {
  const endDate = endDateFor(input.startDate, input.durationWeeks);
  const facts = {
    status: 'upcoming' as ProgramAssignmentStatus,
    start_date: input.startDate,
    end_date: endDate,
    duration_weeks: input.durationWeeks,
    current_week: 1,
    paused_days: 0,
  };
  if (daysBetween(input.startDate, input.today) < 0) {
    return { status: 'upcoming', endDate, currentWeek: 1 };
  }
  if (daysBetween(endDate, input.today) > 0) {
    return { status: 'completed', endDate, currentWeek: input.durationWeeks };
  }
  return { status: 'active', endDate, currentWeek: weekOn(facts, input.today) };
}

/** How many weeks a schedule config describes. `weeks` where the config has it (weekly/multiple_weeks), otherwise the span its own dates cover. */
export function durationWeeksFor(config: ProgramScheduleConfig, dates: string[]): number {
  if ('weeks' in config && typeof config.weeks === 'number' && config.weeks >= 1) {
    return Math.min(52, Math.round(config.weeks));
  }
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (!first || !last) return DEFAULT_PROGRAM_DURATION_WEEKS;
  return Math.min(52, Math.max(1, Math.ceil((daysBetween(first, last) + 1) / 7)));
}

function correctiveGroupTagOf(template: CoachProgramTemplateWithContent): string | null {
  return template.program_tags.find((tag) => tag.startsWith(CORRECTIVE_GROUP_TAG_PREFIX)) ?? null;
}

/** Creates the assignment container plus one frozen coach_assigned_workouts row (with its own frozen sections/exercises) per generated scheduled date. Returns null if no occurrence dates could be generated from the given schedule. */
export async function createAssignment(
  supabase: SupabaseClient,
  input: CreateAssignmentInput
): Promise<CoachProgramAssignment | null> {
  const dates = generateScheduledDates(input.scheduleConfig);
  if (dates.length === 0) return null;

  // Lifecycle (migration 172). A program's span is a property of the
  // program, so it comes from the schedule the coach actually configured —
  // the first date it generates and its own `weeks` — and only falls back
  // to a default when the config says nothing.
  const today = input.lifecycle?.today ?? new Date().toISOString().slice(0, 10);
  const startDate = input.lifecycle?.startDate ?? dates[0]!;
  const durationWeeks = input.lifecycle?.durationWeeks ?? durationWeeksFor(input.scheduleConfig, dates);
  const opening = initialLifecycleState({ startDate, durationWeeks, today });

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
      status: opening.status,
      start_date: startDate,
      end_date: opening.endDate,
      duration_weeks: durationWeeks,
      current_week: opening.currentWeek,
      started_at: opening.status === 'upcoming' ? null : new Date().toISOString(),
      program_group_key:
        input.lifecycle?.programGroupKey ?? correctiveGroupTagOf(input.template) ?? null,
    })
    .select('*')
    .single();

  if (assignmentError || !assignment) {
    console.error('createAssignment (assignment) failed', assignmentError);
    return null;
  }

  // An assignment with no group of its own is its own group, so every row
  // has a key and grouping never has to special-case null.
  if (!assignment.program_group_key) {
    await supabase
      .from('coach_program_assignments')
      .update({ program_group_key: assignment.id })
      .eq('id', assignment.id);
    assignment.program_group_key = assignment.id;
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

// ---------------------------------------------------------------------------
// Lifecycle transitions (migration 172).
//
// Every write to coach_program_assignments.status lives in this file, next
// to cancelAssignment above, so there is one place that knows what a
// status change is allowed to touch. NONE of these functions writes to
// coach_assigned_workouts, coach_assigned_workout_sections or
// coach_assigned_workout_exercises: a frozen snapshot stays frozen, and
// saying where a member is in a program never edits what she was given.
// ---------------------------------------------------------------------------

/** The lifecycle columns a transition reads. Selected explicitly so a transition can never accidentally round-trip content it has no business writing back. */
export const LIFECYCLE_COLUMNS =
  'id, member_id, coach_id, status, start_date, end_date, duration_weeks, current_week, paused_days, paused_at, template_name_snapshot, program_group_key, visibility';

export interface AssignmentLifecycleRow {
  id: string;
  member_id: string;
  coach_id: string;
  status: ProgramAssignmentStatus;
  start_date: string | null;
  end_date: string | null;
  duration_weeks: number | null;
  current_week: number | null;
  paused_days: number;
  paused_at: string | null;
  template_name_snapshot: string;
  program_group_key: string | null;
  visibility: string;
}

/** Every assignment that can still transition — the daily job's whole working set. Terminal rows are never re-read, which is what keeps a completed program completed. */
export async function listLiveAssignments(
  supabase: SupabaseClient
): Promise<AssignmentLifecycleRow[]> {
  const { data, error } = await supabase
    .from('coach_program_assignments')
    .select(LIFECYCLE_COLUMNS)
    .in('status', ['upcoming', 'active'])
    .order('start_date', { ascending: true });
  if (error) {
    console.error('listLiveAssignments failed', error);
    return [];
  }
  return (data ?? []) as unknown as AssignmentLifecycleRow[];
}

export async function getAssignmentLifecycle(
  supabase: SupabaseClient,
  assignmentId: string
): Promise<AssignmentLifecycleRow | null> {
  const { data, error } = await supabase
    .from('coach_program_assignments')
    .select(LIFECYCLE_COLUMNS)
    .eq('id', assignmentId)
    .maybeSingle();
  if (error) {
    console.error('getAssignmentLifecycle failed', error);
    return null;
  }
  return (data as unknown as AssignmentLifecycleRow) ?? null;
}

/** Applies one planned transition. Idempotent by construction: the job only calls this when the row's own dates say the row is out of date, so a second run the same day writes nothing. */
export async function applyLifecycleTransition(
  supabase: SupabaseClient,
  assignmentId: string,
  patch: { status: ProgramAssignmentStatus; currentWeek: number; startedAt?: boolean; completedAt?: boolean }
): Promise<boolean> {
  const now = new Date().toISOString();
  const update: Record<string, unknown> = {
    status: patch.status,
    current_week: patch.currentWeek,
    updated_at: now,
  };
  if (patch.startedAt) update.started_at = now;
  if (patch.completedAt) update.completed_at = now;

  const { error } = await supabase
    .from('coach_program_assignments')
    .update(update)
    .eq('id', assignmentId);
  if (error) {
    console.error('applyLifecycleTransition failed', error);
    return false;
  }
  return true;
}

/** Holds a program. Only a live program can be paused; a completed, replaced or cancelled one has nothing to hold. */
export async function pauseAssignment(
  supabase: SupabaseClient,
  assignmentId: string
): Promise<boolean> {
  const row = await getAssignmentLifecycle(supabase, assignmentId);
  if (!row) return false;
  if (row.status !== 'active' && row.status !== 'upcoming') return false;

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('coach_program_assignments')
    .update({ status: 'paused', paused_at: now, updated_at: now })
    .eq('id', assignmentId);
  if (error) {
    console.error('pauseAssignment failed', error);
    return false;
  }
  return true;
}

/**
 * Restarts a held program, and gives back the days it was held: paused_days
 * accumulates them and end_date moves out by the same amount, so four weeks
 * of program is still four weeks of program. See the header of
 * lib/program-lifecycle/transitions.ts.
 */
export async function resumeAssignment(
  supabase: SupabaseClient,
  assignmentId: string,
  today: string
): Promise<boolean> {
  const row = await getAssignmentLifecycle(supabase, assignmentId);
  if (!row || row.status !== 'paused') return false;

  const heldFrom = row.paused_at ? row.paused_at.slice(0, 10) : today;
  const heldDays = Math.max(0, daysBetween(heldFrom, today));
  const pausedDays = (row.paused_days ?? 0) + heldDays;
  const durationWeeks = row.duration_weeks ?? DEFAULT_PROGRAM_DURATION_WEEKS;
  const endDate = row.start_date ? endDateFor(row.start_date, durationWeeks, pausedDays) : row.end_date;

  const facts = {
    status: 'paused' as ProgramAssignmentStatus,
    start_date: row.start_date,
    end_date: endDate,
    duration_weeks: durationWeeks,
    current_week: row.current_week,
    paused_days: pausedDays,
  };
  const status = resumedStatus(facts, today);

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('coach_program_assignments')
    .update({
      status,
      paused_at: null,
      paused_days: pausedDays,
      end_date: endDate,
      current_week: status === 'upcoming' ? 1 : weekOn(facts, today),
      resumed_at: now,
      updated_at: now,
    })
    .eq('id', assignmentId);
  if (error) {
    console.error('resumeAssignment failed', error);
    return false;
  }
  return true;
}

/** Supersedes one program with another. Never a delete: the old row keeps its dates, its week and its completion record, and gains a pointer to what took its place. */
export async function replaceAssignment(
  supabase: SupabaseClient,
  oldAssignmentId: string,
  newAssignmentId: string
): Promise<boolean> {
  if (oldAssignmentId === newAssignmentId) return false;
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('coach_program_assignments')
    .update({
      status: 'replaced',
      replaced_at: now,
      replaced_by_assignment_id: newAssignmentId,
      updated_at: now,
    })
    .eq('id', oldAssignmentId)
    .in('status', LIVE_PROGRAM_ASSIGNMENT_STATUSES as unknown as string[]);
  if (error) {
    console.error('replaceAssignment failed', error);
    return false;
  }
  return true;
}

/**
 * Called after a new program is assigned: every program this member was
 * already on is marked replaced and pointed at the new one. Excludes the
 * assignments just created, which matters because a corrective program
 * arrives as two or three assignments at once and must not replace itself.
 *
 * Returns the ids it superseded, so the caller can log one lifecycle event
 * per real replacement.
 */
export async function replacePreviousAssignments(
  supabase: SupabaseClient,
  input: { memberId: string; newAssignmentIds: string[]; supersededBy: string }
): Promise<string[]> {
  const { data, error } = await supabase
    .from('coach_program_assignments')
    .select('id')
    .eq('member_id', input.memberId)
    .in('status', LIVE_PROGRAM_ASSIGNMENT_STATUSES as unknown as string[]);
  if (error) {
    console.error('replacePreviousAssignments (read) failed', error);
    return [];
  }

  const stale = (data ?? [])
    .map((row) => row.id as string)
    .filter((id) => !input.newAssignmentIds.includes(id));
  if (stale.length === 0) return [];

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('coach_program_assignments')
    .update({
      status: 'replaced',
      replaced_at: now,
      replaced_by_assignment_id: input.supersededBy,
      updated_at: now,
    })
    .in('id', stale);
  if (updateError) {
    console.error('replacePreviousAssignments (update) failed', updateError);
    return [];
  }
  return stale;
}

/**
 * A member's own view of her programs' lifecycle. Reads
 * `member_program_lifecycle` (migration 172), not the assignment table:
 * coach_program_assignments has no member SELECT policy, deliberately,
 * because it carries internal_notes. The view is the lifecycle columns and
 * nothing else, so there is no coach-only field here to leak.
 */
export async function listMyProgramLifecycles(
  supabase: SupabaseClient
): Promise<MemberProgramLifecycle[]> {
  const { data, error } = await supabase
    .from('member_program_lifecycle')
    .select('*')
    .order('start_date', { ascending: false });
  if (error) {
    console.error('listMyProgramLifecycles failed', error);
    return [];
  }
  return (data ?? []) as MemberProgramLifecycle[];
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
