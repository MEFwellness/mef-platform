/**
 * The reads behind "How the program is going".
 *
 * One file talks to the tables, same discipline as
 * lib/programs/feedback/data.ts. Everything it returns goes straight into
 * ./aggregate.ts's pure functions, which is what lets every rule about what
 * the numbers MEAN be tested against literals.
 *
 * RLS IS THE BOUNDARY. There is no service-role client in this module. A
 * coach reads a member's rows because coach_read_assigned_* policies say
 * so, and a coach who is not this member's coach gets empty arrays rather
 * than an error, which is the same thing every other coach read in this app
 * does.
 *
 * NO EM DASHES, per the house rule.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  BlueprintBlock,
  CoachAssignedWorkout,
  CoachAssignedWorkoutExercise,
  CoachAssignedWorkoutSection,
  CoachProgramAssignment,
  MemberExerciseAvoidance,
  MemberExerciseFeedback,
} from '@mef/shared-types-contracts';
import { blockForSectionType } from '../feedback/candidates';
import { buildProgramSignals, type ProgramSignals } from './aggregate';
import { programInsights, type SignalInsight } from './insights';

export interface ProgramSignalBundle {
  signals: ProgramSignals;
  insights: SignalInsight[];
  /** Kept beside the signals so the load rules can read one exercise's own occurrences without a second query. */
  exercises: CoachAssignedWorkoutExercise[];
  workouts: CoachAssignedWorkout[];
  assignments: CoachProgramAssignment[];
}

/** A UUID, and nothing else. Every real group key looks like `corrective-program:<uuid>` or `named-program:<uuid>`, which is emphatically not one. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Every assignment of one program, by its group key. Falls back to the
 * single assignment when a program predates grouping and its "group key"
 * is therefore its own id.
 *
 * The two reads are deliberately separate rather than one `.or()`. Postgres
 * type-checks every branch of an OR before it filters, so
 * `id.eq.corrective-program:abc` does not simply match nothing, it fails
 * the WHOLE query with "invalid input syntax for type uuid" and the panel
 * comes back empty for every program that actually has a group. Found by
 * tests/program-review-drafts.test.ts against a real group key.
 */
export async function listAssignmentsForGroup(
  supabase: SupabaseClient,
  memberId: string,
  groupKey: string
): Promise<CoachProgramAssignment[]> {
  const { data, error } = await supabase
    .from('coach_program_assignments')
    .select('*')
    .eq('member_id', memberId)
    .eq('program_group_key', groupKey);
  if (error) {
    console.error('listAssignmentsForGroup failed', error);
    return [];
  }
  if ((data ?? []).length > 0) return data as CoachProgramAssignment[];

  if (!UUID_PATTERN.test(groupKey)) return [];
  const { data: single, error: singleError } = await supabase
    .from('coach_program_assignments')
    .select('*')
    .eq('member_id', memberId)
    .eq('id', groupKey);
  if (singleError) {
    console.error('listAssignmentsForGroup (single) failed', singleError);
    return [];
  }
  return (single ?? []) as CoachProgramAssignment[];
}

/**
 * Everything one program produced, as one bundle.
 *
 * Four reads, none of them per exercise: the occurrences, their sections,
 * their exercises, and what she said. A program is at most a few dozen rows
 * of each, so this is one screen's worth of data and not a stream.
 */
export async function loadProgramSignals(
  supabase: SupabaseClient,
  input: { memberId: string; groupKey: string; programName: string }
): Promise<ProgramSignalBundle | null> {
  const assignments = await listAssignmentsForGroup(supabase, input.memberId, input.groupKey);
  if (assignments.length === 0) return null;
  const assignmentIds = assignments.map((a) => a.id);

  const { data: workoutRows, error: workoutError } = await supabase
    .from('coach_assigned_workouts')
    .select('*')
    .eq('member_id', input.memberId)
    .in('assignment_id', assignmentIds)
    .order('scheduled_date', { ascending: true });
  if (workoutError) {
    console.error('loadProgramSignals (workouts) failed', workoutError);
    return null;
  }
  const workouts = (workoutRows ?? []) as CoachAssignedWorkout[];
  const workoutIds = workouts.map((w) => w.id);

  const [sectionResult, exerciseResult, feedbackResult, avoidanceResult] = await Promise.all([
    workoutIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from('coach_assigned_workout_sections')
          .select('id, section_type')
          .in('assigned_workout_id', workoutIds),
    workoutIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from('coach_assigned_workout_exercises')
          .select('*')
          .in('assigned_workout_id', workoutIds)
          .order('sequence_index', { ascending: true }),
    // Her reports about THIS program. Matched on the group key she was in
    // when she made them, so a report from a program she has since finished
    // never lands on this one's panel.
    supabase
      .from('member_exercise_feedback')
      .select('*')
      .eq('member_id', input.memberId)
      // assignment_id is a uuid column and every id here is a real uuid,
      // so this branch is safe. The group key is NOT compared against a
      // uuid column anywhere: see listAssignmentsForGroup's header.
      .or(
        `program_group_key.eq.${input.groupKey},assignment_id.in.(${assignmentIds.join(',')})`
      )
      .order('created_at', { ascending: false }),
    // The avoidance list is a property of the MEMBER, not of one program,
    // so it is read whole. A coach releasing an entry is releasing it
    // everywhere, which is what it means.
    supabase
      .from('member_exercise_avoidance')
      .select('*')
      .eq('member_id', input.memberId)
      .order('created_at', { ascending: false }),
  ]);

  if (sectionResult.error) console.error('loadProgramSignals (sections) failed', sectionResult.error);
  if (exerciseResult.error) console.error('loadProgramSignals (exercises) failed', exerciseResult.error);
  if (feedbackResult.error) console.error('loadProgramSignals (feedback) failed', feedbackResult.error);
  if (avoidanceResult.error) console.error('loadProgramSignals (avoidance) failed', avoidanceResult.error);

  const blockBySectionId = new Map<string, BlueprintBlock>();
  for (const section of (sectionResult.data ?? []) as Pick<
    CoachAssignedWorkoutSection,
    'id' | 'section_type'
  >[]) {
    blockBySectionId.set(section.id, blockForSectionType(section.section_type));
  }

  const exercises = (exerciseResult.data ?? []) as CoachAssignedWorkoutExercise[];
  const feedback = (feedbackResult.data ?? []) as MemberExerciseFeedback[];
  const avoidance = (avoidanceResult.data ?? []) as MemberExerciseAvoidance[];

  const signals = buildProgramSignals({
    groupKey: input.groupKey,
    programName: input.programName,
    workouts,
    exercises,
    feedback,
    avoidance,
    blockBySectionId,
  });

  return {
    signals,
    insights: programInsights(signals),
    exercises,
    workouts,
    assignments,
  };
}

// ---------------------------------------------------------------------
// The two things a coach can DO from the panel.
// ---------------------------------------------------------------------

/**
 * Lets an exercise back in. Released, never deleted: the row stays so a
 * coach reading her history six months from now can see it was on the list
 * and when it came off.
 *
 * Idempotent. Releasing something already released rewrites the same two
 * columns and changes nothing that matters.
 */
export async function releaseAvoidance(
  supabase: SupabaseClient,
  input: { avoidanceId: string; coachId: string }
): Promise<MemberExerciseAvoidance | null> {
  const { data, error } = await supabase
    .from('member_exercise_avoidance')
    .update({ released_at: new Date().toISOString(), released_by: input.coachId })
    .eq('id', input.avoidanceId)
    .select('*')
    .maybeSingle();
  if (error || !data) {
    if (error) console.error('releaseAvoidance failed', error);
    return null;
  }
  return data as MemberExerciseAvoidance;
}

/**
 * Marks a report reviewed. Clears the coach's needs-attention flag (which
 * lib/programs/feedback/attention.ts computes from coach_reviewed_at being
 * null) and keeps everything the member said exactly as she said it.
 *
 * There is deliberately no path here that edits `reason`, `other_text` or
 * `outcome`. A coach closing a report is recording that she has looked at
 * it, not amending what happened.
 */
export async function resolveFeedbackReport(
  supabase: SupabaseClient,
  input: { feedbackId: string; coachId: string; note: string | null }
): Promise<MemberExerciseFeedback | null> {
  const { data, error } = await supabase
    .from('member_exercise_feedback')
    .update({
      coach_reviewed_at: new Date().toISOString(),
      coach_reviewed_by: input.coachId,
      coach_review_note: input.note?.trim() || null,
    })
    .eq('id', input.feedbackId)
    .select('*')
    .maybeSingle();
  if (error || !data) {
    if (error) console.error('resolveFeedbackReport failed', error);
    return null;
  }
  return data as MemberExerciseFeedback;
}
