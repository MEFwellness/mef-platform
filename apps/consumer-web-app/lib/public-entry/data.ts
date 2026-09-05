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
  PublicEntryBindMethod,
  PublicEntryEventType,
  PublicEntryPatternKey,
  PublicEntrySessionRecord,
} from '@mef/shared-types-contracts';
import { isPublicEntryBindMethod } from '@mef/shared-types-contracts';
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

/** One arrival by its own id. Used by the signup link redemption, which holds a reference to a session rather than a browser's token. */
export async function getSessionById(
  supabase: SupabaseClient,
  sessionId: string
): Promise<PublicEntrySessionRecord | null> {
  const { data, error } = await supabase
    .from('public_entry_sessions')
    .select(SESSION_COLUMNS)
    .eq('id', sessionId)
    .maybeSingle();
  if (error) {
    console.error('getSessionById failed', error);
    return null;
  }
  return data ? toSession(data as SessionRow) : null;
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
 * What a claim attempt actually resolved to.
 *
 * FOUR OUTCOMES, AND THE THIRD IS THE ONE THAT WAS MISSING. Before
 * 2026-09-05 this function reported two booleans, and a session that
 * belonged to somebody else fell into the same shape as a read that broke:
 * origin null. The claim route read that as "no session yet, ask again on a
 * later page load", so the browser retried on every page load for the rest
 * of its life and the member was never bound to anything by any path.
 *
 *   'claimed'          This call wrote the bind.
 *   'already_bound'    She already had one. First bind wins, nothing to do.
 *   'session_taken'    The session belongs to another member. TERMINAL for
 *                      this browser: no amount of retrying will change it,
 *                      and the caller should fall through to the email
 *                      match rather than ask again.
 *   'failed'           The read or the write genuinely broke. Worth a retry.
 */
export type ClaimOutcome = 'claimed' | 'already_bound' | 'session_taken' | 'failed';

export interface ClaimResult {
  origin: MemberPublicEntryOrigin | null;
  outcome: ClaimOutcome;
}

/**
 * Binds a member to the public arrival she came from, from her own
 * browser's visitor token.
 *
 * IDEMPOTENT, AND FIRST BIND WINS. member_id is the primary key and
 * session_id is unique, so a repeated claim writes nothing and a second
 * browser's token cannot re-point an existing member at a different
 * arrival. That rule is not being relaxed here: what changed on 2026-09-05
 * is only that losing the race is now REPORTED as losing the race, so the
 * caller can stop asking and try the other join instead of leaving the
 * member with nothing at all.
 *
 * THIS IS THE STRONGER OF THE TWO JOINS, and it is always tried first. A
 * browser that minted the token is the browser that answered the questions.
 * See bindOriginFromEmailMatch below for the weaker one and what it costs.
 */
export async function claimSessionForMember(
  supabase: SupabaseClient,
  memberId: string,
  session: PublicEntrySessionRecord
): Promise<ClaimResult> {
  return bindOriginToSession(supabase, memberId, session, 'browser_token');
}

/**
 * The one insert that writes a bind, whichever route asked for it.
 *
 * ONE SHAPE, THREE CALLERS. The browser claim, the signup link redemption
 * (lib/public-entry/signupRef.ts) and the email match all end here, so the
 * columns written, the conflict handling and the read-back are identical by
 * construction rather than by three files agreeing. `bindMethod` is the
 * only thing that differs, and it is the whole of what the routes disagree
 * about: how strong a statement this row is.
 *
 * FIRST BIND WINS, ENFORCED BY THE DATABASE AND NOT BY THIS CODE. member_id
 * is the primary key and session_id is unique, so this function has no way
 * to overwrite anything even if it tried. Losing is reported as losing.
 */
export async function bindOriginToSession(
  supabase: SupabaseClient,
  memberId: string,
  session: PublicEntrySessionRecord,
  bindMethod: PublicEntryBindMethod
): Promise<ClaimResult> {
  const { data: existing } = await supabase
    .from('member_public_entry_origin')
    .select('*')
    .eq('member_id', memberId)
    .maybeSingle();
  if (existing) return { origin: toOrigin(existing), outcome: 'already_bound' };

  const { error } = await supabase.from('member_public_entry_origin').insert({
    member_id: memberId,
    session_id: session.id,
    experience_key: session.experienceKey,
    source_code: session.sourceCode,
    source_raw: session.sourceRaw,
    pattern_key: session.patternKey,
    entered_at: session.firstSeenAt,
    bind_method: bindMethod,
  });

  if (error) {
    // Either this member already has an origin (a second tab got here
    // first), or this session already belongs to another member. Both are
    // "somebody got here first", and they are two different answers.
    const { data: settled } = await supabase
      .from('member_public_entry_origin')
      .select('*')
      .eq('member_id', memberId)
      .maybeSingle();
    if (settled) return { origin: toOrigin(settled), outcome: 'already_bound' };

    const { data: owner } = await supabase
      .from('member_public_entry_origin')
      .select('member_id')
      .eq('session_id', session.id)
      .maybeSingle();
    if (owner) {
      // NOT AN ERROR, AND NOT A RETRY. This is the shape a shared phone, a
      // re-scanned QR card or a resumed session produces, and it is exactly
      // the shape the 2026-09-05 real-phone test hit.
      return { origin: null, outcome: 'session_taken' };
    }

    console.error('claimSessionForMember failed', error);
    return { origin: null, outcome: 'failed' };
  }

  const { data: written } = await supabase
    .from('member_public_entry_origin')
    .select('*')
    .eq('member_id', memberId)
    .maybeSingle();
  return {
    origin: written ? toOrigin(written) : null,
    outcome: written ? 'claimed' : 'failed',
  };
}

/**
 * How long after leaving her address on a finished quiz an account may
 * still be recognised as hers.
 *
 * A BOUND WINDOW, NOT AN OPEN ONE. The join is an exact address match on a
 * self-entered, unverified field, so it must not reach arbitrarily far back
 * in time: a quiz somebody answered last spring has nothing to say about an
 * account created today, and binding it would put a stale first impression
 * on a stranger's welcome screen. Thirty days is a constant here rather
 * than a number inside a query, so there is one place to change it.
 */
export const PUBLIC_ENTRY_EMAIL_MATCH_WINDOW_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * THE SECOND JOIN: her email address, when no browser carried anything.
 *
 * WHY IT EXISTS. See migration 207's header for the whole story. In short:
 * the visitor token is the strongest join and it is still tried first, but
 * it is carried by one browser, and "answered on my phone, signed up on my
 * laptop" is the ordinary case rather than the exotic one. Without this,
 * every such visitor arrives with no quiz behind her and Root has nothing
 * honest to say about the two minutes she just spent.
 *
 * WHAT IT WILL AND WILL NOT DO.
 *
 *   It binds only a COMPLETED arrival. An abandoned quiz has no result to
 *   carry and binds to nobody.
 *
 *   It binds only an UNBOUND arrival, and only for a member who has no
 *   origin of her own. Both are enforced by the database as well
 *   (session_id unique, member_id primary key), so first bind still wins
 *   and this can never re-point or overwrite an existing bind.
 *
 *   It requires the account to have been created AFTER the arrival and
 *   within PUBLIC_ENTRY_EMAIL_MATCH_WINDOW_DAYS of the address being left.
 *
 *   It marks what it wrote. bind_method 'email_match' says out loud that
 *   this row came from a weaker join than a browser token, so nothing
 *   downstream has to guess.
 *
 * NEWEST MATCHING ARRIVAL WINS, and that is the opposite of the first-touch
 * rule the attribution tables use, deliberately. Attribution answers "who
 * sent her", which is a question about the first time. This answers "what
 * did she just tell us", which is a question about the most recent time,
 * because that is the result she has actually read and the one Root would
 * be referring to.
 *
 * NEVER THROWS AND NEVER FAILS A SIGNUP. Every failure returns false.
 */
export async function bindOriginFromEmailMatch(
  supabase: SupabaseClient,
  input: { memberId: string; email: string; accountCreatedAt: string | null }
): Promise<{ bound: boolean; sessionId: string | null }> {
  const email = input.email.trim().toLowerCase();
  if (!email) return { bound: false, sessionId: null };

  // Her own side of "never overwrite". Cheapest check, and the one that
  // makes this a no-op for every member who already arrived with a token.
  const { data: existing, error: existingError } = await supabase
    .from('member_public_entry_origin')
    .select('member_id')
    .eq('member_id', input.memberId)
    .maybeSingle();
  if (existingError) {
    console.error('bindOriginFromEmailMatch read failed', existingError);
    return { bound: false, sessionId: null };
  }
  if (existing) return { bound: false, sessionId: null };

  const createdAt = input.accountCreatedAt ? new Date(input.accountCreatedAt) : null;
  if (!createdAt || Number.isNaN(createdAt.getTime())) return { bound: false, sessionId: null };

  const { data: rows, error } = await supabase
    .from('public_entry_sessions')
    .select(SESSION_COLUMNS)
    .ilike('lead_email', email)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(10);
  if (error) {
    console.error('bindOriginFromEmailMatch session read failed', error);
    return { bound: false, sessionId: null };
  }

  const candidates = ((rows ?? []) as SessionRow[])
    .map(toSession)
    // ilike is a pattern match, and an address is not a pattern. The exact
    // comparison is made here so an address holding a % or an _ can never
    // match somebody else's.
    .filter((session) => (session.leadEmail ?? '').trim().toLowerCase() === email)
    .filter((session) => {
      const capturedAt = session.leadCapturedAt ? new Date(session.leadCapturedAt).getTime() : NaN;
      const arrivedAt = new Date(session.firstSeenAt).getTime();
      if (Number.isNaN(capturedAt) || Number.isNaN(arrivedAt)) return false;
      // The account cannot predate the arrival it is supposed to have come
      // from, and it cannot follow it by more than the window.
      if (createdAt.getTime() < arrivedAt) return false;
      return createdAt.getTime() - capturedAt <= PUBLIC_ENTRY_EMAIL_MATCH_WINDOW_DAYS * DAY_MS;
    });

  for (const session of candidates) {
    const { data: owner, error: ownerError } = await supabase
      .from('member_public_entry_origin')
      .select('member_id')
      .eq('session_id', session.id)
      .maybeSingle();
    if (ownerError) {
      console.error('bindOriginFromEmailMatch owner read failed', ownerError);
      return { bound: false, sessionId: null };
    }
    // Already somebody's arrival. Try the next newest rather than stopping:
    // one address used on two arrivals is exactly the case where the older
    // session is still genuinely free.
    if (owner) continue;

    // The same insert every other route uses, so there is one shape and one
    // conflict story rather than three.
    const { origin, outcome } = await bindOriginToSession(
      supabase,
      input.memberId,
      session,
      'email_match'
    );
    if (outcome === 'claimed' && origin) return { bound: true, sessionId: origin.sessionId };
    // Lost a race on either key, or the write broke. Somebody got here
    // first is a correct outcome, so stop rather than trying the next
    // candidate; a broken write is not something a second candidate fixes.
    if (outcome !== 'session_taken') return { bound: false, sessionId: null };
  }

  return { bound: false, sessionId: null };
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
  bind_method: string | null;
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
    // A row written before migration 207 has no value here. It was written
    // by the browser claim, because that was the only writer that had ever
    // existed, so reading a missing value as anything else would be
    // inventing a weaker provenance than the row actually has.
    bindMethod: isPublicEntryBindMethod(r.bind_method) ? r.bind_method : 'browser_token',
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
