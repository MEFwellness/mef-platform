/**
 * The Health & Lifestyle Intake's own table, plus the reads its gate needs.
 *
 * A ROW EXISTS BEFORE SHE FINISHES, AND A RENDER STILL NEVER MAKES ONE.
 * The intake is long and resumable, so a row exists while she is partway
 * through. It is created by the save behind her own first answer and by
 * nothing else (app/actions/healthIntake.ts). A page render may read; it
 * may not insert, claim, upsert or schedule. That is also what makes
 * started_at a real number: it is the moment she began, not the moment a
 * screen was prefetched, so how long the intake took her is reportable.
 *
 * "NO ERROR" IS NOT "IT WORKED". Every write reads the row back, so a write
 * that matched no RLS policy, which returns zero rows and no error, is
 * caught here rather than reported as a success.
 *
 * COMPLETION IS WRITE ONCE, enforced by migration 230's update policy
 * matching only a row whose completed_at is still null. This module does
 * not re-check that in application code, because a second copy of the rule
 * is exactly how the two come to disagree.
 *
 * WHAT IS ARCHIVED IS ARCHIVED FOR AUDIT AND NOTHING ELSE. `archived` holds
 * answers a member removed by changing a gate. Nothing that builds a coach
 * summary, a safety signal or a question worth exploring is ever handed it:
 * they are all built from `answers`, which is the pruned set.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { HLI_DEFINITION_ID, HLI_TABLE } from './constants';
import type { IntakeAnswers, IntakeAnswerValue } from './types';

const SESSION_COLUMNS =
  'id, assignment_id, content_version, answers, archived, progress, safety_escalated_at, started_at, completed_at, created_at, updated_at';

export type HliSessionRecord = {
  id: string;
  assignmentId: string | null;
  contentVersion: number;
  answers: IntakeAnswers;
  /** Answers she removed by changing a gate. Audit only. Never summarised. */
  archived: IntakeAnswers;
  stepIndex: number;
  safetyEscalatedAt: string | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type SessionRow = {
  id: string;
  assignment_id: string | null;
  content_version: number;
  answers: unknown;
  archived: unknown;
  progress: unknown;
  safety_escalated_at: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * A stored answers object, read defensively.
 *
 * Only the five shapes an answer can have survive: a string, a finite
 * number, a list of strings, a list of flat string maps, and a flat string
 * map. Anything else is dropped rather than guessed at, because a value no
 * screen can render is a screen that crashes on a member.
 */
export function readAnswers(raw: unknown): IntakeAnswers {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: IntakeAnswers = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const clean = readAnswerValue(value);
    if (clean !== null) out[key] = clean;
  }
  return out;
}

function readAnswerValue(value: unknown): IntakeAnswerValue | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    if (value.every((entry) => typeof entry === 'string')) return value as string[];
    const entries: Record<string, string>[] = [];
    for (const entry of value) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
      const clean: Record<string, string> = {};
      for (const [key, raw] of Object.entries(entry as Record<string, unknown>)) {
        if (typeof raw === 'string') clean[key] = raw;
      }
      entries.push(clean);
    }
    return entries;
  }
  if (value && typeof value === 'object') {
    const clean: Record<string, string> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      if (typeof raw === 'string') clean[key] = raw;
    }
    return clean;
  }
  return null;
}

function readStepIndex(raw: unknown): number {
  if (!raw || typeof raw !== 'object') return 0;
  const value = (raw as Record<string, unknown>).stepIndex;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function fromRow(row: SessionRow): HliSessionRecord {
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    contentVersion: row.content_version,
    answers: readAnswers(row.answers),
    archived: readAnswers(row.archived),
    stepIndex: readStepIndex(row.progress),
    safetyEscalatedAt: row.safety_escalated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type HliAssignment = {
  id: string;
  createdAt: string;
  reason: string | null;
  dueAt: string | null;
};

/**
 * Her open assignment, if she has one.
 *
 * FAILS SHUT. `ok: false` is the answer to a read that failed, and
 * ./access.ts resolves that to "not offered", because the cost of being
 * wrong the other way is handing a member an experience her coach never
 * gave her.
 */
export async function fetchPendingHliAssignment(
  supabase: SupabaseClient,
  memberId: string
): Promise<{ ok: boolean; assignment: HliAssignment | null }> {
  const { data, error } = await supabase
    .from('assessment_assignments')
    .select('id, created_at, reason, due_at')
    .eq('member_id', memberId)
    .eq('assessment_definition_id', HLI_DEFINITION_ID)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('fetchPendingHliAssignment failed', error);
    return { ok: false, assignment: null };
  }
  if (!data) return { ok: true, assignment: null };
  const row = data as { id: string; created_at: string; reason: string | null; due_at: string | null };
  return {
    ok: true,
    assignment: { id: row.id, createdAt: row.created_at, reason: row.reason, dueAt: row.due_at },
  };
}

export async function fetchHliSessionForAssignment(
  supabase: SupabaseClient,
  memberId: string,
  assignmentId: string
): Promise<HliSessionRecord | null> {
  const { data, error } = await supabase
    .from(HLI_TABLE)
    .select(SESSION_COLUMNS)
    .eq('member_id', memberId)
    .eq('assignment_id', assignmentId)
    .maybeSingle();

  if (error) {
    console.error('fetchHliSessionForAssignment failed', error);
    return null;
  }
  return data ? fromRow(data as SessionRow) : null;
}

export async function listHliSessions(
  supabase: SupabaseClient,
  memberId: string,
  limit?: number
): Promise<{ ok: boolean; records: HliSessionRecord[] }> {
  let query = supabase
    .from(HLI_TABLE)
    .select(SESSION_COLUMNS)
    .eq('member_id', memberId)
    .order('completed_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error) {
    console.error('listHliSessions failed', error);
    return { ok: false, records: [] };
  }
  return { ok: true, records: (data ?? []).map((row) => fromRow(row as SessionRow)) };
}

export type SaveHliDraft = {
  assignmentId: string;
  answers: IntakeAnswers;
  archived: IntakeAnswers;
  stepIndex: number;
  contentVersion: number;
};

/**
 * Writes the draft, creating the row the first time.
 *
 * An upsert on assignment_id, which migration 230 makes unique, so two
 * saves racing each other produce one row rather than two sittings for one
 * assignment.
 */
export async function saveHliProgress(
  supabase: SupabaseClient,
  memberId: string,
  draft: SaveHliDraft
): Promise<HliSessionRecord | null> {
  const { data, error } = await supabase
    .from(HLI_TABLE)
    .upsert(
      {
        member_id: memberId,
        assignment_id: draft.assignmentId,
        content_version: draft.contentVersion,
        answers: draft.answers,
        archived: draft.archived,
        progress: { stepIndex: draft.stepIndex },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'assignment_id' }
    )
    .select(SESSION_COLUMNS)
    .maybeSingle();

  if (error) {
    console.error('saveHliProgress failed', error);
    return null;
  }
  // "No error" is not "it worked": a write matching no policy returns zero
  // rows and no error, so the row is read back rather than assumed.
  return data ? fromRow(data as SessionRow) : null;
}

export async function completeHliSession(
  supabase: SupabaseClient,
  memberId: string,
  input: {
    sessionId: string;
    answers: IntakeAnswers;
    archived: IntakeAnswers;
    stepIndex: number;
  }
): Promise<HliSessionRecord | null> {
  const { data, error } = await supabase
    .from(HLI_TABLE)
    .update({
      answers: input.answers,
      archived: input.archived,
      progress: { stepIndex: input.stepIndex },
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.sessionId)
    .eq('member_id', memberId)
    .select(SESSION_COLUMNS)
    .maybeSingle();

  if (error) {
    console.error('completeHliSession failed', error);
    return null;
  }
  return data ? fromRow(data as SessionRow) : null;
}

/**
 * Records that the safety pipeline has already been run for this sitting.
 *
 * A FLAG, NOT A COPY OF THE SIGNALS. What fired is recomputed from her
 * stored answers every time it is read (lib/health-intake/safety.ts), so a
 * later correction to a rule reaches every past sitting at once and a
 * member and her coach can never be looking at two different readings of
 * one sitting. This column answers a different question: has the
 * escalation already been written, so a retried submit does not open a
 * second review case for the same answers.
 *
 * IT IS CALLED WHILE THE SITTING IS STILL UNFINISHED, and it has to be:
 * migration 230's member update policy only matches a row whose
 * completed_at is still null, which is what makes a finished sitting
 * un-editable. So the submit escalates, marks, and only then completes. A
 * completion that fails after the mark leaves a sitting she can retry
 * without opening a second safety case, which is the failure this ordering
 * is chosen for.
 */
export async function markHliSafetyEscalated(
  supabase: SupabaseClient,
  memberId: string,
  sessionId: string
): Promise<void> {
  const { error } = await supabase
    .from(HLI_TABLE)
    .update({ safety_escalated_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('member_id', memberId);
  if (error) console.error('markHliSafetyEscalated failed', error);
}
