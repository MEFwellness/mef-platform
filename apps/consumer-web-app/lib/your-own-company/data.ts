/**
 * Your Own Company on the shared Happiness table (migrations 211 through
 * 218), and the reads its gate needs.
 *
 * Same discipline as every other data.ts here: pure functions taking a
 * caller-scoped SupabaseClient, RLS decides who may read or write what, and
 * a failed read returns a safe value rather than throwing, since every
 * caller is on a page render the member is already waiting on.
 *
 * EVERY READ IS SCOPED BY experience_key. The table now holds SEVEN
 * Happiness templates, so a query that forgot that clause would hand a
 * coach one template's answers under another template's questions. There is
 * no unscoped read in this file.
 *
 * NO RENDER WRITES ANYTHING IN THIS FEATURE. There is a draft row, because
 * this experience saves and resumes, but nothing on a read path creates or
 * touches it. The two writers below are both reached from a server action
 * she triggers by tapping Continue or Finish.
 *
 * "NO ERROR" IS NOT "IT WORKED". Every write reads the row back, so a write
 * that matched no RLS policy (which returns zero rows and no error) is
 * caught rather than reported as a success.
 *
 * HER LINES ARE REBUILT FROM HER OWN WORDS ON EVERY READ, never trusted as
 * stored. fromRow derives the list from the text of her question three
 * answer and re-hangs whatever was stored on it, so even a row edited
 * directly in the database cannot make this screen quote a sentence she did
 * not type.
 *
 * NO FOLLOW-UP ARM. This template never reads another template's rows and
 * never quotes one, so follow_up_source_experience_key is null on every row
 * it writes and this file never sets it.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { HAPPINESS_DEEP_DIVE_TABLE, YOC_DEFINITION_ID, YOC_KEY } from './constants';
import {
  readYocAnswers,
  sanitizeYocDraft,
  sanitizeYocInstinctState,
  YOC_LINES_KEY,
  type YocAnswers,
  type YocDraft,
} from './questions';
import type { YocInstinctState } from './instinct';

const SESSION_COLUMNS =
  'id, assignment_id, experience_key, questions_version, answers, rewritten_line, instinct_state, started_at, completed_at, created_at';

export type YocSessionRecord = {
  id: string;
  assignmentId: string | null;
  questionsVersion: number;
  /** Whatever writing is stored, complete or not. A draft is legitimately partial. */
  draft: YocDraft;
  /** Null unless the stored writing is a complete set. Never half an answer sheet. */
  answers: YocAnswers | null;
  /** Her picks, her round, her own lines and the one she named, re-hung on her own question three lines. */
  instinct: YocInstinctState;
  /** Question eight, from its own column (migration 218). */
  rewrittenLine: string | null;
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
  rewritten_line: string | null;
  instinct_state: unknown;
  started_at: string;
  completed_at: string | null;
  created_at: string;
};

function fromRow(row: SessionRow): YocSessionRecord {
  const draft = sanitizeYocDraft(row.answers) ?? {};
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    questionsVersion: row.questions_version,
    draft,
    answers: readYocAnswers(row.answers),
    // Her own question three answer is the only source of lines, here as
    // everywhere else.
    instinct: sanitizeYocInstinctState(row.instinct_state, draft[YOC_LINES_KEY] ?? ''),
    rewrittenLine: row.rewritten_line,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

export type YocAssignment = {
  id: string;
  createdAt: string;
  reason: string | null;
  /** The stored due date. Every assignment this app makes now carries one. */
  dueAt: string | null;
};

/**
 * Her open assignment for this experience, if she has one.
 *
 * "No row" and "the read did not work" are kept apart, exactly as the six
 * templates beside it keep them apart and for the same reason: a failed
 * read that looked like "no assignment" would silently take the experience
 * away from a member her coach had just assigned, and a failed read that
 * looked like "assigned" would offer it to somebody who was never given it.
 * `ok: false` means: decide nothing this render.
 */
export async function fetchPendingYocAssignment(
  supabase: SupabaseClient,
  memberId: string
): Promise<{ ok: boolean; assignment: YocAssignment | null }> {
  const { data, error } = await supabase
    .from('assessment_assignments')
    .select('id, created_at, reason, due_at')
    .eq('member_id', memberId)
    .eq('assessment_definition_id', YOC_DEFINITION_ID)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('fetchPendingYocAssignment failed', error);
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
export async function listYocSessions(
  supabase: SupabaseClient,
  memberId: string,
  limit = 24
): Promise<{ ok: boolean; records: YocSessionRecord[] }> {
  const { data, error } = await supabase
    .from(HAPPINESS_DEEP_DIVE_TABLE)
    .select(SESSION_COLUMNS)
    .eq('member_id', memberId)
    .eq('experience_key', YOC_KEY)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('listYocSessions failed', error);
    return { ok: false, records: [] };
  }
  return { ok: true, records: ((data ?? []) as unknown as SessionRow[]).map(fromRow) };
}

/**
 * The row for one assignment, finished or not.
 *
 * Scoped by experience_key as well as by assignment, so this can never
 * return one of the six other templates' sittings that share this table.
 */
export async function fetchYocSessionForAssignment(
  supabase: SupabaseClient,
  memberId: string,
  assignmentId: string
): Promise<YocSessionRecord | null> {
  const { data, error } = await supabase
    .from(HAPPINESS_DEEP_DIVE_TABLE)
    .select(SESSION_COLUMNS)
    .eq('member_id', memberId)
    .eq('experience_key', YOC_KEY)
    .eq('assignment_id', assignmentId)
    .maybeSingle();

  if (error) {
    console.error('fetchYocSessionForAssignment failed', error);
    return null;
  }
  return data ? fromRow(data as unknown as SessionRow) : null;
}

/**
 * Saves what she has done so far, so she can close the app and come back to
 * it.
 *
 * BOTH HALVES, ON EVERY CONTINUE. The writing goes into `answers` and her
 * picks go into `instinct_state`, in the same statement, because on this
 * template five of the nine questions carry a choice that leaves no prose
 * at all. A save that stored only the writing would lose a whole rapid
 * round.
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
export async function saveYocDraft(
  supabase: SupabaseClient,
  memberId: string,
  params: {
    assignmentId: string;
    questionsVersion: number;
    draft: YocDraft;
    instinct: YocInstinctState;
  }
): Promise<YocSessionRecord | null> {
  const existing = await fetchYocSessionForAssignment(supabase, memberId, params.assignmentId);

  if (existing?.completedAt) return existing;

  if (existing) {
    const { data, error } = await supabase
      .from(HAPPINESS_DEEP_DIVE_TABLE)
      .update({
        answers: params.draft,
        instinct_state: params.instinct,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .eq('member_id', memberId)
      .select(SESSION_COLUMNS)
      .maybeSingle();
    if (error) console.error('saveYocDraft update failed', error);
    return data ? fromRow(data as unknown as SessionRow) : null;
  }

  const { data, error } = await supabase
    .from(HAPPINESS_DEEP_DIVE_TABLE)
    .insert({
      member_id: memberId,
      experience_key: YOC_KEY,
      assignment_id: params.assignmentId,
      questions_version: params.questionsVersion,
      answers: params.draft,
      instinct_state: params.instinct,
    })
    .select(SESSION_COLUMNS)
    .maybeSingle();

  if (!error && data) return fromRow(data as unknown as SessionRow);

  // Either the unique index rejected a second row for this assignment (a
  // second tab, a double tap), or the insert wrote nothing. Both resolve
  // the same way: read back whatever is actually there.
  if (error) console.error('saveYocDraft insert failed', error);
  return await fetchYocSessionForAssignment(supabase, memberId, params.assignmentId);
}

/**
 * Stamps her sitting finished, with the complete sheet, all her picks, and
 * the rewrite in its own column.
 *
 * WRITE ONCE. An already-completed row is handed straight back untouched,
 * and the completing update carries `.is('completed_at', null)` so two
 * concurrent submits cannot both stamp it. Migration 211's update policy
 * enforces the identical thing in the database.
 */
export async function completeYocSession(
  supabase: SupabaseClient,
  memberId: string,
  params: {
    assignmentId: string;
    questionsVersion: number;
    answers: YocAnswers;
    instinct: YocInstinctState;
    rewrittenLine: string;
  }
): Promise<YocSessionRecord | null> {
  const existing =
    (await fetchYocSessionForAssignment(supabase, memberId, params.assignmentId)) ??
    (await saveYocDraft(supabase, memberId, {
      assignmentId: params.assignmentId,
      questionsVersion: params.questionsVersion,
      draft: params.answers,
      instinct: params.instinct,
    }));

  if (!existing) return null;
  if (existing.completedAt) return existing;

  const { data, error } = await supabase
    .from(HAPPINESS_DEEP_DIVE_TABLE)
    .update({
      answers: params.answers,
      instinct_state: params.instinct,
      rewritten_line: params.rewrittenLine,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id)
    .eq('member_id', memberId)
    .is('completed_at', null)
    .select(SESSION_COLUMNS)
    .maybeSingle();

  if (error) console.error('completeYocSession failed', error);
  if (data) return fromRow(data as unknown as SessionRow);

  // Lost the race, or the update matched nothing. Read back what actually
  // stands, so a member who lost it still sees the sitting that won.
  return await fetchYocSessionForAssignment(supabase, memberId, params.assignmentId);
}
