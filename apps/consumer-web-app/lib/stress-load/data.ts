/**
 * The Stress & Load Deep-Dive's own table, plus the two reads its gate and
 * its cross reference need.
 *
 * Same discipline as every other data.ts here: pure functions taking a
 * caller-scoped SupabaseClient, RLS decides who may read or write what, and
 * a failed read returns a safe value rather than throwing, since every
 * caller is on a page render the member is already waiting on.
 *
 * NO ROW EXISTS UNTIL SHE FINISHES. There is deliberately no "start" write
 * and no draft row. A page render may read; it may not insert, claim,
 * upsert or schedule (the standing rule). The only write in this feature
 * happens inside the server action she triggers by pressing the final
 * button, and the registry rows that action publishes alongside it.
 *
 * "NO ERROR" IS NOT "IT WORKED". The insert reads the row back, so a write
 * that matched no RLS policy (which returns zero rows and no error) is
 * caught rather than reported as a success.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { LongitudinalSignal } from '../longitudinal-intelligence/types';
import { listMemberPatternStates } from '../longitudinal-intelligence/data';
import { addDaysToLocalDate } from '../feed/dateMath';
import { STRESS_LOAD_DEFINITION_ID } from './constants';
import { readStressLoadAnswers, type StressLoadAnswers } from './questions';
import { sanitizeInterpretation, type StressLoadInterpretation } from './crossReference';

const SESSION_COLUMNS =
  'id, assignment_id, questions_version, answers, pattern, started_at, completed_at, created_at';

/** How far back the check-in cross reference looks. Matches the Root Map's own coverage window, so two counts on one screen cannot mean two different spans. */
export const STRESS_LOAD_CROSS_REFERENCE_WINDOW_DAYS = 21;

export type StressLoadSessionRecord = {
  id: string;
  assignmentId: string | null;
  questionsVersion: number;
  /** Null when the stored answers are not a complete, in-range set. Never half an answer sheet. */
  answers: StressLoadAnswers | null;
  /** Null when the stored reading could not be read under the current vocabulary. Never half a reading. */
  interpretation: StressLoadInterpretation | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
};

type SessionRow = {
  id: string;
  assignment_id: string | null;
  questions_version: number;
  answers: unknown;
  pattern: unknown;
  started_at: string;
  completed_at: string | null;
  created_at: string;
};

function fromRow(row: SessionRow): StressLoadSessionRecord {
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    questionsVersion: row.questions_version,
    answers: readStressLoadAnswers(row.answers),
    interpretation: sanitizeInterpretation(row.pattern),
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

export type StressLoadAssignment = {
  id: string;
  createdAt: string;
  reason: string | null;
};

/**
 * Her open assignment for this deep-dive, if she has one.
 *
 * "No row" and "the read did not work" are kept apart, exactly as
 * fetchWeeklyReflection keeps them apart and for the same reason: a failed
 * read that looked like "no assignment" would silently take the experience
 * away from a member her coach had just assigned, and a failed read that
 * looked like "assigned" would offer it to somebody who was never given it.
 * `ok: false` means: decide nothing this render.
 */
export async function fetchPendingStressLoadAssignment(
  supabase: SupabaseClient,
  memberId: string
): Promise<{ ok: boolean; assignment: StressLoadAssignment | null }> {
  const { data, error } = await supabase
    .from('assessment_assignments')
    .select('id, created_at, reason')
    .eq('member_id', memberId)
    .eq('assessment_definition_id', STRESS_LOAD_DEFINITION_ID)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('fetchPendingStressLoadAssignment failed', error);
    return { ok: false, assignment: null };
  }
  if (!data) return { ok: true, assignment: null };
  const row = data as { id: string; created_at: string; reason: string | null };
  return { ok: true, assignment: { id: row.id, createdAt: row.created_at, reason: row.reason } };
}

/**
 * Every sitting this member has finished, newest first.
 *
 * The coach panel's whole data source, and what the route reads to decide
 * whether a member with no open assignment has a finished one to be shown
 * instead of being turned away.
 */
export async function listStressLoadSessions(
  supabase: SupabaseClient,
  memberId: string,
  limit = 24
): Promise<{ ok: boolean; records: StressLoadSessionRecord[] }> {
  const { data, error } = await supabase
    .from('member_stress_load_sessions')
    .select(SESSION_COLUMNS)
    .eq('member_id', memberId)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('listStressLoadSessions failed', error);
    return { ok: false, records: [] };
  }
  return { ok: true, records: ((data ?? []) as unknown as SessionRow[]).map(fromRow) };
}

/**
 * Writes her finished sitting, if this assignment has no row yet.
 *
 * An insert-if-absent, matching claimWeeklyReflection's own discipline for
 * the same reason: one sitting per assignment is the rule, and a double
 * submit (a slow network, a second tab, a double tap) must not be able to
 * produce a second row or overwrite the first. The partial unique index on
 * assignment_id is what actually enforces it; this turns losing the race
 * into a normal, quiet outcome.
 */
export async function claimStressLoadSession(
  supabase: SupabaseClient,
  memberId: string,
  params: {
    assignmentId: string;
    questionsVersion: number;
    answers: StressLoadAnswers;
    interpretation: StressLoadInterpretation;
    startedAt: string;
  }
): Promise<{ record: StressLoadSessionRecord | null; created: boolean }> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('member_stress_load_sessions')
    .insert({
      member_id: memberId,
      assignment_id: params.assignmentId,
      questions_version: params.questionsVersion,
      answers: params.answers,
      pattern: params.interpretation,
      started_at: params.startedAt,
      completed_at: now,
    })
    .select(SESSION_COLUMNS)
    .maybeSingle();

  if (!error && data) {
    return { record: fromRow(data as unknown as SessionRow), created: true };
  }

  // Either the unique index rejected a second submission for this
  // assignment, or the insert wrote nothing. Both resolve the same way:
  // read back whatever is actually there, so a member who lost the race
  // still sees the sitting that won it.
  if (error) console.error('claimStressLoadSession insert failed', error);
  const existing = await fetchStressLoadSessionForAssignment(supabase, memberId, params.assignmentId);
  return { record: existing, created: false };
}

export async function fetchStressLoadSessionForAssignment(
  supabase: SupabaseClient,
  memberId: string,
  assignmentId: string
): Promise<StressLoadSessionRecord | null> {
  const { data, error } = await supabase
    .from('member_stress_load_sessions')
    .select(SESSION_COLUMNS)
    .eq('member_id', memberId)
    .eq('assignment_id', assignmentId)
    .maybeSingle();

  if (error) {
    console.error('fetchStressLoadSessionForAssignment failed', error);
    return null;
  }
  return data ? fromRow(data as unknown as SessionRow) : null;
}

/**
 * How many distinct days she checked in over the cross reference window.
 *
 * `daily_checkins_current` returns one row per member per local_date, so
 * this is a day count by construction. Scoped in the query rather than
 * fetched wholesale, because the only caller is a member waiting on a
 * submit.
 */
export async function countCheckinDaysForCrossReference(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string
): Promise<number> {
  const since = addDaysToLocalDate(localDate, -(STRESS_LOAD_CROSS_REFERENCE_WINDOW_DAYS - 1));
  const { data, error } = await supabase
    .from('daily_checkins_current')
    .select('local_date')
    .eq('user_id', memberId)
    .gte('local_date', since)
    .lte('local_date', localDate);

  if (error) {
    console.error('countCheckinDaysForCrossReference failed', error);
    return 0;
  }
  return new Set(((data ?? []) as Array<{ local_date: string }>).map((row) => row.local_date)).size;
}

/**
 * Her already-classified signals. A pure read of member_pattern_states
 * through the module that owns it, never a recompute: this experience reads
 * conclusions, it does not draw them.
 */
export async function listPatternStatesForCrossReference(
  supabase: SupabaseClient,
  memberId: string
): Promise<LongitudinalSignal[]> {
  const states = await listMemberPatternStates(supabase, memberId);
  return [...states.values()];
}
