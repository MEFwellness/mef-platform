import { describe, it, expect } from 'vitest';
import { anonClient, signInAs, TEST_USERS } from './setup/test-clients';

describe('authentication', () => {
  it('signs in with valid seeded credentials', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const {
      data: { user },
    } = await client.auth.getUser();
    expect(user?.id).toBe(TEST_USERS.memberOne.id);
    expect(user?.email).toBe(TEST_USERS.memberOne.email);
  });

  it('rejects an incorrect password', async () => {
    const client = anonClient();
    const { error } = await client.auth.signInWithPassword({
      email: TEST_USERS.memberOne.email,
      password: 'definitely-the-wrong-password',
    });
    expect(error).not.toBeNull();
  });

  it('a signed-in user can read their own profile', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const { data, error } = await client
      .from('profiles')
      .select('id, display_name, timezone')
      .eq('id', TEST_USERS.memberOne.id)
      .single();

    expect(error).toBeNull();
    expect(data?.id).toBe(TEST_USERS.memberOne.id);
    expect(data?.display_name).toBeTruthy();
  });

  it("RLS blocks a member from reading another member's profile", async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    // member_read_own_profile only allows id = auth.uid() — this isn't an
    // error, RLS just silently filters the row out (deny-by-default select).
    const { data, error } = await client
      .from('profiles')
      .select('id')
      .eq('id', TEST_USERS.memberTwo.id)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it('a signed-out (anon) client cannot read any profile', async () => {
    const client = anonClient();
    const { data, error } = await client
      .from('profiles')
      .select('id')
      .eq('id', TEST_USERS.memberOne.id)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it('a member cannot self-grant a role (no INSERT policy on user_roles for members)', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const { error } = await client.from('user_roles').insert({
      user_id: TEST_USERS.memberOne.id,
      role: 'platform_administrator',
      granted_by: TEST_USERS.memberOne.id,
    });

    // Deny-by-default RLS: no INSERT policy exists for member/coach on
    // user_roles, so Postgres rejects the write outright.
    expect(error).not.toBeNull();
  });

  it("a member can read their own role grants but not another user's", async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const { data: own } = await client
      .from('user_roles')
      .select('user_id, role')
      .eq('user_id', TEST_USERS.memberOne.id);
    expect(own?.length).toBeGreaterThan(0);

    const { data: others } = await client
      .from('user_roles')
      .select('user_id, role')
      .eq('user_id', TEST_USERS.coachOne.id);
    expect(others ?? []).toHaveLength(0);
  });
});
