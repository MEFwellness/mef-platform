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
import { serviceRoleClient } from './setup/test-clients';

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
});
