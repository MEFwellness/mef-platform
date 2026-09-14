// @vitest-environment jsdom
/**
 * THE FIFTH AND LAST FIX FOR ONE BUG: SIGN-IN HAS NO BOT CHECK.
 *
 * ===================================================================
 * WHAT KEPT HAPPENING
 * ===================================================================
 *
 * A member typed a correct email and a correct password, pressed Log in,
 * and read "We could not confirm that in time. Please try again." It was
 * reported four separate times from real phones. Four fixes shipped, all
 * of them aimed at making Cloudflare's challenge finish sooner: preloading
 * the script during page parse, keeping the token re-armed across
 * backgrounding, retrying once with a genuinely fresh token, topping up
 * instead of restarting the challenge. Each one made the window smaller.
 * None of them could close it, because a sign-in gated on a third party's
 * round trip fails whenever that round trip is slow, and on a phone on a
 * weak connection it is slow.
 *
 * So the fifth fix deleted the gate rather than tuning it. This suite is
 * what stops it coming back.
 *
 * ===================================================================
 * THE FOUR PROPERTIES
 * ===================================================================
 *
 *   1. A sign-in request reaches Supabase with no captcha token in it, and
 *      no screen on the sign-in path loads anything from Cloudflare.
 *   2. A wrong password says the email or the password is wrong, in those
 *      words, and never anything about confirming or security checks.
 *   3. Several wrong passwords in a row earn a short, visible pause, and a
 *      failure that was NOT about what she typed never advances it.
 *   4. Signup still refuses a request with no valid token, on the server,
 *      because that is where the check went.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  COOLDOWN_STEPS_S,
  FAILURES_BEFORE_COOLDOWN,
  IDLE_THROTTLE,
  cooldownMessage,
  cooldownSecondsFor,
  isCoolingDown,
  isWrongCredentials,
  recordFailure,
  secondsRemaining,
} from '../lib/auth/loginThrottle';
import { getFriendlyAuthError } from '../lib/auth/errors';
import { TURNSTILE_UNVERIFIED_MESSAGE } from '../lib/turnstile/env';
import {
  HUMAN_CHECK_REFUSED_ERROR,
  HUMAN_CHECK_UNREACHABLE_ERROR,
  TURNSTILE_SITEVERIFY_URL,
  isTurnstileVerifiedHere,
  verifyTurnstileToken,
} from '../lib/turnstile/verify';
import { isCaptchaError } from '../lib/turnstile/captcha';
import { isCaptchaRefusal, isTransientFailure } from '../lib/turnstile/submit';

const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** The dead sentence. It must not exist anywhere a member can reach it. */
const DEAD_PHRASE = 'could not confirm that in time';

// ---------------------------------------------------------------------------
// 1. A valid sign-in, with no token anywhere near it
// ---------------------------------------------------------------------------

/**
 * Runs a Supabase auth call against a stubbed fetch and hands back what was
 * actually transmitted. The claim being checked is about the request
 * Supabase receives, which is the only place it can honestly be checked.
 */
async function capturedSignIn(
  call: (client: SupabaseClient) => Promise<unknown>
): Promise<{ body: Record<string, unknown>; url: string }> {
  let body: Record<string, unknown> | null = null;
  let url = '';
  const client = createClient('https://stub.supabase.co', 'stub-anon-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        url = String(input);
        body = JSON.parse(String(init?.body ?? '{}'));
        return new Response(
          JSON.stringify({
            access_token: 'stub',
            token_type: 'bearer',
            expires_in: 3600,
            refresh_token: 'stub',
            user: { id: 'stub-user', email: 'someone@example.test' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      },
    },
  });
  await call(client);
  if (body === null) throw new Error('no request was made');
  return { body, url };
}

describe('a sign-in that succeeds carries no bot-check token', () => {
  it('puts nothing about a captcha on the wire', async () => {
    const { body, url } = await capturedSignIn((c) =>
      c.auth.signInWithPassword({ email: 'someone@example.test', password: 'correct-horse' })
    );
    expect(url).toContain('grant_type=password');
    expect(JSON.stringify(body)).not.toContain('captcha');
    // supabase-js always includes the envelope; what matters is that it is
    // empty, because that is exactly the request GoTrue received before
    // this app ever heard of Cloudflare.
    expect(body.gotrue_meta_security).toEqual({});
  });

  it('succeeds with a token-free request, which is the whole fix', async () => {
    const { body } = await capturedSignIn((c) =>
      c.auth.signInWithPassword({ email: 'someone@example.test', password: 'correct-horse' })
    );
    expect(body).toMatchObject({ email: 'someone@example.test', password: 'correct-horse' });
    expect(Object.keys(body).sort()).toEqual(['email', 'gotrue_meta_security', 'password']);
  });

  it('the sign-in action reads no token and passes no captcha option', () => {
    const source = read('app/actions/auth.ts');
    const signIn = source.slice(
      source.indexOf('export async function signIn('),
      source.indexOf('export async function completePasskeyLogin')
    );
    expect(signIn).not.toContain('readCaptchaToken');
    expect(signIn).not.toContain('captchaOptions');
    expect(signIn).not.toContain('captchaToken');
  });
});

describe('the sign-in screens load nothing from a third party', () => {
  it('the login form has no widget, no preload and no submit wrapper', () => {
    const source = read('app/(auth)/login/page.tsx');
    expect(source).not.toContain('TurnstileGate');
    expect(source).not.toContain('TurnstilePreload');
    expect(source).not.toContain('submitWithFreshCaptcha');
    expect(source).not.toContain('CAPTCHA_TOKEN_FIELD');
    // The one call it makes is the plain Server Action.
    expect(source).toContain('await signIn(formData)');
  });

  it('the shared auth layout no longer preloads Cloudflare onto /login', () => {
    expect(read('app/(auth)/layout.tsx')).not.toContain('<TurnstilePreload />');
  });

  it('Face ID sign-in asks for no token either', () => {
    const source = read('components/auth/PasskeyLoginButton.tsx');
    expect(source).not.toContain('TurnstileHandle');
    expect(source).not.toContain('captchaToken');
    expect(source).toContain('signInWithPasskey()');
  });

  it('the signed-in change-password form dropped its widget too', () => {
    const source = read('app/account/password/ChangePasswordForm.tsx');
    expect(source).not.toContain('<TurnstileGate');
    expect(source).not.toContain('submitWithFreshCaptcha');
    expect(read('app/account/password/page.tsx')).not.toContain('<TurnstilePreload />');
  });
});

// ---------------------------------------------------------------------------
// 2. What a wrong password says
// ---------------------------------------------------------------------------

describe('a wrong password', () => {
  it('says the email or the password is incorrect, in plain words', () => {
    expect(getFriendlyAuthError('Invalid login credentials')).toBe('Incorrect email or password.');
  });

  it('says the same thing on the login screen, which shows raw text on fallback', () => {
    const shown = getFriendlyAuthError('Invalid login credentials', {
      includeRawOnFallback: true,
      fallbackPrefix: 'Sign in failed',
    });
    expect(shown).toBe('Incorrect email or password.');
    expect(shown).not.toContain('Sign in failed');
  });

  it('never mentions confirming, security checks, bots or tokens', () => {
    const shown = getFriendlyAuthError('Invalid login credentials');
    const lower = shown.toLowerCase();
    expect(lower).not.toContain('confirm');
    expect(lower).not.toContain('security check');
    expect(lower).not.toContain('captcha');
    expect(lower).not.toContain('token');
    expect(shown).not.toContain('—');
  });

  it('the dead sentence is gone from the app entirely, copy and code', () => {
    // Not just from the login screen: from every file that could put it in
    // front of anybody. Comments and historical notes are allowed to
    // quote it (that is how the bug stays explained), so this walks the
    // string literals the app can actually render.
    expect(TURNSTILE_UNVERIFIED_MESSAGE.toLowerCase()).not.toContain(DEAD_PHRASE);
    for (const file of [
      'app/(auth)/login/page.tsx',
      'app/(auth)/signup/page.tsx',
      'lib/auth/errors.ts',
      'lib/auth/loginThrottle.ts',
      'lib/passkey/errors.ts',
    ]) {
      expect(read(file).toLowerCase()).not.toContain(DEAD_PHRASE);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. The cooldown after repeated wrong passwords
// ---------------------------------------------------------------------------

describe('repeated wrong passwords earn a short pause', () => {
  const T0 = 1_700_000_000_000;

  const afterFailures = (count: number, now = T0) => {
    let state = IDLE_THROTTLE;
    for (let i = 0; i < count; i += 1) state = recordFailure(state, now);
    return state;
  };

  it('lets her try a normal number of times without any pause at all', () => {
    for (let i = 1; i < FAILURES_BEFORE_COOLDOWN; i += 1) {
      const state = afterFailures(i);
      expect(isCoolingDown(state, T0)).toBe(false);
      expect(cooldownSecondsFor(i)).toBe(0);
    }
  });

  it('pauses on the fifth wrong answer in a row', () => {
    const state = afterFailures(FAILURES_BEFORE_COOLDOWN);
    expect(isCoolingDown(state, T0)).toBe(true);
    expect(secondsRemaining(state, T0)).toBe(COOLDOWN_STEPS_S[0]);
  });

  it('makes each further failure wait longer, and then stops growing', () => {
    expect(cooldownSecondsFor(5)).toBe(15);
    expect(cooldownSecondsFor(6)).toBe(30);
    expect(cooldownSecondsFor(7)).toBe(60);
    expect(cooldownSecondsFor(20)).toBe(60);
    expect(cooldownSecondsFor(200)).toBe(60);
  });

  it('reopens on its own once the time has passed', () => {
    const state = afterFailures(FAILURES_BEFORE_COOLDOWN);
    expect(isCoolingDown(state, T0 + 14_000)).toBe(true);
    expect(isCoolingDown(state, T0 + 15_001)).toBe(false);
    expect(secondsRemaining(state, T0 + 15_001)).toBe(0);
  });

  it('counts down in whole seconds and never shows zero while it is still shut', () => {
    const state = afterFailures(FAILURES_BEFORE_COOLDOWN);
    expect(secondsRemaining(state, T0 + 1)).toBe(15);
    expect(secondsRemaining(state, T0 + 14_500)).toBe(1);
  });

  it('only a wrong email or password advances it, never an outage', () => {
    expect(isWrongCredentials('Invalid login credentials')).toBe(true);
    expect(isWrongCredentials('invalid login credentials')).toBe(true);
    // Everything that is the service having a problem rather than an answer
    // about what she typed.
    expect(isWrongCredentials('{}')).toBe(false);
    expect(isWrongCredentials('fetch failed')).toBe(false);
    expect(
      isWrongCredentials('For security purposes, you can only request this after 57 seconds')
    ).toBe(false);
    expect(isWrongCredentials('Email not confirmed')).toBe(false);
    expect(isWrongCredentials(null)).toBe(false);
  });

  it('the login screen advances it only on a wrong credential', () => {
    const source = read('app/(auth)/login/page.tsx');
    expect(source).toContain('isWrongCredentials(result.error)');
    expect(source).toContain('recordFailure(');
    // And refuses to submit while it is running, rather than only dimming
    // the button, because a keyboard Enter does not read a CSS class.
    expect(source).toContain('if (secondsRemaining(throttle, Date.now()) > 0) return;');
  });

  it('says how long, and points at the thing that actually solves it', () => {
    const message = cooldownMessage(30);
    expect(message).toContain('30 seconds');
    expect(message.toLowerCase()).toContain('reset your password');
    expect(message).not.toContain('—');
  });

  it('says "second", not "seconds", when there is one left', () => {
    expect(cooldownMessage(1)).toContain('1 second');
    expect(cooldownMessage(1)).not.toContain('1 seconds');
  });
});

// ---------------------------------------------------------------------------
// 4. Signup is still protected, and it is protected HERE
// ---------------------------------------------------------------------------

describe('signup still enforces the bot check, on our own server', () => {
  const SECRET = 'test-secret-not-a-real-key';

  const siteverify = (payload: unknown, status = 200) =>
    vi.fn(
      async () =>
        new Response(JSON.stringify(payload), {
          status,
          headers: { 'content-type': 'application/json' },
        })
    ) as unknown as typeof fetch;

  it('accepts a token Cloudflare vouches for', async () => {
    const fetchImpl = siteverify({ success: true });
    const check = await verifyTurnstileToken('a-real-token', { secret: SECRET, fetchImpl });
    expect(check).toEqual({ ok: true, reason: 'ok' });
  });

  it('asks Cloudflare with the secret and the token, and nothing else', async () => {
    const fetchImpl = siteverify({ success: true });
    await verifyTurnstileToken('a-real-token', { secret: SECRET, fetchImpl });
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe(TURNSTILE_SITEVERIFY_URL);
    expect((init as RequestInit).method).toBe('POST');
    const sent = new URLSearchParams(String((init as RequestInit).body));
    expect(sent.get('secret')).toBe(SECRET);
    expect(sent.get('response')).toBe('a-real-token');
  });

  it('refuses a request that carries no token at all', async () => {
    const fetchImpl = siteverify({ success: true });
    expect(await verifyTurnstileToken(undefined, { secret: SECRET, fetchImpl })).toEqual({
      ok: false,
      reason: 'missing',
    });
    expect(await verifyTurnstileToken('   ', { secret: SECRET, fetchImpl })).toEqual({
      ok: false,
      reason: 'missing',
    });
    // A hand-made POST never even reaches Cloudflare.
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a token Cloudflare rejects', async () => {
    const fetchImpl = siteverify({ success: false, 'error-codes': ['invalid-input-response'] });
    expect(await verifyTurnstileToken('forged', { secret: SECRET, fetchImpl })).toEqual({
      ok: false,
      reason: 'rejected',
    });
  });

  it('calls Cloudflare failing to answer "unreachable", not "refused"', async () => {
    const dead = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    expect(await verifyTurnstileToken('a-real-token', { secret: SECRET, fetchImpl: dead })).toEqual(
      {
        ok: false,
        reason: 'unreachable',
      }
    );
    const fiveHundred = siteverify({}, 503);
    expect(
      await verifyTurnstileToken('a-real-token', { secret: SECRET, fetchImpl: fiveHundred })
    ).toEqual({ ok: false, reason: 'unreachable' });
  });

  it('gives up rather than hanging a member on a Cloudflare that never answers', async () => {
    const hangs = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        })
    ) as unknown as typeof fetch;
    const check = await verifyTurnstileToken('a-real-token', {
      secret: SECRET,
      fetchImpl: hangs,
      timeoutMs: 20,
    });
    expect(check).toEqual({ ok: false, reason: 'unreachable' });
  });

  it('proceeds, loudly, when no secret key is configured', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const check = await verifyTurnstileToken(undefined, { secret: null });
    expect(check).toEqual({ ok: true, reason: 'unconfigured' });
    warn.mockRestore();
  });

  describe('reading the secret from the environment', () => {
    let original: string | undefined;
    beforeEach(() => {
      original = process.env.TURNSTILE_SECRET_KEY;
    });
    afterEach(() => {
      if (original === undefined) delete process.env.TURNSTILE_SECRET_KEY;
      else process.env.TURNSTILE_SECRET_KEY = original;
    });

    it('treats a blank value as unset, not as a key', () => {
      process.env.TURNSTILE_SECRET_KEY = '   ';
      expect(isTurnstileVerifiedHere()).toBe(false);
      process.env.TURNSTILE_SECRET_KEY = 'something';
      expect(isTurnstileVerifiedHere()).toBe(true);
    });
  });

  it('runs the check BEFORE Supabase is touched, so a refusal creates nothing', () => {
    const source = read('app/actions/auth.ts');
    const signUp = source.slice(
      source.indexOf('export async function signUp('),
      source.indexOf('EVERYTHING HER ARRIVAL PRODUCED')
    );
    const gate = signUp.indexOf('humanCheckFailure(captchaToken)');
    const call = signUp.indexOf('supabase.auth.signUp(');
    expect(gate).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(call);
    // And it no longer hands the token to Supabase, which is not checking
    // it any more.
    expect(signUp).not.toContain('captchaOptions');
  });

  it('protects every anonymous endpoint that creates a row or sends mail', () => {
    const source = read('app/actions/auth.ts');
    for (const action of [
      'export async function signUp(',
      'export async function resendVerificationEmail(',
      'export async function requestPasswordReset(',
    ]) {
      const start = source.indexOf(action);
      expect(start).toBeGreaterThan(-1);
      // The gate is within the opening lines of the action, before any
      // Supabase call it makes.
      const body = source.slice(start, start + 1400);
      expect(body).toContain('humanCheckFailure(');
    }
  });

  it('leaves the two sign-in-shaped actions alone, which is the point', () => {
    const source = read('app/actions/auth.ts');
    for (const [action, next] of [
      ['export async function signIn(', 'export async function completePasskeyLogin'],
      ['export async function changePassword(', ''],
    ] as const) {
      const start = source.indexOf(action);
      const end = next ? source.indexOf(next) : source.length;
      const body = source.slice(start, end === -1 ? source.length : end);
      expect(body).not.toContain('humanCheckFailure(');
    }
  });

  it('a refusal is still auto-retried once and still shows calm copy', () => {
    // The error strings the server returns are deliberately shaped so the
    // machinery that was already right about retries keeps working.
    expect(isCaptchaError(HUMAN_CHECK_REFUSED_ERROR)).toBe(true);
    expect(isCaptchaRefusal({ error: HUMAN_CHECK_REFUSED_ERROR })).toBe(true);
    expect(getFriendlyAuthError(HUMAN_CHECK_REFUSED_ERROR)).toBe(TURNSTILE_UNVERIFIED_MESSAGE);
    expect(
      getFriendlyAuthError(HUMAN_CHECK_UNREACHABLE_ERROR, {
        includeRawOnFallback: true,
        fallbackPrefix: 'Account creation failed',
      })
    ).toBe(TURNSTILE_UNVERIFIED_MESSAGE);
    // A Cloudflare that did not answer is retried as a transient failure,
    // so a member reads nothing at all about the first attempt.
    expect(isTransientFailure({ error: HUMAN_CHECK_UNREACHABLE_ERROR, retryable: true })).toBe(
      true
    );
  });

  it('the signup form still renders the widget and still preloads it', () => {
    const form = read('app/(auth)/signup/page.tsx');
    expect(form).toContain('<TurnstileGate ref=');
    expect(form).toContain('submitWithFreshCaptcha(');
    // Preloaded from a server layout, so the challenge starts during parse
    // rather than after hydration. It moved here out of the shared auth
    // layout when /login stopped carrying a widget.
    expect(read('app/(auth)/signup/layout.tsx')).toContain('<TurnstilePreload />');
  });
});
