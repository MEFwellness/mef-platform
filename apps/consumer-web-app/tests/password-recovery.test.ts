/**
 * The reset-password-by-email flow.
 *
 * Split in two on purpose. The pure half pins the detection and gating rules
 * that decide whether a landing is a recovery at all, including a direct
 * regression guard on the defect this work fixed. The integration half runs
 * real recovery tokens through a real GoTrue, because the behaviour that
 * actually matters (the new password works, the old one is dead, the link
 * cannot be used twice) is GoTrue's, not this app's, and mocking it would
 * prove nothing.
 *
 * Server actions cannot be called here: they use cookies() from next/headers,
 * which throws outside a request scope. These tests issue the same Supabase
 * calls the actions issue, which is the shared setup file's stated approach.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { anonClient, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import {
  PASSWORD_RECOVERY_COOKIE,
  RESET_CONFIRM_PATH,
  expiredLinkPath,
  isRecoveryExemptPath,
  nextRecoveryScreen,
  parseRecoveryLanding,
  recoveryRedirectTo,
  shouldGateToPasswordReset,
} from '../lib/auth/recovery';

const SITE = 'https://app.mefwellness.com';

describe('recoveryRedirectTo', () => {
  /**
   * The whole defect in one assertion.
   *
   * The old target was `/api/auth/callback?next=/reset-password/confirm`. The
   * intent of the link lived entirely in that `next` parameter, and if it was
   * ever dropped between the email template, GoTrue's allow-list matching and
   * the redirect back, the callback fell through to its `next = '/'` default
   * and sent the member to the routing hub, which signed them in and never
   * mentioned their password again. A target with no query string cannot lose
   * a query parameter.
   */
  it('carries no query string, so there is no parameter to lose', () => {
    const target = recoveryRedirectTo(SITE);
    expect(target).not.toContain('?');
    expect(target).not.toContain('next=');
    expect(target).toBe(`${SITE}/api/auth/recovery`);
  });

  it('does not double a trailing slash on the site url', () => {
    expect(recoveryRedirectTo(`${SITE}/`)).toBe(`${SITE}/api/auth/recovery`);
  });
});

describe('parseRecoveryLanding', () => {
  it('reads a PKCE code from the query string', () => {
    expect(parseRecoveryLanding('?code=abc123', '')).toEqual({ kind: 'code', code: 'abc123' });
  });

  it('reads a verify-otp token hash from the query string', () => {
    expect(parseRecoveryLanding('?token_hash=xyz&type=recovery', '')).toEqual({
      kind: 'token_hash',
      tokenHash: 'xyz',
    });
  });

  /**
   * The implicit landing. A fragment is never sent to a server, which is why
   * the confirm screen has to resolve this one in the browser.
   */
  it('reads implicit-flow tokens from the fragment', () => {
    expect(
      parseRecoveryLanding('', '#access_token=at1&refresh_token=rt1&type=recovery')
    ).toEqual({ kind: 'tokens', accessToken: 'at1', refreshToken: 'rt1' });
  });

  /**
   * Verified directly against this project's own production and local GoTrue
   * instances: a dead link comes back as a fragment, never a query string.
   * That is why the old server-only callback could not tell an expired link
   * from a request that simply had nothing in it.
   */
  it('recognises the expired-link fragment GoTrue actually returns', () => {
    const landing = parseRecoveryLanding(
      '',
      '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'
    );
    expect(landing.kind).toBe('expired');
    expect(landing).toMatchObject({ description: 'Email link is invalid or has expired' });
  });

  it('treats an error as an error even if a token rides along with it', () => {
    expect(
      parseRecoveryLanding('?code=abc', '#error_code=otp_expired').kind
    ).toBe('expired');
  });

  it('reports nothing for a bare visit to the screen', () => {
    expect(parseRecoveryLanding('', '')).toEqual({ kind: 'none' });
  });

  it('accepts search and hash with or without their leading sigil', () => {
    expect(parseRecoveryLanding('code=abc', '')).toEqual({ kind: 'code', code: 'abc' });
  });
});

describe('shouldGateToPasswordReset', () => {
  const pending = { hasUser: true, recoveryPending: true };

  it('sends a member mid-recovery to the set-new-password screen', () => {
    expect(shouldGateToPasswordReset({ ...pending, path: '/dashboard' })).toBe(true);
  });

  it('gates a coach and an administrator the same way', () => {
    expect(shouldGateToPasswordReset({ ...pending, path: '/coach' })).toBe(true);
    expect(shouldGateToPasswordReset({ ...pending, path: '/admin' })).toBe(true);
  });

  it('does not gate the set-new-password screen itself', () => {
    expect(shouldGateToPasswordReset({ ...pending, path: RESET_CONFIRM_PATH })).toBe(false);
  });

  it('leaves api routes alone, including the ones the screen depends on', () => {
    expect(shouldGateToPasswordReset({ ...pending, path: '/api/auth/recovery' })).toBe(false);
    expect(shouldGateToPasswordReset({ ...pending, path: '/api/entry-animation/x' })).toBe(false);
  });

  it('leaves /login alone so signing out mid-recovery lands somewhere sensible', () => {
    expect(shouldGateToPasswordReset({ ...pending, path: '/login' })).toBe(false);
  });

  it('is inert without a session, so a stale cookie cannot trap a visitor', () => {
    expect(
      shouldGateToPasswordReset({ hasUser: false, recoveryPending: true, path: '/dashboard' })
    ).toBe(false);
  });

  it('does not gate an ordinary signed-in member', () => {
    expect(
      shouldGateToPasswordReset({ hasUser: true, recoveryPending: false, path: '/dashboard' })
    ).toBe(false);
  });
});

/**
 * Regression guard for a defect found by driving the flow in a real browser,
 * not by reading the code. Full detail in nextRecoveryScreen's own comment:
 * finishing a reset clears the recovery marker, the confirm screen re-renders
 * with "no recovery in progress", re-resolves itself from a URL whose tokens
 * are gone, and told the member their link had expired seconds after their
 * new password had genuinely been saved.
 */
describe('nextRecoveryScreen', () => {
  it('never walks a completed change back to expired', () => {
    expect(nextRecoveryScreen('done', 'expired')).toBe('done');
  });

  it('never walks a completed change back to anything at all', () => {
    expect(nextRecoveryScreen('done', 'checking')).toBe('done');
    expect(nextRecoveryScreen('done', 'ready')).toBe('done');
  });

  it('otherwise takes the proposed screen', () => {
    expect(nextRecoveryScreen('checking', 'ready')).toBe('ready');
    expect(nextRecoveryScreen('checking', 'expired')).toBe('expired');
    expect(nextRecoveryScreen('ready', 'done')).toBe('done');
  });
});

describe('recovery paths', () => {
  it('names a cookie that is only ever a marker', () => {
    expect(PASSWORD_RECOVERY_COOKIE).toBe('mef_password_recovery');
  });

  it('sends a dead link to the request screen with an honest reason', () => {
    expect(expiredLinkPath()).toBe('/reset-password?reason=expired');
  });

  it('exempts exactly the paths the gate must not block', () => {
    expect(isRecoveryExemptPath(RESET_CONFIRM_PATH)).toBe(true);
    expect(isRecoveryExemptPath('/api/auth/recovery')).toBe(true);
    expect(isRecoveryExemptPath('/login')).toBe(true);
    expect(isRecoveryExemptPath('/dashboard')).toBe(false);
    // The request screen is deliberately NOT exempt: mid-recovery there is
    // one place to be, and asking for another link from there would only
    // invalidate the link already in play.
    expect(isRecoveryExemptPath('/reset-password')).toBe(false);
  });
});

/**
 * Real tokens, real GoTrue. generateLink is the admin-side equivalent of the
 * email a member receives: it mints exactly the same one-time recovery token
 * without sending mail, so the link can be redeemed here the way the browser
 * would redeem it.
 */
describe('a real recovery link', () => {
  const member = TEST_USERS.memberOne;
  const NEW_PASSWORD = 'RecoveredPassword456!';

  afterAll(async () => {
    // Put the shared fixture back exactly as the seed left it. Every other
    // test file signs in as this member.
    const admin = serviceRoleClient();
    await admin.auth.admin.updateUserById(member.id, { password: member.password });
  });

  async function mintRecoveryToken(): Promise<string> {
    const admin = serviceRoleClient();
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: member.email,
      options: { redirectTo: recoveryRedirectTo('http://localhost:3000') },
    });
    expect(error).toBeNull();
    return data.properties!.hashed_token;
  }

  it('redeems into a real session, which is what the confirm screen needs', async () => {
    const client = anonClient();
    const { data, error } = await client.auth.verifyOtp({
      type: 'recovery',
      token_hash: await mintRecoveryToken(),
    });

    expect(error).toBeNull();
    expect(data.session).not.toBeNull();
    expect(data.user?.id).toBe(member.id);
  });

  it('sets the new password, and the old one stops working', async () => {
    const client = anonClient();
    const { error: verifyError } = await client.auth.verifyOtp({
      type: 'recovery',
      token_hash: await mintRecoveryToken(),
    });
    expect(verifyError).toBeNull();

    const { error: updateError } = await client.auth.updateUser({ password: NEW_PASSWORD });
    expect(updateError).toBeNull();

    // The old password is dead.
    const { error: oldError } = await anonClient().auth.signInWithPassword({
      email: member.email,
      password: member.password,
    });
    expect(oldError).not.toBeNull();

    // The new one works.
    const { data: newData, error: newError } = await anonClient().auth.signInWithPassword({
      email: member.email,
      password: NEW_PASSWORD,
    });
    expect(newError).toBeNull();
    expect(newData.user?.id).toBe(member.id);
  });

  /**
   * The expired-link path, proven rather than asserted. A link that has
   * already been redeemed is refused on the second attempt, which is exactly
   * what the confirm screen turns into "This link has expired" plus a button
   * to request a fresh one.
   */
  it('cannot be redeemed twice', async () => {
    const tokenHash = await mintRecoveryToken();

    const first = await anonClient().auth.verifyOtp({ type: 'recovery', token_hash: tokenHash });
    expect(first.error).toBeNull();

    const second = await anonClient().auth.verifyOtp({ type: 'recovery', token_hash: tokenHash });
    expect(second.error).not.toBeNull();
    expect(second.data.session).toBeNull();
  });

  it('refuses a token that was never issued', async () => {
    const { error } = await anonClient().auth.verifyOtp({
      type: 'recovery',
      token_hash: 'not-a-real-token-hash',
    });
    expect(error).not.toBeNull();
  });

  /**
   * The recovery session is an ordinary session as far as the database is
   * concerned, which is precisely why the app needs its own marker cookie to
   * tell the two apart. If this ever started failing, the middleware gate
   * would be the only thing standing between a reset link and a silent
   * sign-in, so it is worth stating outright.
   */
  it('is indistinguishable from a normal session to the database', async () => {
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await client.auth.verifyOtp({ type: 'recovery', token_hash: await mintRecoveryToken() });

    const { data, error } = await client
      .from('profiles')
      .select('id')
      .eq('id', member.id)
      .single();

    expect(error).toBeNull();
    expect(data?.id).toBe(member.id);
  });
});
