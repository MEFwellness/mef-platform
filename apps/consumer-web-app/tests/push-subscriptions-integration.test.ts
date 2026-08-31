/**
 * member_push_subscriptions and the claim function (migration 195),
 * against real local Supabase with real RLS, as the member herself.
 *
 * A write that matches no policy returns zero rows and no error, so every
 * write below is read back rather than trusted, and the isolation cases
 * are asserted from a second member's own session rather than reasoned
 * about.
 *
 * The rule that most needs a real database to prove is the one about a
 * shared phone: a push subscription belongs to a browser, not to a person,
 * so two members who sign in on the same device produce the SAME endpoint.
 * Without the claim function retiring the previous owner, the first
 * member's reminders would keep arriving on a phone the second member is
 * now holding. That retirement is a write to ANOTHER member's row, which
 * no policy a member holds could ever make, and it is checked here from
 * both sides.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import {
  countLiveDevicesByMember,
  getMemberPushState,
  listLivePushDevices,
  recordPushPromptShown,
  revokeAllPushSubscriptions,
  savePushSubscription,
  setPushNotificationsEnabled,
} from '../lib/push/data';

const SHARED_ENDPOINT = 'https://push.test/shared-family-phone';
const OWN_ENDPOINT = 'https://push.test/her-own-phone';

function subscription(endpoint: string) {
  return { endpoint, keys: { p256dh: 'BK-fake-p256dh-key', auth: 'fake-auth-secret' } };
}

const admin = serviceRoleClient();

async function resetFixtures() {
  await admin
    .from('member_push_subscriptions')
    .delete()
    .in('member_id', [TEST_USERS.memberOne.id, TEST_USERS.memberTwo.id]);
  await admin
    .from('profiles')
    .update({
      push_notifications_enabled: false,
      push_prompt_shown_at: null,
      push_prompt_answer: null,
    })
    .in('id', [TEST_USERS.memberOne.id, TEST_USERS.memberTwo.id]);
}

let one: SupabaseClient;
let two: SupabaseClient;

beforeEach(async () => {
  await resetFixtures();
  one = await signInAs(TEST_USERS.memberOne);
  two = await signInAs(TEST_USERS.memberTwo);
});

afterAll(async () => {
  await resetFixtures();
});

describe('saving a device', () => {
  it('stores it, reads back as hers, and turns her one preference on', async () => {
    const before = await getMemberPushState(one, TEST_USERS.memberOne.id);
    expect(before.enabled).toBe(false);
    expect(before.liveDeviceCount).toBe(0);

    const saved = await savePushSubscription(one, subscription(OWN_ENDPOINT), 'iPhone, Safari');
    expect('error' in saved).toBe(false);

    const devices = await listLivePushDevices(one, TEST_USERS.memberOne.id);
    expect(devices).toHaveLength(1);
    expect(devices[0]!.endpoint).toBe(OWN_ENDPOINT);
    expect(devices[0]!.deviceLabel).toBe('iPhone, Safari');
    expect(devices[0]!.subscription.keys.auth).toBe('fake-auth-secret');

    const after = await getMemberPushState(one, TEST_USERS.memberOne.id);
    expect(after.enabled).toBe(true);
    expect(after.liveDeviceCount).toBe(1);
  });

  it('re-saving the same device updates it rather than growing a second row', async () => {
    await savePushSubscription(one, subscription(OWN_ENDPOINT), 'iPhone, Safari');
    await savePushSubscription(one, subscription(OWN_ENDPOINT), 'iPhone, Chrome');

    const { data } = await admin
      .from('member_push_subscriptions')
      .select('id, device_label, revoked_at')
      .eq('member_id', TEST_USERS.memberOne.id);

    expect(data).toHaveLength(1);
    expect(data![0]!.device_label).toBe('iPhone, Chrome');
    expect(data![0]!.revoked_at).toBeNull();
  });

  it('refuses a subscription whose endpoint disagrees with itself', async () => {
    const result = await savePushSubscription(
      one,
      { endpoint: OWN_ENDPOINT, keys: subscription('https://push.test/other').keys } as never,
      'Mismatched'
    );
    // The endpoint column and the stored JSON must agree, or the column
    // stops being a reliable key for the JSON beside it. Same endpoint in
    // both here, so this one is accepted; the disagreeing case is below.
    expect('error' in result).toBe(false);

    const { data, error } = await one.rpc('claim_member_push_subscription', {
      p_endpoint: 'https://push.test/one',
      p_subscription: subscription('https://push.test/two'),
      p_device_label: 'Mismatched',
    });
    expect(data).toBeNull();
    expect(error?.message ?? '').toContain('must agree');
  });
});

describe('two members, one phone', () => {
  it('retires the first member the moment the second claims the same device', async () => {
    await savePushSubscription(one, subscription(SHARED_ENDPOINT), 'Family iPad');
    expect(await listLivePushDevices(one, TEST_USERS.memberOne.id)).toHaveLength(1);

    await savePushSubscription(two, subscription(SHARED_ENDPOINT), 'Family iPad');

    // Member two now owns the device.
    expect(await listLivePushDevices(two, TEST_USERS.memberTwo.id)).toHaveLength(1);
    // Member one no longer does, so nothing of hers can reach that phone.
    expect(await listLivePushDevices(one, TEST_USERS.memberOne.id)).toHaveLength(0);

    // Her row is kept and revoked, not deleted, so the record survives.
    const { data } = await admin
      .from('member_push_subscriptions')
      .select('member_id, revoked_at')
      .eq('endpoint', SHARED_ENDPOINT);
    expect(data).toHaveLength(2);
    const hers = data!.find((row) => row.member_id === TEST_USERS.memberOne.id)!;
    expect(hers.revoked_at).not.toBeNull();
  });

  it('is the database that enforces one live owner, not only the function', async () => {
    await savePushSubscription(one, subscription(SHARED_ENDPOINT), 'Family iPad');
    await savePushSubscription(two, subscription(SHARED_ENDPOINT), 'Family iPad');

    // Un-revoking member one's row by hand would put two live rows on one
    // endpoint. The partial unique index refuses it, so no bug in any
    // application code can produce that state.
    const { error } = await admin
      .from('member_push_subscriptions')
      .update({ revoked_at: null })
      .eq('endpoint', SHARED_ENDPOINT)
      .eq('member_id', TEST_USERS.memberOne.id);

    expect(error).not.toBeNull();
    expect(error!.message.toLowerCase()).toContain('duplicate key');
  });
});

describe('RLS keeps one member out of another member’s devices', () => {
  it('a second member cannot read them', async () => {
    await savePushSubscription(one, subscription(OWN_ENDPOINT), 'iPhone, Safari');

    const { data } = await two
      .from('member_push_subscriptions')
      .select('id')
      .eq('member_id', TEST_USERS.memberOne.id);

    expect(data).toEqual([]);
  });

  it('a second member cannot insert one on her behalf', async () => {
    const { error } = await two.from('member_push_subscriptions').insert({
      member_id: TEST_USERS.memberOne.id,
      endpoint: 'https://push.test/planted',
      subscription: subscription('https://push.test/planted'),
      device_label: 'Planted',
    });
    expect(error).not.toBeNull();

    const { data } = await admin
      .from('member_push_subscriptions')
      .select('id')
      .eq('endpoint', 'https://push.test/planted');
    expect(data).toEqual([]);
  });

  it('a second member cannot revoke hers', async () => {
    await savePushSubscription(one, subscription(OWN_ENDPOINT), 'iPhone, Safari');

    await two
      .from('member_push_subscriptions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('member_id', TEST_USERS.memberOne.id);

    expect(await listLivePushDevices(one, TEST_USERS.memberOne.id)).toHaveLength(1);
  });
});

describe('turning reminders off', () => {
  it('revokes every device as well as setting the preference', async () => {
    await savePushSubscription(one, subscription(OWN_ENDPOINT), 'iPhone, Safari');
    await savePushSubscription(one, subscription('https://push.test/laptop'), 'Mac, Chrome');
    expect((await getMemberPushState(one, TEST_USERS.memberOne.id)).liveDeviceCount).toBe(2);

    expect(await revokeAllPushSubscriptions(one, TEST_USERS.memberOne.id)).toBe(true);
    expect(await setPushNotificationsEnabled(one, TEST_USERS.memberOne.id, false)).toBe(true);

    const state = await getMemberPushState(one, TEST_USERS.memberOne.id);
    expect(state.enabled).toBe(false);
    expect(state.liveDeviceCount).toBe(0);
    expect(await listLivePushDevices(one, TEST_USERS.memberOne.id)).toEqual([]);

    // The rows are still there, revoked, so what she once enabled survives.
    const { data } = await admin
      .from('member_push_subscriptions')
      .select('revoked_at')
      .eq('member_id', TEST_USERS.memberOne.id);
    expect(data).toHaveLength(2);
    expect(data!.every((row) => row.revoked_at !== null)).toBe(true);
  });
});

describe('the one-time ask is recorded exactly once', () => {
  it('records the first showing and refuses to move it afterwards', async () => {
    expect(await recordPushPromptShown(one, TEST_USERS.memberOne.id, 'declined')).toBe(true);

    const first = await getMemberPushState(one, TEST_USERS.memberOne.id);
    expect(first.promptShownAt).not.toBeNull();
    expect(first.promptAnswer).toBe('declined');

    await recordPushPromptShown(one, TEST_USERS.memberOne.id, 'enabled');

    const second = await getMemberPushState(one, TEST_USERS.memberOne.id);
    expect(second.promptShownAt).toBe(first.promptShownAt);
    expect(second.promptAnswer).toBe('declined');
  });

  it('refuses an answer the column does not allow', async () => {
    const { error } = await one
      .from('profiles')
      .update({ push_prompt_answer: 'maybe' })
      .eq('id', TEST_USERS.memberOne.id);
    expect(error).not.toBeNull();
  });
});

describe('the admin listing', () => {
  it('counts only live devices, per member', async () => {
    await savePushSubscription(one, subscription(OWN_ENDPOINT), 'iPhone, Safari');
    await savePushSubscription(one, subscription('https://push.test/laptop'), 'Mac, Chrome');
    await savePushSubscription(two, subscription('https://push.test/two-phone'), 'Android, Chrome');

    const adminSession = await signInAs(TEST_USERS.adminOne);
    const counts = await countLiveDevicesByMember(adminSession);

    expect(counts.get(TEST_USERS.memberOne.id)).toBe(2);
    expect(counts.get(TEST_USERS.memberTwo.id)).toBe(1);

    await revokeAllPushSubscriptions(one, TEST_USERS.memberOne.id);
    const after = await countLiveDevicesByMember(adminSession);
    expect(after.get(TEST_USERS.memberOne.id)).toBeUndefined();
    expect(after.get(TEST_USERS.memberTwo.id)).toBe(1);
  });

  it('an ordinary member sees nobody but herself in that count', async () => {
    await savePushSubscription(one, subscription(OWN_ENDPOINT), 'iPhone, Safari');
    await savePushSubscription(two, subscription('https://push.test/two-phone'), 'Android, Chrome');

    const counts = await countLiveDevicesByMember(one);
    expect([...counts.keys()]).toEqual([TEST_USERS.memberOne.id]);
  });
});
