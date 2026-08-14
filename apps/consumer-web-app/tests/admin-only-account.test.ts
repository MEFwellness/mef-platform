/**
 * An administrator-only account: what it takes to have one, and what it must
 * be invisible to.
 *
 * THE PROBLEM THIS PROVES A SOLUTION TO. `handle_new_user()` (migration 17,
 * last re-created by migration 146) hardcodes a `member` role grant on every
 * account created by any path. There is no flag to suppress it and no path
 * around it: the grant exists before any caller ever sees the new user id. So
 * "grant only the administrator role" cannot be achieved by not granting
 * `member`, and an account created for administration alone would otherwise
 * be counted as a member forever.
 *
 * THE SOLUTION, AND WHY IT IS THIS ONE. The baseline grant is revoked through
 * the `revoked_at` / `revoked_by` columns `user_roles` has had since migration
 * 4, rather than deleted. `has_active_role()` is the single function both the
 * app guards and the RLS policies call, and it only counts grants with a null
 * `revoked_at`, so every layer agrees the account is not a member without any
 * of them being special-cased. Deleting the row would have worked for the
 * guards and destroyed the audit trail, which is the one record of the fact
 * that the trigger granted a role and provisioning took it away.
 *
 * The trigger itself is deliberately not modified. Every ordinary signup
 * still becomes a member; this is one account handled explicitly, not a
 * change to how accounts are made.
 *
 * These tests run against real local Supabase, real RLS and the real
 * database functions, on an account they create and remove themselves.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { anonClient, serviceRoleClient } from './setup/test-clients';
import { getMemberEngagementStates } from '../lib/analytics-service/detections';
import { getOverviewMetrics } from '../lib/analytics-service/reports';
import { AnalyticsAccessDeniedError } from '../lib/analytics-service/client';

const EMAIL = 'admin.only.fixture@example.test';
const PASSWORD = 'DevPassword123!';

describe('an administrator-only account', () => {
  let service: SupabaseClient;
  let userId: string;

  beforeAll(async () => {
    service = serviceRoleClient();

    // Remove any leftover from an interrupted run, so the trigger below is
    // genuinely running on a fresh account.
    const { data: existing } = await service.auth.admin.listUsers({ page: 1, perPage: 200 });
    const stale = existing.users.find((user) => user.email === EMAIL);
    if (stale) await service.auth.admin.deleteUser(stale.id);

    const { data, error } = await service.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: 'Admin Only Fixture' },
    });
    if (error) throw new Error(`fixture createUser failed: ${error.message}`);
    userId = data.user.id;
  });

  afterAll(async () => {
    if (userId) await service.auth.admin.deleteUser(userId);
  });

  it('the trigger grants member on every new account, which is why this is not simply a matter of not granting it', async () => {
    const { data } = await service
      .from('user_roles')
      .select('role, revoked_at')
      .eq('user_id', userId);
    const member = (data ?? []).find((row) => row.role === 'member');
    expect(member, 'handle_new_user did not grant member').toBeDefined();
    expect(member!.revoked_at).toBeNull();

    // And the app's own guard function agrees, before anything is done.
    const { data: isMember } = await service.rpc('has_active_role', {
      p_user: userId,
      p_role: 'member',
    });
    expect(isMember).toBe(true);
  });

  it('revoking the baseline grant makes has_active_role answer false, without deleting the row', async () => {
    await service
      .from('user_roles')
      .update({ revoked_at: new Date().toISOString(), revoked_by: userId })
      .eq('user_id', userId)
      .eq('role', 'member')
      .is('revoked_at', null);

    const { data: isMember } = await service.rpc('has_active_role', {
      p_user: userId,
      p_role: 'member',
    });
    expect(isMember).toBe(false);

    // The audit trail survives: the grant is still there, marked revoked.
    const { data } = await service
      .from('user_roles')
      .select('role, granted_at, revoked_at, revoked_by')
      .eq('user_id', userId)
      .eq('role', 'member');
    expect(data).toHaveLength(1);
    expect(data![0]!.revoked_at).not.toBeNull();
    expect(data![0]!.granted_at).not.toBeNull();
    expect(data![0]!.revoked_by).toBe(userId);
  });

  it('holds the administrator role and nothing else', async () => {
    await service
      .from('user_roles')
      .insert({ user_id: userId, role: 'platform_administrator', granted_by: userId });

    const answers: Record<string, boolean> = {};
    for (const role of ['member', 'coach', 'clinician_reviewer', 'platform_administrator']) {
      const { data } = await service.rpc('has_active_role', { p_user: userId, p_role: role });
      answers[role] = data === true;
    }

    expect(answers).toEqual({
      member: false,
      coach: false,
      clinician_reviewer: false,
      platform_administrator: true,
    });
  });

  it('is invisible to analytics, with the test-account toggle off and on', async () => {
    for (const includeTest of [false, true]) {
      const { data, error } = await service.rpc('analytics_member_scope', {
        p_include_test: includeTest,
      });
      expect(error).toBeNull();
      const ids = (data ?? []).map((row: { member_id: string }) => row.member_id);
      expect(ids, `include_test=${includeTest}`).not.toContain(userId);
    }
  });

  it('is excluded because of the administrator grant, not because it has no activity', async () => {
    // A profile row exists for it, so it is a real account the scope query
    // had the opportunity to return.
    const { data: profile } = await service
      .from('profiles')
      .select('id, is_test')
      .eq('id', userId)
      .single();
    expect(profile).not.toBeNull();
    expect(profile!.is_test).toBe(false);

    // Revoke the administrator grant and it becomes an in-scope member,
    // which is what proves the exclusion above was caused by that grant.
    await service
      .from('user_roles')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('role', 'platform_administrator')
      .is('revoked_at', null);

    const { data: withoutAdmin } = await service.rpc('analytics_member_scope', {
      p_include_test: false,
    });
    const ids = (withoutAdmin ?? []).map((row: { member_id: string }) => row.member_id);
    expect(ids).toContain(userId);

    // Put it back, so the account ends this file the way it is meant to be.
    await service
      .from('user_roles')
      .insert({ user_id: userId, role: 'platform_administrator', granted_by: userId });
    const { data: restored } = await service.rpc('analytics_member_scope', {
      p_include_test: false,
    });
    expect((restored ?? []).map((row: { member_id: string }) => row.member_id)).not.toContain(userId);
  });

  it('is in no coach caseload', async () => {
    const { data } = await service
      .from('coach_client_assignments')
      .select('id')
      .eq('client_id', userId);
    expect(data ?? []).toHaveLength(0);
  });

  it('can still sign in, which is the whole point of provisioning it', async () => {
    const { data: user } = await service.auth.admin.getUserById(userId);
    expect(user.user?.email).toBe(EMAIL);
    // email_confirm was set at creation, so there is no verification step
    // standing between provisioning the account and using it.
    expect(user.user?.email_confirmed_at).toBeTruthy();
  });

  // -------------------------------------------------------------------
  // What the account can and cannot actually DO, signed in as itself
  // -------------------------------------------------------------------

  describe('signed in as the admin-only account', () => {
    let admin: SupabaseClient;

    beforeAll(async () => {
      admin = anonClient();
      const { error } = await admin.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
      if (error) throw new Error(`admin-only account could not sign in: ${error.message}`);
    });

    it('is admitted to the admin analytics surfaces', async () => {
      // analytics_assert_admin() runs first inside every one of these and
      // raises 42501 for anyone without the role, so getting a result at all
      // is the admission.
      const overview = await getOverviewMetrics(admin, { period: { preset: 'last_30_days' } });
      expect(overview).toBeDefined();

      const states = await getMemberEngagementStates(admin, { period: { preset: 'last_30_days' } });
      expect(Array.isArray(states)).toBe(true);
    });

    it('does not appear in the member engagement table it can itself read', async () => {
      for (const includeTestAccounts of [false, true]) {
        const states = await getMemberEngagementStates(admin, {
          period: { preset: 'last_30_days' },
          includeTestAccounts,
        });
        expect(
          states.map((member) => member.memberId),
          `includeTestAccounts=${includeTestAccounts}`
        ).not.toContain(userId);
      }
    });

    /**
     * WHAT "REFUSED AS MEMBER AND COACH" ACTUALLY MEANS HERE, because it is
     * not what it first sounds like.
     *
     * `platform_administrator` holds broad FOR ALL row level security policies
     * across the schema (migration 16). That is the deliberate meaning of the
     * role and it long predates this account: an administrator CAN read
     * onboarding submissions and coach assignments, and asserting otherwise
     * would be asserting that the platform administrator role does not work.
     *
     * The refusal that matters, and the one the product actually implements,
     * is at the level of ROLE and ROUTE:
     *
     *   - it holds no member role and no coach role, so middleware.ts sends it
     *     away from /coach, and lib/auth/postLoginRoute.ts never routes it
     *     into the member experience
     *   - it is not a member for any counting purpose
     *   - it is nobody's client
     *
     * Those are the three asserted below.
     */
    it('is refused from the coach area, because the role check middleware runs is false', async () => {
      // middleware.ts gates /coach on exactly this call.
      const { data: isCoach } = await admin.rpc('has_active_role', {
        p_user: userId,
        p_role: 'coach',
      });
      expect(isCoach).toBe(false);
    });

    it('is never routed into the member experience, because it holds no member role', async () => {
      // lib/auth/postLoginRoute.ts checks coach, then administrator, and
      // returns /admin before any member branch is reached.
      const { data: isMember } = await admin.rpc('has_active_role', {
        p_user: userId,
        p_role: 'member',
      });
      expect(isMember).toBe(false);

      const { data: isAdmin } = await admin.rpc('has_active_role', {
        p_user: userId,
        p_role: 'platform_administrator',
      });
      expect(isAdmin).toBe(true);
    });

    it('is nobody client: it appears in no coach caseload', async () => {
      // Reading the table is allowed for an administrator. What must be true
      // is that this account is not a CLIENT in any row of it.
      const { data: assignments } = await admin
        .from('coach_client_assignments')
        .select('client_id');
      expect((assignments ?? []).map((row) => row.client_id)).not.toContain(userId);
    });

    it('owns no member data of its own', async () => {
      // An administrator can read these tables; the point is that none of the
      // rows are this account's, so it can never be mistaken for a member with
      // a history.
      for (const [table, column] of [
        ['daily_checkins', 'user_id'],
        ['member_goal_selections', 'member_id'],
        ['onboarding_submissions', 'user_id'],
      ] as const) {
        const { data } = await admin.from(table).select('id').eq(column, userId);
        expect(data ?? [], table).toHaveLength(0);
      }
    });

    it('a signed-out visitor is still refused from the same analytics reads', async () => {
      const visitor = anonClient();
      await expect(
        getOverviewMetrics(visitor, { period: { preset: 'last_30_days' } })
      ).rejects.toBeInstanceOf(AnalyticsAccessDeniedError);
    });
  });
});

/**
 * The hazard that caused the 2026-08-14 incident, guarded directly.
 *
 * GoTrue scans several auth.users columns into plain Go strings. A NULL in any
 * of them breaks the scan for the WHOLE query, so a single malformed row makes
 * every admin listUsers call in the project fail with a 500 and an empty body,
 * and makes that account unable to sign in. Only a hand written SQL INSERT can
 * produce such a row; the Auth Admin API always writes ''.
 *
 * This test asserts the invariant rather than the incident, so it will catch
 * the next hand written INSERT too, whatever it is for.
 */
describe('no auth.users row has a NULL where GoTrue expects an empty string', () => {
  it('every account has empty strings, not nulls, in the token columns', async () => {
    const service = serviceRoleClient();

    // listUsers is itself the canary: it is the call that fails when a
    // malformed row exists, so a clean result here is the invariant holding.
    const { data, error } = await service.auth.admin.listUsers({ page: 1, perPage: 200 });
    expect(
      error,
      'listUsers failed. If this is a 500 with an empty body, an auth.users row has NULL token ' +
        'columns. Repair with scripts/repair-auth-null-tokens.sql.'
    ).toBeNull();
    expect((data?.users ?? []).length).toBeGreaterThan(0);
  });
});
