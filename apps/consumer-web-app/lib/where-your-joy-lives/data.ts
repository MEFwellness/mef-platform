/**
 * Where Your Joy Lives on the shared Happiness table (migrations 211 and
 * 212), and the reads its gate needs.
 *
 * Same discipline as every other data.ts here: pure functions taking a
 * caller-scoped SupabaseClient, RLS decides who may read or write what, and
 * a failed read returns a safe value rather than throwing, since every
 * caller is on a page render the member is already waiting on.
 *
 * EVERY READ IS SCOPED BY experience_key. The table holds both Happiness
 * templates, so a query that forgot that clause would hand a coach one
 * template's answers under the other template's questions. There is no
 * unscoped read in this file.
 *
 * NO RENDER WRITES ANYTHING IN THIS FEATURE. There is a draft row, because
 * this experience saves and resumes, but nothing on a read path creates or
 * touches it. The two writers below are both reached from a server action
 * she triggers by tapping Continue or Finish.
 *
 * "NO ERROR" IS NOT "IT WORKED". Every write reads the row back, so a write
 * that matched no RLS policy (which returns zero rows and no error) is
 * caught rather than reported as a success.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { HAPPINESS_DEEP_DIVE_TABLE, WYJL_DEFINITION_ID, WYJL_KEY } from './constants';
import {
  readWyjlAnswers,
  sanitizeWyjlDraft,
  type WyjlAnswers,
  type WyjlDraft,
} from './questions';

const SESSION_COLUMNS =
  'id, assignment_id, experience_key, questions_version, answers, twenty_minute_joy, follow_up_source_experience_key, started_at, completed_at, created_at';

export type WyjlSessionRecord = {
  id: string;
  assignmentId: string | null;
  questionsVersion: number;
  /** Whatever is stored, complete or not. A draft is legitimately partial. */
  draft: WyjlDraft;
  /** Null unless the stored answers are a complete set of nine. Never half an answer sheet. */
  answers: WyjlAnswers | null;
  /** Question eight, from its own column (migration 212). */
  twentyMinuteJoy: string | null;
  /** Which earlier experience this sitting follows. Null for this template. */
  followUpSourceExperienceKey: string | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
};

type SessionRow = {
  id: string;
  assignment_id: string | null;
  experience_key: string;
  questions_version: number;
  answers: unknown;
  twenty_minute_joy: string | null;
  follow_up_source_experience_key: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
};

function fromRow(row: SessionRow): WyjlSessionRecord {
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    questionsVersion: row.questions_version,
    draft: sanitizeWyjlDraft(row.answers) ?? {},
    answers: readWyjlAnswers(row.answers),
    twentyMinuteJoy: row.twenty_minute_joy,
    followUpSourceExperienceKey: row.follow_up_source_experience_key,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

export type WyjlAssignment = {
  id: string;
  createdAt: string;
  reason: string | null;
  /** The stored due date. Every assignment this app makes now carries one. */
  dueAt: string | null;
};

/**
 * Her open assignment for this experience, if she has one.
 *
 * "No row" and "the read did not work" are kept apart, exactly as Owning
 * Your Value keeps them apart and for the same reason: a failed read that
 * looked like "no assignment" would silently take the experience away from
 * a member her coach had just assigned, and a failed read that looked like
 * "assigned" would offer it to somebody who was never given it. `ok: false`
 * means: decide nothing this render.
 */
export async function fetchPendingWyjlAssignment(
  supabase: SupabaseClient,
  memberId: string
): Promise<{ ok: boolean; assignment: WyjlAssignment | null }> {
  const { data, error } = await supabase
    .from('assessment_assignments')
    .select('id, created_at, reason, due_at')
    .eq('member_id', memberId)
    .eq('assessment_definition_id', WYJL_DEFINITION_ID)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('fetchPendingWyjlAssignment failed', error);
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
 * Every sitting this member has FINISHED, newest first.
 *
 * The coach panel's whole data source, and what the route reads to decide
 * whether a member with no open assignment has a finished one to be shown
 * instead of being turned away. Drafts are deliberately excluded: an
 * unfinished sitting is not something a coach should read as an answer.
 */
export async function listWyjlSessions(
  supabase: SupabaseClient,
  memberId: string,
  limit = 24
): Promise<{ ok: boolean; records: WyjlSessionRecord[] }> {
  const { data, error } = await supabase
    .from(HAPPINESS_DEEP_DIVE_TABLE)
    .select(SESSION_COLUMNS)
    .eq('member_id', memberId)
    .eq('experience_key', WYJL_KEY)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('listWyjlSessions failed', error);
    return { ok: false, records: [] };
  }
  return { ok: true, records: ((data ?? []) as unknown as SessionRow[]).map(fromRow) };
}

/**
 * The row for one assignment, finished or not.
 *
 * Scoped by experience_key as well as by assignment, so this can never
 * return the Owning Your Value sitting that happens to sit in the same
 * table.
 */
export async function fetchWyjlSessionForAssignment(
  supabase: SupabaseClient,
  memberId: string,
  assignmentId: string
): Promise<WyjlSessionRecord | null> {
  const { data, error } = await supabase
    .from(HAPPINESS_DEEP_DIVE_TABLE)
    .select(SESSION_COLUMNS)
    .eq('member_id', memberId)
    .eq('experience_key', WYJL_KEY)
    .eq('assignment_id', assignmentId)
    .maybeSingle();

  if (error) {
    console.error('fetchWyjlSessionForAssignment failed', error);
    return null;
  }
  return data ? fromRow(data as unknown as SessionRow) : null;
}

/**
 * Saves what she has written so far, so she can close the app and come
 * back to it.
 *
 * INSERT IF ABSENT, UPDATE OTHERWISE, and never on a render. The row is
 * created by the first Continue she taps, not by opening the screen. A
 * completed sitting is left exactly as it is: migration 211's update policy
 * refuses it in the database, and this refuses it here too rather than
 * sending a write it knows will be rejected.
 *
 * Returns the row it actually read back, so a write that matched no policy
 * is caught by the caller instead of being reported as a save.
 */
export async function saveWyjlDraft(
  supabase: SupabaseClient,
  memberId: string,
  params: { assignmentId: string; questionsVersion: number; draft: WyjlDraft }
): Promise<WyjlSessionRecord | null> {
  const existing = await fetchWyjlSessionForAssignment(supabase, memberId, params.assignmentId);

  if (existing?.completedAt) return existing;

  if (existing) {
    const { data, error } = await supabase
      .from(HAPPINESS_DEEP_DIVE_TABLE)
      .update({ answers: params.draft, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .eq('member_id', memberId)
      .select(SESSION_COLUMNS)
      .maybeSingle();
    if (error) console.error('saveWyjlDraft update failed', error);
    return data ? fromRow(data as unknown as SessionRow) : null;
  }

  const { data, error } = await supabase
    .from(HAPPINESS_DEEP_DIVE_TABLE)
    .insert({
      member_id: memberId,
      experience_key: WYJL_KEY,
      assignment_id: params.assignmentId,
      questions_version: params.questionsVersion,
      answers: params.draft,
      follow_up_source_experience_key: null,
    })
    .select(SESSION_COLUMNS)
    .maybeSingle();

  if (!error && data) return fromRow(data as unknown as SessionRow);

  // Either the unique index rejected a second row for this assignment (a
  // second tab, a double tap), or the insert wrote nothing. Both resolve
  // the same way: read back whatever is actually there.
  if (error) console.error('saveWyjlDraft insert failed', error);
  return await fetchWyjlSessionForAssignment(supabase, memberId, params.assignmentId);
}

/**
 * Stamps her sitting finished, with the complete sheet and the twenty
 * minute answer in its own column.
 *
 * WRITE ONCE. An already-completed row is handed straight back untouched,
 * and the completing update carries `.is('completed_at', null)` so two
 * concurrent submits cannot both stamp it. Migration 211's update policy
 * enforces the identical thing in the database.
 */
export async function completeWyjlSession(
  supabase: SupabaseClient,
  memberId: string,
  params: {
    assignmentId: string;
    questionsVersion: number;
    answers: WyjlAnswers;
    twentyMinuteJoy: string;
  }
): Promise<WyjlSessionRecord | null> {
  const existing =
    (await fetchWyjlSessionForAssignment(supabase, memberId, params.assignmentId)) ??
    (await saveWyjlDraft(supabase, memberId, {
      assignmentId: params.assignmentId,
      questionsVersion: params.questionsVersion,
      draft: params.answers,
    }));

  if (!existing) return null;
  if (existing.completedAt) return existing;

  const { data, error } = await supabase
    .from(HAPPINESS_DEEP_DIVE_TABLE)
    .update({
      answers: params.answers,
      twenty_minute_joy: params.twentyMinuteJoy,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id)
    .eq('member_id', memberId)
    .is('completed_at', null)
    .select(SESSION_COLUMNS)
    .maybeSingle();

  if (error) console.error('completeWyjlSession failed', error);
  if (data) return fromRow(data as unknown as SessionRow);

  // Lost the race, or the update matched nothing. Read back what actually
  // stands, so a member who lost it still sees the sitting that won.
  return await fetchWyjlSessionForAssignment(supabase, memberId, params.assignmentId);
}
