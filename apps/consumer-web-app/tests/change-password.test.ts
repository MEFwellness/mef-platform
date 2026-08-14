/**
 * Change password from inside the app, for a signed-in account of any role.
 *
 * changePassword() itself cannot be called here (it uses cookies() from
 * next/headers, which throws outside a request scope), so these tests run the
 * exact sequence the action runs: verify the current password on a throwaway
 * client, then update the password on the caller's own session. That sequence
 * is where every interesting failure lives.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { serviceRoleClient, signInAs, TEST_USERS } from './setup/test-clients';
import { getFriendlyAuthError } from '../lib/auth/errors';
import { checkPasswordStrength, passwordsMatch } from '../lib/auth/validation';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * The throwaway client changePassword() uses to check the current password.
 * persistSession off is what keeps it from touching the cookies carrying the
 * caller's real session.
 */
function verificationClient(): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** Every role runs the same flow, which is the point of the feature. */
const ROLES = [
  { label: 'member', user: TEST_USERS.memberOne },
  { label: 'coach', user: TEST_USERS.coachOne },
  { label: 'administrator', user: TEST_USERS.adminOne },
] as const;

describe('changing your password while signed in', () => {
  afterAll(async () => {
    // Restore every fixture account to its seeded password. Other test files
    // sign in as all three.
    const admin = serviceRoleClient();
    for (const { user } of ROLES) {
      await admin.auth.admin.updateUserById(user.id, { password: user.password });
    }
  });

  /**
   * The wrong-current-password path, which has to produce a specific inline
   * error rather than a generic failure. changePassword() decides that by
   * matching GoTrue's own message text, so this pins the exact string it
   * matches on: if GoTrue ever changes it, a member would silently start
   * getting "something went wrong" instead of "that is not your current
   * password", and this is the test that would catch it.
   */
  it('rejects a wrong current password with the message the action keys on', async () => {
    const { error } = await verificationClient().auth.signInWithPassword({
      email: TEST_USERS.memberOne.email,
      password: 'not-the-current-password',
    });

    expect(error).not.toBeNull();
    expect(error!.message.toLowerCase()).toContain('invalid login credentials');
    expect(getFriendlyAuthError(error!.message)).toBe('Incorrect email or password.');
  });

  it('accepts the correct current password', async () => {
    const { error } = await verificationClient().auth.signInWithPassword({
      email: TEST_USERS.memberOne.email,
      password: TEST_USERS.memberOne.password,
    });
    expect(error).toBeNull();
  });

  /**
   * Signing the throwaway client out must not revoke the caller's own
   * session. supabase-js defaults signOut() to scope 'global', which revokes
   * every session the account holds, so a member changing their password
   * would have been logged out mid-change. changePassword() passes
   * scope 'local' for exactly this reason.
   */
  it('discarding the verification session leaves the real session signed in', async () => {
    const real = await signInAs(TEST_USERS.memberOne);

    const throwaway = verificationClient();
    await throwaway.auth.signInWithPassword({
      email: TEST_USERS.memberOne.email,
      password: TEST_USERS.memberOne.password,
    });
    await throwaway.auth.signOut({ scope: 'local' });

    const { data, error } = await real.auth.getUser();
    expect(error).toBeNull();
    expect(data.user?.id).toBe(TEST_USERS.memberOne.id);
  });

  for (const { label, user } of ROLES) {
    it(`works for a ${label}: new password lives, old password dies`, async () => {
      const newPassword = `Changed-${label}-9876`;

      // 1. Verify the current password, the way the action does.
      const { error: verifyError } = await verificationClient().auth.signInWithPassword({
        email: user.email,
        password: user.password,
      });
      expect(verifyError).toBeNull();

      // 2. Update on the caller's own session.
      const session = await signInAs(user);
      const { error: updateError } = await session.auth.updateUser({ password: newPassword });
      expect(updateError).toBeNull();

      // 3. The old password no longer signs in.
      const old = await createClient(SUPABASE_URL, ANON_KEY).auth.signInWithPassword({
        email: user.email,
        password: user.password,
      });
      expect(old.error).not.toBeNull();
      expect(old.data.session).toBeNull();

      // 4. The new one does.
      const fresh = await createClient(SUPABASE_URL, ANON_KEY).auth.signInWithPassword({
        email: user.email,
        password: newPassword,
      });
      expect(fresh.error).toBeNull();
      expect(fresh.data.user?.id).toBe(user.id);

      // Put it back for the next test in this file.
      await serviceRoleClient().auth.admin.updateUserById(user.id, { password: user.password });
    });
  }

  it('refuses a password change with no session at all', async () => {
    const { error } = await createClient(SUPABASE_URL, ANON_KEY).auth.updateUser({
      password: 'SomeNewPassword123',
    });
    expect(error).not.toBeNull();
  });
});

describe('the rules the change-password form enforces before submitting', () => {
  it('requires at least eight characters', () => {
    expect(checkPasswordStrength('Ab1cd').valid).toBe(false);
  });

  it('requires a letter and a number', () => {
    expect(checkPasswordStrength('abcdefghij').valid).toBe(false);
    expect(checkPasswordStrength('1234567890').valid).toBe(false);
    expect(checkPasswordStrength('abcdefg1').valid).toBe(true);
  });

  it('requires the confirmation to match', () => {
    expect(passwordsMatch('abcdefg1', 'abcdefg2')).toBe(false);
    expect(passwordsMatch('abcdefg1', 'abcdefg1')).toBe(true);
    // An empty confirmation is never a match, so the form cannot be
    // submitted with the second field blank.
    expect(passwordsMatch('abcdefg1', '')).toBe(false);
  });
});
