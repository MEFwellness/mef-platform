'use server';

import { createClient } from '@/lib/supabase/server';
import { fetchBaselineAssessment, type BaselineAssessment } from '@/lib/onboarding/baseline';
import {
  fetchAssessmentHistory,
  fetchAssessmentById,
  fetchLatestReassessment,
  type AssessmentSummary,
} from '@/lib/onboarding/reassessment';
import {
  buildComparison,
  buildProgressSummary,
  type ComparisonMetric,
  type ProgressSummary,
} from '@/lib/onboarding/comparison';
import type { Profile, DailyCheckin, Habit, CoachNote } from '@mef/shared-types-contracts';
import type { ActionResult } from './auth';

/**
 * Reads only what coach_read_assigned_* RLS policies allow (migration 16).
 * If a coach's assignment is revoked between page loads, this simply
 * returns fewer rows on the next call — no cache to invalidate, because
 * there is no cache; every read goes through Postgres and its policies
 * directly.
 */
export async function listAssignedClients(): Promise<Profile[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: assignments, error: assignmentError } = await supabase
    .from('coach_client_assignments')
    .select('client_id')
    .eq('coach_id', user.id)
    .eq('status', 'active');

  if (assignmentError || !assignments || assignments.length === 0) return [];

  const clientIds = assignments.map((a) => a.client_id);
  const { data: profiles, error } = await supabase.from('profiles').select('*').in('id', clientIds);

  if (error) {
    console.error('listAssignedClients failed', error);
    return [];
  }
  return profiles as Profile[];
}

export async function getClientCheckins(clientId: string): Promise<DailyCheckin[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('daily_checkins_current')
    .select('*')
    .eq('user_id', clientId)
    .order('local_date', { ascending: false })
    .limit(14);

  // If this coach isn't actually assigned to clientId, RLS returns zero
  // rows here — not an error, just nothing. That's the deny-by-default
  // behavior working as intended.
  if (error) {
    console.error('getClientCheckins failed', error);
    return [];
  }
  return data as DailyCheckin[];
}

/** Same coach_read_assigned_habits RLS as everything else here — zero rows for an unassigned client. */
export async function getClientHabits(clientId: string): Promise<Habit[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('habits')
    .select('*')
    .eq('user_id', clientId)
    .eq('active', true);

  if (error) {
    console.error('getClientHabits failed', error);
    return [];
  }
  return data as Habit[];
}

/** Habit completion state for a single date, keyed by habit_id — mirrors getHabitLogsForDate in checkin.ts. */
export async function getClientHabitLogs(
  clientId: string,
  localDate: string
): Promise<Record<string, boolean>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('habit_logs')
    .select('habit_id, completed')
    .eq('user_id', clientId)
    .eq('local_date', localDate);

  if (error) {
    console.error('getClientHabitLogs failed', error);
    return {};
  }
  return Object.fromEntries(data.map((log) => [log.habit_id, log.completed]));
}

/**
 * Private coach notes — never visible to members. coach_notes has no
 * member-facing RLS policy at all (migration 23), so this is enforced by
 * Postgres even if this action layer had a bug; there's no policy path
 * that could ever let a member's session read this table.
 *
 * Without a submissionId, returns every note for this client (unchanged
 * behavior — the general client-detail-page notes panel). With one,
 * returns only notes tied to that specific assessment, for the
 * per-reassessment notes panel on the coach's assessment detail page.
 */
export async function getCoachNotes(clientId: string, submissionId?: string): Promise<CoachNote[]> {
  const supabase = createClient();
  let query = supabase.from('coach_notes').select('*').eq('client_id', clientId);
  if (submissionId !== undefined) {
    query = query.eq('onboarding_submission_id', submissionId);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    console.error('getCoachNotes failed', error);
    return [];
  }
  return data as CoachNote[];
}

export async function addCoachNote(
  clientId: string,
  note: string,
  submissionId?: string
): Promise<ActionResult> {
  const trimmed = note.trim();
  if (!trimmed) return { error: 'Note cannot be empty.' };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  // is_active_coach_for RLS check (migration 23) is what actually rejects
  // a note about a client this coach isn't assigned to — not this check.
  const { error } = await supabase.from('coach_notes').insert({
    coach_id: user.id,
    client_id: clientId,
    note: trimmed,
    onboarding_submission_id: submissionId ?? null,
  });

  if (error) return { error: error.message };
  return {};
}

/**
 * A client's Baseline Assessment, from the coach's side. Uses the exact
 * same fetchBaselineAssessment() as the member's own view — coach_read_
 * assigned_submissions/answers RLS (migration 16) is what actually decides
 * whether this coach may see it; an unassigned clientId simply comes back
 * as null, the same shape as "hasn't onboarded yet."
 */
export async function getClientBaselineAssessment(
  clientId: string
): Promise<BaselineAssessment | null> {
  const supabase = createClient();
  return fetchBaselineAssessment(supabase, clientId);
}

/** Every submission a client has made, oldest first — same RLS-gated read as the client's own history. */
export async function getClientAssessmentHistory(clientId: string): Promise<AssessmentSummary[]> {
  const supabase = createClient();
  return fetchAssessmentHistory(supabase, clientId);
}

/** A specific one of a client's past submissions, by id. */
export async function getClientAssessmentById(
  clientId: string,
  submissionId: string
): Promise<BaselineAssessment | null> {
  const supabase = createClient();
  return fetchAssessmentById(supabase, clientId, submissionId);
}

/** Baseline-vs-latest-reassessment comparison for a client, from the coach's side — identical computation to the member's own view. */
export async function getClientProgressComparison(clientId: string): Promise<{
  baseline: BaselineAssessment | null;
  latest: BaselineAssessment | null;
  metrics: ComparisonMetric[];
  summary: ProgressSummary;
}> {
  const supabase = createClient();
  const [baseline, latest] = await Promise.all([
    fetchBaselineAssessment(supabase, clientId),
    fetchLatestReassessment(supabase, clientId),
  ]);

  const metrics = buildComparison(baseline, latest);
  return { baseline, latest, metrics, summary: buildProgressSummary(metrics) };
}
