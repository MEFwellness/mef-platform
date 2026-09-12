/**
 * This assessment's own tables, plus the reads its gate needs.
 *
 * A ROW EXISTS BEFORE SHE FINISHES, AND A RENDER STILL NEVER MAKES ONE.
 * The assessment is resumable, so a row exists while she is partway
 * through. It is created by the save behind her own answer and her own
 * Continue (app/actions/wholeBodySignal.ts) and by nothing else. A page
 * render may read; it may not insert, claim, upsert or schedule.
 *
 * "NO ERROR" IS NOT "IT WORKED". Every write reads the row back, so a
 * write that matched no RLS policy, which returns zero rows and no error,
 * is caught here rather than reported as a success.
 *
 * COMPLETION IS WRITE ONCE, enforced by migration 225's update policy
 * matching only a row whose completed_at is still null. This module does
 * not re-check that in application code, because a second copy of the rule
 * is exactly how the two come to disagree.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { WBS_DEFINITION_ID } from './constants';
import type { WbsAnswers, WbsResults } from './types';

const SESSION_COLUMNS =
  'id, assignment_id, content_version, routing_option_key, answers, results, progress, started_at, completed_at, created_at';

export type WbsSessionRecord = {
  id: string;
  assignmentId: string | null;
  contentVersion: number;
  /** Null until she has answered Section 8's routing question. */
  routingOptionKey: string | null;
  answers: WbsAnswers;
  results: WbsResults | null;
  stepIndex: number;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
};

type SessionRow = {
  id: string;
  assignment_id: string | null;
  content_version: number;
  routing_option_key: string | null;
  answers: unknown;
  results: unknown;
  progress: unknown;
  started_at: string;
  completed_at: string | null;
  created_at: string;
};

function readAnswers(raw: unknown): WbsAnswers {
  if (!raw || typeof raw !== 'object') return {};
  const out: WbsAnswers = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

function readNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Null rather than half a reading. A partially readable results object is not a reading. */
export function readResults(raw: unknown): WbsResults | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (!Array.isArray(value.sections) || !Array.isArray(value.zones)) return null;
  if (!value.load || typeof value.load !== 'object') return null;

  const sections = [];
  for (const entry of value.sections) {
    if (!entry || typeof entry !== 'object') return null;
    const row = entry as Record<string, unknown>;
    if (typeof row.sectionKey !== 'string') return null;
    if (typeof row.percent !== 'number' || typeof row.bandKey !== 'string') return null;
    sections.push({
      sectionKey: row.sectionKey,
      points: readNumber(row.points),
      possible: readNumber(row.possible),
      percent: row.percent,
      bandKey: row.bandKey,
      answeredCount: readNumber(row.answeredCount),
      pntaCount: readNumber(row.pntaCount),
    });
  }

  const zones = [];
  for (const entry of value.zones) {
    if (!entry || typeof entry !== 'object') return null;
    const row = entry as Record<string, unknown>;
    if (typeof row.zoneKey !== 'string' || typeof row.percent !== 'number') return null;
    zones.push({
      zoneKey: row.zoneKey,
      points: readNumber(row.points),
      possible: readNumber(row.possible),
      percent: row.percent,
    });
  }

  const load = value.load as Record<string, unknown>;
  if (typeof load.value !== 'number') return null;

  return {
    routingOptionKey: typeof value.routingOptionKey === 'string' ? value.routingOptionKey : null,
    sections,
    zones,
    load: {
      value: load.value,
      componentA: readNumber(load.componentA),
      componentB: readNumber(load.componentB),
      componentC: readNumber(load.componentC),
    },
  };
}

function readStepIndex(raw: unknown): number {
  if (!raw || typeof raw !== 'object') return 0;
  const value = (raw as Record<string, unknown>).stepIndex;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function fromRow(row: SessionRow): WbsSessionRecord {
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    contentVersion: row.content_version,
    routingOptionKey: row.routing_option_key,
    answers: readAnswers(row.answers),
    results: readResults(row.results),
    stepIndex: readStepIndex(row.progress),
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

export type WbsAssignment = {
  id: string;
  createdAt: string;
  reason: string | null;
  dueAt: string | null;
};

/**
 * Her open assignment, if she has one.
 *
 * "No row" and "the read did not work" are kept apart, because a failed
 * read that looked like "no assignment" would silently take the assessment
 * away from a member her coach had just assigned.
 */
export async function fetchPendingWbsAssignment(
  supabase: SupabaseClient,
  memberId: string
): Promise<{ ok: boolean; assignment: WbsAssignment | null }> {
  const { data, error } = await supabase
    .from('assessment_assignments')
    .select('id, created_at, reason, due_at')
    .eq('member_id', memberId)
    .eq('assessment_definition_id', WBS_DEFINITION_ID)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('fetchPendingWbsAssignment failed', error);
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
export async function listWbsSessions(
  supabase: SupabaseClient,
  memberId: string,
  limit = 24
): Promise<{ ok: boolean; records: WbsSessionRecord[] }> {
  const { data, error } = await supabase
    .from('member_whole_body_signal_sessions')
    .select(SESSION_COLUMNS)
    .eq('member_id', memberId)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('listWbsSessions failed', error);
    return { ok: false, records: [] };
  }
  return { ok: true, records: ((data ?? []) as unknown as SessionRow[]).map(fromRow) };
}

/** The sitting answering one assignment, finished or not. This is what resume reads. */
export async function fetchWbsSessionForAssignment(
  supabase: SupabaseClient,
  memberId: string,
  assignmentId: string
): Promise<WbsSessionRecord | null> {
  const { data, error } = await supabase
    .from('member_whole_body_signal_sessions')
    .select(SESSION_COLUMNS)
    .eq('member_id', memberId)
    .eq('assignment_id', assignmentId)
    .maybeSingle();

  if (error) {
    console.error('fetchWbsSessionForAssignment failed', error);
    return null;
  }
  return data ? fromRow(data as unknown as SessionRow) : null;
}

export type ProgressWrite = {
  assignmentId: string;
  routingOptionKey: string | null;
  answers: WbsAnswers;
  stepIndex: number;
  contentVersion: number;
};

/**
 * Saves how far she has got, creating the row if this is her first answer
 * on this assignment.
 *
 * An insert if absent then update, rather than an upsert, because the
 * insert and the update pass through two different RLS policies and only
 * the insert one may create a sitting for a pending assignment. Losing the
 * race to another tab is a normal, quiet outcome: the update below then
 * writes the same thing.
 */
export async function saveWbsProgress(
  supabase: SupabaseClient,
  memberId: string,
  params: ProgressWrite
): Promise<WbsSessionRecord | null> {
  const existing = await fetchWbsSessionForAssignment(supabase, memberId, params.assignmentId);

  if (!existing) {
    const { data, error } = await supabase
      .from('member_whole_body_signal_sessions')
      .insert({
        member_id: memberId,
        assignment_id: params.assignmentId,
        content_version: params.contentVersion,
        routing_option_key: params.routingOptionKey,
        answers: params.answers,
        progress: { stepIndex: params.stepIndex },
      })
      .select(SESSION_COLUMNS)
      .maybeSingle();

    if (!error && data) return fromRow(data as unknown as SessionRow);
    // Either another tab won the race or the write matched no policy. Read
    // back what is actually there rather than reporting a success nobody
    // can see.
    return fetchWbsSessionForAssignment(supabase, memberId, params.assignmentId);
  }

  // A finished sitting is immutable. Nothing is attempted against it, so a
  // stale tab reopening on an old step cannot rewrite a completion.
  if (existing.completedAt) return existing;

  const { data, error } = await supabase
    .from('member_whole_body_signal_sessions')
    .update({
      routing_option_key: params.routingOptionKey,
      answers: params.answers,
      progress: { stepIndex: params.stepIndex },
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id)
    .select(SESSION_COLUMNS)
    .maybeSingle();

  if (error) {
    console.error('saveWbsProgress update failed', error);
    return null;
  }
  return data ? fromRow(data as unknown as SessionRow) : null;
}

/**
 * Finishes the sitting.
 *
 * Write once, by migration 225's update policy: a row whose completed_at
 * is already set matches no policy, so a second submit changes nothing and
 * the row that is already there is read back and returned.
 */
export async function completeWbsSession(
  supabase: SupabaseClient,
  memberId: string,
  params: {
    sessionId: string;
    routingOptionKey: string | null;
    answers: WbsAnswers;
    results: WbsResults;
    stepIndex: number;
  }
): Promise<{ record: WbsSessionRecord | null; created: boolean }> {
  const { data, error } = await supabase
    .from('member_whole_body_signal_sessions')
    .update({
      routing_option_key: params.routingOptionKey,
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

  if (!error && data) return { record: fromRow(data as unknown as SessionRow), created: true };

  const { data: readBack } = await supabase
    .from('member_whole_body_signal_sessions')
    .select(SESSION_COLUMNS)
    .eq('id', params.sessionId)
    .eq('member_id', memberId)
    .maybeSingle();

  return {
    record: readBack ? fromRow(readBack as unknown as SessionRow) : null,
    created: false,
  };
}

// ---------------------------------------------------------------------
// The coach's own rows.
// ---------------------------------------------------------------------

export type WbsFocusRecord = {
  sessionId: string;
  sectionKey: string;
  chosenAt: string;
};

/** The coach's chosen focus for each of this client's sittings. */
export async function listWbsFocus(
  supabase: SupabaseClient,
  memberId: string
): Promise<{ ok: boolean; records: WbsFocusRecord[] }> {
  const { data, error } = await supabase
    .from('member_whole_body_signal_focus')
    .select('session_id, section_key, chosen_at')
    .eq('member_id', memberId);
  if (error) {
    console.error('listWbsFocus failed', error);
    return { ok: false, records: [] };
  }
  return {
    ok: true,
    records: (data ?? []).map((row) => ({
      sessionId: row.session_id as string,
      sectionKey: row.section_key as string,
      chosenAt: row.chosen_at as string,
    })),
  };
}

/** One sitting's focus, replaced rather than stacked. Read back, never assumed. */
export async function saveWbsFocus(
  supabase: SupabaseClient,
  params: { sessionId: string; memberId: string; sectionKey: string; coachId: string }
): Promise<WbsFocusRecord | null> {
  const { data, error } = await supabase
    .from('member_whole_body_signal_focus')
    .upsert(
      {
        session_id: params.sessionId,
        member_id: params.memberId,
        section_key: params.sectionKey,
        chosen_by: params.coachId,
        chosen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'session_id' }
    )
    .select('session_id, section_key, chosen_at')
    .maybeSingle();

  if (error || !data) {
    console.error('saveWbsFocus failed', error);
    return null;
  }
  return {
    sessionId: data.session_id as string,
    sectionKey: data.section_key as string,
    chosenAt: data.chosen_at as string,
  };
}

export type WbsQuestionAction = {
  sessionId: string;
  questionKey: string;
  askedAt: string | null;
  hiddenAt: string | null;
  savedAt: string | null;
};

export async function listWbsQuestionActions(
  supabase: SupabaseClient,
  memberId: string,
  sessionIds: string[]
): Promise<{ ok: boolean; records: WbsQuestionAction[] }> {
  if (sessionIds.length === 0) return { ok: true, records: [] };
  const { data, error } = await supabase
    .from('member_whole_body_signal_question_actions')
    .select('session_id, question_key, asked_at, hidden_at, saved_at')
    .eq('member_id', memberId)
    .in('session_id', sessionIds);
  if (error) {
    console.error('listWbsQuestionActions failed', error);
    return { ok: false, records: [] };
  }
  return {
    ok: true,
    records: (data ?? []).map((row) => ({
      sessionId: row.session_id as string,
      questionKey: row.question_key as string,
      askedAt: (row.asked_at as string | null) ?? null,
      hiddenAt: (row.hidden_at as string | null) ?? null,
      savedAt: (row.saved_at as string | null) ?? null,
    })),
  };
}

/**
 * One coaching question's state for one sitting.
 *
 * THE THREE MARKS ARE INDEPENDENT. Only the fields the coach's tap names
 * are written, so marking a question asked does not quietly clear that it
 * was saved to session prep. A blank is not an erasure.
 */
export async function saveWbsQuestionAction(
  supabase: SupabaseClient,
  params: {
    sessionId: string;
    memberId: string;
    questionKey: string;
    coachId: string;
    asked?: boolean;
    hidden?: boolean;
    saved?: boolean;
  }
): Promise<WbsQuestionAction | null> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    session_id: params.sessionId,
    member_id: params.memberId,
    question_key: params.questionKey,
    updated_by: params.coachId,
    updated_at: now,
  };

  const { data: existing } = await supabase
    .from('member_whole_body_signal_question_actions')
    .select('asked_at, hidden_at, saved_at')
    .eq('session_id', params.sessionId)
    .eq('question_key', params.questionKey)
    .maybeSingle();

  const prior = (existing ?? {}) as { asked_at?: string | null; hidden_at?: string | null; saved_at?: string | null };
  patch.asked_at = params.asked === undefined ? (prior.asked_at ?? null) : params.asked ? now : null;
  patch.hidden_at = params.hidden === undefined ? (prior.hidden_at ?? null) : params.hidden ? now : null;
  patch.saved_at = params.saved === undefined ? (prior.saved_at ?? null) : params.saved ? now : null;

  const { data, error } = await supabase
    .from('member_whole_body_signal_question_actions')
    .upsert(patch, { onConflict: 'session_id,question_key' })
    .select('session_id, question_key, asked_at, hidden_at, saved_at')
    .maybeSingle();

  if (error || !data) {
    console.error('saveWbsQuestionAction failed', error);
    return null;
  }
  return {
    sessionId: data.session_id as string,
    questionKey: data.question_key as string,
    askedAt: (data.asked_at as string | null) ?? null,
    hiddenAt: (data.hidden_at as string | null) ?? null,
    savedAt: (data.saved_at as string | null) ?? null,
  };
}
