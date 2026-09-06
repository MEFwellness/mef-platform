/**
 * Owning Your Value's table (migration 211) and the reads its gate needs.
 *
 * Same discipline as every other data.ts here: pure functions taking a
 * caller-scoped SupabaseClient, RLS decides who may read or write what, and
 * a failed read returns a safe value rather than throwing, since every
 * caller is on a page render the member is already waiting on.
 *
 * NO RENDER WRITES ANYTHING IN THIS FEATURE. There is a draft row, because
 * this experience saves and resumes, but nothing on a read path creates or
 * touches it. The two writers below are both reached from a server action
 * she triggers by tapping Continue or Finish. That is the standing rule as
 * written: a page render may read, it may not insert, claim, upsert or
 * schedule.
 *
 * "NO ERROR" IS NOT "IT WORKED". Every write reads the row back, so a write
 * that matched no RLS policy (which returns zero rows and no error) is
 * caught rather than reported as a success.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { HAPPINESS_DEEP_DIVE_TABLE, OYV_DEFINITION_ID, OYV_KEY } from './constants';
import { readOyvAnswers, sanitizeOyvDraft, type OyvAnswers, type OyvDraft } from './questions';

const SESSION_COLUMNS =
  'id, assignment_id, experience_key, questions_version, answers, held_sentence, follow_up_source_experience_key, started_at, completed_at, created_at';

export type OyvSessionRecord = {
  id: string;
  assignmentId: string | null;
  questionsVersion: number;
  /** Whatever is stored, complete or not. A draft is legitimately partial. */
  draft: OyvDraft;
  /** Null unless the stored answers are a complete set of nine. Never half an answer sheet. */
  answers: OyvAnswers | null;
  /** The sentence she wrote at question nine, from its own column. */
  heldSentence: string | null;
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
  held_sentence: string | null;
  follow_up_source_experience_key: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
};

function fromRow(row: SessionRow): OyvSessionRecord {
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    questionsVersion: row.questions_version,
    draft: sanitizeOyvDraft(row.answers) ?? {},
    answers: readOyvAnswers(row.answers),
    heldSentence: row.held_sentence,
    followUpSourceExperienceKey: row.follow_up_source_experience_key,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

export type OyvAssignment = {
  id: string;
  createdAt: string;
  reason: string | null;
  /** The stored due date. Every assignment this app makes now carries one. */
  dueAt: string | null;
};

/**
 * Her open assignment for this experience, if she has one.
 *
 * "No row" and "the read did not work" are kept apart, exactly as the
 * Stress & Load Deep-Dive keeps them apart and for the same reason: a
 * failed read that looked like "no assignment" would silently take the
 * experience away from a member her coach had just assigned, and a failed
 * read that looked like "assigned" would offer it to somebody who was never
 * given it. `ok: false` means: decide nothing this render.
 */
export async function fetchPendingOyvAssignment(
  supabase: SupabaseClient,
  memberId: string
): Promise<{ ok: boolean; assignment: OyvAssignment | null }> {
  const { data, error } = await supabase
    .from('assessment_assignments')
    .select('id, created_at, reason, due_at')
    .eq('member_id', memberId)
    .eq('assessment_definition_id', OYV_DEFINITION_ID)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('fetchPendingOyvAssignment failed', error);
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
export async function listOyvSessions(
  supabase: SupabaseClient,
  memberId: string,
  limit = 24
): Promise<{ ok: boolean; records: OyvSessionRecord[] }> {
  const { data, error } = await supabase
    .from(HAPPINESS_DEEP_DIVE_TABLE)
    .select(SESSION_COLUMNS)
    .eq('member_id', memberId)
    .eq('experience_key', OYV_KEY)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('listOyvSessions failed', error);
    return { ok: false, records: [] };
  }
  return { ok: true, records: ((data ?? []) as unknown as SessionRow[]).map(fromRow) };
}

/** The row for one assignment, finished or not. */
export async function fetchOyvSessionForAssignment(
  supabase: SupabaseClient,
  memberId: string,
  assignmentId: string
): Promise<OyvSessionRecord | null> {
  const { data, error } = await supabase
    .from(HAPPINESS_DEEP_DIVE_TABLE)
    .select(SESSION_COLUMNS)
    .eq('member_id', memberId)
    .eq('assignment_id', assignmentId)
    .maybeSingle();

  if (error) {
    console.error('fetchOyvSessionForAssignment failed', error);
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
export async function saveOyvDraft(
  supabase: SupabaseClient,
  memberId: string,
  params: { assignmentId: string; questionsVersion: number; draft: OyvDraft }
): Promise<OyvSessionRecord | null> {
  const existing = await fetchOyvSessionForAssignment(supabase, memberId, params.assignmentId);

  if (existing?.completedAt) return existing;

  if (existing) {
    const { data, error } = await supabase
      .from(HAPPINESS_DEEP_DIVE_TABLE)
      .update({ answers: params.draft, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .eq('member_id', memberId)
      .select(SESSION_COLUMNS)
      .maybeSingle();
    if (error) console.error('saveOyvDraft update failed', error);
    return data ? fromRow(data as unknown as SessionRow) : null;
  }

  const { data, error } = await supabase
    .from(HAPPINESS_DEEP_DIVE_TABLE)
    .insert({
      member_id: memberId,
      experience_key: OYV_KEY,
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
  if (error) console.error('saveOyvDraft insert failed', error);
  return await fetchOyvSessionForAssignment(supabase, memberId, params.assignmentId);
}

/**
 * Stamps her sitting finished, with the complete sheet and the sentence she
 * wants held.
 *
 * WRITE ONCE. An already-completed row is handed straight back untouched,
 * and the completing update carries `.is('completed_at', null)` so two
 * concurrent submits cannot both stamp it. That is the same discipline the
 * assessment runtime's own completion holds, and migration 211's update
 * policy enforces the identical thing in the database.
 */
export async function completeOyvSession(
  supabase: SupabaseClient,
  memberId: string,
  params: {
    assignmentId: string;
    questionsVersion: number;
    answers: OyvAnswers;
    heldSentence: string;
  }
): Promise<OyvSessionRecord | null> {
  const existing =
    (await fetchOyvSessionForAssignment(supabase, memberId, params.assignmentId)) ??
    (await saveOyvDraft(supabase, memberId, {
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
      held_sentence: params.heldSentence,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id)
    .eq('member_id', memberId)
    .is('completed_at', null)
    .select(SESSION_COLUMNS)
    .maybeSingle();

  if (error) console.error('completeOyvSession failed', error);
  if (data) return fromRow(data as unknown as SessionRow);

  // Lost the race, or the update matched nothing. Read back what actually
  // stands, so a member who lost it still sees the sitting that won.
  return await fetchOyvSessionForAssignment(supabase, memberId, params.assignmentId);
}
