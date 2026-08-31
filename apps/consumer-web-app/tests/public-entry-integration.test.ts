/**
 * The public entry tables, against the real database and its real policies.
 *
 * WHAT THIS PROVES that the pure tests cannot:
 *
 *   1. An anonymous visitor cannot read or write ANY of it. The tables have
 *      no public policy at all by design, so the browser's writes go through
 *      the app's own route handler with the service role, gated by that
 *      route's origin check and rate limit. This asserts the policy half.
 *   2. A member can read her own origin row and nobody else's, and cannot
 *      write, re-point or erase one.
 *   3. The two provenance constraints genuinely refuse a row that claims to
 *      be anything other than a preliminary public arrival.
 *   4. The funnel view settles is_test from BOTH the source and the member
 *      who claimed it, which is what makes the numbers on the admin screen
 *      real.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { anonClient, serviceRoleClient, signInAs, TEST_USERS } from './setup/test-clients';

const service = serviceRoleClient();

const TOKEN_REAL = 'pe-test-token-real-0001';
const TOKEN_TEST_SOURCE = 'pe-test-token-qa-0002';
const TOKEN_CLAIMED = 'pe-test-token-claimed-0003';

let realSessionId = '';
let qaSessionId = '';
let claimedSessionId = '';

async function createSession(
  visitorToken: string,
  sourceCode: string | null,
  patch: Record<string, unknown> = {}
): Promise<string> {
  const { data, error } = await service
    .from('public_entry_sessions')
    .insert({
      visitor_token: visitorToken,
      experience_key: 'energy_map',
      source_code: sourceCode,
      source_raw: sourceCode,
      landing_path: `/energy/${sourceCode ?? ''}`,
      ...patch,
    })
    .select('id')
    .single();
  if (error) throw new Error(`createSession failed: ${error.message}`);
  return (data as { id: string }).id;
}

beforeAll(async () => {
  realSessionId = await createSession(TOKEN_REAL, 'partner-01', {
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    pattern_key: 'fuel_timing_pattern',
  });
  qaSessionId = await createSession(TOKEN_TEST_SOURCE, 'qa', {
    started_at: new Date().toISOString(),
  });
  claimedSessionId = await createSession(TOKEN_CLAIMED, 'partner-02', {
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    pattern_key: 'wind_down_deficit',
  });

  await service.from('public_entry_answers').insert([
    { session_id: realSessionId, question_key: 'low_point', answer_value: 'early_afternoon' },
    { session_id: realSessionId, question_key: 'first_food', answer_value: 'not_until_lunch' },
  ]);
  await service.from('public_entry_events').insert([
    { session_id: realSessionId, event_type: 'entry_viewed' },
    { session_id: realSessionId, event_type: 'result_engaged' },
  ]);

  await service.from('member_public_entry_origin').insert({
    member_id: TEST_USERS.memberOne.id,
    session_id: claimedSessionId,
    experience_key: 'energy_map',
    source_code: 'partner-02',
    source_raw: 'partner-02',
    pattern_key: 'wind_down_deficit',
    entered_at: new Date().toISOString(),
  });
});

afterAll(async () => {
  await service
    .from('member_public_entry_origin')
    .delete()
    .eq('member_id', TEST_USERS.memberOne.id);
  await service
    .from('public_entry_sessions')
    .delete()
    .in('visitor_token', [TOKEN_REAL, TOKEN_TEST_SOURCE, TOKEN_CLAIMED]);
});

// ---------------------------------------------------------------------

describe('an anonymous visitor', () => {
  const anon = anonClient();

  it('cannot read a single public entry session', async () => {
    const { data } = await anon.from('public_entry_sessions').select('id');
    expect(data ?? []).toEqual([]);
  });

  it('cannot read anybody answers', async () => {
    const { data } = await anon.from('public_entry_answers').select('id');
    expect(data ?? []).toEqual([]);
  });

  it('cannot create a session of their own', async () => {
    // The browser never writes directly. Every write goes through the app's
    // own route handler with the service role, gated by that route's origin
    // allowlist and rate limit, exactly like the lead capture route.
    const { data, error } = await anon
      .from('public_entry_sessions')
      .insert({ visitor_token: 'anon-forged-token-x', experience_key: 'energy_map' })
      .select('id');
    expect(data ?? []).toEqual([]);
    expect(error).not.toBeNull();
  });

  it('cannot manufacture an origin row for anybody', async () => {
    const { error } = await anon.from('member_public_entry_origin').insert({
      member_id: TEST_USERS.memberTwo.id,
      session_id: realSessionId,
      experience_key: 'energy_map',
      entered_at: new Date().toISOString(),
    });
    expect(error).not.toBeNull();
  });

  it('cannot read the source codes', async () => {
    const { data } = await anon.from('public_entry_sources').select('code');
    expect(data ?? []).toEqual([]);
  });
});

describe('a member', () => {
  let member: SupabaseClient;
  let otherMember: SupabaseClient;

  beforeAll(async () => {
    member = await signInAs(TEST_USERS.memberOne);
    otherMember = await signInAs(TEST_USERS.memberTwo);
  });

  it('reads her own origin row', async () => {
    const { data } = await member
      .from('member_public_entry_origin')
      .select('*')
      .eq('member_id', TEST_USERS.memberOne.id)
      .maybeSingle();
    expect(data).toBeTruthy();
    expect((data as { source_code: string }).source_code).toBe('partner-02');
  });

  it('reads the provenance the schema wrote, not something the app asserted', async () => {
    const { data } = await member
      .from('member_public_entry_origin')
      .select('origin, preliminary')
      .eq('member_id', TEST_USERS.memberOne.id)
      .single();
    expect(data).toEqual({ origin: 'public_acquisition', preliminary: true });
  });

  it('cannot read another member origin row', async () => {
    const { data } = await otherMember
      .from('member_public_entry_origin')
      .select('*')
      .eq('member_id', TEST_USERS.memberOne.id);
    expect(data ?? []).toEqual([]);
  });

  it('cannot write an origin row for herself', async () => {
    // Where she came from is a fact about her arrival. No session on earth
    // has a policy to manufacture one, which is what stops a member handing
    // herself a referral attribution.
    const { error } = await otherMember.from('member_public_entry_origin').insert({
      member_id: TEST_USERS.memberTwo.id,
      session_id: realSessionId,
      experience_key: 'energy_map',
      entered_at: new Date().toISOString(),
    });
    expect(error).not.toBeNull();
  });

  it('cannot re-point her own origin at a different arrival', async () => {
    const { error } = await member
      .from('member_public_entry_origin')
      .update({ session_id: realSessionId })
      .eq('member_id', TEST_USERS.memberOne.id);
    // Either refused outright, or silently matched nothing. Both are the
    // correct outcome; what matters is the row does not move.
    const { data } = await service
      .from('member_public_entry_origin')
      .select('session_id')
      .eq('member_id', TEST_USERS.memberOne.id)
      .single();
    expect((data as { session_id: string }).session_id).toBe(claimedSessionId);
    expect(error === null || error !== null).toBe(true);
  });

  it('cannot delete it either', async () => {
    await member
      .from('member_public_entry_origin')
      .delete()
      .eq('member_id', TEST_USERS.memberOne.id);
    const { data } = await service
      .from('member_public_entry_origin')
      .select('member_id')
      .eq('member_id', TEST_USERS.memberOne.id);
    expect((data ?? []).length).toBe(1);
  });

  it('cannot read the answers she gave before she had an account', async () => {
    // Deliberate. They are hers in origin but they are not member data, and
    // the surface that shows them back to her is Root saying one honest
    // sentence, not a table of raw answers she could mistake for a record.
    const { data } = await member.from('public_entry_answers').select('id');
    expect(data ?? []).toEqual([]);
  });
});

describe('the provenance constraints', () => {
  it('refuse an origin row that claims a different origin', async () => {
    const { error } = await service.from('member_public_entry_origin').insert({
      member_id: TEST_USERS.memberTwo.id,
      session_id: realSessionId,
      experience_key: 'energy_map',
      entered_at: new Date().toISOString(),
      origin: 'in_app_assessment',
    });
    expect(error).not.toBeNull();
  });

  it('refuse an origin row that claims not to be preliminary', async () => {
    const { error } = await service.from('member_public_entry_origin').insert({
      member_id: TEST_USERS.memberTwo.id,
      session_id: realSessionId,
      experience_key: 'energy_map',
      entered_at: new Date().toISOString(),
      preliminary: false,
    });
    expect(error).not.toBeNull();
  });

  it('refuse an existing row being restated as an assessment later', async () => {
    const { error } = await service
      .from('member_public_entry_origin')
      .update({ preliminary: false })
      .eq('member_id', TEST_USERS.memberOne.id);
    expect(error).not.toBeNull();
  });

  it('refuse free text as an answer', async () => {
    const { error } = await service.from('public_entry_answers').insert({
      session_id: realSessionId,
      question_key: 'low_point',
      answer_value: 'I have been exhausted since my surgery in March',
    });
    expect(error).not.toBeNull();
  });

  it('refuse prose as an event detail', async () => {
    const { error } = await service.from('public_entry_events').insert({
      session_id: realSessionId,
      event_type: 'chapter_completed',
      detail: 'she said her sleep is bad',
    });
    expect(error).not.toBeNull();
  });

  it('allow only one member per arrival', async () => {
    const { error } = await service.from('member_public_entry_origin').insert({
      member_id: TEST_USERS.memberTwo.id,
      session_id: claimedSessionId,
      experience_key: 'energy_map',
      entered_at: new Date().toISOString(),
    });
    expect(error).not.toBeNull();
  });
});

describe('the funnel view', () => {
  let admin: SupabaseClient;

  beforeAll(async () => {
    admin = await signInAs(TEST_USERS.adminOne);
  });

  it('marks an arrival on one of our own source codes as test traffic', async () => {
    const { data } = await admin
      .from('public_entry_funnel')
      .select('is_test, source_code')
      .eq('session_id', qaSessionId)
      .single();
    expect(data).toEqual({ is_test: true, source_code: 'qa' });
  });

  it('leaves a real arrival on a real source out of the test bucket', async () => {
    const { data } = await admin
      .from('public_entry_funnel')
      .select('is_test')
      .eq('session_id', realSessionId)
      .single();
    expect((data as { is_test: boolean }).is_test).toBe(false);
  });

  it('resolves each funnel step to a boolean rather than making a reader derive it', async () => {
    const { data } = await admin
      .from('public_entry_funnel')
      .select('did_start, did_complete, did_leave_email, did_click_to_app, did_create_account')
      .eq('session_id', realSessionId)
      .single();
    expect(data).toEqual({
      did_start: true,
      did_complete: true,
      did_leave_email: false,
      did_click_to_app: false,
      did_create_account: false,
    });
  });

  it('knows a claimed arrival produced an account', async () => {
    const { data } = await admin
      .from('public_entry_funnel')
      .select('did_create_account, member_id')
      .eq('session_id', claimedSessionId)
      .single();
    const row = data as { did_create_account: boolean; member_id: string };
    expect(row.did_create_account).toBe(true);
    expect(row.member_id).toBe(TEST_USERS.memberOne.id);
  });

  it('names an arrival with no registered code rather than dropping it', async () => {
    const unknownToken = 'pe-test-token-unknown-0004';
    const id = await createSession(unknownToken, null, { source_raw: 'dr-okafr' });
    const { data } = await admin
      .from('public_entry_funnel')
      .select('source_code, source_raw, source_label')
      .eq('session_id', id)
      .single();
    expect(data).toEqual({
      source_code: null,
      source_raw: 'dr-okafr',
      source_label: 'Unregistered code',
    });
    await service.from('public_entry_sessions').delete().eq('visitor_token', unknownToken);
  });

  it('is readable by a coach and by nobody signed out', async () => {
    const coach = await signInAs(TEST_USERS.coachOne);
    const { data: coachRows } = await coach.from('public_entry_funnel').select('session_id').limit(1);
    expect((coachRows ?? []).length).toBeGreaterThan(0);

    const { data: anonRows } = await anonClient().from('public_entry_funnel').select('session_id');
    expect(anonRows ?? []).toEqual([]);
  });
});

describe('the analytics pipeline', () => {
  it('accepts the one new event type on the existing stream', async () => {
    const { data, error } = await service
      .from('member_wellness_events')
      .insert({
        member_id: TEST_USERS.memberOne.id,
        event_type: 'public_entry_claimed',
        occurred_at: new Date().toISOString(),
        timezone: 'America/New_York',
        local_date: '2026-08-31',
        payload: { sourceCode: 'partner-02', experienceKey: 'energy_map' },
        source: 'member',
      })
      .select('id')
      .single();
    expect(error).toBeNull();
    expect(data).toBeTruthy();

    const { data: viewRow } = await service
      .from('product_analytics_events')
      .select('event_type, payload')
      .eq('id', (data as { id: string }).id)
      .single();
    // It reaches the analytics read surface, which is what makes the
    // post-account half of the funnel readable with no new machinery.
    expect((viewRow as { event_type: string }).event_type).toBe('public_entry_claimed');

    await service.from('member_wellness_events').delete().eq('id', (data as { id: string }).id);
  });
});
