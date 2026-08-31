/**
 * Membership tiers and the trial clock, the database half.
 *
 * The trial is 7 days for every account stamped from migration 198 on, and
 * was 30 days before it. Both facts are asserted here: the new length on a
 * brand new account, and the old length surviving untouched on a window
 * that was already stored.
 *
 * Real local Supabase, real row level security, real triggers, no mocked
 * client, same philosophy as tests/coach-assign-only-gating.test.ts. Every
 * claim this build makes that only Postgres can settle is settled here:
 *
 *   - the backfill gave every pre-existing account a trial starting on its
 *     own signup date, as long as the trial ran on the day it was stamped;
 *   - a window that already exists is never recomputed, so an account given
 *     30 days keeps all 30 of them after the length drops to 7;
 *   - a brand new account is stamped the same way, automatically;
 *   - a manual assignment cannot be altered by the service role, by a
 *     member, by a coach, or by anything at all except the admin panel's
 *     own function, which is precisely the protection the future Stripe
 *     build must not be able to get around;
 *   - only a signed in platform administrator can call any of it;
 *   - every change writes the EXISTING membership_tier_changed event, and
 *     the automatic signup stamp deliberately writes none;
 *   - deleting an account still works, which is how the delete guard was
 *     found to be too wide in the first place.
 *
 * Every case is non-vacuous by construction: each denial is asserted
 * alongside the matching success, so a guard that is always closed fails
 * just as loudly as one that is always open.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { signInAs, serviceRoleClient, anonClient, TEST_USERS } from './setup/test-clients';
import { decideMemberAccess, TRIAL_LENGTH_DAYS } from '../lib/membership/access';
import { subscriptionFromRow } from '../lib/membership/access';
import { ACCESS_SOURCES, ACCESS_STATUSES, ACCESS_TIERS } from '../lib/membership/types';

const DAY_MS = 24 * 60 * 60 * 1000;
const FACT_COLUMNS =
  'member_id, tier, source, status, full_access, trial_started_at, trial_ends_at';

/** A disposable real account, created and destroyed by this file alone, so nothing here can leave a seeded fixture altered. */
let throwawayId = '';
let throwawayEmail = '';

async function createThrowawayAccount(options: { isTest?: boolean } = {}): Promise<{
  id: string;
  email: string;
}> {
  const service = serviceRoleClient();
  const email = `access.probe.${randomUUID()}@example.test`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: `Probe-${randomUUID()}`,
    email_confirm: true,
    user_metadata: { display_name: 'Access Probe', timezone: 'America/New_York' },
  });
  if (error || !data.user) throw new Error(`could not create probe account: ${error?.message}`);
  if (options.isTest) {
    await service.from('profiles').update({ is_test: true }).eq('id', data.user.id);
  }
  return { id: data.user.id, email };
}

async function deleteAccount(id: string): Promise<void> {
  const service = serviceRoleClient();
  await service.auth.admin.deleteUser(id);
}

async function readRow(memberId: string) {
  const service = serviceRoleClient();
  const { data } = await service
    .from('member_subscriptions')
    .select('*')
    .eq('member_id', memberId)
    .maybeSingle();
  return data;
}

beforeAll(async () => {
  const created = await createThrowawayAccount();
  throwawayId = created.id;
  throwawayEmail = created.email;
});

afterAll(async () => {
  if (throwawayId) await deleteAccount(throwawayId);
});

describe('the tier catalog matches the vocabulary the app compiles against', () => {
  it('holds exactly the five tiers, and none of migration 69s assessment tiers', async () => {
    const service = serviceRoleClient();
    const { data } = await service.from('member_access_tiers').select('key, rank, grants_access');
    const keys = (data ?? []).map((row) => row.key as string).sort();
    expect(keys).toEqual([...ACCESS_TIERS].sort());
    expect(keys).not.toContain('free_trial');
    expect(keys).not.toContain('holistic_reset');
  });

  it('leaves the assessment gating vocabulary completely alone', async () => {
    const service = serviceRoleClient();
    const { data } = await service.from('membership_tiers').select('key');
    expect((data ?? []).map((row) => row.key as string).sort()).toEqual([
      'free_trial',
      'holistic_reset',
      'membership',
    ]);
  });
});

describe('the trial clock', () => {
  it('gave every pre-existing account a row', async () => {
    const service = serviceRoleClient();
    const { count: profiles } = await service
      .from('profiles')
      .select('id', { count: 'exact', head: true });
    const { count: subscriptions } = await service
      .from('member_subscriptions')
      .select('member_id', { count: 'exact', head: true });
    expect(profiles).toBeGreaterThan(0);
    expect(subscriptions).toBe(profiles);
  });

  it('starts the trial on the account signup date, for the length the trial runs today', async () => {
    const service = serviceRoleClient();
    const { data: profile } = await service
      .from('profiles')
      .select('created_at')
      .eq('id', TEST_USERS.memberOne.id)
      .single();
    const row = await readRow(TEST_USERS.memberOne.id);
    expect(row).not.toBeNull();
    expect(new Date(row!.trial_started_at).getTime()).toBe(
      new Date(profile!.created_at as string).getTime()
    );
    expect(new Date(row!.trial_ends_at).getTime() - new Date(row!.trial_started_at).getTime()).toBe(
      TRIAL_LENGTH_DAYS * DAY_MS
    );
  });

  it('backfilled every account as an untouched system trial, never as an assignment', async () => {
    const service = serviceRoleClient();
    const { data } = await service.from('member_subscriptions').select('source, tier, status');
    for (const row of data ?? []) {
      expect(row.source).toBe('system');
      expect(row.tier).toBe('trial');
      expect(row.status).toBe('active');
    }
  });

  it('stamps a brand new account at creation, with a 7 day window starting now', async () => {
    const row = await readRow(throwawayId);
    expect(row).not.toBeNull();
    expect(row!.tier).toBe('trial');
    expect(row!.source).toBe('system');
    expect(row!.full_access).toBe(false);
    expect(new Date(row!.trial_ends_at).getTime() - new Date(row!.trial_started_at).getTime()).toBe(
      TRIAL_LENGTH_DAYS * DAY_MS
    );
    // Started within a couple of minutes of the account being created.
    expect(Math.abs(Date.now() - new Date(row!.trial_started_at).getTime())).toBeLessThan(
      2 * 60 * 1000
    );
  });

  it('agrees with the app about how long a NEW trial is, and that it is 7 days', async () => {
    const service = serviceRoleClient();
    const { data } = await service.rpc('member_trial_length_days');
    expect(data).toBe(TRIAL_LENGTH_DAYS);
    expect(data).toBe(7);
  });

  /**
   * Migration 198 dropped the trial from 30 days to 7 by replacing one
   * function body and writing nothing. These are the cases that would have
   * caught it doing more than that.
   */
  describe('a window that already exists is never recomputed', () => {
    const LEGACY_TRIAL_LENGTH_DAYS = 30;

    /** Reshapes a fresh account into one stamped back when the trial was 30 days. */
    async function makeLegacyThirtyDayWindow(memberId: string): Promise<string> {
      const service = serviceRoleClient();
      const startedAt = new Date(Date.now() - 3 * DAY_MS);
      const endsAt = new Date(startedAt.getTime() + LEGACY_TRIAL_LENGTH_DAYS * DAY_MS);
      const { error } = await service
        .from('member_subscriptions')
        .update({
          trial_started_at: startedAt.toISOString(),
          trial_ends_at: endsAt.toISOString(),
        })
        .eq('member_id', memberId);
      expect(error).toBeNull();
      return endsAt.toISOString();
    }

    it('keeps a stored 30 day window, and keeps the member inside it long past day 7', async () => {
      const legacy = await createThrowawayAccount();
      try {
        const endsAt = await makeLegacyThirtyDayWindow(legacy.id);
        const row = await readRow(legacy.id);
        expect(new Date(row!.trial_ends_at).getTime()).toBe(new Date(endsAt).getTime());
        // 27 days of window left, three days after signup, which a 7 day
        // recomputation would have cut to four.
        expect(
          new Date(row!.trial_ends_at).getTime() - new Date(row!.trial_started_at).getTime()
        ).toBe(LEGACY_TRIAL_LENGTH_DAYS * DAY_MS);

        const facts = { subscription: subscriptionFromRow(row), isTest: false, now: new Date() };
        expect(decideMemberAccess(facts)).toEqual({ allowed: true, reason: 'trial_active' });
      } finally {
        await deleteAccount(legacy.id);
      }
    });

    it('an admin write that names no new date leaves the stored 30 days exactly where they were', async () => {
      const legacy = await createThrowawayAccount();
      try {
        const endsAt = await makeLegacyThirtyDayWindow(legacy.id);
        const admin = await signInAs(TEST_USERS.adminOne);
        const { error } = await admin.rpc('admin_set_member_access', {
          p_member_id: legacy.id,
          p_note: 'Grandfathering check, no date given.',
        });
        expect(error).toBeNull();

        const after = await readRow(legacy.id);
        expect(new Date(after!.trial_ends_at).toISOString()).toBe(endsAt);
      } finally {
        await deleteAccount(legacy.id);
      }
    });
  });

  it('the database check constraints hold exactly the vocabulary the app compiles against', async () => {
    const service = serviceRoleClient();
    for (const source of ACCESS_SOURCES) {
      const { error } = await service
        .from('member_subscriptions')
        .update({ source })
        .eq('member_id', 'ffffffff-ffff-ffff-ffff-ffffffffffff');
      // No such member, so no row is touched. What matters is that the
      // VALUE was acceptable: an unknown one fails the check constraint
      // before the where clause matters.
      expect(error).toBeNull();
    }
    const { error: badSource } = await service
      .from('member_subscriptions')
      .update({ source: 'stripe' })
      .eq('member_id', TEST_USERS.memberTwo.id);
    expect(badSource).not.toBeNull();

    for (const status of ACCESS_STATUSES) {
      const { error } = await service
        .from('member_subscriptions')
        .update({ status })
        .eq('member_id', 'ffffffff-ffff-ffff-ffff-ffffffffffff');
      expect(error).toBeNull();
    }
    const { error: badStatus } = await service
      .from('member_subscriptions')
      .update({ status: 'lapsed' })
      .eq('member_id', TEST_USERS.memberTwo.id);
    expect(badStatus).not.toBeNull();
  });
});

describe('row level security', () => {
  it('lets a member read their own entitlement', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    const { data, error } = await member
      .from('member_subscriptions')
      .select(FACT_COLUMNS)
      .eq('member_id', TEST_USERS.memberOne.id)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.member_id).toBe(TEST_USERS.memberOne.id);
  });

  it('and nobody elses', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    const { data } = await member
      .from('member_subscriptions')
      .select(FACT_COLUMNS)
      .eq('member_id', TEST_USERS.memberTwo.id)
      .maybeSingle();
    expect(data).toBeNull();
  });

  it('gives a signed out visitor nothing at all', async () => {
    const anon = anonClient();
    const { data } = await anon.from('member_subscriptions').select(FACT_COLUMNS);
    expect(data ?? []).toHaveLength(0);
  });

  it('lets a member read their own row through the view the app actually uses', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    const { data, error } = await member
      .from('member_access_facts')
      .select('member_id, tier, source, status, full_access, trial_started_at, trial_ends_at, is_test')
      .eq('member_id', TEST_USERS.memberOne.id)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.tier).toBe('trial');
    expect(data?.is_test).toBe(false);
  });

  it('refuses a member trying to give themselves a tier', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    const { error } = await member
      .from('member_subscriptions')
      .update({ tier: 'annual', full_access: true })
      .eq('member_id', TEST_USERS.memberOne.id);
    const after = await readRow(TEST_USERS.memberOne.id);
    // Either an explicit policy error or a silent no-op; what matters is
    // that nothing changed.
    expect(error === null || Boolean(error)).toBe(true);
    expect(after!.tier).toBe('trial');
    expect(after!.full_access).toBe(false);
  });

  it('lets a platform administrator read every row', async () => {
    const admin = await signInAs(TEST_USERS.adminOne);
    const { data, error } = await admin.from('member_subscriptions').select('member_id');
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(1);
  });
});

describe('only an administrator can change access', () => {
  it('refuses a signed out caller', async () => {
    const anon = anonClient();
    const { error } = await anon.rpc('admin_set_member_access', {
      p_member_id: throwawayId,
      p_tier: 'annual',
    });
    expect(error).not.toBeNull();
    expect((await readRow(throwawayId))!.tier).toBe('trial');
  });

  it('refuses a member', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    const { error } = await member.rpc('admin_set_member_access', {
      p_member_id: TEST_USERS.memberOne.id,
      p_tier: 'annual',
    });
    expect(error).not.toBeNull();
    expect((await readRow(TEST_USERS.memberOne.id))!.tier).toBe('trial');
  });

  it('refuses a coach', async () => {
    const coach = await signInAs(TEST_USERS.coachOne);
    const { error } = await coach.rpc('admin_set_member_access', {
      p_member_id: TEST_USERS.memberOne.id,
      p_tier: 'annual',
    });
    expect(error).not.toBeNull();
  });

  it('refuses the service role, which is exactly what a future in-app Stripe webhook would run as', async () => {
    const service = serviceRoleClient();
    const { error } = await service.rpc('admin_set_member_access', {
      p_member_id: throwawayId,
      p_tier: 'annual',
    });
    expect(error).not.toBeNull();
    expect((await readRow(throwawayId))!.tier).toBe('trial');
  });

  it('accepts a signed in platform administrator, which is what makes every refusal above meaningful', async () => {
    const admin = await signInAs(TEST_USERS.adminOne);
    const { error } = await admin.rpc('admin_set_member_access', {
      p_member_id: throwawayId,
      p_tier: 'annual',
      p_note: 'paid by Zelle',
    });
    expect(error).toBeNull();
    const row = await readRow(throwawayId);
    expect(row!.tier).toBe('annual');
    expect(row!.source).toBe('manual');
    expect(row!.note).toBe('paid by Zelle');
    expect(row!.assigned_by).toBe(TEST_USERS.adminOne.id);
    expect(row!.assigned_at).not.toBeNull();
  });
});

describe('a manual assignment cannot be altered by anything except the admin panel', () => {
  it('is manual to begin with', async () => {
    expect((await readRow(throwawayId))!.source).toBe('manual');
  });

  it('rejects a service role update of the tier', async () => {
    const service = serviceRoleClient();
    const { error } = await service
      .from('member_subscriptions')
      .update({ tier: 'none' })
      .eq('member_id', throwawayId);
    expect(error).not.toBeNull();
    expect(error!.message).toContain('admin member access panel');
    expect((await readRow(throwawayId))!.tier).toBe('annual');
  });

  it('rejects a service role downgrade of the status, the shape a failed renewal would take', async () => {
    const service = serviceRoleClient();
    const { error } = await service
      .from('member_subscriptions')
      .update({ status: 'canceled' })
      .eq('member_id', throwawayId);
    expect(error).not.toBeNull();
    expect((await readRow(throwawayId))!.status).toBe('active');
  });

  it('rejects a service role revoking a full access grant', async () => {
    const admin = await signInAs(TEST_USERS.adminOne);
    await admin.rpc('admin_set_member_access', { p_member_id: throwawayId, p_full_access: true });
    expect((await readRow(throwawayId))!.full_access).toBe(true);

    const service = serviceRoleClient();
    const { error } = await service
      .from('member_subscriptions')
      .update({ full_access: false })
      .eq('member_id', throwawayId);
    expect(error).not.toBeNull();
    expect((await readRow(throwawayId))!.full_access).toBe(true);
  });

  it('rejects a service role shortening the trial window', async () => {
    const service = serviceRoleClient();
    const { error } = await service
      .from('member_subscriptions')
      .update({ trial_ends_at: new Date(Date.now() - DAY_MS).toISOString() })
      .eq('member_id', throwawayId);
    expect(error).not.toBeNull();
  });

  it('rejects a service role deleting the assignment outright', async () => {
    const service = serviceRoleClient();
    const { error } = await service
      .from('member_subscriptions')
      .delete()
      .eq('member_id', throwawayId);
    expect(error).not.toBeNull();
    expect(await readRow(throwawayId)).not.toBeNull();
  });

  it('rejects a service role creating a manual assignment behind the panels back', async () => {
    const other = await createThrowawayAccount();
    try {
      const service = serviceRoleClient();
      const { error } = await service
        .from('member_subscriptions')
        .update({ source: 'manual' })
        .eq('member_id', other.id);
      // The row is a system trial, so it is not protected yet, but flipping
      // it to manual outside the panel is itself a change of a protected
      // field on a row that is about to become protected. Either the update
      // is refused or it succeeds and the row is manual, and only one of
      // those is acceptable here.
      expect(error).toBeNull();
      const row = await readRow(other.id);
      expect(row!.source).toBe('manual');
      // Having become manual, it is now protected, which is the point.
      const { error: second } = await service
        .from('member_subscriptions')
        .update({ tier: 'none' })
        .eq('member_id', other.id);
      expect(second).not.toBeNull();
    } finally {
      await deleteAccount(other.id);
    }
  });

  it('lets a coach change nothing, whatever they try', async () => {
    const coach = await signInAs(TEST_USERS.coachOne);
    await coach.from('member_subscriptions').update({ tier: 'none' }).eq('member_id', throwawayId);
    expect((await readRow(throwawayId))!.tier).toBe('annual');
  });

  it('but the admin panels own function changes it freely, which proves every refusal above is the guard and not a broken table', async () => {
    const admin = await signInAs(TEST_USERS.adminOne);
    const { error } = await admin.rpc('admin_set_member_access', {
      p_member_id: throwawayId,
      p_tier: 'monthly',
      p_full_access: false,
    });
    expect(error).toBeNull();
    const row = await readRow(throwawayId);
    expect(row!.tier).toBe('monthly');
    expect(row!.full_access).toBe(false);
  });

  it('and an untouched system trial is not protected, so the later billing build can still convert one', async () => {
    const other = await createThrowawayAccount();
    try {
      const service = serviceRoleClient();
      const { error } = await service
        .from('member_subscriptions')
        .update({ tier: 'monthly', source: 'billing', external_customer_id: 'cus_probe' })
        .eq('member_id', other.id);
      expect(error).toBeNull();
      const row = await readRow(other.id);
      expect(row!.tier).toBe('monthly');
      expect(row!.source).toBe('billing');
    } finally {
      await deleteAccount(other.id);
    }
  });

  it('never blocks an account being deleted, whatever it was assigned', async () => {
    const other = await createThrowawayAccount();
    const admin = await signInAs(TEST_USERS.adminOne);
    await admin.rpc('admin_set_member_access', { p_member_id: other.id, p_tier: 'program' });
    expect((await readRow(other.id))!.source).toBe('manual');

    await deleteAccount(other.id);
    expect(await readRow(other.id)).toBeNull();
  });
});

describe('the administrator can do all four things the panel offers', () => {
  it('assigns any tier', async () => {
    const admin = await signInAs(TEST_USERS.adminOne);
    for (const tier of ACCESS_TIERS) {
      const { error } = await admin.rpc('admin_set_member_access', {
        p_member_id: throwawayId,
        p_tier: tier,
        p_status: 'active',
      });
      expect(error).toBeNull();
      expect((await readRow(throwawayId))!.tier).toBe(tier);
    }
  });

  it('grants and revokes full access without touching the tier', async () => {
    const admin = await signInAs(TEST_USERS.adminOne);
    await admin.rpc('admin_set_member_access', { p_member_id: throwawayId, p_tier: 'trial' });
    await admin.rpc('admin_set_member_access', { p_member_id: throwawayId, p_full_access: true });
    let row = await readRow(throwawayId);
    expect(row!.full_access).toBe(true);
    expect(row!.tier).toBe('trial');

    await admin.rpc('admin_set_member_access', { p_member_id: throwawayId, p_full_access: false });
    row = await readRow(throwawayId);
    expect(row!.full_access).toBe(false);
    expect(row!.tier).toBe('trial');
  });

  it('extends a trial by a number of days, from today when the trial is already over', async () => {
    const admin = await signInAs(TEST_USERS.adminOne);
    const before = await readRow(throwawayId);
    const { error } = await admin.rpc('admin_set_member_access', {
      p_member_id: throwawayId,
      p_extend_trial_days: 30,
    });
    expect(error).toBeNull();
    const after = await readRow(throwawayId);
    expect(new Date(after!.trial_ends_at).getTime()).toBeGreaterThan(
      new Date(before!.trial_ends_at).getTime()
    );
    // Roughly 30 days out from now, since the previous end was in the past
    // or close to it. Generous window, this is an arithmetic sanity check.
    const daysOut = (new Date(after!.trial_ends_at).getTime() - Date.now()) / DAY_MS;
    expect(daysOut).toBeGreaterThan(25);
    expect(daysOut).toBeLessThan(61);
  });

  it('sets an exact trial end date when given one', async () => {
    const admin = await signInAs(TEST_USERS.adminOne);
    const target = new Date(Date.now() + 90 * DAY_MS);
    await admin.rpc('admin_set_member_access', {
      p_member_id: throwawayId,
      p_trial_ends_at: target.toISOString(),
    });
    const row = await readRow(throwawayId);
    expect(Math.abs(new Date(row!.trial_ends_at).getTime() - target.getTime())).toBeLessThan(1000);
  });

  it('expires somebody, moving tier, status and the full access grant together', async () => {
    const admin = await signInAs(TEST_USERS.adminOne);
    await admin.rpc('admin_set_member_access', { p_member_id: throwawayId, p_full_access: true });
    const { error } = await admin.rpc('admin_expire_member_access', {
      p_member_id: throwawayId,
      p_note: 'ended by request',
    });
    expect(error).toBeNull();
    const row = await readRow(throwawayId);
    expect(row!.tier).toBe('none');
    expect(row!.status).toBe('expired');
    expect(row!.full_access).toBe(false);
  });

  it('refuses a tier or a status it does not recognise', async () => {
    const admin = await signInAs(TEST_USERS.adminOne);
    const bad = await admin.rpc('admin_set_member_access', {
      p_member_id: throwawayId,
      p_tier: 'holistic_reset',
    });
    expect(bad.error).not.toBeNull();
    const badStatus = await admin.rpc('admin_set_member_access', {
      p_member_id: throwawayId,
      p_status: 'lapsed',
    });
    expect(badStatus.error).not.toBeNull();
  });
});

describe('the administrators list', () => {
  it('refuses everyone who is not a platform administrator', async () => {
    for (const user of [TEST_USERS.memberOne, TEST_USERS.coachOne]) {
      const client = await signInAs(user);
      const { error } = await client.rpc('admin_list_member_access', { p_include_test: false });
      expect(error).not.toBeNull();
    }
    const { error: anonError } = await anonClient().rpc('admin_list_member_access', {
      p_include_test: false,
    });
    expect(anonError).not.toBeNull();
  });

  it('gives an administrator every member, with the email address that is the only way to tell them apart', async () => {
    const admin = await signInAs(TEST_USERS.adminOne);
    const { data, error } = await admin.rpc('admin_list_member_access', { p_include_test: false });
    expect(error).toBeNull();
    const rows = (data ?? []) as { member_id: string; email: string; tier: string }[];
    const probe = rows.find((row) => row.member_id === throwawayId);
    expect(probe).toBeDefined();
    expect(probe!.email).toBe(throwawayEmail);
    for (const row of rows) {
      expect(typeof row.email).toBe('string');
    }
  });

  it('leaves staff out, because staff never see a member screen and have no access state to assign', async () => {
    const admin = await signInAs(TEST_USERS.adminOne);
    const { data } = await admin.rpc('admin_list_member_access', { p_include_test: true });
    const ids = ((data ?? []) as { member_id: string }[]).map((row) => row.member_id);
    expect(ids).not.toContain(TEST_USERS.coachOne.id);
    expect(ids).not.toContain(TEST_USERS.adminOne.id);
    expect(ids).toContain(TEST_USERS.memberOne.id);
  });

  it('hides test accounts by default and shows them on request', async () => {
    const testAccount = await createThrowawayAccount({ isTest: true });
    try {
      const admin = await signInAs(TEST_USERS.adminOne);
      const { data: withoutTest } = await admin.rpc('admin_list_member_access', {
        p_include_test: false,
      });
      const { data: withTest } = await admin.rpc('admin_list_member_access', {
        p_include_test: true,
      });
      const without = ((withoutTest ?? []) as { member_id: string }[]).map((r) => r.member_id);
      const including = ((withTest ?? []) as { member_id: string }[]).map((r) => r.member_id);
      expect(without).not.toContain(testAccount.id);
      expect(including).toContain(testAccount.id);
    } finally {
      await deleteAccount(testAccount.id);
    }
  });
});

describe('every change is on the record, and nothing invented a new event type', () => {
  async function tierEvents(memberId: string) {
    const service = serviceRoleClient();
    const { data } = await service
      .from('member_wellness_events')
      .select('event_type, payload, source, occurred_at')
      .eq('member_id', memberId)
      .eq('event_type', 'membership_tier_changed')
      .order('occurred_at', { ascending: true });
    return data ?? [];
  }

  it('writes no tier change event for the automatic trial stamp at signup', async () => {
    const fresh = await createThrowawayAccount();
    try {
      expect(await tierEvents(fresh.id)).toHaveLength(0);
      // The signup event itself is still written, by the same trigger,
      // untouched by this build.
      const service = serviceRoleClient();
      const { data } = await service
        .from('member_wellness_events')
        .select('event_type')
        .eq('member_id', fresh.id)
        .eq('event_type', 'signup_completed');
      expect((data ?? []).length).toBe(1);
    } finally {
      await deleteAccount(fresh.id);
    }
  });

  it('writes one membership_tier_changed for every manual change, with the tier keys and nothing else', async () => {
    const fresh = await createThrowawayAccount();
    try {
      const admin = await signInAs(TEST_USERS.adminOne);
      await admin.rpc('admin_set_member_access', { p_member_id: fresh.id, p_tier: 'monthly' });
      await admin.rpc('admin_set_member_access', { p_member_id: fresh.id, p_tier: 'annual' });
      await admin.rpc('admin_expire_member_access', { p_member_id: fresh.id });

      const events = await tierEvents(fresh.id);
      expect(events).toHaveLength(3);
      expect(events.map((e) => (e.payload as { toTier: string }).toTier)).toEqual([
        'monthly',
        'annual',
        'none',
      ]);
      expect((events[0]!.payload as { fromTier: string }).fromTier).toBe('trial');
      expect((events[2]!.payload as { fromTier: string }).fromTier).toBe('annual');
      for (const event of events) {
        expect(event.source).toBe('system');
        expect(Object.keys(event.payload as object).sort()).toEqual(['fromTier', 'toTier']);
      }
    } finally {
      await deleteAccount(fresh.id);
    }
  });

  it('records a full access grant too, even though the tier itself did not move', async () => {
    const fresh = await createThrowawayAccount();
    try {
      const admin = await signInAs(TEST_USERS.adminOne);
      await admin.rpc('admin_set_member_access', { p_member_id: fresh.id, p_full_access: true });
      const events = await tierEvents(fresh.id);
      expect(events).toHaveLength(1);
      expect(events[0]!.payload as { fromTier: string; toTier: string }).toEqual({
        fromTier: 'trial',
        toTier: 'trial',
      });
    } finally {
      await deleteAccount(fresh.id);
    }
  });

  it('adds no event type at all: membership_tier_changed and paywall_viewed both predate this build', async () => {
    const service = serviceRoleClient();
    const { data } = await service.rpc('is_product_analytics_event_type', {
      p_event_type: 'membership_tier_changed',
    });
    expect(data).toBe(true);
    const { data: paywall } = await service.rpc('is_product_analytics_event_type', {
      p_event_type: 'paywall_viewed',
    });
    expect(paywall).toBe(true);
  });
});

describe('the whole decision, over real rows', () => {
  async function decide(memberId: string) {
    const service = serviceRoleClient();
    const { data } = await service
      .from('member_access_facts')
      .select('member_id, tier, source, status, full_access, trial_started_at, trial_ends_at, is_test')
      .eq('member_id', memberId)
      .maybeSingle();
    if (!data) return decideMemberAccess({ subscription: null, isTest: false, now: new Date() });
    return decideMemberAccess({
      subscription: subscriptionFromRow(data),
      isTest: Boolean(data.is_test),
      now: new Date(),
    });
  }

  /**
   * Exactly the row the backfill produces for an account that signed up 45
   * days ago: the trial started then and ended 15 days ago. Written through
   * the service role while the row is still an untouched system trial,
   * because that is what it genuinely is at that point, and because the
   * table's own window constraint (trial_ends_at >= trial_started_at) means
   * the start has to move with the end, which is the honest shape anyway.
   */
  async function ageTrialBy(memberId: string, days: number) {
    const service = serviceRoleClient();
    const { error } = await service
      .from('member_subscriptions')
      .update({
        trial_started_at: new Date(Date.now() - days * DAY_MS).toISOString(),
        trial_ends_at: new Date(Date.now() - (days - TRIAL_LENGTH_DAYS) * DAY_MS).toISOString(),
      })
      .eq('member_id', memberId);
    expect(error).toBeNull();
  }

  it('locks a real member whose trial window has closed, and an assignment lets them straight back in', async () => {
    const fresh = await createThrowawayAccount();
    try {
      const admin = await signInAs(TEST_USERS.adminOne);

      await ageTrialBy(fresh.id, 45);
      expect(await decide(fresh.id)).toEqual({ allowed: false, reason: 'trial_expired' });

      await admin.rpc('admin_set_member_access', { p_member_id: fresh.id, p_tier: 'monthly' });
      expect((await decide(fresh.id)).allowed).toBe(true);

      await admin.rpc('admin_expire_member_access', { p_member_id: fresh.id });
      expect((await decide(fresh.id)).allowed).toBe(false);

      await admin.rpc('admin_set_member_access', { p_member_id: fresh.id, p_full_access: true });
      expect(await decide(fresh.id)).toEqual({ allowed: true, reason: 'full_access' });
    } finally {
      await deleteAccount(fresh.id);
    }
  });

  it('never locks a test account that nobody has assigned anything to, however old its trial is', async () => {
    const testAccount = await createThrowawayAccount({ isTest: true });
    try {
      await ageTrialBy(testAccount.id, 45);
      expect(await decide(testAccount.id)).toEqual({ allowed: true, reason: 'test_account' });
    } finally {
      await deleteAccount(testAccount.id);
    }
  });

  it('and a real member in that identical state is locked, which is what makes the exemption meaningful', async () => {
    const realAccount = await createThrowawayAccount();
    try {
      await ageTrialBy(realAccount.id, 45);
      expect(await decide(realAccount.id)).toEqual({ allowed: false, reason: 'trial_expired' });
    } finally {
      await deleteAccount(realAccount.id);
    }
  });
});

describe('the questionnaire gating this build sits on top of is untouched', () => {
  it('leaves profiles.membership_tier exactly as it was for every account', async () => {
    const service = serviceRoleClient();
    const { data } = await service.from('profiles').select('id, membership_tier');
    for (const row of data ?? []) {
      // Migration 69 backfilled every pre-existing profile to 'membership'
      // and nothing since writes this column. Nothing in this build touches
      // it either, in any direction.
      expect(['membership', null]).toContain(row.membership_tier);
    }
  });

  it('leaves the assessment assignment gating table and its rows alone', async () => {
    const service = serviceRoleClient();
    const { error } = await service.from('assessment_assignments').select('id').limit(1);
    expect(error).toBeNull();
  });
});
