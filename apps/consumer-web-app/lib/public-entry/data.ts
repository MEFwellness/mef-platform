/**
 * Every read and write against the public entry tables, in one file.
 *
 * WHO CALLS THIS WITH WHAT CLIENT. The anonymous half runs with the service
 * role, because an anonymous visitor has no session and the tables have no
 * public policy at all (migration 197), exactly like the lead capture
 * tables before them. That is not an authorisation shortcut: the boundary
 * for those calls is the route handler's own origin check and rate limit,
 * and the only rows a request can reach are the ones its own visitor token
 * names. The member-facing reads take the member's own RLS-scoped client
 * and rely on her `member_read_own_public_entry_origin` policy.
 *
 * WHAT THIS FILE WILL NEVER DO. It will never write to onboarding_answers,
 * daily_checkins, unified_assessment_answers, member_wellness_events (the
 * one analytics event is written by the claim route through the existing
 * lib/analytics/track.ts, not here) or any scoring input table. Public
 * answers stay in public_entry_answers. tests/public-entry-provenance.test.ts
 * fails the build if an import here suggests otherwise.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  MemberPublicEntryOrigin,
  PublicEntryEventType,
  PublicEntryPatternKey,
  PublicEntrySessionRecord,
} from '@mef/shared-types-contracts';
import { PUBLIC_ENTRY_EXPERIENCE_KEY } from './questions';

type SessionRow = {
  id: string;
  visitor_token: string;
  experience_key: string;
  source_code: string | null;
  source_raw: string | null;
  landing_path: string | null;
  referrer_host: string | null;
  first_seen_at: string;
  started_at: string | null;
  completed_at: string | null;
  pattern_key: string | null;
  lead_email: string | null;
  lead_captured_at: string | null;
  captured_lead_id: string | null;
};

const SESSION_COLUMNS =
  'id, visitor_token, experience_key, source_code, source_raw, landing_path, referrer_host, first_seen_at, started_at, completed_at, pattern_key, lead_email, lead_captured_at, captured_lead_id';

function toSession(row: SessionRow): PublicEntrySessionRecord {
  return {
    id: row.id,
    visitorToken: row.visitor_token,
    experienceKey: PUBLIC_ENTRY_EXPERIENCE_KEY,
    sourceCode: row.source_code,
    sourceRaw: row.source_raw,
    landingPath: row.landing_path,
    referrerHost: row.referrer_host,
    firstSeenAt: row.first_seen_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    patternKey: (row.pattern_key as PublicEntryPatternKey | null) ?? null,
    leadEmail: row.lead_email,
    leadCapturedAt: row.lead_captured_at,
    capturedLeadId: row.captured_lead_id,
  };
}

/**
 * Whether a code is one we registered. An unknown code is NOT an error: it
 * is stored verbatim in source_raw and left unresolved, so a mistyped or
 * invented code appears in the funnel as its own thing rather than as
 * direct traffic.
 */
export async function resolveRegisteredSource(
  supabase: SupabaseClient,
  code: string | null
): Promise<string | null> {
  if (!code) return null;
  const { data, error } = await supabase
    .from('public_entry_sources')
    .select('code')
    .eq('code', code)
    .maybeSingle();
  if (error) {
    console.error('resolveRegisteredSource failed', error);
    return null;
  }
  return (data?.code as string | undefined) ?? null;
}

export type StartSessionInput = {
  visitorToken: string;
  sourceRaw: string | null;
  landingPath: string | null;
  referrerHost: string | null;
};

/**
 * The session for this browser, creating it on first arrival.
 *
 * THE ATTRIBUTION IS DECIDED ONCE, ON FIRST ARRIVAL, AND NEVER OVERWRITTEN.
 * If somebody opens a partner's link, wanders off, and comes back later
 * through a social post, the partner is who sent them and stays who sent
 * them. Last-touch would make every source's number depend on how the
 * others behaved, which is exactly the thing that makes an attribution
 * number impossible to act on with a hundred visitors.
 */
export async function getOrCreateSession(
  supabase: SupabaseClient,
  input: StartSessionInput
): Promise<PublicEntrySessionRecord | null> {
  const { data: existing, error: readError } = await supabase
    .from('public_entry_sessions')
    .select(SESSION_COLUMNS)
    .eq('visitor_token', input.visitorToken)
    .maybeSingle();

  if (readError) {
    console.error('getOrCreateSession read failed', readError);
    return null;
  }
  if (existing) return toSession(existing as SessionRow);

  const sourceCode = await resolveRegisteredSource(supabase, input.sourceRaw);

  const { data, error } = await supabase
    .from('public_entry_sessions')
    .insert({
      visitor_token: input.visitorToken,
      experience_key: PUBLIC_ENTRY_EXPERIENCE_KEY,
      source_code: sourceCode,
      source_raw: input.sourceRaw,
      landing_path: input.landingPath,
      referrer_host: input.referrerHost,
    })
    .select(SESSION_COLUMNS)
    .single();

  if (error) {
    // A second tab racing the first loses the unique index on
    // visitor_token, which is the correct outcome: re-read rather than
    // reporting a failure to a visitor who is fine.
    const { data: raced } = await supabase
      .from('public_entry_sessions')
      .select(SESSION_COLUMNS)
      .eq('visitor_token', input.visitorToken)
      .maybeSingle();
    if (raced) return toSession(raced as SessionRow);
    console.error('getOrCreateSession insert failed', error);
    return null;
  }
  return toSession(data as SessionRow);
}

export async function getSessionByToken(
  supabase: SupabaseClient,
  visitorToken: string
): Promise<PublicEntrySessionRecord | null> {
  const { data, error } = await supabase
    .from('public_entry_sessions')
    .select(SESSION_COLUMNS)
    .eq('visitor_token', visitorToken)
    .maybeSingle();
  if (error) {
    console.error('getSessionByToken failed', error);
    return null;
  }
  return data ? toSession(data as SessionRow) : null;
}

/** Marks the moment the first question was reached. Written once: a resumed visit is not a second start. */
export async function markSessionStarted(supabase: SupabaseClient, sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('public_entry_sessions')
    .update({ started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', sessionId)
    .is('started_at', null);
  if (error) console.error('markSessionStarted failed', error);
}

/**
 * Saves one answer, replacing whatever was there if the visitor went back
 * and changed it. The unique index on (session_id, question_key) is what
 * makes a change an update rather than a second opinion.
 */
export async function saveAnswers(
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
    .from('public_entry_answers')
    .upsert(rows, { onConflict: 'session_id,question_key' });
  if (error) console.error('saveAnswers failed', error);
}

export async function loadAnswers(
  supabase: SupabaseClient,
  sessionId: string
): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('public_entry_answers')
    .select('question_key, answer_value')
    .eq('session_id', sessionId);
  if (error) {
    console.error('loadAnswers failed', error);
    return {};
  }
  const out: Record<string, string> = {};
  for (const row of (data ?? []) as { question_key: string; answer_value: string }[]) {
    out[row.question_key] = row.answer_value;
  }
  return out;
}

/**
 * Records the completion and the pattern it resolved to.
 *
 * TWO DIFFERENT LIFETIMES IN ONE ROW, WHICH IS WHY THIS IS TWO WRITES.
 * `completed_at` is written once and never moves: it is when this visitor
 * first finished, and a funnel counting finishers must not be able to
 * count one person twice. `pattern_key` is the CURRENT answer and must
 * always reflect the answers as they stand, because a visitor can step
 * back through the questions, change one, and finish again with a
 * genuinely different pattern. Writing both under one
 * `is('completed_at', null)` guard, which is what this did, meant the
 * second finish silently kept the first pattern while showing her the new
 * one: a stored result that disagreed with the result she read.
 */
export async function markSessionCompleted(
  supabase: SupabaseClient,
  sessionId: string,
  patternKey: PublicEntryPatternKey
): Promise<void> {
  const now = new Date().toISOString();

  // Always current.
  const { error: patternError } = await supabase
    .from('public_entry_sessions')
    .update({ pattern_key: patternKey, updated_at: now })
    .eq('id', sessionId);
  if (patternError) console.error('markSessionCompleted pattern failed', patternError);

  // Once, ever.
  const { error: completedError } = await supabase
    .from('public_entry_sessions')
    .update({ completed_at: now })
    .eq('id', sessionId)
    .is('completed_at', null);
  if (completedError) console.error('markSessionCompleted completion failed', completedError);
}

/** The anonymous funnel. Never carries an answer, an email or prose: `detail` is a short slug or nothing, and the database enforces that with its own regex. */
export async function recordEvent(
  supabase: SupabaseClient,
  sessionId: string,
  eventType: PublicEntryEventType,
  detail?: string | null
): Promise<void> {
  const { error } = await supabase
    .from('public_entry_events')
    .insert({ session_id: sessionId, event_type: eventType, detail: detail ?? null });
  if (error) console.error('recordEvent failed', eventType, error);
}

/**
 * True when this session has already recorded this event type at least
 * once, so a once-per-visit event stays once per visit across reloads.
 *
 * `detail` narrows it to one specific instance, which is what a per chapter
 * event needs: `chapter_completed` should fire once for chapter two, not
 * once every time somebody crosses that boundary. A visitor can now step
 * backward through the questions, so crossing a boundary twice is ordinary
 * behaviour rather than a bug, and the funnel has to count it once.
 */
export async function hasEvent(
  supabase: SupabaseClient,
  sessionId: string,
  eventType: PublicEntryEventType,
  detail?: string | null
): Promise<boolean> {
  let query = supabase
    .from('public_entry_events')
    .select('id')
    .eq('session_id', sessionId)
    .eq('event_type', eventType);
  if (detail !== undefined) query = query.eq('detail', detail);

  const { data, error } = await query.limit(1);
  if (error) {
    console.error('hasEvent failed', error);
    return false;
  }
  return (data ?? []).length > 0;
}

export async function attachLead(
  supabase: SupabaseClient,
  sessionId: string,
  email: string,
  capturedLeadId: string | null
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('public_entry_sessions')
    .update({
      lead_email: email,
      lead_captured_at: now,
      captured_lead_id: capturedLeadId,
      updated_at: now,
    })
    .eq('id', sessionId);
  if (error) console.error('attachLead failed', error);
}

/**
 * Binds a member to the public arrival she came from.
 *
 * IDEMPOTENT, AND FIRST BIND WINS. member_id is the primary key and
 * session_id is unique, so a repeated claim writes nothing and a second
 * browser's token cannot re-point an existing member at a different
 * arrival. `ignoreDuplicates` makes that a quiet no-op rather than an
 * error, because a member loading two tabs at once is not a problem.
 *
 * Returns the row that now stands, whether this call wrote it or found it.
 */
export async function claimSessionForMember(
  supabase: SupabaseClient,
  memberId: string,
  session: PublicEntrySessionRecord
): Promise<{ origin: MemberPublicEntryOrigin | null; newlyClaimed: boolean }> {
  const { data: existing } = await supabase
    .from('member_public_entry_origin')
    .select('*')
    .eq('member_id', memberId)
    .maybeSingle();
  if (existing) return { origin: toOrigin(existing), newlyClaimed: false };

  const { error } = await supabase.from('member_public_entry_origin').insert({
    member_id: memberId,
    session_id: session.id,
    experience_key: session.experienceKey,
    source_code: session.sourceCode,
    source_raw: session.sourceRaw,
    pattern_key: session.patternKey,
    entered_at: session.firstSeenAt,
  });

  if (error) {
    // Either this member already has an origin, or this session already
    // belongs to another member. Both are "somebody got here first", which
    // is a correct outcome and not a failure to report.
    const { data: settled } = await supabase
      .from('member_public_entry_origin')
      .select('*')
      .eq('member_id', memberId)
      .maybeSingle();
    if (settled) return { origin: toOrigin(settled), newlyClaimed: false };
    console.error('claimSessionForMember failed', error);
    return { origin: null, newlyClaimed: false };
  }

  const { data: written } = await supabase
    .from('member_public_entry_origin')
    .select('*')
    .eq('member_id', memberId)
    .maybeSingle();
  return { origin: written ? toOrigin(written) : null, newlyClaimed: true };
}

type OriginRow = {
  member_id: string;
  session_id: string;
  experience_key: string;
  source_code: string | null;
  source_raw: string | null;
  pattern_key: string | null;
  entered_at: string;
  claimed_at: string;
};

function toOrigin(row: unknown): MemberPublicEntryOrigin {
  const r = row as OriginRow;
  return {
    memberId: r.member_id,
    sessionId: r.session_id,
    experienceKey: PUBLIC_ENTRY_EXPERIENCE_KEY,
    sourceCode: r.source_code,
    sourceRaw: r.source_raw,
    patternKey: (r.pattern_key as PublicEntryPatternKey | null) ?? null,
    enteredAt: r.entered_at,
    claimedAt: r.claimed_at,
    // Not read from the row on purpose. These two are check-constrained to
    // exactly these values in the database, so restating them here is the
    // type system agreeing with the schema rather than trusting a column.
    origin: 'public_acquisition',
    preliminary: true,
  };
}

/** The member's own origin row, read with her own client under her own policy. Null when she did not arrive this way, which is the normal case. */
export async function getMemberOrigin(
  supabase: SupabaseClient,
  memberId: string
): Promise<MemberPublicEntryOrigin | null> {
  const { data, error } = await supabase
    .from('member_public_entry_origin')
    .select('*')
    .eq('member_id', memberId)
    .maybeSingle();
  if (error) {
    console.error('getMemberOrigin failed', error);
    return null;
  }
  return data ? toOrigin(data) : null;
}
