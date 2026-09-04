/**
 * Every read and write against the fenced Quick Wellness Check tables, in
 * one file.
 *
 * WHO CALLS THIS WITH WHAT CLIENT. Always the service role, because the
 * visitor these rows belong to has no session and the tables have no public
 * policy at all (migration 202), exactly like the public entry tables
 * before them. That is not an authorisation shortcut: the boundary for the
 * anonymous half is the route handler's own origin check and rate limit,
 * and the only rows a request can reach are the ones its own visitor token
 * names. The claim resolves the member from her own session cookie FIRST,
 * and only then writes as the platform.
 *
 * WHAT THIS FILE WILL NEVER DO. It will never write to daily_checkins,
 * onboarding_answers, unified_assessment_answers, member_wellness_events or
 * any scoring input table. Guest answers stay in
 * guest_wellness_check_answers. tests/public-entry-provenance.test.ts fails
 * the build if that changes.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type GuestWellnessCheckSession = {
  id: string;
  visitorToken: string;
  startedAt: string | null;
  completedAt: string | null;
  claimedBy: string | null;
  claimedAt: string | null;
};

type SessionRow = {
  id: string;
  visitor_token: string;
  started_at: string | null;
  completed_at: string | null;
  claimed_by: string | null;
  claimed_at: string | null;
};

const SESSION_COLUMNS = 'id, visitor_token, started_at, completed_at, claimed_by, claimed_at';

function toSession(row: SessionRow): GuestWellnessCheckSession {
  return {
    id: row.id,
    visitorToken: row.visitor_token,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    claimedBy: row.claimed_by,
    claimedAt: row.claimed_at,
  };
}

/**
 * The session for this browser, creating it on first arrival. A second tab
 * racing the first loses the unique index on visitor_token, which is the
 * correct outcome: re-read rather than reporting a failure to a visitor who
 * is fine.
 */
export async function getOrCreateGuestSession(
  supabase: SupabaseClient,
  visitorToken: string
): Promise<GuestWellnessCheckSession | null> {
  const { data: existing, error: readError } = await supabase
    .from('guest_wellness_check_sessions')
    .select(SESSION_COLUMNS)
    .eq('visitor_token', visitorToken)
    .maybeSingle();

  if (readError) {
    console.error('getOrCreateGuestSession read failed', readError);
    return null;
  }
  if (existing) return toSession(existing as SessionRow);

  const { data, error } = await supabase
    .from('guest_wellness_check_sessions')
    .insert({ visitor_token: visitorToken })
    .select(SESSION_COLUMNS)
    .single();

  if (error) {
    const { data: raced } = await supabase
      .from('guest_wellness_check_sessions')
      .select(SESSION_COLUMNS)
      .eq('visitor_token', visitorToken)
      .maybeSingle();
    if (raced) return toSession(raced as SessionRow);
    console.error('getOrCreateGuestSession insert failed', error);
    return null;
  }
  return toSession(data as SessionRow);
}

export async function getGuestSessionByToken(
  supabase: SupabaseClient,
  visitorToken: string
): Promise<GuestWellnessCheckSession | null> {
  const { data, error } = await supabase
    .from('guest_wellness_check_sessions')
    .select(SESSION_COLUMNS)
    .eq('visitor_token', visitorToken)
    .maybeSingle();
  if (error) {
    console.error('getGuestSessionByToken failed', error);
    return null;
  }
  return data ? toSession(data as SessionRow) : null;
}

/** Marks the moment the first question was reached. Written once: a resumed visit is not a second start. */
export async function markGuestSessionStarted(
  supabase: SupabaseClient,
  sessionId: string
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('guest_wellness_check_sessions')
    .update({ started_at: now, updated_at: now })
    .eq('id', sessionId)
    .is('started_at', null);
  if (error) console.error('markGuestSessionStarted failed', error);
}

/**
 * Saves answers, replacing whatever was there if the visitor went back and
 * changed one. The unique index on (session_id, question_key) is what makes
 * a change an update rather than a second opinion.
 */
export async function saveGuestAnswers(
  supabase: SupabaseClient,
  sessionId: string,
  answers: Record<string, string>
): Promise<void> {
  const rows = Object.entries(answers).map(([question_key, answer_value]) => ({
    session_id: sessionId,
    question_key,
    answer_value,
    answered_at: new Date().toISOString(),
  }));
  if (rows.length === 0) return;
  const { error } = await supabase
    .from('guest_wellness_check_answers')
    .upsert(rows, { onConflict: 'session_id,question_key' });
  if (error) console.error('saveGuestAnswers failed', error);
}

export async function loadGuestAnswers(
  supabase: SupabaseClient,
  sessionId: string
): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('guest_wellness_check_answers')
    .select('question_key, answer_value')
    .eq('session_id', sessionId);
  if (error) {
    console.error('loadGuestAnswers failed', error);
    return {};
  }
  const out: Record<string, string> = {};
  for (const row of (data ?? []) as { question_key: string; answer_value: string }[]) {
    out[row.question_key] = row.answer_value;
  }
  return out;
}

/** Written once and never moved: a funnel counting finishers must not count one person twice. */
export async function markGuestSessionCompleted(
  supabase: SupabaseClient,
  sessionId: string
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('guest_wellness_check_sessions')
    .update({ completed_at: now, updated_at: now })
    .eq('id', sessionId)
    .is('completed_at', null);
  if (error) console.error('markGuestSessionCompleted failed', error);
}

/**
 * Binds a member to the pre-account run she took in this browser.
 *
 * IDEMPOTENT, AND FIRST BIND WINS. claimed_by is unique and the update only
 * touches a session that is still unclaimed, so a repeated claim writes
 * nothing, a second browser's token cannot re-point a member who already
 * has a run, and a run already belonging to somebody else is refused by the
 * database rather than by a check this code has to remember to make.
 *
 * The read-back is not decoration: a write that matches no row returns no
 * error, so "it did not fail" is not "it worked".
 */
export async function claimGuestSessionForMember(
  supabase: SupabaseClient,
  memberId: string,
  sessionId: string
): Promise<{ claimed: boolean; alreadyBound: boolean }> {
  const { data: mine } = await supabase
    .from('guest_wellness_check_sessions')
    .select('id')
    .eq('claimed_by', memberId)
    .maybeSingle();
  if (mine) return { claimed: true, alreadyBound: true };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('guest_wellness_check_sessions')
    .update({ claimed_by: memberId, claimed_at: now, updated_at: now })
    .eq('id', sessionId)
    .is('claimed_by', null);

  if (error) {
    // Somebody got here first, on this session or on this member. Both are
    // correct outcomes, not failures to report.
    console.error('claimGuestSessionForMember update failed', error);
  }

  const { data: settled } = await supabase
    .from('guest_wellness_check_sessions')
    .select('claimed_by')
    .eq('id', sessionId)
    .maybeSingle();
  const owner = (settled as { claimed_by: string | null } | null)?.claimed_by ?? null;
  return { claimed: owner === memberId, alreadyBound: false };
}
