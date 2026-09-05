/**
 * THE SIGNUP LINK, AND THE THIRD WAY A REAL SIGNUP CAME OUT BOUND TO
 * NOTHING (2026-09-05).
 *
 * WHAT HAPPENED, FROM PRODUCTION ROWS. A visitor finished "Where Your
 * Energy Goes" on her phone at 09:06 and read her result. She tapped the
 * create-account button at 09:11, finished the signup form, and confirmed
 * her email at 09:12. Her account came out with no arrival bound to it at
 * all, and the finished quiz session was still sitting there with nobody
 * attached.
 *
 * Neither join that existed could reach:
 *
 *   The BROWSER TOKEN join runs from the claim in the root layout, and that
 *   needs somebody to be signed in. Between the button and the confirmation
 *   she is signed in nowhere, and the confirmation link opened in her mail
 *   app's own browser, which holds no token.
 *
 *   The EMAIL MATCH join needs an address on the finished session, and the
 *   email step on the result screen is optional. She skipped it.
 *
 * WHAT CLOSES IT. The create-account button carries a one-time, server
 * issued reference to the arrival it belongs to, and the signup SERVER
 * redeems it while it is creating the account. No browser has to come back.
 *
 * WHAT THESE TESTS HOLD.
 *
 *   1. A reference binds once, cleanly, and says out loud which route it
 *      was.
 *   2. Using the same reference twice binds nothing the second time.
 *   3. An expired reference binds nothing.
 *   4. A forged reference binds nothing and costs nothing.
 *   5. A reference to an arrival somebody else already claimed loses,
 *      FINALLY, with no retry left anywhere.
 *   6. Precedence: the browser token still wins whenever it got there
 *      first, a reference never overwrites, and the email match never runs
 *      when the reference already bound her.
 *   7. Nothing about a signup can complete without attempting the bind when
 *      a reference is present, asserted against the source so a later edit
 *      that quietly drops the call fails the build.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { serviceRoleClient } from './setup/test-clients';
import {
  bindOriginToSession,
  getMemberOrigin,
  getSessionById,
} from '@/lib/public-entry/data';
import {
  hashSignupRef,
  mintSignupRef,
  redeemSignupRef,
  PUBLIC_ENTRY_SIGNUP_REF_TTL_HOURS,
} from '@/lib/public-entry/signupRef';
import { isSignupRefShape, readSignupRef } from '@/lib/public-entry/signupField';

const service = serviceRoleClient();

const ROOT = path.resolve(__dirname, '..');
const read = (relative: string): string => fs.readFileSync(path.join(ROOT, relative), 'utf-8');

const SOURCE_CODE = 'slink-test-partner';
const ARRIVED_AT = '2026-09-01T09:00:00.000Z';
const COMPLETED_AT = '2026-09-01T09:05:00.000Z';

const TOKEN = {
  phone: 'slink-token-phone-00001',
  second: 'slink-token-second-0001',
  taken: 'slink-token-taken-00001',
  unfinished: 'slink-token-unfin-00001',
  expired: 'slink-token-expire-0001',
  precedence: 'slink-token-preced-0001',
};

const users: Record<string, string> = {};
const sessions: Record<string, string> = {};

/** A leftover from an interrupted run, hard deleted so its address is free again. */
async function dropExisting(email: string): Promise<void> {
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= 5; page++) {
    const { data } = await service.auth.admin.listUsers({ page, perPage: 200 });
    const hit = (data?.users ?? []).find((u) => (u.email ?? '').toLowerCase() === target);
    if (hit) {
      await service.auth.admin.deleteUser(hit.id, false);
      return;
    }
    if ((data?.users ?? []).length < 200) return;
  }
}

async function createUser(key: string, email: string): Promise<string> {
  await dropExisting(email);
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: 'DevPassword123!',
    email_confirm: true,
  });
  if (error) throw new Error(`createUser(${email}) failed: ${error.message}`);
  const id = data.user?.id;
  // Never proceed on an id we did not get back: a mistyped address mints a
  // session for a brand new stranger, and a fixture that writes rows for
  // nobody proves nothing and leaves rows behind.
  if (!id) throw new Error(`createUser(${email}) returned no id`);
  users[key] = id;
  return id;
}

async function insertSession(key: string, token: string, completedAt: string | null): Promise<string> {
  const { data, error } = await service
    .from('public_entry_sessions')
    .insert({
      visitor_token: token,
      experience_key: 'energy_map',
      source_code: SOURCE_CODE,
      source_raw: SOURCE_CODE,
      landing_path: `/energy/${SOURCE_CODE}`,
      first_seen_at: ARRIVED_AT,
      started_at: ARRIVED_AT,
      completed_at: completedAt,
      pattern_key: completedAt ? 'wind_down_deficit' : null,
    })
    .select('id')
    .single();
  if (error) throw new Error(`session ${token} failed: ${error.message}`);
  const id = (data as { id: string }).id;
  sessions[key] = id;
  return id;
}

beforeAll(async () => {
  await service.from('public_entry_sources').upsert({
    code: SOURCE_CODE,
    label: 'Signup link test partner',
    channel: 'qa',
    is_test: true,
    active: true,
  });

  await insertSession('phone', TOKEN.phone, COMPLETED_AT);
  await insertSession('second', TOKEN.second, COMPLETED_AT);
  await insertSession('taken', TOKEN.taken, COMPLETED_AT);
  await insertSession('unfinished', TOKEN.unfinished, null);
  await insertSession('expired', TOKEN.expired, COMPLETED_AT);
  await insertSession('precedence', TOKEN.precedence, COMPLETED_AT);

  await Promise.all([
    createUser('phone', 'slink.phone@example.test'),
    createUser('reuse', 'slink.reuse@example.test'),
    createUser('expired', 'slink.expired@example.test'),
    createUser('forged', 'slink.forged@example.test'),
    createUser('owner', 'slink.owner@example.test'),
    createUser('loser', 'slink.loser@example.test'),
    createUser('unfinished', 'slink.unfinished@example.test'),
    createUser('precedence', 'slink.precedence@example.test'),
  ]);
});

afterAll(async () => {
  for (const id of Object.values(users)) {
    // Hard deleted, so the address is free the next time this file runs.
    if (id) await service.auth.admin.deleteUser(id, false);
  }
  await service.from('public_entry_sessions').delete().in('id', Object.values(sessions));
  await service.from('public_entry_sources').delete().eq('code', SOURCE_CODE);
});

// ---------------------------------------------------------------------
// Minting
// ---------------------------------------------------------------------

describe('the reference is server minted, opaque and stored only as a hash', () => {
  it('is a long url-safe value the browser never chose', async () => {
    const ref = await mintSignupRef(service, sessions.phone!);
    expect(ref).not.toBeNull();
    expect(isSignupRefShape(ref!)).toBe(true);
    // url-safe base64 of thirty two bytes.
    expect(ref!.length).toBe(43);
    expect(ref).not.toContain(TOKEN.phone);
  });

  it('two mints are never the same value', async () => {
    const a = await mintSignupRef(service, sessions.phone!);
    const b = await mintSignupRef(service, sessions.phone!);
    expect(a).not.toBe(b);
  });

  it('the reference itself is nowhere in the table, only its hash', async () => {
    const ref = await mintSignupRef(service, sessions.second!);
    const { data } = await service
      .from('public_entry_signup_refs')
      .select('ref_hash')
      .eq('session_id', sessions.second!);
    const hashes = ((data ?? []) as { ref_hash: string }[]).map((r) => r.ref_hash);
    expect(hashes).not.toContain(ref);
    expect(hashes).toContain(hashSignupRef(ref!));
  });

  it('leaves exactly one live reference per arrival, so an old one stops working', async () => {
    const { data } = await service
      .from('public_entry_signup_refs')
      .select('id')
      .eq('session_id', sessions.phone!);
    expect((data ?? []).length).toBe(1);
  });

  it('expires on a stated window rather than a number buried in a query', async () => {
    expect(PUBLIC_ENTRY_SIGNUP_REF_TTL_HOURS).toBe(24);
    const ref = await mintSignupRef(service, sessions.expired!);
    const { data } = await service
      .from('public_entry_signup_refs')
      .select('issued_at, expires_at')
      .eq('ref_hash', hashSignupRef(ref!))
      .single();
    const row = data as { issued_at: string; expires_at: string };
    const hours = (new Date(row.expires_at).getTime() - new Date(row.issued_at).getTime()) / 3_600_000;
    expect(Math.round(hours)).toBe(PUBLIC_ENTRY_SIGNUP_REF_TTL_HOURS);
  });
});

// ---------------------------------------------------------------------
// Redeeming: the happy path, and single use
// ---------------------------------------------------------------------

describe('redeeming binds once and says which route it was', () => {
  it('binds the arrival the reference names, marked signup_link', async () => {
    const ref = await mintSignupRef(service, sessions.phone!);
    const result = await redeemSignupRef(service, { memberId: users.phone!, ref: ref! });
    expect(result.outcome).toBe('bound');
    expect(result.bound).toBe(true);
    expect(result.session?.id).toBe(sessions.phone);

    const origin = await getMemberOrigin(service, users.phone!);
    expect(origin?.sessionId).toBe(sessions.phone);
    expect(origin?.bindMethod).toBe('signup_link');
    expect(origin?.patternKey).toBe('wind_down_deficit');
    // The provenance the database itself refuses to restate.
    expect(origin?.origin).toBe('public_acquisition');
    expect(origin?.preliminary).toBe(true);
  });

  it('the same reference used a second time binds nothing', async () => {
    const ref = await mintSignupRef(service, sessions.second!);
    const first = await redeemSignupRef(service, { memberId: users.reuse!, ref: ref! });
    expect(first.outcome).toBe('bound');

    // A different member, the same reference. This is the replay.
    const second = await redeemSignupRef(service, { memberId: users.forged!, ref: ref! });
    expect(second.bound).toBe(false);
    expect(second.outcome).toBe('used');
    expect(await getMemberOrigin(service, users.forged!)).toBeNull();
  });

  it('the spent row records who spent it and what it resolved to', async () => {
    const { data } = await service
      .from('public_entry_signup_refs')
      .select('used_at, used_by_member_id, outcome')
      .eq('session_id', sessions.second!)
      .not('used_at', 'is', null)
      .maybeSingle();
    const row = data as { used_by_member_id: string; outcome: string } | null;
    expect(row?.used_by_member_id).toBe(users.reuse);
    expect(row?.outcome).toBe('bound');
  });
});

// ---------------------------------------------------------------------
// Redeeming: everything that must bind nothing, quietly
// ---------------------------------------------------------------------

describe('a reference that should not work, does not, and breaks nothing', () => {
  it('an expired reference binds nothing', async () => {
    const ref = await mintSignupRef(service, sessions.expired!);
    // Pushed into the past, which is the only way to observe a window
    // without waiting a day for it.
    await service
      .from('public_entry_signup_refs')
      .update({ expires_at: '2026-09-01T10:00:00.000Z' })
      .eq('ref_hash', hashSignupRef(ref!));

    const result = await redeemSignupRef(service, { memberId: users.expired!, ref: ref! });
    expect(result.bound).toBe(false);
    expect(result.outcome).toBe('expired');
    expect(await getMemberOrigin(service, users.expired!)).toBeNull();
  });

  it('an expired reference is not silently spent either', async () => {
    const { data } = await service
      .from('public_entry_signup_refs')
      .select('used_at')
      .eq('session_id', sessions.expired!)
      .maybeSingle();
    expect((data as { used_at: string | null } | null)?.used_at).toBeNull();
  });

  it('a forged reference of the right shape names nothing', async () => {
    const forged = 'A'.repeat(43);
    expect(isSignupRefShape(forged)).toBe(true);
    const result = await redeemSignupRef(service, { memberId: users.forged!, ref: forged });
    expect(result.bound).toBe(false);
    expect(result.outcome).toBe('not_found');
    expect(await getMemberOrigin(service, users.forged!)).toBeNull();
  });

  it('a malformed reference costs one regex and no query at all', async () => {
    for (const junk of ['', 'short', '../../etc/passwd', 'x'.repeat(500), "a'; drop table --"]) {
      const result = await redeemSignupRef(service, { memberId: users.forged!, ref: junk });
      expect(result.bound).toBe(false);
      expect(result.outcome).toBe('invalid');
    }
  });

  it('an unfinished arrival has no result to carry, so it binds nobody', async () => {
    const ref = await mintSignupRef(service, sessions.unfinished!);
    const result = await redeemSignupRef(service, { memberId: users.unfinished!, ref: ref! });
    expect(result.bound).toBe(false);
    expect(result.outcome).toBe('session_unfinished');
    expect(await getMemberOrigin(service, users.unfinished!)).toBeNull();
  });
});

// ---------------------------------------------------------------------
// First bind wins, and losing is final
// ---------------------------------------------------------------------

describe('an arrival that already belongs to somebody is a final loss', () => {
  it('the first account claims it', async () => {
    const session = await getSessionById(service, sessions.taken!);
    const claim = await bindOriginToSession(service, users.owner!, session!, 'browser_token');
    expect(claim.outcome).toBe('claimed');
    expect(claim.origin?.bindMethod).toBe('browser_token');
  });

  it('a reference to it loses, and says so rather than asking again', async () => {
    const ref = await mintSignupRef(service, sessions.taken!);
    const result = await redeemSignupRef(service, { memberId: users.loser!, ref: ref! });
    expect(result.bound).toBe(false);
    expect(result.outcome).toBe('session_taken');
    expect(await getMemberOrigin(service, users.loser!)).toBeNull();
  });

  it('and the reference is spent, so there is no retry loop left in it', async () => {
    const { data } = await service
      .from('public_entry_signup_refs')
      .select('used_at, used_by_member_id, outcome')
      .eq('session_id', sessions.taken!)
      .maybeSingle();
    const row = data as { used_at: string | null; used_by_member_id: string; outcome: string } | null;
    expect(row?.used_at).not.toBeNull();
    expect(row?.used_by_member_id).toBe(users.loser);
    expect(row?.outcome).toBe('session_taken');
  });

  it('the arrival still belongs to whoever got there first', async () => {
    const { data } = await service
      .from('member_public_entry_origin')
      .select('member_id, bind_method')
      .eq('session_id', sessions.taken!)
      .single();
    const row = data as { member_id: string; bind_method: string };
    expect(row.member_id).toBe(users.owner);
    expect(row.bind_method).toBe('browser_token');
  });
});

// ---------------------------------------------------------------------
// Precedence
// ---------------------------------------------------------------------

describe('precedence: browser token first, signup link second, email match last', () => {
  it('a member the browser token already bound is never rewritten by a reference', async () => {
    const session = await getSessionById(service, sessions.precedence!);
    const claim = await bindOriginToSession(service, users.precedence!, session!, 'browser_token');
    expect(claim.outcome).toBe('claimed');

    const ref = await mintSignupRef(service, sessions.precedence!);
    const result = await redeemSignupRef(service, { memberId: users.precedence!, ref: ref! });
    expect(result.bound).toBe(false);
    expect(result.outcome).toBe('member_already_bound');

    const origin = await getMemberOrigin(service, users.precedence!);
    expect(origin?.bindMethod).toBe('browser_token');
    expect(origin?.sessionId).toBe(sessions.precedence);
  });

  it('and it does not burn the reference on a member it could never bind', async () => {
    const { data } = await service
      .from('public_entry_signup_refs')
      .select('used_at')
      .eq('session_id', sessions.precedence!)
      .maybeSingle();
    expect((data as { used_at: string | null } | null)?.used_at).toBeNull();
  });

  it('the signup action tries the reference BEFORE the email match, and never both', () => {
    const source = read('app/actions/auth.ts');
    const body = source.slice(source.indexOf('async function linkArrival('));
    expect(body.indexOf('redeemSignupRef(')).toBeGreaterThan(-1);
    expect(body.indexOf('redeemSignupRef(')).toBeLessThan(body.indexOf('bindOriginFromEmailMatch('));
    // One bind, never two: the email match is skipped outright once the
    // reference bound her.
    expect(body).toContain('if (bound || options.browserCarriesArrival) return;');
  });

  it('the browser token still owns the outcome when it is the only thing carried', () => {
    const source = read('app/actions/auth.ts');
    const body = source.slice(source.indexOf('async function linkArrival('));
    // Nothing carried but a token: the claim route owns it, exactly as before.
    expect(body).toContain('if (!options.signupRef && options.browserCarriesArrival) return;');
  });

  it('one insert writes every bind, so the three routes cannot drift apart', () => {
    const data = read('lib/public-entry/data.ts');
    expect(data).toContain('export async function bindOriginToSession(');
    expect(data).toContain('bind_method: bindMethod,');
    // And the browser claim is a thin caller of it rather than a copy.
    expect(data).toMatch(/claimSessionForMember[\s\S]{0,200}bindOriginToSession\(supabase, memberId, session, 'browser_token'\)/);
  });
});

// ---------------------------------------------------------------------
// THE GUARD. No signup carrying a reference can complete without trying it.
// ---------------------------------------------------------------------

describe('no path to an account can skip the reference it was handed', () => {
  it('signUp reads it off the form and hands it to the linker', () => {
    const source = read('app/actions/auth.ts');
    expect(source).toContain('const signupRef = readSignupRef(formData);');
    expect(source).toMatch(/await linkArrival\(data\.user, email, \{ signupRef, browserCarriesArrival \}\)/);
    // Unconditionally called: the decision about which routes apply is made
    // inside, where it can be read in one place.
    expect(source).not.toMatch(/if \(!browserCarriesArrival\) \{\s*await linkArrival/);
  });

  it('the form carries it, and still never carries the visitor token itself', () => {
    const form = read('app/(auth)/signup/page.tsx');
    expect(form).toContain('PUBLIC_ENTRY_REF_FIELD');
    expect(form).toContain('captureSignupRef()');
    expect(form).not.toMatch(/name=\{?["']?visitorToken/);
  });

  it('the result screen mints it on completion and puts it on the create-account link only', () => {
    const route = read('app/api/public-entry/route.ts');
    expect(route).toContain('const signupRef = await mintSignupRef(supabase, session.id);');
    const client = read('components/public-entry/EnergyEntryClient.tsx');
    expect(client).toContain('PUBLIC_ENTRY_REF_QUERY');
    // The log-in button never carries one.
    expect(client).toMatch(/if \(target === 'login'\) \{\s*window\.location\.href = '\/login';/);
  });

  it('the form reader refuses anything that is not the right shape', () => {
    const form = new FormData();
    expect(readSignupRef(form)).toBeNull();
    form.set('publicEntryRef', 'nope');
    expect(readSignupRef(form)).toBeNull();
    form.set('publicEntryRef', 'B'.repeat(43));
    expect(readSignupRef(form)).toBe('B'.repeat(43));
  });

  it('redeeming can never throw into a signup', async () => {
    await expect(
      redeemSignupRef(service, { memberId: '00000000-0000-0000-0000-000000000000', ref: 'C'.repeat(43) })
    ).resolves.toMatchObject({ bound: false });
  });
});

// ---------------------------------------------------------------------
// The reasoning is written down, not merely followed
// ---------------------------------------------------------------------

describe('the superseded rule is rewritten in place, not deleted', () => {
  const MIGRATION = '../../supabase/migrations/00000000000208_public_entry_signup_ref.sql';

  it('the field file still states the old rule and states what supersedes it', () => {
    const source = read('lib/public-entry/signupField.ts');
    expect(source).toContain('THE ORIGINAL RULE, WHICH STILL STANDS FOR THE VISITOR TOKEN');
    expect(source).toMatch(/nything a browser can name, a browser can invent/);
    expect(source).toContain('SUPERSEDED FOR ONE SHAPE');
  });

  it('the database can hold the new provenance and refuses a fourth value', async () => {
    const sql = read(MIGRATION);
    expect(sql).toContain("check (bind_method in ('browser_token', 'email_match', 'signup_link'))");
    const { error } = await service
      .from('member_public_entry_origin')
      .update({ bind_method: 'guessed' })
      .eq('member_id', users.phone!);
    expect(error).not.toBeNull();
  });

  it('the references table is readable by nobody but the platform', async () => {
    const sql = read(MIGRATION);
    expect(sql).toContain('alter table public_entry_signup_refs enable row level security;');
    expect(sql).not.toMatch(/create policy[\s\S]*public_entry_signup_refs/);
  });

  it('holds no em dash, including its own comments', () => {
    expect(read(MIGRATION).includes(String.fromCharCode(0x2014))).toBe(false);
    expect(read('lib/public-entry/signupRef.ts').includes(String.fromCharCode(0x2014))).toBe(false);
  });
});
