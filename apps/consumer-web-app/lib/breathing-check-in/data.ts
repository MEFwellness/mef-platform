/**
 * Every read and write this feature makes against the database.
 *
 * "NO ERROR" IS NOT "IT WORKED". A write that matches no RLS policy
 * returns zero rows and no error, so every write below is read back and a
 * write that produced nothing is reported as a failure rather than as a
 * success nobody can see.
 *
 * A PARTIAL UNIQUE INDEX CANNOT ARBITRATE AN UPSERT. The one row per
 * assignment index on this table is partial (`where assignment_id is not
 * null`), Postgres will not accept a partial index as an ON CONFLICT
 * arbiter unless the statement repeats its predicate, and PostgREST's
 * onConflict cannot express one. The Health & Lifestyle Intake shipped
 * with that upsert and every autosave in it silently matched nothing. So
 * the save below is a read, then an insert or an update, which is the
 * shape lib/whole-body-signal/data.ts and lib/health-intake/data.ts both
 * use for exactly this reason. The race the index exists for is still
 * closed: a losing insert reads back the row that won.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { BPC_DEFINITION_ID, BPC_TABLE } from './constants';
import { parseBpcResults, sanitizeBpcAnswers, type BpcAnswers, type BpcResults } from './instrument';

const SESSION_COLUMNS =
  'id, member_id, assignment_id, content_version, answers, progress, results, started_at, completed_at';

type SessionRow = {
  id: string;
  member_id: string;
  assignment_id: string | null;
  content_version: number;
  answers: unknown;
  progress: unknown;
  results: unknown;
  started_at: string;
  completed_at: string | null;
};

export type BpcSessionRecord = {
  id: string;
  memberId: string;
  assignmentId: string | null;
  contentVersion: number;
  answers: BpcAnswers;
  /** Where a save last said she was. Never trusted on its own (./steps.ts). */
  stepIndex: number;
  results: BpcResults | null;
  startedAt: string;
  completedAt: string | null;
};

function readStepIndex(progress: unknown): number {
  if (!progress || typeof progress !== 'object') return 0;
  const value = (progress as Record<string, unknown>).stepIndex;
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function fromRow(row: SessionRow): BpcSessionRecord {
  return {
    id: row.id,
    memberId: row.member_id,
    assignmentId: row.assignment_id,
    contentVersion: row.content_version,
    // Sanitised on the way OUT as well as on the way in, so a row written
    // by an older version of the instrument reads as unanswered on the
    // questions that moved rather than as an answer nobody gave.
    answers: sanitizeBpcAnswers(row.answers),
    stepIndex: readStepIndex(row.progress),
    results: parseBpcResults(row.results),
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

export type BpcAssignment = {
  id: string;
  createdAt: string;
  reason: string | null;
  dueAt: string | null;
};

/**
 * Her open assignment, if she has one.
 *
 * "No row" and "the read did not work" are kept apart, because a failed
 * read that looked like "no assignment" would silently take the check-in
 * away from a member her coach had just assigned.
 */
export async function fetchPendingBpcAssignment(
  supabase: SupabaseClient,
  memberId: string
): Promise<{ ok: boolean; assignment: BpcAssignment | null }> {
  const { data, error } = await supabase
    .from('assessment_assignments')
    .select('id, created_at, reason, due_at')
    .eq('member_id', memberId)
    .eq('assessment_definition_id', BPC_DEFINITION_ID)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('fetchPendingBpcAssignment failed', error);
    return { ok: false, assignment: null };
  }
  if (!data) return { ok: true, assignment: null };
  const row = data as {
    id: string;
    created_at: string;
    reason: string | null;
    due_at: string | null;
  };
  return {
    ok: true,
    assignment: { id: row.id, createdAt: row.created_at, reason: row.reason, dueAt: row.due_at },
  };
}

/**
 * Every FINISHED sitting, newest first.
 *
 * NOTHING IS EVER OVERWRITTEN, which is what makes this list the history a
 * coach compares across. A retake is a new assignment and a new row, and
 * completion is write once in the database, so a second sitting can never
 * replace the first.
 */
export async function listBpcSessions(
  supabase: SupabaseClient,
  memberId: string,
  limit = 24
): Promise<{ ok: boolean; records: BpcSessionRecord[] }> {
  const { data, error } = await supabase
    .from(BPC_TABLE)
    .select(SESSION_COLUMNS)
    .eq('member_id', memberId)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('listBpcSessions failed', error);
    return { ok: false, records: [] };
  }
  return { ok: true, records: ((data ?? []) as unknown as SessionRow[]).map(fromRow) };
}

/** The sitting answering one assignment, finished or not. This is what resume reads. */
export async function fetchBpcSessionForAssignment(
  supabase: SupabaseClient,
  memberId: string,
  assignmentId: string
): Promise<BpcSessionRecord | null> {
  const { data, error } = await supabase
    .from(BPC_TABLE)
    .select(SESSION_COLUMNS)
    .eq('member_id', memberId)
    .eq('assignment_id', assignmentId)
    .maybeSingle();

  if (error) {
    console.error('fetchBpcSessionForAssignment failed', error);
    return null;
  }
  return data ? fromRow(data as unknown as SessionRow) : null;
}

export type BpcProgressWrite = {
  assignmentId: string;
  answers: BpcAnswers;
  stepIndex: number;
  contentVersion: number;
};

/**
 * Saves how far she has got, creating the row if this is her first answer
 * on this assignment.
 *
 * An insert if absent then update, rather than an upsert, for the two
 * reasons this file's header gives: the partial index cannot arbitrate a
 * conflict, and the insert and the update pass through two different RLS
 * policies where only the insert one may create a sitting against a
 * pending assignment. Losing the race to another tab is a normal, quiet
 * outcome: the read back returns the row that won.
 */
export async function saveBpcProgress(
  supabase: SupabaseClient,
  memberId: string,
  params: BpcProgressWrite
): Promise<BpcSessionRecord | null> {
  const existing = await fetchBpcSessionForAssignment(supabase, memberId, params.assignmentId);

  if (!existing) {
    const { data, error } = await supabase
      .from(BPC_TABLE)
      .insert({
        member_id: memberId,
        assignment_id: params.assignmentId,
        content_version: params.contentVersion,
        answers: params.answers,
        progress: { stepIndex: params.stepIndex },
      })
      .select(SESSION_COLUMNS)
      .maybeSingle();

    if (!error && data) return fromRow(data as unknown as SessionRow);
    if (error) console.error('saveBpcProgress insert failed', error);
    return fetchBpcSessionForAssignment(supabase, memberId, params.assignmentId);
  }

  // A finished sitting is immutable. Nothing is attempted against it, so a
  // stale tab reopening on an old step cannot rewrite a completion.
  if (existing.completedAt) return existing;

  const { data, error } = await supabase
    .from(BPC_TABLE)
    .update({
      content_version: params.contentVersion,
      answers: params.answers,
      progress: { stepIndex: params.stepIndex },
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id)
    .select(SESSION_COLUMNS)
    .maybeSingle();

  if (error) {
    console.error('saveBpcProgress update failed', error);
    return null;
  }
  return data ? fromRow(data as unknown as SessionRow) : null;
}

/**
 * Finishes the sitting.
 *
 * Write once, by migration 231's update policy: a row whose completed_at is
 * already set matches no policy, so a second submit changes nothing and the
 * row that is already there is read back and returned. That is also what
 * makes the submit safe to press twice on a flaky connection.
 */
export async function completeBpcSession(
  supabase: SupabaseClient,
  memberId: string,
  params: {
    sessionId: string;
    answers: BpcAnswers;
    results: BpcResults;
    stepIndex: number;
  }
): Promise<BpcSessionRecord | null> {
  const { data, error } = await supabase
    .from(BPC_TABLE)
    .update({
      answers: params.answers,
      results: params.results,
      progress: { stepIndex: params.stepIndex },
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.sessionId)
    .eq('member_id', memberId)
    .select(SESSION_COLUMNS)
    .maybeSingle();

  if (!error && data) return fromRow(data as unknown as SessionRow);
  if (error) console.error('completeBpcSession update failed', error);

  const { data: readBack } = await supabase
    .from(BPC_TABLE)
    .select(SESSION_COLUMNS)
    .eq('id', params.sessionId)
    .eq('member_id', memberId)
    .maybeSingle();

  return readBack ? fromRow(readBack as unknown as SessionRow) : null;
}
