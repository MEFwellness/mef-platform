/**
 * The survey's own table, plus the reads its gate needs.
 *
 * A ROW EXISTS BEFORE SHE FINISHES, AND A RENDER STILL NEVER MAKES ONE.
 * This survey is resumable, so unlike the Stress & Load Deep-Dive there is
 * a row while she is partway through. It is created by the server action
 * behind her Continue button (app/actions/bodySystems.ts) and by nothing
 * else. A page render may read; it may not insert, claim, upsert or
 * schedule.
 *
 * "NO ERROR" IS NOT "IT WORKED". Every write reads the row back, so a
 * write that matched no RLS policy, which returns zero rows and no error,
 * is caught here rather than reported to her as a success.
 *
 * COMPLETION IS WRITE ONCE, enforced by migration 220's update policy
 * matching only a row whose completed_at is still null. This module does
 * not re-check that in application code, because a second copy of the rule
 * is exactly how the two come to disagree.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { BODY_SYSTEMS_DEFINITION_ID } from './constants';
import type {
  BodySystemsAnswers,
  BodySystemsBranch,
  BodySystemsRedFlagAnswers,
  BodySystemsResults,
} from './types';

const SESSION_COLUMNS =
  'id, assignment_id, content_version, branch, answers, red_flag_answers, results, progress, started_at, completed_at, created_at';

export type BodySystemsSessionRecord = {
  id: string;
  assignmentId: string | null;
  contentVersion: number;
  branch: BodySystemsBranch;
  answers: BodySystemsAnswers;
  redFlagAnswers: BodySystemsRedFlagAnswers;
  results: BodySystemsResults | null;
  /** How far she got. Zero on a sitting she has only just started. */
  stepIndex: number;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
};

type SessionRow = {
  id: string;
  assignment_id: string | null;
  content_version: number;
  branch: string;
  answers: unknown;
  red_flag_answers: unknown;
  results: unknown;
  progress: unknown;
  started_at: string;
  completed_at: string | null;
  created_at: string;
};

function readAnswers(raw: unknown): BodySystemsAnswers {
  if (!raw || typeof raw !== 'object') return {};
  const out: BodySystemsAnswers = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

function readRedFlagAnswers(raw: unknown): BodySystemsRedFlagAnswers {
  if (!raw || typeof raw !== 'object') return {};
  const out: BodySystemsRedFlagAnswers = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'boolean') out[key] = value;
  }
  return out;
}

/** Null rather than half a reading, the same rule sanitizeInterpretation holds for the deep-dive. */
export function readResults(raw: unknown): BodySystemsResults | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (value.branch !== 'a' && value.branch !== 'b') return null;
  if (!Array.isArray(value.sections)) return null;

  const sections = [];
  for (const entry of value.sections) {
    if (!entry || typeof entry !== 'object') return null;
    const row = entry as Record<string, unknown>;
    if (typeof row.sectionKey !== 'string') return null;
    if (typeof row.percent !== 'number' || typeof row.bandKey !== 'string') return null;
    sections.push({
      sectionKey: row.sectionKey,
      points: typeof row.points === 'number' ? row.points : 0,
      possible: typeof row.possible === 'number' ? row.possible : 0,
      percent: row.percent,
      bandKey: row.bandKey,
      answeredCount: typeof row.answeredCount === 'number' ? row.answeredCount : 0,
      dnaCount: typeof row.dnaCount === 'number' ? row.dnaCount : 0,
    });
  }
  return { branch: value.branch, sections };
}

function readStepIndex(raw: unknown): number {
  if (!raw || typeof raw !== 'object') return 0;
  const value = (raw as Record<string, unknown>).stepIndex;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function fromRow(row: SessionRow): BodySystemsSessionRecord {
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    contentVersion: row.content_version,
    branch: row.branch === 'b' ? 'b' : 'a',
    answers: readAnswers(row.answers),
    redFlagAnswers: readRedFlagAnswers(row.red_flag_answers),
    results: readResults(row.results),
    stepIndex: readStepIndex(row.progress),
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

export type BodySystemsAssignment = {
  id: string;
  createdAt: string;
  reason: string | null;
  /** Every new assignment gets one. Null only on a row made before due dates existed. */
  dueAt: string | null;
};

/**
 * Her open assignment, if she has one.
 *
 * "No row" and "the read did not work" are kept apart, for the reason
 * fetchPendingStressLoadAssignment keeps them apart: a failed read that
 * looked like "no assignment" would silently take the survey away from a
 * member her coach had just assigned.
 */
export async function fetchPendingBodySystemsAssignment(
  supabase: SupabaseClient,
  memberId: string
): Promise<{ ok: boolean; assignment: BodySystemsAssignment | null }> {
  const { data, error } = await supabase
    .from('assessment_assignments')
    .select('id, created_at, reason, due_at')
    .eq('member_id', memberId)
    .eq('assessment_definition_id', BODY_SYSTEMS_DEFINITION_ID)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('fetchPendingBodySystemsAssignment failed', error);
    return { ok: false, assignment: null };
  }
  if (!data) return { ok: true, assignment: null };
  const row = data as { id: string; created_at: string; reason: string | null; due_at: string | null };
  return {
    ok: true,
    assignment: { id: row.id, createdAt: row.created_at, reason: row.reason, dueAt: row.due_at },
  };
}

/** Every FINISHED sitting, newest first. The coach panel's data source. */
export async function listBodySystemsSessions(
  supabase: SupabaseClient,
  memberId: string,
  limit = 24
): Promise<{ ok: boolean; records: BodySystemsSessionRecord[] }> {
  const { data, error } = await supabase
    .from('member_body_systems_sessions')
    .select(SESSION_COLUMNS)
    .eq('member_id', memberId)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('listBodySystemsSessions failed', error);
    return { ok: false, records: [] };
  }
  return { ok: true, records: ((data ?? []) as unknown as SessionRow[]).map(fromRow) };
}

/** The sitting answering one assignment, finished or not. This is what resume reads. */
export async function fetchBodySystemsSessionForAssignment(
  supabase: SupabaseClient,
  memberId: string,
  assignmentId: string
): Promise<BodySystemsSessionRecord | null> {
  const { data, error } = await supabase
    .from('member_body_systems_sessions')
    .select(SESSION_COLUMNS)
    .eq('member_id', memberId)
    .eq('assignment_id', assignmentId)
    .maybeSingle();

  if (error) {
    console.error('fetchBodySystemsSessionForAssignment failed', error);
    return null;
  }
  return data ? fromRow(data as unknown as SessionRow) : null;
}

export type ProgressWrite = {
  assignmentId: string;
  branch: BodySystemsBranch;
  answers: BodySystemsAnswers;
  redFlagAnswers: BodySystemsRedFlagAnswers;
  stepIndex: number;
  contentVersion: number;
};

/**
 * Saves how far she has got, creating the row if this is her first
 * Continue on this assignment.
 *
 * An insert if absent then update, rather than an upsert, because the
 * insert and the update pass through two different RLS policies and only
 * the insert one may create a sitting for a pending assignment. Losing the
 * race to another tab is a normal, quiet outcome: the update below then
 * writes the same thing.
 */
export async function saveBodySystemsProgress(
  supabase: SupabaseClient,
  memberId: string,
  params: ProgressWrite
): Promise<BodySystemsSessionRecord | null> {
  const existing = await fetchBodySystemsSessionForAssignment(supabase, memberId, params.assignmentId);

  if (!existing) {
    const { data, error } = await supabase
      .from('member_body_systems_sessions')
      .insert({
        member_id: memberId,
        assignment_id: params.assignmentId,
        content_version: params.contentVersion,
        branch: params.branch,
        answers: params.answers,
        red_flag_answers: params.redFlagAnswers,
        progress: { stepIndex: params.stepIndex },
      })
      .select(SESSION_COLUMNS)
      .maybeSingle();

    if (!error && data) return fromRow(data as unknown as SessionRow);
    // Either another tab won the race or the write matched no policy. Read
    // back what is actually there rather than reporting a success nobody
    // can see.
    return fetchBodySystemsSessionForAssignment(supabase, memberId, params.assignmentId);
  }

  // A finished sitting is immutable. Nothing is attempted against it, so a
  // stale tab reopening on an old step cannot rewrite a completion.
  if (existing.completedAt) return existing;

  const { data, error } = await supabase
    .from('member_body_systems_sessions')
    .update({
      branch: params.branch,
      answers: params.answers,
      red_flag_answers: params.redFlagAnswers,
      progress: { stepIndex: params.stepIndex },
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id)
    .select(SESSION_COLUMNS)
    .maybeSingle();

  if (error) {
    console.error('saveBodySystemsProgress update failed', error);
    return null;
  }
  return data ? fromRow(data as unknown as SessionRow) : null;
}

/**
 * Finishes the sitting.
 *
 * Write once, by migration 220's update policy: a row whose completed_at
 * is already set matches no policy, so a second submit changes nothing and
 * the row that is already there is read back and returned.
 */
export async function completeBodySystemsSession(
  supabase: SupabaseClient,
  memberId: string,
  params: {
    sessionId: string;
    answers: BodySystemsAnswers;
    redFlagAnswers: BodySystemsRedFlagAnswers;
    results: BodySystemsResults;
    stepIndex: number;
  }
): Promise<{ record: BodySystemsSessionRecord | null; created: boolean }> {
  const { data, error } = await supabase
    .from('member_body_systems_sessions')
    .update({
      answers: params.answers,
      red_flag_answers: params.redFlagAnswers,
      results: params.results,
      progress: { stepIndex: params.stepIndex },
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.sessionId)
    .eq('member_id', memberId)
    .select(SESSION_COLUMNS)
    .maybeSingle();

  if (!error && data) return { record: fromRow(data as unknown as SessionRow), created: true };

  const { data: readBack } = await supabase
    .from('member_body_systems_sessions')
    .select(SESSION_COLUMNS)
    .eq('id', params.sessionId)
    .eq('member_id', memberId)
    .maybeSingle();

  return {
    record: readBack ? fromRow(readBack as unknown as SessionRow) : null,
    created: false,
  };
}

/** Her remembered branch, or null when she has never answered the branch question. */
export async function fetchMemberBranch(
  supabase: SupabaseClient,
  memberId: string
): Promise<BodySystemsBranch | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('body_systems_branch')
    .eq('id', memberId)
    .maybeSingle();
  if (error || !data) return null;
  const value = (data as { body_systems_branch: string | null }).body_systems_branch;
  return value === 'a' || value === 'b' ? value : null;
}

/** Remembers her branch for next time. Written by her own tap, never inferred. */
export async function saveMemberBranch(
  supabase: SupabaseClient,
  memberId: string,
  branch: BodySystemsBranch
): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ body_systems_branch: branch })
    .eq('id', memberId)
    .select('id')
    .maybeSingle();
  if (error) {
    console.error('saveMemberBranch failed', error);
    return false;
  }
  return Boolean(data);
}
