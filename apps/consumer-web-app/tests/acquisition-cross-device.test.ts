/**
 * THE CROSS DEVICE FIX AND THE REPORT IT FEEDS, against the real database
 * and its real policies.
 *
 * WHAT WAS BROKEN. The link from a lead to an account went through the
 * browser and only through the browser: the visitor token in localStorage
 * was the whole join. Somebody who answered on her phone, left her email
 * there, and created her account on a laptop arrived as an untracked
 * account, and the partner who actually sent her was credited with nothing.
 *
 * WHAT THESE PROVE, which the pure tests cannot:
 *
 *   1. The email match attaches the lead's attribution to the account, with
 *      the ORIGINAL timestamps, and it is case insensitive.
 *   2. It is EXACT. `a_b@x.com` does not match `axb@x.com`. That is not
 *      hypothetical: matching case insensitively through PostgREST means
 *      `ilike`, whose SQL wildcards include the underscore, and an
 *      underscore is an ordinary character in an email address.
 *   3. Browser-carried attribution still wins. An account that already has
 *      an origin is left exactly as it was, by the database's own refusal
 *      as well as by the code.
 *   4. One arrival backs at most one account. The second account matching
 *      the same arrival keeps its attribution and claims no session.
 *   5. The funnel view resolves an account bound only by its own
 *      attribution row, which is what makes a cross device signup show as
 *      attributed instead of untracked.
 *   6. The report view carries the six stages, settles is_test from both
 *      ends, and shows paid conversion from a real tier change.
 *   7. The report view carries no answer and no pattern key at all.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { serviceRoleClient, signInAs, TEST_USERS } from './setup/test-clients';
import {
  attachUserAcquisitionFromLead,
  findLeadAcquisitionByEmail,
} from '@/lib/acquisition/data';
import { readAcquisitionRows } from '@/lib/acquisition/reportData';
import { rollUp, totalsOf, UNTRACKED_KEY } from '@/lib/acquisition/report';

const service = serviceRoleClient();

const SOURCE_CODE = 'xdev-test-partner';
const TOKEN_PHONE = 'xdev-token-phone-000001';
const TOKEN_BARE = 'xdev-token-bare-0000001';

/** The address she typed on her phone. The laptop account uses a different CASE of the same address on purpose. */
const LEAD_EMAIL = 'xdev.phone@example.test';
const LAPTOP_EMAIL = 'XDev.Phone@Example.Test';
/** One character apart from the lead address, and that character is a SQL LIKE wildcard. */
const UNDERSCORE_EMAIL = 'xdev_phone@example.test';
const SECOND_LEAD_EMAIL = 'xdev.second@example.test';

const LANDED_AT = '2026-08-31T09:00:00.000Z';
const LEAD_AT = '2026-08-31T09:07:00.000Z';

const ATTRIBUTION = {
  utm_source: SOURCE_CODE,
  utm_medium: 'counter_card',
  utm_campaign: 'xdev_run',
  utm_content: 'card_x',
  utm_term: null as string | null,
  source_code: SOURCE_CODE,
  source_raw: SOURCE_CODE,
  fbclid: null as string | null,
  ttclid: null as string | null,
  gclid: null as string | null,
  landing_path: `/energy/${SOURCE_CODE}`,
  referrer_host: 'www.instagram.com',
  geo_country: 'GB',
  geo_region: 'ENG',
  geo_city: 'Milton Keynes',
};

let phoneSessionId = '';
let bareSessionId = '';
let conversationId = '';
let leadId = '';
let secondLeadId = '';
let laptopUserId = '';
let underscoreUserId = '';
let browserUserId = '';
let secondUserId = '';

async function createUser(email: string): Promise<string> {
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: 'DevPassword123!',
    email_confirm: true,
  });
  if (error) throw new Error(`createUser(${email}) failed: ${error.message}`);
  const id = data.user?.id;
  // Never proceed on an id we did not get back: a fixture that quietly
  // writes rows for nobody proves nothing and leaves rows behind.
  if (!id) throw new Error(`createUser(${email}) returned no id`);
  return id;
}

beforeAll(async () => {
  await service.from('public_entry_sources').upsert({
    code: SOURCE_CODE,
    label: 'Cross device test partner',
    channel: 'partner',
    is_test: false,
    active: true,
    partner_name: 'Cross device test partner',
    location_name: 'Test Counter',
    location_city: 'Milton Keynes',
  });

  const phone = await service
    .from('public_entry_sessions')
    .insert({
      visitor_token: TOKEN_PHONE,
      experience_key: 'energy_map',
      source_code: SOURCE_CODE,
      source_raw: SOURCE_CODE,
      landing_path: `/energy/${SOURCE_CODE}`,
      first_seen_at: LANDED_AT,
      started_at: '2026-08-31T09:01:00.000Z',
      completed_at: '2026-08-31T09:06:00.000Z',
      pattern_key: 'wind_down_deficit',
      lead_email: LEAD_EMAIL,
      lead_captured_at: LEAD_AT,
    })
    .select('id')
    .single();
  if (phone.error) throw new Error(`phone session failed: ${phone.error.message}`);
  phoneSessionId = (phone.data as { id: string }).id;

  const bare = await service
    .from('public_entry_sessions')
    .insert({
      visitor_token: TOKEN_BARE,
      experience_key: 'energy_map',
      landing_path: '/energy',
      first_seen_at: LANDED_AT,
    })
    .select('id')
    .single();
  if (bare.error) throw new Error(`bare session failed: ${bare.error.message}`);
  bareSessionId = (bare.data as { id: string }).id;

  await service
    .from('public_entry_attribution')
    .insert({ session_id: phoneSessionId, touch: 'first', landed_at: LANDED_AT, ...ATTRIBUTION });

  const conversation = await service
    .from('lead_conversations')
    .insert({ session_token: 'xdev-conversation-0001', topic: 'energy', status: 'completed' })
    .select('id')
    .single();
  if (conversation.error) throw new Error(`conversation failed: ${conversation.error.message}`);
  conversationId = (conversation.data as { id: string }).id;

  const lead = await service
    .from('captured_leads')
    .insert({ conversation_id: conversationId, email: LEAD_EMAIL, topic: 'energy' })
    .select('id')
    .single();
  if (lead.error) throw new Error(`lead failed: ${lead.error.message}`);
  leadId = (lead.data as { id: string }).id;

  const secondLead = await service
    .from('captured_leads')
    .insert({ conversation_id: conversationId, email: SECOND_LEAD_EMAIL, topic: 'energy' })
    .select('id')
    .single();
  if (secondLead.error) throw new Error(`second lead failed: ${secondLead.error.message}`);
  secondLeadId = (secondLead.data as { id: string }).id;

  await service.from('captured_lead_acquisition').insert([
    {
      captured_lead_id: leadId,
      session_id: phoneSessionId,
      landed_at: LANDED_AT,
      lead_captured_at: LEAD_AT,
      ...ATTRIBUTION,
    },
    {
      captured_lead_id: secondLeadId,
      session_id: phoneSessionId,
      landed_at: LANDED_AT,
      lead_captured_at: LEAD_AT,
      ...ATTRIBUTION,
    },
  ]);

  laptopUserId = await createUser(LAPTOP_EMAIL);
  underscoreUserId = await createUser(UNDERSCORE_EMAIL);
  browserUserId = await createUser('xdev.browser@example.test');
  secondUserId = await createUser(SECOND_LEAD_EMAIL);
});

afterAll(async () => {
  for (const id of [laptopUserId, underscoreUserId, browserUserId, secondUserId]) {
    if (id) await service.auth.admin.deleteUser(id);
  }
  await service.from('captured_lead_acquisition').delete().in('captured_lead_id', [leadId, secondLeadId]);
  await service.from('captured_leads').delete().in('id', [leadId, secondLeadId]);
  await service.from('lead_conversations').delete().eq('id', conversationId);
  await service.from('public_entry_sessions').delete().in('visitor_token', [TOKEN_PHONE, TOKEN_BARE]);
  await service.from('public_entry_sources').delete().eq('code', SOURCE_CODE);
});

// ---------------------------------------------------------------------
// The match itself
// ---------------------------------------------------------------------

describe('matching a lead to an account by email address', () => {
  it('finds the lead whatever case the address was typed in', async () => {
    const match = await findLeadAcquisitionByEmail(service, LAPTOP_EMAIL);
    expect(match).not.toBeNull();
    expect(match?.capturedLeadId).toBe(leadId);
    expect(match?.attribution.sourceCode).toBe(SOURCE_CODE);
    expect(match?.attribution.utmCampaign).toBe('xdev_run');
    // Postgres hands a timestamptz back as `+00:00` rather than `Z`, so
    // the assertion is on the INSTANT rather than on the spelling.
    expect(new Date(match?.landedAt ?? '').toISOString()).toBe(LANDED_AT);
  });

  it('is exact: an underscore is a character in an address, not a wildcard', async () => {
    // `lower(x) = lower(y)`, never `ilike`. Under ilike this address would
    // have matched the lead above and attached one stranger's origin to
    // another person's account.
    const match = await findLeadAcquisitionByEmail(service, UNDERSCORE_EMAIL);
    expect(match).toBeNull();
  });

  it('an address nobody left returns nothing rather than the nearest thing', async () => {
    expect(await findLeadAcquisitionByEmail(service, 'nobody.here@example.test')).toBeNull();
    expect(await findLeadAcquisitionByEmail(service, '   ')).toBeNull();
  });
});

describe('attaching it to the account', () => {
  it('attaches the arrival she took on another device, with the original timestamps', async () => {
    const result = await attachUserAcquisitionFromLead(service, {
      memberId: laptopUserId,
      email: LAPTOP_EMAIL,
      accountCreatedAt: '2026-09-01T12:00:00.000Z',
    });
    expect(result).toEqual({ attached: true, sourceCode: SOURCE_CODE });

    const { data } = await service
      .from('user_acquisition')
      .select('*')
      .eq('member_id', laptopUserId)
      .single();
    expect(data).toMatchObject({
      source_code: SOURCE_CODE,
      utm_campaign: 'xdev_run',
      utm_content: 'card_x',
      geo_city: 'Milton Keynes',
      captured_lead_id: leadId,
      session_id: phoneSessionId,
      origin: 'public_acquisition',
    });
    const times = data as { landed_at: string; lead_captured_at: string; account_created_at: string };
    expect(new Date(times.landed_at).toISOString()).toBe(LANDED_AT);
    expect(new Date(times.lead_captured_at).toISOString()).toBe(LEAD_AT);
    expect(new Date(times.account_created_at).toISOString()).toBe('2026-09-01T12:00:00.000Z');
  });

  it('carries no email address anywhere, because there is no column for one', async () => {
    const { data } = await service
      .from('user_acquisition')
      .select('*')
      .eq('member_id', laptopUserId)
      .single();
    expect(JSON.stringify(data)).not.toContain('xdev.phone');
    expect(JSON.stringify(data)).not.toContain('wind_down_deficit');
  });

  it('does not write the browser bind, because an email match is not consent to show her answers', async () => {
    const { data } = await service
      .from('member_public_entry_origin')
      .select('member_id')
      .eq('member_id', laptopUserId)
      .maybeSingle();
    expect(data).toBeNull();
  });

  it('running it twice changes nothing at all', async () => {
    const again = await attachUserAcquisitionFromLead(service, {
      memberId: laptopUserId,
      email: LAPTOP_EMAIL,
      accountCreatedAt: '2030-01-01T00:00:00.000Z',
    });
    expect(again.attached).toBe(false);

    const { data } = await service
      .from('user_acquisition')
      .select('account_created_at')
      .eq('member_id', laptopUserId)
      .single();
    expect(
      new Date((data as { account_created_at: string }).account_created_at).toISOString()
    ).toBe('2026-09-01T12:00:00.000Z');
  });

  it('one arrival backs at most one account, and the second keeps its attribution anyway', async () => {
    const result = await attachUserAcquisitionFromLead(service, {
      memberId: secondUserId,
      email: SECOND_LEAD_EMAIL,
      accountCreatedAt: '2026-09-02T12:00:00.000Z',
    });
    expect(result.attached).toBe(true);

    const { data } = await service
      .from('user_acquisition')
      .select('session_id, source_code, captured_lead_id')
      .eq('member_id', secondUserId)
      .single();
    expect(data).toMatchObject({
      session_id: null,
      source_code: SOURCE_CODE,
      captured_lead_id: secondLeadId,
    });
  });

  it('browser-carried attribution wins: an account that already has one is untouched', async () => {
    await service.from('user_acquisition').insert({
      member_id: browserUserId,
      session_id: null,
      experience_key: 'energy_map',
      source_code: 'ig',
      source_raw: 'ig',
      utm_source: 'ig',
      landed_at: LANDED_AT,
    });

    const result = await attachUserAcquisitionFromLead(service, {
      memberId: browserUserId,
      // The same address the phone lead used. It still must not win.
      email: LEAD_EMAIL,
      accountCreatedAt: '2026-09-01T12:00:00.000Z',
    });
    expect(result.attached).toBe(false);

    const { data } = await service
      .from('user_acquisition')
      .select('source_code')
      .eq('member_id', browserUserId)
      .single();
    expect((data as { source_code: string }).source_code).toBe('ig');
  });

  it('the database refuses to revise an origin even when asked directly', async () => {
    const { error } = await service
      .from('user_acquisition')
      .update({ source_code: 'fb' })
      .eq('member_id', laptopUserId);
    expect(error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------
// What the report reads
// ---------------------------------------------------------------------

describe('the funnel view resolves a cross device account', () => {
  it('shows the arrival as having become an account with no browser bind at all', async () => {
    const { data } = await service
      .from('public_entry_funnel')
      .select('member_id, did_create_account, source_code')
      .eq('session_id', phoneSessionId)
      .single();
    expect(data).toMatchObject({
      member_id: laptopUserId,
      did_create_account: true,
      source_code: SOURCE_CODE,
    });
  });
});

describe('the report rows, read by an administrator under her own policies', () => {
  it('carries the six stages of one real arrival', async () => {
    const admin = await signInAs(TEST_USERS.adminOne);
    const read = await readAcquisitionRows(admin, {
      start: '2026-08-31',
      end: '2026-08-31',
      includeTest: false,
    });
    expect(read.error).toBeNull();

    const arrival = read.rows.find((row) => row.sessionId === phoneSessionId);
    expect(arrival).toBeTruthy();
    expect(arrival).toMatchObject({
      rowKind: 'visit',
      sourceCode: SOURCE_CODE,
      utmCampaign: 'xdev_run',
      utmContent: 'card_x',
      geoCity: 'Milton Keynes',
      locationName: 'Test Counter',
      memberId: laptopUserId,
      isTest: false,
    });
    expect(arrival?.startedAt).not.toBeNull();
    expect(arrival?.completedAt).not.toBeNull();
    expect(arrival?.leadCapturedAt).not.toBeNull();
  });

  it('a bare arrival with no code at all lands in the untracked row', async () => {
    const admin = await signInAs(TEST_USERS.adminOne);
    const read = await readAcquisitionRows(admin, {
      start: '2026-08-31',
      end: '2026-08-31',
      includeTest: false,
    });
    const rows = rollUp(read.rows, 'source');
    const untracked = rows.find((row) => row.key === UNTRACKED_KEY);
    expect(untracked).toBeTruthy();
    expect(untracked?.visits).toBeGreaterThanOrEqual(1);

    const bare = read.rows.find((row) => row.sessionId === bareSessionId);
    expect(bare).toBeTruthy();
    expect(bare?.sourceCode).toBeNull();
    expect(bare?.utmSource).toBeNull();
  });

  it('the partner row counts the whole journey and the totals agree with it', async () => {
    const admin = await signInAs(TEST_USERS.adminOne);
    const read = await readAcquisitionRows(admin, {
      start: '2026-08-31',
      end: '2026-08-31',
      includeTest: false,
    });
    const rows = rollUp(read.rows, 'source');
    const partner = rows.find((row) => row.key === SOURCE_CODE);
    // ONE arrival, and TWO accounts credited to this partner. The second
    // account matched the same lead conversation on a different address and
    // could not claim the arrival, so it is credited where it belongs and
    // still adds nothing to the first four columns. That is exactly the
    // rule the account leg exists to keep: a funnel is never inflated by a
    // visit that no longer has a row.
    expect(partner).toMatchObject({
      visits: 1,
      starts: 1,
      completions: 1,
      leads: 1,
      accounts: 2,
    });

    const totals = totalsOf(rows);
    expect(totals.visits).toBe(rows.reduce((sum, row) => sum + row.visits, 0));
  });

  it('shows no answer and no result pattern anywhere in a row', async () => {
    const admin = await signInAs(TEST_USERS.adminOne);
    const read = await readAcquisitionRows(admin, {
      start: '2026-08-31',
      end: '2026-08-31',
      includeTest: false,
    });
    const serialized = JSON.stringify(read.rows);
    expect(serialized).not.toContain('wind_down_deficit');
    expect(serialized).not.toContain('pattern');
    expect(serialized).not.toContain('@example.test');
  });

  it('paid conversion follows a real tier change to a paid plan', async () => {
    const before = await service
      .from('member_paid_conversion')
      .select('paid_at')
      .eq('member_id', laptopUserId)
      .maybeSingle();
    expect(before.data).toBeNull();

    const { error } = await service
      .from('member_subscriptions')
      .update({ tier: 'monthly', source: 'billing', status: 'active' })
      .eq('member_id', laptopUserId);
    expect(error).toBeNull();

    const after = await service
      .from('member_paid_conversion')
      .select('paid_at')
      .eq('member_id', laptopUserId)
      .maybeSingle();
    expect(after.data).not.toBeNull();

    const admin = await signInAs(TEST_USERS.adminOne);
    const read = await readAcquisitionRows(admin, {
      start: '2026-08-31',
      end: '2026-08-31',
      includeTest: false,
    });
    const partner = rollUp(read.rows, 'source').find((row) => row.key === SOURCE_CODE);
    expect(partner?.paid).toBe(1);
  });
});
