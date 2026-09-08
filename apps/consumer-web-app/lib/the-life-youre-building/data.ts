/**
 * The Life You're Building on the shared Happiness table (migrations 211
 * through 219), and the reads its gate needs.
 *
 * Same discipline as every other data.ts here: pure functions taking a
 * caller-scoped SupabaseClient, RLS decides who may read or write what, and
 * a failed read returns a safe value rather than throwing, since every
 * caller is on a page render the member is already waiting on.
 *
 * EVERY READ IS SCOPED BY experience_key. The table now holds EIGHT
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
 * HER MARKS ARE REBUILT AGAINST THIS TEMPLATE'S OWN QUESTIONS ON EVERY
 * READ, never trusted as stored. fromRow runs the stored positions through
 * sanitizeTlybSliders, so a row edited directly in the database cannot put
 * a position on this screen under a question this template does not ask.
 *
 * THE FOLLOW-UP FLAG IS WRITTEN ON THE INSERT ONLY. It records the version
 * of question nine she was actually shown, and once her row exists it is
 * never revisited: an Owning Your Value finished mid-sitting cannot rewrite
 * a question she has already answered. See ./followUp.ts for why the check
 * happens when it happens.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { HAPPINESS_DEEP_DIVE_TABLE, TLYB_DEFINITION_ID, TLYB_KEY } from './constants';
import {
  readTlybAnswers,
  sanitizeTlybDraft,
  TLYB_SLIDER_KEYS,
  type TlybAnswers,
  type TlybDraft,
} from './questions';
import { readTlybSliders, type TlybSliderState } from './sliders';

const SESSION_COLUMNS =
  'id, assignment_id, experience_key, questions_version, answers, first_stone, forward_sentence, slider_positions, follow_up_source_experience_key, started_at, completed_at, created_at';

export type TlybSessionRecord = {
  id: string;
  assignmentId: string | null;
  questionsVersion: number;
  /** Whatever writing is stored, complete or not. A draft is legitimately partial. */
  draft: TlybDraft;
  /** Null unless the stored writing is a complete set. Never half an answer sheet. */
  answers: TlybAnswers | null;
  /** Her three marks, rebuilt against this template's own question list. */
  sliders: TlybSliderState;
  /** Question eight, from its own column (migration 219). */
  firstStone: string | null;
  /** Question nine, from its own column (migration 219), in BOTH modes. */
  forwardSentence: string | null;
  /** Null means the standalone question nine ran. */
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
  first_stone: string | null;
  forward_sentence: string | null;
  slider_positions: unknown;
  follow_up_source_experience_key: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
};

function fromRow(row: SessionRow): TlybSessionRecord {
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    questionsVersion: row.questions_version,
    draft: sanitizeTlybDraft(row.answers) ?? {},
    answers: readTlybAnswers(row.answers),
    sliders: readTlybSliders(row.slider_positions, TLYB_SLIDER_KEYS),
    firstStone: row.first_stone,
    forwardSentence: row.forward_sentence,
    followUpSourceExperienceKey: row.follow_up_source_experience_key,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

export type TlybAssignment = {
  id: string;
  createdAt: string;
  reason: string | null;
  /** The stored due date. Every assignment this app makes now carries one. */
  dueAt: string | null;
};

/**
 * Her open assignment for this experience, if she has one.
 *
 * "No row" and "the read did not work" are kept apart, exactly as the seven
 * templates beside it keep them apart and for the same reason: a failed
 * read that looked like "no assignment" would silently take the experience
 * away from a member her coach had just assigned, and a failed read that
 * looked like "assigned" would offer it to somebody who was never given it.
 * `ok: false` means: decide nothing this render.
 */
export async function fetchPendingTlybAssignment(
  supabase: SupabaseClient,
  memberId: string
): Promise<{ ok: boolean; assignment: TlybAssignment | null }> {
  const { data, error } = await supabase
    .from('assessment_assignments')
    .select('id, created_at, reason, due_at')
    .eq('member_id', memberId)
    .eq('assessment_definition_id', TLYB_DEFINITION_ID)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('fetchPendingTlybAssignment failed', error);
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
export async function listTlybSessions(
  supabase: SupabaseClient,
  memberId: string,
  limit = 24
): Promise<{ ok: boolean; records: TlybSessionRecord[] }> {
  const { data, error } = await supabase
    .from(HAPPINESS_DEEP_DIVE_TABLE)
    .select(SESSION_COLUMNS)
    .eq('member_id', memberId)
    .eq('experience_key', TLYB_KEY)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('listTlybSessions failed', error);
    return { ok: false, records: [] };
  }
  return { ok: true, records: ((data ?? []) as unknown as SessionRow[]).map(fromRow) };
}

/**
 * The row for one assignment, finished or not.
 *
 * Scoped by experience_key as well as by assignment, so this can never
 * return one of the seven other templates' sittings that share this table.
 */
export async function fetchTlybSessionForAssignment(
  supabase: SupabaseClient,
  memberId: string,
  assignmentId: string
): Promise<TlybSessionRecord | null> {
  const { data, error } = await supabase
    .from(HAPPINESS_DEEP_DIVE_TABLE)
    .select(SESSION_COLUMNS)
    .eq('member_id', memberId)
    .eq('experience_key', TLYB_KEY)
    .eq('assignment_id', assignmentId)
    .maybeSingle();

  if (error) {
    console.error('fetchTlybSessionForAssignment failed', error);
    return null;
  }
  return data ? fromRow(data as unknown as SessionRow) : null;
}

/**
 * Saves what she has done so far, so she can close the app and come back to
 * it.
 *
 * BOTH HALVES, ON EVERY CONTINUE. The writing goes into `answers` and her
 * three marks go into `slider_positions`, in the same statement, because on
 * this template three of the nine questions carry a position that leaves no
 * prose at all. A save that stored only the writing would lose every mark
 * she had placed.
 *
 * INSERT IF ABSENT, UPDATE OTHERWISE, and never on a render. The row is
 * created by the first Continue she taps, not by opening the screen. A
 * completed sitting is left exactly as it is: migration 211's update policy
 * refuses it in the database, and this refuses it here too rather than
 * sending a write it knows will be rejected.
 *
 * `followUpSourceExperienceKey` is used ON THE INSERT ONLY. An existing row
 * already records which version of question nine she was shown, and
 * re-deciding it on a later save is exactly the drift this mechanism exists
 * to prevent.
 *
 * Returns the row it actually read back, so a write that matched no policy
 * is caught by the caller instead of being reported as a save.
 */
export async function saveTlybDraft(
  supabase: SupabaseClient,
  memberId: string,
  params: {
    assignmentId: string;
    questionsVersion: number;
    draft: TlybDraft;
    sliders: TlybSliderState;
    followUpSourceExperienceKey: string | null;
  }
): Promise<TlybSessionRecord | null> {
  const existing = await fetchTlybSessionForAssignment(supabase, memberId, params.assignmentId);

  if (existing?.completedAt) return existing;

  if (existing) {
    const { data, error } = await supabase
      .from(HAPPINESS_DEEP_DIVE_TABLE)
      .update({
        answers: params.draft,
        slider_positions: params.sliders,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .eq('member_id', memberId)
      .select(SESSION_COLUMNS)
      .maybeSingle();
    if (error) console.error('saveTlybDraft update failed', error);
    return data ? fromRow(data as unknown as SessionRow) : null;
  }

  const { data, error } = await supabase
    .from(HAPPINESS_DEEP_DIVE_TABLE)
    .insert({
      member_id: memberId,
      experience_key: TLYB_KEY,
      assignment_id: params.assignmentId,
      questions_version: params.questionsVersion,
      answers: params.draft,
      slider_positions: params.sliders,
      follow_up_source_experience_key: params.followUpSourceExperienceKey,
    })
    .select(SESSION_COLUMNS)
    .maybeSingle();

  if (!error && data) return fromRow(data as unknown as SessionRow);

  // Either the unique index rejected a second row for this assignment (a
  // second tab, a double tap), or the insert wrote nothing. Both resolve
  // the same way: read back whatever is actually there.
  if (error) console.error('saveTlybDraft insert failed', error);
  return await fetchTlybSessionForAssignment(supabase, memberId, params.assignmentId);
}

/**
 * Stamps her sitting finished, with the complete sheet, all three marks,
 * and the two answers that get columns of their own.
 *
 * WRITE ONCE. An already-completed row is handed straight back untouched,
 * and the completing update carries `.is('completed_at', null)` so two
 * concurrent submits cannot both stamp it. Migration 211's update policy
 * enforces the identical thing in the database.
 *
 * The completing update NEVER revisits the follow-up flag, for the reason
 * saveTlybDraft does not: it was settled when the row was created.
 */
export async function completeTlybSession(
  supabase: SupabaseClient,
  memberId: string,
  params: {
    assignmentId: string;
    questionsVersion: number;
    answers: TlybAnswers;
    sliders: TlybSliderState;
    firstStone: string;
    forwardSentence: string;
    followUpSourceExperienceKey: string | null;
  }
): Promise<TlybSessionRecord | null> {
  const existing =
    (await fetchTlybSessionForAssignment(supabase, memberId, params.assignmentId)) ??
    (await saveTlybDraft(supabase, memberId, {
      assignmentId: params.assignmentId,
      questionsVersion: params.questionsVersion,
      draft: params.answers,
      sliders: params.sliders,
      followUpSourceExperienceKey: params.followUpSourceExperienceKey,
    }));

  if (!existing) return null;
  if (existing.completedAt) return existing;

  const { data, error } = await supabase
    .from(HAPPINESS_DEEP_DIVE_TABLE)
    .update({
      answers: params.answers,
      slider_positions: params.sliders,
      first_stone: params.firstStone,
      forward_sentence: params.forwardSentence,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id)
    .eq('member_id', memberId)
    .is('completed_at', null)
    .select(SESSION_COLUMNS)
    .maybeSingle();

  if (error) console.error('completeTlybSession failed', error);
  if (data) return fromRow(data as unknown as SessionRow);

  // Lost the race, or the update matched nothing. Read back what actually
  // stands, so a member who lost it still sees the sitting that won.
  return await fetchTlybSessionForAssignment(supabase, memberId, params.assignmentId);
}
