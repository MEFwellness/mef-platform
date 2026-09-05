/**
 * THE QUIZ BINDING, AND THE HOLE A REAL PHONE FOUND IN IT (2026-09-05).
 *
 * WHAT HAPPENED. A visitor finished "Where Your Energy Goes" on a phone,
 * tapped the create-account button on her own result screen, and completed
 * the real signup form. Her account came out with no bound arrival at all.
 *
 * The reconstruction, from production rows: the phone still held the
 * visitor token minted when it scanned the same QR card five days earlier,
 * so opening /energy resumed THAT session rather than starting a new one,
 * and that session had already been claimed by another account. The insert
 * lost on `session_id unique`, which is correct. What was not correct is
 * what happened next: the loss was reported as `origin: null`, the claim
 * route read that as "no session yet, ask again later", the browser retried
 * on every page load forever, and the email match at signup had been
 * skipped because the form had truthfully said "this browser is holding a
 * token". Every path was closed at once and she was bound to nothing.
 *
 * WHAT THESE TESTS HOLD.
 *
 *   1. Losing the session is REPORTED as losing the session, distinctly
 *      from a broken read, so a caller can tell them apart.
 *   2. The email match binds the arrival as well as the attribution, under
 *      its four conditions, and marks its own weaker provenance.
 *   3. It never overwrites anything, from either side of the join.
 *   4. The signup path cannot complete without attempting the bind, and
 *      neither can the claim route once the browser path has failed. Both
 *      are asserted against the source, so a later edit that quietly drops
 *      the call fails the build.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { serviceRoleClient } from './setup/test-clients';
import {
  bindOriginFromEmailMatch,
  claimSessionForMember,
  getMemberOrigin,
  getSessionByToken,
  PUBLIC_ENTRY_EMAIL_MATCH_WINDOW_DAYS,
} from '@/lib/public-entry/data';

const service = serviceRoleClient();

const ROOT = path.resolve(__dirname, '..');
const read = (relative: string): string => fs.readFileSync(path.join(ROOT, relative), 'utf-8');

const SOURCE_CODE = 'qbind-test-partner';

/** Every session this file creates, so the token prefix alone identifies its rows. */
const TOKEN = {
  phone: 'qbind-token-phone-00001',
  laptop: 'qbind-token-laptop-0001',
  stale: 'qbind-token-stale-00001',
  unfinished: 'qbind-token-unfin-00001',
  phoneAgain: 'qbind-token-phone-00002',
};

const PHONE_EMAIL = 'qbind.phone@example.test';
/** The same address, typed differently at signup. The match must not care. */
const LAPTOP_EMAIL = 'QBind.Phone@Example.Test';
/** One character apart from the phone address, and that character is a SQL LIKE wildcard. */
const UNDERSCORE_EMAIL = 'qbind_phone@example.test';
const STALE_EMAIL = 'qbind.stale@example.test';
const UNFINISHED_EMAIL = 'qbind.unfinished@example.test';

const ARRIVED_AT = '2026-08-20T09:00:00.000Z';
const LEAD_AT = '2026-08-20T09:06:00.000Z';
/** Well inside the window, and after the arrival. */
const ACCOUNT_AT = '2026-08-22T18:00:00.000Z';
/** Outside the window by a clear margin. */
const LATE_ACCOUNT_AT = '2026-11-30T18:00:00.000Z';

let phoneSessionId = '';
let laptopSessionId = '';
let staleSessionId = '';
let unfinishedSessionId = '';
let secondPhoneSessionId = '';

const users: Record<string, string> = {};

async function createUser(key: string, email: string): Promise<string> {
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: 'DevPassword123!',
    email_confirm: true,
  });
  if (error) throw new Error(`createUser(${email}) failed: ${error.message}`);
  const id = data.user?.id;
  // Never proceed on an id we did not get back. A mistyped address mints a
  // session for a brand new stranger, and a fixture that writes rows for
  // nobody proves nothing and leaves rows behind.
  if (!id) throw new Error(`createUser(${email}) returned no id`);
  users[key] = id;
  return id;
}

async function insertSession(input: {
  token: string;
  leadEmail: string | null;
  completedAt: string | null;
  firstSeenAt?: string;
  leadCapturedAt?: string | null;
}): Promise<string> {
  const { data, error } = await service
    .from('public_entry_sessions')
    .insert({
      visitor_token: input.token,
      experience_key: 'energy_map',
      source_code: SOURCE_CODE,
      source_raw: SOURCE_CODE,
      landing_path: `/energy/${SOURCE_CODE}`,
      first_seen_at: input.firstSeenAt ?? ARRIVED_AT,
      started_at: ARRIVED_AT,
      completed_at: input.completedAt,
      pattern_key: input.completedAt ? 'wind_down_deficit' : null,
      lead_email: input.leadEmail,
      lead_captured_at: input.leadEmail ? (input.leadCapturedAt ?? LEAD_AT) : null,
    })
    .select('id')
    .single();
  if (error) throw new Error(`session ${input.token} failed: ${error.message}`);
  return (data as { id: string }).id;
}

beforeAll(async () => {
  await service.from('public_entry_sources').upsert({
    code: SOURCE_CODE,
    label: 'Quiz binding test partner',
    channel: 'qa',
    is_test: true,
    active: true,
  });

  phoneSessionId = await insertSession({
    token: TOKEN.phone,
    leadEmail: PHONE_EMAIL,
    completedAt: '2026-08-20T09:05:00.000Z',
  });
  laptopSessionId = await insertSession({
    token: TOKEN.laptop,
    leadEmail: STALE_EMAIL,
    completedAt: '2026-08-20T09:05:00.000Z',
  });
  staleSessionId = await insertSession({
    token: TOKEN.stale,
    leadEmail: STALE_EMAIL,
    completedAt: '2026-08-20T09:05:00.000Z',
  });
  unfinishedSessionId = await insertSession({
    token: TOKEN.unfinished,
    leadEmail: UNFINISHED_EMAIL,
    completedAt: null,
  });
  secondPhoneSessionId = await insertSession({
    token: TOKEN.phoneAgain,
    leadEmail: PHONE_EMAIL,
    completedAt: '2026-08-20T09:05:00.000Z',
  });

  await Promise.all([
    createUser('laptop', LAPTOP_EMAIL),
    createUser('underscore', UNDERSCORE_EMAIL),
    createUser('late', STALE_EMAIL),
    createUser('unfinished', UNFINISHED_EMAIL),
    createUser('first', 'qbind.first@example.test'),
    createUser('second', 'qbind.second@example.test'),
  ]);
});

afterAll(async () => {
  for (const id of Object.values(users)) {
    if (id) await service.auth.admin.deleteUser(id);
  }
  await service
    .from('public_entry_sessions')
    .delete()
    .in('id', [phoneSessionId, laptopSessionId, staleSessionId, unfinishedSessionId, secondPhoneSessionId]);
  await service.from('public_entry_sources').delete().eq('code', SOURCE_CODE);
});

// ---------------------------------------------------------------------
// The browser claim, and the answer it could not give before.
// ---------------------------------------------------------------------

describe('the browser claim reports what actually happened', () => {
  it('claims a free arrival, and marks it as the browser join', async () => {
    const session = await getSessionByToken(service, TOKEN.phone);
    expect(session).not.toBeNull();
    const result = await claimSessionForMember(service, users.first!, session!);
    expect(result.outcome).toBe('claimed');
    expect(result.origin?.sessionId).toBe(phoneSessionId);
    expect(result.origin?.bindMethod).toBe('browser_token');
  });

  it('a second call for the same member is already_bound, never a rewrite', async () => {
    const session = await getSessionByToken(service, TOKEN.phone);
    const result = await claimSessionForMember(service, users.first!, session!);
    expect(result.outcome).toBe('already_bound');
    expect(result.origin?.sessionId).toBe(phoneSessionId);
  });

  it('ANOTHER member holding the same token is session_taken, which is terminal and not a retry', async () => {
    // THE 2026-09-05 SHAPE, EXACTLY: a browser whose token names a session
    // that already belongs to somebody else. This used to be reported the
    // same way a broken read is, and the browser retried it forever.
    const session = await getSessionByToken(service, TOKEN.phone);
    const result = await claimSessionForMember(service, users.second!, session!);
    expect(result.outcome).toBe('session_taken');
    expect(result.origin).toBeNull();
    // And the member who lost still has nothing bound by this path.
    expect(await getMemberOrigin(service, users.second!)).toBeNull();
  });

  it('first bind still wins: the session belongs to whoever got there first', async () => {
    const { data } = await service
      .from('member_public_entry_origin')
      .select('member_id')
      .eq('session_id', phoneSessionId)
      .single();
    expect((data as { member_id: string }).member_id).toBe(users.first);
  });
});

// ---------------------------------------------------------------------
// The email match, the second join.
// ---------------------------------------------------------------------

describe('the email match binds the arrival she actually took', () => {
  it('matches case insensitively and marks itself as the weaker join', async () => {
    const result = await bindOriginFromEmailMatch(service, {
      memberId: users.laptop!,
      email: LAPTOP_EMAIL,
      accountCreatedAt: ACCOUNT_AT,
    });
    expect(result.bound).toBe(true);
    // The first phone session is already taken by `first`, so the only
    // free arrival on this address is the second one, and it is the one
    // that binds. A taken session is skipped, never stolen.
    expect(result.sessionId).toBe(secondPhoneSessionId);

    const origin = await getMemberOrigin(service, users.laptop!);
    expect(origin?.bindMethod).toBe('email_match');
    expect(origin?.patternKey).toBe('wind_down_deficit');
    expect(origin?.origin).toBe('public_acquisition');
    expect(origin?.preliminary).toBe(true);
  });

  it('is EXACT, so an underscore in an address is a character and not a wildcard', async () => {
    const result = await bindOriginFromEmailMatch(service, {
      memberId: users.underscore!,
      email: UNDERSCORE_EMAIL,
      accountCreatedAt: ACCOUNT_AT,
    });
    expect(result.bound).toBe(false);
    expect(await getMemberOrigin(service, users.underscore!)).toBeNull();
  });

  it('never binds an unfinished quiz, because there is no result to carry', async () => {
    const result = await bindOriginFromEmailMatch(service, {
      memberId: users.unfinished!,
      email: UNFINISHED_EMAIL,
      accountCreatedAt: ACCOUNT_AT,
    });
    expect(result.bound).toBe(false);
    expect(await getMemberOrigin(service, users.unfinished!)).toBeNull();
  });

  it('refuses an account created long after the address was left', async () => {
    const result = await bindOriginFromEmailMatch(service, {
      memberId: users.late!,
      email: STALE_EMAIL,
      accountCreatedAt: LATE_ACCOUNT_AT,
    });
    expect(result.bound).toBe(false);
    expect(await getMemberOrigin(service, users.late!)).toBeNull();
  });

  it('refuses an account that predates the arrival it would be bound to', async () => {
    const result = await bindOriginFromEmailMatch(service, {
      memberId: users.late!,
      email: STALE_EMAIL,
      accountCreatedAt: '2026-08-01T09:00:00.000Z',
    });
    expect(result.bound).toBe(false);
  });

  it('binds inside the window, and the two free arrivals are taken one each', async () => {
    const result = await bindOriginFromEmailMatch(service, {
      memberId: users.late!,
      email: STALE_EMAIL,
      accountCreatedAt: ACCOUNT_AT,
    });
    expect(result.bound).toBe(true);
    expect([laptopSessionId, staleSessionId]).toContain(result.sessionId);
  });

  it('never overwrites a bind that already stands', async () => {
    const before = await getMemberOrigin(service, users.first!);
    const result = await bindOriginFromEmailMatch(service, {
      memberId: users.first!,
      email: PHONE_EMAIL,
      accountCreatedAt: ACCOUNT_AT,
    });
    expect(result.bound).toBe(false);
    const after = await getMemberOrigin(service, users.first!);
    expect(after?.sessionId).toBe(before?.sessionId);
    expect(after?.claimedAt).toBe(before?.claimedAt);
    expect(after?.bindMethod).toBe('browser_token');
  });

  it('the window is a named constant, not a number buried in a query', () => {
    expect(PUBLIC_ENTRY_EMAIL_MATCH_WINDOW_DAYS).toBeGreaterThan(0);
    expect(read('lib/public-entry/data.ts')).toContain(
      'export const PUBLIC_ENTRY_EMAIL_MATCH_WINDOW_DAYS'
    );
  });
});

// ---------------------------------------------------------------------
// THE GUARD. No signup path may complete without attempting the bind.
// ---------------------------------------------------------------------

describe('no path to an account can skip the bind', () => {
  const AUTH = 'app/actions/auth.ts';
  const CLAIM = 'app/api/public-entry/claim/route.ts';

  it('the signup action attempts it whenever this browser carries no token', () => {
    const source = read(AUTH);
    expect(source).toMatch(/if \(!browserCarriesArrival\) \{\s*await linkArrivalByEmail/);
  });

  it('and that helper attempts BOTH halves, the bind and the attribution', () => {
    const source = read(AUTH);
    const body = source.slice(source.indexOf('async function linkArrivalByEmail'));
    expect(body).toContain('bindOriginFromEmailMatch(');
    expect(body).toContain('attachUserAcquisitionFromLead(');
  });

  it('the claim route falls through to the email match when the browser path cannot bind', () => {
    const source = read(CLAIM);
    // A taken session and a missing session both settle by email.
    expect(source).toContain("if (outcome === 'session_taken') return await settleByEmail(");
    expect(source).toContain("if (!session) return await settleByEmail(");
    const settle = source.slice(source.indexOf('async function settleByEmail'));
    expect(settle).toContain('bindOriginFromEmailMatch(');
    expect(settle).toContain('attachUserAcquisitionFromLead(');
  });

  it('and stops asking once it has, so no browser retries a question already answered', () => {
    const settle = read(CLAIM).slice(read(CLAIM).indexOf('async function settleByEmail'));
    // Every return in the fallback is terminal.
    const returns = [...settle.matchAll(/retry: (true|false)/g)].map((m) => m[1]);
    expect(returns.length).toBeGreaterThan(0);
    expect(returns.every((value) => value === 'false')).toBe(true);
  });

  it('the browser join is still tried first, and still wins', () => {
    const source = read(CLAIM);
    expect(source.indexOf('claimSessionForMember(')).toBeLessThan(
      source.indexOf("if (outcome === 'session_taken')")
    );
  });
});

// ---------------------------------------------------------------------
// The provenance, as a constraint rather than a convention.
// ---------------------------------------------------------------------

describe('how a bind happened is stored, not inferred', () => {
  const MIGRATION = '../../supabase/migrations/00000000000207_public_entry_email_bind.sql';

  it('the column exists and can hold only the two real answers', () => {
    const sql = read(MIGRATION);
    expect(sql).toContain("check (bind_method in ('browser_token', 'email_match'))");
    expect(sql).toContain("default 'browser_token'");
  });

  it('the database refuses a third value', async () => {
    const { error } = await service
      .from('member_public_entry_origin')
      .update({ bind_method: 'guessed' })
      .eq('member_id', users.first!);
    expect(error).not.toBeNull();
  });

  it('holds no em dash, including its own comments', () => {
    expect(read(MIGRATION).includes(String.fromCharCode(0x2014))).toBe(false);
  });
});
