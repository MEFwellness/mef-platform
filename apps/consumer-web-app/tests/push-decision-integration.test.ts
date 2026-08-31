/**
 * The one a day cap, against real local Supabase with real RLS.
 *
 * WHAT NEEDS A REAL DATABASE TO PROVE, and cannot be proved with a mock:
 *
 *   * The cap is the unique (member_id, local_date) index in migration
 *     196, not a check in the job. Two concurrent claims for the same day
 *     produce ONE row and exactly one winner, and the loser is told it
 *     lost rather than being handed the winner's row.
 *   * A member may read her own record of what was sent to her, and
 *     nobody else's.
 *   * A member cannot write one. There is deliberately no insert or update
 *     policy, because a session that could manufacture or erase a receipt
 *     could give itself a second notification.
 *   * The cadence history's "ignored" reading is a real join between
 *     receipts and real session_started rows, not arithmetic on a fixture.
 *
 * A write that matches no policy returns zero rows and no error, so every
 * write below is read back rather than trusted.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import {
  claimPushDelivery,
  getPushDelivery,
  listNotifiableMembers,
  loadCadenceHistory,
  loadNotifiableMember,
  recordPushDeliveryOutcome,
} from '../lib/push-decision/data';
import { resolveCadence } from '../lib/push-decision/cadence';

const admin = serviceRoleClient();
const ONE = TEST_USERS.memberOne.id;
const TWO = TEST_USERS.memberTwo.id;
const TODAY = '2026-08-31';

const FIELDS = {
  priorityRule: 'daily_reset',
  priorityKey: null,
  title: 'Your Daily Reset',
  body: 'Take two minutes for your Daily Reset.',
  url: '/checkin',
  cadence: 'daily' as const,
  source: 'scheduled' as const,
};

async function resetFixtures() {
  await admin.from('member_push_deliveries').delete().in('member_id', [ONE, TWO]);
  await admin
    .from('member_wellness_events')
    .delete()
    .in('member_id', [ONE, TWO])
    .eq('event_type', 'session_started');
  await admin.from('member_push_subscriptions').delete().in('member_id', [ONE, TWO]);
  await admin
    .from('profiles')
    .update({ push_notifications_enabled: false, push_send_hour_local: null, is_test: false })
    .in('id', [ONE, TWO]);
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

describe('the cap is the database, not the job', () => {
  it('claims today once and reports the second claim as lost', async () => {
    const first = await claimPushDelivery(admin, ONE, TODAY, FIELDS);
    expect(first.claimed).not.toBeNull();
    expect(first.claimed!.title).toBe('Your Daily Reset');

    const second = await claimPushDelivery(admin, ONE, TODAY, {
      ...FIELDS,
      title: 'Something else entirely',
    });
    expect(second.claimed).toBeNull();
    expect(second.claimed === null && second.reason).toBe('conflict');

    const stored = await getPushDelivery(admin, ONE, TODAY);
    expect(stored!.title).toBe('Your Daily Reset');
  });

  it('survives two claims fired at the same moment with exactly one winner', async () => {
    const [a, b] = await Promise.all([
      claimPushDelivery(admin, ONE, TODAY, FIELDS),
      claimPushDelivery(admin, ONE, TODAY, FIELDS),
    ]);
    const winners = [a, b].filter((row) => row.claimed !== null);
    expect(winners).toHaveLength(1);
    const losers = [a, b].filter((row) => row.claimed === null);
    // A conflict, never a refusal. The difference is what the first
    // production run of the admin tool got wrong.
    expect(losers.every((row) => row.claimed === null && row.reason === 'conflict')).toBe(true);

    const { count } = await admin
      .from('member_push_deliveries')
      .select('id', { count: 'exact', head: true })
      .eq('member_id', ONE)
      .eq('local_date', TODAY);
    expect(count).toBe(1);
  });

  it('REPORTS A REFUSED WRITE AS REFUSED, NOT AS A LOST RACE', async () => {
    // Her own session has no insert policy here, by design. The first
    // production run of the admin tool hit exactly this and reported
    // "another run claimed today at the same moment", which had never
    // happened and pointed the investigation at the wrong thing.
    const refused = await claimPushDelivery(one, ONE, TODAY, FIELDS);
    expect(refused.claimed).toBeNull();
    expect(refused.claimed === null && refused.reason).toBe('refused');

    expect(await getPushDelivery(admin, ONE, TODAY)).toBeNull();
  });

  it('is scoped to one member and one day', async () => {
    await claimPushDelivery(admin, ONE, TODAY, FIELDS);
    expect((await claimPushDelivery(admin, TWO, TODAY, FIELDS)).claimed).not.toBeNull();
    expect((await claimPushDelivery(admin, ONE, '2026-09-01', FIELDS)).claimed).not.toBeNull();
  });

  it('records what the push service did, on the receipt already claimed', async () => {
    const claimed = await claimPushDelivery(admin, ONE, TODAY, FIELDS);
    await recordPushDeliveryOutcome(admin, claimed.claimed!.id, {
      sentDeviceCount: 2,
      retiredDeviceCount: 1,
    });

    const stored = await getPushDelivery(admin, ONE, TODAY);
    expect(stored!.sentDeviceCount).toBe(2);
    expect(stored!.retiredDeviceCount).toBe(1);
  });
});

describe('who may read and write a receipt', () => {
  beforeEach(async () => {
    await claimPushDelivery(admin, ONE, TODAY, FIELDS);
  });

  it('she reads her own', async () => {
    const mine = await getPushDelivery(one, ONE, TODAY);
    expect(mine).not.toBeNull();
    expect(mine!.title).toBe('Your Daily Reset');
  });

  it('another member reads nothing of hers', async () => {
    expect(await getPushDelivery(two, ONE, TODAY)).toBeNull();
  });

  it('she cannot write one for herself, so she cannot give herself a second notification', async () => {
    const { error } = await one.from('member_push_deliveries').insert({
      member_id: ONE,
      local_date: '2026-09-02',
      priority_rule: 'daily_reset',
      title: 'Mine',
      body: 'Mine',
      url: '/checkin',
      cadence: 'daily',
      source: 'scheduled',
    });
    expect(error).not.toBeNull();

    // Read back with the service role, because "no error" would not have
    // been proof either way.
    const { count } = await admin
      .from('member_push_deliveries')
      .select('id', { count: 'exact', head: true })
      .eq('member_id', ONE)
      .eq('local_date', '2026-09-02');
    expect(count).toBe(0);
  });

  it('she cannot erase today’s receipt to earn a second one', async () => {
    await one.from('member_push_deliveries').delete().eq('member_id', ONE).eq('local_date', TODAY);
    expect(await getPushDelivery(admin, ONE, TODAY)).not.toBeNull();
  });
});

describe('who the scheduled pass will consider', () => {
  async function saveDevice(memberId: string, endpoint: string) {
    await admin.from('member_push_subscriptions').insert({
      member_id: memberId,
      endpoint,
      subscription: { endpoint, keys: { p256dh: 'p', auth: 'a' } },
      device_label: 'iPhone, Safari',
    });
  }

  it('needs BOTH the switch on and a live device', async () => {
    await saveDevice(ONE, 'https://push.test/one');
    // Switch still off.
    expect((await listNotifiableMembers(admin)).some((m) => m.memberId === ONE)).toBe(false);

    await admin.from('profiles').update({ push_notifications_enabled: true }).eq('id', ONE);
    expect((await listNotifiableMembers(admin)).some((m) => m.memberId === ONE)).toBe(true);

    // A switch with every device revoked is nowhere to send.
    await admin
      .from('member_push_subscriptions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('member_id', ONE);
    expect((await listNotifiableMembers(admin)).some((m) => m.memberId === ONE)).toBe(false);
  });

  it('reads her timezone and her send hour, and reports the default as absent', async () => {
    await saveDevice(ONE, 'https://push.test/one');
    await admin
      .from('profiles')
      .update({ push_notifications_enabled: true, timezone: 'America/Los_Angeles' })
      .eq('id', ONE);

    const member = await loadNotifiableMember(admin, ONE);
    expect(member!.timezone).toBe('America/Los_Angeles');
    expect(member!.storedSendHour).toBeNull();
    expect(member!.liveDeviceCount).toBe(1);

    await admin.from('profiles').update({ push_send_hour_local: 7 }).eq('id', ONE);
    expect((await loadNotifiableMember(admin, ONE))!.storedSendHour).toBe(7);
  });

  it('never selects a seeded test account, however switched on it is', async () => {
    await saveDevice(ONE, 'https://push.test/one');
    await admin
      .from('profiles')
      .update({ push_notifications_enabled: true, is_test: true })
      .eq('id', ONE);

    expect((await listNotifiableMembers(admin)).some((m) => m.memberId === ONE)).toBe(false);

    // And the force-run path can still read her, which is the only reason
    // this feature is provable on production at all.
    const member = await loadNotifiableMember(admin, ONE);
    expect(member!.isTest).toBe(true);

    await admin.from('profiles').update({ is_test: false }).eq('id', ONE);
  });

  it('refuses an hour that is not an hour of a day', async () => {
    const { error } = await admin
      .from('profiles')
      .update({ push_send_hour_local: 24 })
      .eq('id', ONE);
    expect(error).not.toBeNull();
  });
});

describe('ignored, read from real sign-in rows', () => {
  async function receipt(localDate: string, sentAt: string) {
    await admin.from('member_push_deliveries').insert({
      member_id: ONE,
      local_date: localDate,
      sent_at: sentAt,
      priority_rule: 'daily_reset',
      title: 'Your Daily Reset',
      body: 'Take two minutes for your Daily Reset.',
      url: '/checkin',
      cadence: 'daily',
      source: 'scheduled',
    });
  }

  async function signIn(occurredAt: string, localDate: string) {
    await admin.from('member_wellness_events').insert({
      member_id: ONE,
      event_type: 'session_started',
      occurred_at: occurredAt,
      local_date: localDate,
      timezone: 'America/New_York',
    });
  }

  const DAYS = ['2026-08-26', '2026-08-27', '2026-08-28', '2026-08-29', '2026-08-30'];

  it('drops her to one a week after five reminders with no sign-in near any of them', async () => {
    for (const day of DAYS) await receipt(day, `${day}T13:00:00.000Z`);

    const history = await loadCadenceHistory(admin, ONE, 5);
    expect(history.recent).toHaveLength(5);
    expect(history.recent.every((d) => d.openedWithin24h === false)).toBe(true);
    expect(history.openedSinceLastSent).toBe(false);

    const verdict = resolveCadence({
      recent: history.recent,
      openedSinceLastSent: history.openedSinceLastSent,
      todayLocalDate: TODAY,
    });
    expect(verdict.cadence).toBe('weekly');
    expect(verdict.allowedToday).toBe(false);
  });

  it('keeps her on one a day when one real sign-in landed inside a day of one of them', async () => {
    for (const day of DAYS) await receipt(day, `${day}T13:00:00.000Z`);
    await signIn('2026-08-30T17:00:00.000Z', '2026-08-30');

    const history = await loadCadenceHistory(admin, ONE, 5);
    expect(history.recent[0]!.openedWithin24h).toBe(true);
    expect(history.openedSinceLastSent).toBe(true);

    const verdict = resolveCadence({
      recent: history.recent,
      openedSinceLastSent: history.openedSinceLastSent,
      todayLocalDate: TODAY,
    });
    expect(verdict.cadence).toBe('daily');
  });

  it('restores one a day on a sign-in that came back too late to have opened the last one', async () => {
    for (const day of DAYS) await receipt(day, `${day}T13:00:00.000Z`);
    // Thirty hours after the last reminder: too late to count as opening
    // it, and still exactly what "until she opens the app again" means.
    await signIn('2026-08-31T19:00:00.000Z', '2026-08-31');

    const history = await loadCadenceHistory(admin, ONE, 5);
    expect(history.recent[0]!.openedWithin24h).toBe(false);
    expect(history.openedSinceLastSent).toBe(true);

    const verdict = resolveCadence({
      recent: history.recent,
      openedSinceLastSent: history.openedSinceLastSent,
      todayLocalDate: TODAY,
    });
    expect(verdict.cadence).toBe('daily');
    expect(verdict.allowedToday).toBe(true);
  });
});
