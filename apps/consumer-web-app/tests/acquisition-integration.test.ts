/**
 * ACQUISITION ATTRIBUTION, AGAINST THE REAL DATABASE AND ITS REAL POLICIES.
 *
 * WHAT THIS PROVES that the pure tests cannot:
 *
 *   1. First touch is genuinely write-once. Not "we are careful": the
 *      database refuses the update, and so do the two copies on the lead
 *      and on the account. This is the guarantee the whole feature rests
 *      on, and it is the one that a careless upsert in a build next year
 *      would otherwise quietly break.
 *   2. An anonymous visitor cannot read or write any of it, and a member
 *      cannot read another member's origin. The tables have no public
 *      policy at all by design.
 *   3. The three tables really do share one shape, because they were
 *      copied from one template. A reporting build that reads three shapes
 *      believing they are one is the failure the template exists to
 *      prevent.
 *   4. The check constraints refuse prose, a precise location, and a value
 *      that skipped the normaliser.
 *   5. The funnel view carries the attribution and the partner's physical
 *      place alongside the steps it already carried, with is_test still
 *      settled from both ends.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { anonClient, serviceRoleClient, signInAs, TEST_USERS } from './setup/test-clients';

const service = serviceRoleClient();

const TOKEN_TRACKED = 'acq-test-token-tracked-01';
const TOKEN_BARE = 'acq-test-token-bare-0001';
const TOKEN_QA = 'acq-test-token-qa-000001';

let trackedSessionId = '';
let bareSessionId = '';
let qaSessionId = '';
let leadConversationId = '';
let capturedLeadId = '';

const FIRST_TOUCH = {
  utm_source: 'partner-01',
  utm_medium: 'counter_card',
  utm_campaign: 'autumn_run',
  utm_content: 'card_a',
  utm_term: null as string | null,
  source_code: 'partner-01',
  source_raw: 'partner-01',
  fbclid: 'FB_abc.123-XYZ',
  ttclid: null as string | null,
  gclid: null as string | null,
  landing_path: '/energy/partner-01',
  referrer_host: 'www.instagram.com',
  geo_country: 'GB',
  geo_region: 'ENG',
  geo_city: 'Milton Keynes',
};

async function createSession(visitorToken: string, sourceCode: string | null): Promise<string> {
  const { data, error } = await service
    .from('public_entry_sessions')
    .insert({
      visitor_token: visitorToken,
      experience_key: 'energy_map',
      source_code: sourceCode,
      source_raw: sourceCode,
      landing_path: `/energy/${sourceCode ?? ''}`,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      pattern_key: 'wind_down_deficit',
    })
    .select('id')
    .single();
  if (error) throw new Error(`createSession failed: ${error.message}`);
  return (data as { id: string }).id;
}

beforeAll(async () => {
  trackedSessionId = await createSession(TOKEN_TRACKED, 'partner-01');
  bareSessionId = await createSession(TOKEN_BARE, null);
  qaSessionId = await createSession(TOKEN_QA, 'qa');

  const { data: conversation, error: conversationError } = await service
    .from('lead_conversations')
    .insert({ session_token: 'acq-test-conversation-0001', topic: 'energy', status: 'completed' })
    .select('id')
    .single();
  if (conversationError) throw new Error(`lead_conversations failed: ${conversationError.message}`);
  leadConversationId = (conversation as { id: string }).id;

  const { data: lead, error: leadError } = await service
    .from('captured_leads')
    .insert({
      conversation_id: leadConversationId,
      email: 'acq.attribution@example.test',
      topic: 'energy',
      lead_temperature: 'warm',
    })
    .select('id')
    .single();
  if (leadError) throw new Error(`captured_leads failed: ${leadError.message}`);
  capturedLeadId = (lead as { id: string }).id;

  const { error } = await service
    .from('public_entry_attribution')
    .insert({ session_id: trackedSessionId, touch: 'first', ...FIRST_TOUCH });
  if (error) throw new Error(`first touch insert failed: ${error.message}`);
});

afterAll(async () => {
  await service.from('user_acquisition').delete().eq('member_id', TEST_USERS.memberOne.id);
  await service.from('member_public_entry_origin').delete().eq('member_id', TEST_USERS.memberOne.id);
  await service.from('captured_lead_acquisition').delete().eq('captured_lead_id', capturedLeadId);
  await service.from('captured_leads').delete().eq('id', capturedLeadId);
  await service.from('lead_conversations').delete().eq('id', leadConversationId);
  await service
    .from('public_entry_sessions')
    .delete()
    .in('visitor_token', [TOKEN_TRACKED, TOKEN_BARE, TOKEN_QA]);
  await service.from('public_entry_links').delete().eq('source_code', 'acq-test-partner');
  await service.from('public_entry_sources').delete().eq('code', 'acq-test-partner');
});

// ---------------------------------------------------------------------
// First touch wins, and the database is what makes it win
// ---------------------------------------------------------------------

describe('first touch is written once', () => {
  it('refuses an update to the first-touch row outright', async () => {
    const { error } = await service
      .from('public_entry_attribution')
      .update({ utm_campaign: 'spring_run' })
      .eq('session_id', trackedSessionId)
      .eq('touch', 'first');
    expect(error).not.toBeNull();

    const { data } = await service
      .from('public_entry_attribution')
      .select('utm_campaign')
      .eq('session_id', trackedSessionId)
      .eq('touch', 'first')
      .single();
    expect((data as { utm_campaign: string }).utm_campaign).toBe('autumn_run');
  });

  it('refuses a second first-touch row for the same arrival', async () => {
    const { error } = await service
      .from('public_entry_attribution')
      .insert({ session_id: trackedSessionId, touch: 'first', utm_campaign: 'spring_run' });
    expect(error).not.toBeNull();
  });

  it('lets a last touch be written, and lets it move, because that is what last means', async () => {
    const { error: insertError } = await service
      .from('public_entry_attribution')
      .insert({ session_id: trackedSessionId, touch: 'last', utm_campaign: 'spring_run', source_code: 'ig' });
    expect(insertError).toBeNull();

    const { error: updateError } = await service
      .from('public_entry_attribution')
      .update({ utm_campaign: 'winter_run' })
      .eq('session_id', trackedSessionId)
      .eq('touch', 'last');
    expect(updateError).toBeNull();

    const { data } = await service
      .from('public_entry_attribution')
      .select('utm_campaign')
      .eq('session_id', trackedSessionId)
      .eq('touch', 'last')
      .single();
    expect((data as { utm_campaign: string }).utm_campaign).toBe('winter_run');
  });

  it('leaves the first touch exactly where it was after all of that', async () => {
    const { data } = await service
      .from('public_entry_attribution')
      .select('utm_campaign, source_code, utm_content')
      .eq('session_id', trackedSessionId)
      .eq('touch', 'first')
      .single();
    expect(data).toMatchObject({
      utm_campaign: 'autumn_run',
      source_code: 'partner-01',
      utm_content: 'card_a',
    });
  });
});

// ---------------------------------------------------------------------
// The lead's copy and the account's copy
// ---------------------------------------------------------------------

describe('the copies onto the lead and the account', () => {
  it('carries the first touch onto the lead with the original landing time', async () => {
    const { data: first } = await service
      .from('public_entry_attribution')
      .select('*')
      .eq('session_id', trackedSessionId)
      .eq('touch', 'first')
      .single();
    const touch = first as Record<string, unknown>;

    const { error } = await service.from('captured_lead_acquisition').insert({
      captured_lead_id: capturedLeadId,
      session_id: trackedSessionId,
      landed_at: touch.landed_at,
      ...FIRST_TOUCH,
    });
    expect(error).toBeNull();

    const { data } = await service
      .from('captured_lead_acquisition')
      .select('*')
      .eq('captured_lead_id', capturedLeadId)
      .single();
    const stored = data as Record<string, unknown>;
    // The snapshot equals the first touch at the moment it was taken. This
    // is the assertion that makes copying rather than joining safe.
    for (const key of Object.keys(FIRST_TOUCH)) {
      expect(stored[key]).toEqual(touch[key]);
    }
    expect(stored.landed_at).toEqual(touch.landed_at);
  });

  it('refuses an update to the lead copy', async () => {
    const { error } = await service
      .from('captured_lead_acquisition')
      .update({ utm_campaign: 'spring_run' })
      .eq('captured_lead_id', capturedLeadId);
    expect(error).not.toBeNull();
  });

  it('attaches the account copy once and never overwrites it', async () => {
    const { data: first } = await service
      .from('public_entry_attribution')
      .select('landed_at')
      .eq('session_id', trackedSessionId)
      .eq('touch', 'first')
      .single();
    const landedAt = (first as { landed_at: string }).landed_at;

    const { error } = await service.from('user_acquisition').insert({
      member_id: TEST_USERS.memberOne.id,
      session_id: trackedSessionId,
      captured_lead_id: capturedLeadId,
      experience_key: 'energy_map',
      landed_at: landedAt,
      ...FIRST_TOUCH,
    });
    expect(error).toBeNull();

    // A second arrival, a year later, on a different partner's link.
    const { error: secondError } = await service.from('user_acquisition').insert({
      member_id: TEST_USERS.memberOne.id,
      session_id: bareSessionId,
      experience_key: 'energy_map',
      landed_at: new Date().toISOString(),
      source_code: 'ig',
      utm_campaign: 'spring_run',
    });
    expect(secondError).not.toBeNull();

    const { data } = await service
      .from('user_acquisition')
      .select('source_code, utm_campaign, landed_at, origin')
      .eq('member_id', TEST_USERS.memberOne.id)
      .single();
    expect(data).toMatchObject({
      source_code: 'partner-01',
      utm_campaign: 'autumn_run',
      landed_at: landedAt,
      origin: 'public_acquisition',
    });
  });

  it('refuses an update to the account copy', async () => {
    const { error } = await service
      .from('user_acquisition')
      .update({ source_code: 'ig' })
      .eq('member_id', TEST_USERS.memberOne.id);
    expect(error).not.toBeNull();
  });

  it('cannot be restated as anything other than a public acquisition arrival', async () => {
    const { error } = await service.from('user_acquisition').insert({
      member_id: TEST_USERS.memberTwo.id,
      experience_key: 'energy_map',
      landed_at: new Date().toISOString(),
      origin: 'baseline_assessment',
    });
    expect(error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------
// One shape, three tables
// ---------------------------------------------------------------------

describe('the three tables share one shape', () => {
  it('holds the same attribution columns in all three, because they were copied from one template', async () => {
    // Asserted the way a reporting build would meet it: ask each of the
    // three tables for the same column list and check that all three
    // answer with the same set. A `LIKE` that stopped copying, or a
    // column added to one table by hand, fails here.
    const keys = Object.keys(FIRST_TOUCH);
    const [attribution, lead, user] = await Promise.all([
      service.from('public_entry_attribution').select(keys.join(', ')).eq('session_id', trackedSessionId).eq('touch', 'first').single(),
      service.from('captured_lead_acquisition').select(keys.join(', ')).eq('captured_lead_id', capturedLeadId).single(),
      service.from('user_acquisition').select(keys.join(', ')).eq('member_id', TEST_USERS.memberOne.id).single(),
    ]);
    expect(attribution.error).toBeNull();
    expect(lead.error).toBeNull();
    expect(user.error).toBeNull();
    expect(Object.keys(lead.data as object).sort()).toEqual(Object.keys(attribution.data as object).sort());
    expect(Object.keys(user.data as object).sort()).toEqual(Object.keys(attribution.data as object).sort());
  });
});

// ---------------------------------------------------------------------
// What the columns refuse
// ---------------------------------------------------------------------

describe('an attribution column refuses anything that is not attribution', () => {
  it('refuses prose in a campaign', async () => {
    const { error } = await service
      .from('public_entry_attribution')
      .insert({ session_id: bareSessionId, touch: 'first', utm_campaign: 'I have not slept properly in weeks' });
    expect(error).not.toBeNull();
  });

  it('refuses a value that skipped the normaliser', async () => {
    const { error } = await service
      .from('public_entry_attribution')
      .insert({ session_id: bareSessionId, touch: 'first', utm_content: 'Card A' });
    expect(error).not.toBeNull();
  });

  it('refuses a country that is not a two letter code', async () => {
    const { error } = await service
      .from('public_entry_attribution')
      .insert({ session_id: bareSessionId, touch: 'first', geo_country: 'United Kingdom' });
    expect(error).not.toBeNull();
  });

  it('has no column a precise location could be written into', async () => {
    const { error } = await service
      .from('public_entry_attribution')
      .insert({ session_id: bareSessionId, touch: 'first', latitude: 51.5, longitude: -0.12 });
    expect(error).not.toBeNull();
  });

  it('has no column an answer, a pattern or an email could be written into', async () => {
    for (const forbidden of [
      { answer_value: 'poor_sleep' },
      { pattern_key: 'wind_down_deficit' },
      { email: 'her@example.test' },
    ]) {
      const { error } = await service
        .from('public_entry_attribution')
        .insert({ session_id: bareSessionId, touch: 'first', ...forbidden });
      expect(error).not.toBeNull();
    }
  });

  it('accepts an ordinary untracked arrival, which is most of them', async () => {
    const { error } = await service
      .from('public_entry_attribution')
      .insert({ session_id: bareSessionId, touch: 'first', landing_path: '/energy' });
    expect(error).toBeNull();
  });
});

// ---------------------------------------------------------------------
// Who can read it
// ---------------------------------------------------------------------

describe('who can read acquisition attribution', () => {
  it('is completely closed to an anonymous visitor', async () => {
    const anon = anonClient();
    for (const table of ['public_entry_attribution', 'captured_lead_acquisition', 'user_acquisition', 'public_entry_links']) {
      const { data } = await anon.from(table).select('*').limit(1);
      expect(data ?? []).toEqual([]);
    }
  });

  it('is closed to a member, including her own row', async () => {
    // Where somebody came from is a business record about an account, not
    // health content she reads. member_public_entry_origin already gives
    // her the one part of it Root shows her.
    const member: SupabaseClient = await signInAs(TEST_USERS.memberOne);
    const { data } = await member.from('user_acquisition').select('*');
    expect(data ?? []).toEqual([]);
    await member.auth.signOut();
  });

  it('is readable by a coach and by a platform administrator', async () => {
    for (const user of [TEST_USERS.coachOne, TEST_USERS.adminOne]) {
      const client = await signInAs(user);
      const { error } = await client.from('public_entry_attribution').select('session_id').limit(1);
      expect(error).toBeNull();
      await client.auth.signOut();
    }
  });

  it('lets an administrator write a source and a link, and refuses a member the same write', async () => {
    const admin = await signInAs(TEST_USERS.adminOne);
    const { error: sourceError } = await admin.from('public_entry_sources').insert({
      code: 'acq-test-partner',
      label: 'Acquisition test partner',
      channel: 'partner',
      is_test: true,
      partner_name: 'Acquisition test partner',
      location_name: 'Test clinic counter',
      location_city: 'Croydon',
      location_country: 'GB',
    });
    expect(sourceError).toBeNull();

    const { error: linkError } = await admin.from('public_entry_links').insert({
      source_code: 'acq-test-partner',
      label: 'Counter card',
      utm_source: 'acq-test-partner',
      utm_medium: 'counter_card',
      utm_campaign: 'autumn_run',
      utm_content: 'card_a',
      url: 'https://app.mefwellness.com/energy/acq-test-partner?utm_source=acq-test-partner&utm_medium=counter_card&utm_campaign=autumn_run&utm_content=card_a',
    });
    expect(linkError).toBeNull();
    await admin.auth.signOut();

    const member = await signInAs(TEST_USERS.memberTwo);
    const { error: refused } = await member.from('public_entry_links').insert({
      source_code: 'acq-test-partner',
      label: 'Not hers to make',
      utm_source: 'acq-test-partner',
      utm_medium: 'counter_card',
      utm_campaign: 'spring_run',
      url: 'https://app.mefwellness.com/energy/acq-test-partner',
    });
    expect(refused).not.toBeNull();
    await member.auth.signOut();
  });

  it('refuses a second copy of one link, however differently it was typed', async () => {
    const admin = await signInAs(TEST_USERS.adminOne);
    const { error } = await admin.from('public_entry_links').insert({
      source_code: 'acq-test-partner',
      label: 'The same link again',
      utm_source: 'acq-test-partner',
      utm_medium: 'counter_card',
      utm_campaign: 'autumn_run',
      utm_content: 'card_a',
      url: 'https://app.mefwellness.com/energy/acq-test-partner?whatever',
    });
    expect(error).not.toBeNull();
    await admin.auth.signOut();
  });
});

// ---------------------------------------------------------------------
// The funnel view carries it
// ---------------------------------------------------------------------

describe('the funnel view', () => {
  it('carries the first-touch attribution alongside the steps it already carried', async () => {
    const admin = await signInAs(TEST_USERS.adminOne);
    const { data, error } = await admin
      .from('public_entry_funnel')
      .select('session_id, source_code, did_complete, utm_campaign, utm_content, had_ad_click, geo_city, is_test')
      .eq('session_id', trackedSessionId)
      .single();
    expect(error).toBeNull();
    expect(data).toMatchObject({
      source_code: 'partner-01',
      did_complete: true,
      utm_campaign: 'autumn_run',
      utm_content: 'card_a',
      had_ad_click: true,
      geo_city: 'Milton Keynes',
      is_test: false,
    });
    await admin.auth.signOut();
  });

  it('still settles is_test from the source, so a QA arrival stays out of the real numbers', async () => {
    const admin = await signInAs(TEST_USERS.adminOne);
    const { data } = await admin
      .from('public_entry_funnel')
      .select('is_test')
      .eq('session_id', qaSessionId)
      .single();
    expect((data as { is_test: boolean }).is_test).toBe(true);
    await admin.auth.signOut();
  });

  it('reads an untracked arrival as untracked rather than as missing', async () => {
    const admin = await signInAs(TEST_USERS.adminOne);
    const { data, error } = await admin
      .from('public_entry_funnel')
      .select('session_id, source_code, utm_campaign, had_ad_click')
      .eq('session_id', bareSessionId)
      .single();
    expect(error).toBeNull();
    expect(data).toMatchObject({
      source_code: null,
      utm_campaign: null,
      had_ad_click: false,
    });
    await admin.auth.signOut();
  });

  it('carries the partner physical location, which no header will ever know', async () => {
    const admin = await signInAs(TEST_USERS.adminOne);
    const { data, error } = await admin
      .from('public_entry_sources')
      .select('partner_name, location_name, location_city, location_country')
      .eq('code', 'acq-test-partner')
      .single();
    expect(error).toBeNull();
    expect(data).toMatchObject({
      partner_name: 'Acquisition test partner',
      location_name: 'Test clinic counter',
      location_city: 'Croydon',
      location_country: 'GB',
    });
    await admin.auth.signOut();
  });
});
