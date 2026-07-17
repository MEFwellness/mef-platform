/**
 * Database access for Movement Intelligence — pure functions taking a
 * SupabaseClient, RLS (migration 58) decides who may read/write what. Same
 * shape as lib/body-assessment/data.ts: no business logic here beyond
 * shaping rows in and out of the tables; session composition itself lives
 * in lib/movement/rules/.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  MovementSession,
  MovementSessionExercise,
  MovementSessionExerciseWithDetail,
  MovementSessionStatus,
} from '@mef/shared-types-contracts';
import type { MovementSessionPlan } from './rules/plan';
import type { MovementExerciseProvider } from './providers/types';

export async function getLatestMovementSessionForDate(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string
): Promise<MovementSession | null> {
  const { data, error } = await supabase
    .from('movement_sessions')
    .select('*')
    .eq('member_id', memberId)
    .eq('local_date', localDate)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('getLatestMovementSessionForDate failed', error);
    return null;
  }
  return data as MovementSession | null;
}

/** Newest first — callers needing oldest-first (facts-building) reverse it themselves, same convention as lib/ai/rules/facts.ts's caller-supplied ordering. */
export async function listRecentMovementSessions(
  supabase: SupabaseClient,
  memberId: string,
  limit: number
): Promise<MovementSession[]> {
  const { data, error } = await supabase
    .from('movement_sessions')
    .select('*')
    .eq('member_id', memberId)
    .order('local_date', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('listRecentMovementSessions failed', error);
    return [];
  }
  return data as MovementSession[];
}

export async function listSessionExercises(
  supabase: SupabaseClient,
  sessionId: string
): Promise<MovementSessionExercise[]> {
  const { data, error } = await supabase
    .from('movement_session_exercises')
    .select('*')
    .eq('session_id', sessionId)
    .order('sequence_index', { ascending: true });

  if (error) {
    console.error('listSessionExercises failed', error);
    return [];
  }
  return data as MovementSessionExercise[];
}

/** Resolves each session exercise's full catalog record through whichever provider generated it — the join a real exercise-library provider will one day serve directly. */
export async function hydrateSessionExercises(
  sessionExercises: MovementSessionExercise[],
  provider: MovementExerciseProvider
): Promise<MovementSessionExerciseWithDetail[]> {
  const hydrated: MovementSessionExerciseWithDetail[] = [];
  for (const sessionExercise of sessionExercises) {
    const exercise = await provider.getExercise(sessionExercise.exercise_id);
    if (!exercise) continue; // orphaned reference (e.g. provider swapped) — skip rather than crash the page
    hydrated.push({ ...sessionExercise, exercise });
  }
  return hydrated;
}

export async function insertMovementSession(
  supabase: SupabaseClient,
  memberId: string,
  timezone: string,
  localDate: string,
  plan: MovementSessionPlan
): Promise<MovementSession | null> {
  const { data: session, error } = await supabase
    .from('movement_sessions')
    .insert({
      member_id: memberId,
      timezone,
      local_date: localDate,
      status: 'ready',
      focus_summary: plan.focusSummary,
      recovery_status: plan.recoveryStatus,
      estimated_duration_minutes: plan.estimatedDurationMinutes,
      selection_reasons: plan.selectionReasons,
    })
    .select('*')
    .single();

  if (error || !session) {
    console.error('insertMovementSession failed', error);
    return null;
  }

  if (plan.exercises.length > 0) {
    const { error: exercisesError } = await supabase.from('movement_session_exercises').insert(
      plan.exercises.map((planExercise) => ({
        session_id: session.id,
        member_id: memberId,
        exercise_id: planExercise.exercise.exercise_id,
        section: planExercise.section,
        sequence_index: planExercise.sequenceIndex,
        prescribed_sets: planExercise.prescribedSets,
        prescribed_reps: planExercise.prescribedReps,
        prescribed_tempo: planExercise.prescribedTempo,
        prescribed_rest_seconds: planExercise.prescribedRestSeconds,
        estimated_duration_seconds: planExercise.estimatedDurationSeconds,
      }))
    );
    if (exercisesError) console.error('insertMovementSession exercises failed', exercisesError);
  }

  return session as MovementSession;
}

export async function updateMovementSessionStatus(
  supabase: SupabaseClient,
  sessionId: string,
  status: MovementSessionStatus,
  extra: Partial<
    Pick<
      MovementSession,
      'started_at' | 'completed_at' | 'skipped_at' | 'skip_reason' | 'movement_score'
    >
  > = {}
): Promise<void> {
  const { error } = await supabase
    .from('movement_sessions')
    .update({ status, updated_at: new Date().toISOString(), ...extra })
    .eq('id', sessionId);

  if (error) console.error('updateMovementSessionStatus failed', error);
}

export async function setSessionExerciseCompleted(
  supabase: SupabaseClient,
  sessionExerciseId: string,
  completed: boolean
): Promise<void> {
  const { error } = await supabase
    .from('movement_session_exercises')
    .update({ completed, completed_at: completed ? new Date().toISOString() : null })
    .eq('id', sessionExerciseId);

  if (error) console.error('setSessionExerciseCompleted failed', error);
}
