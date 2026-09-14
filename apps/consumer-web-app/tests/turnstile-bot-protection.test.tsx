/**
 * Bot and spam protection on the auth screens (Cloudflare Turnstile).
 *
 * REVISED 2026-09-14, AND THE REVISION IS THE POINT. Supabase's captcha
 * setting is one project-wide switch, so protecting signup also protected
 * SIGN-IN, and sign-in is where it kept refusing members who had typed a
 * correct password. The switch is off now and the check runs in
 * lib/turnstile/verify.ts instead, on the three anonymous endpoints that
 * create an account or send mail. tests/login-without-captcha.test.tsx
 * holds the sign-in half. This file holds the rest.
 *
 * This ships dormant, so the property that actually matters is not "the
 * token is sent" but "nothing changes until a site key exists". Both are
 * asserted here, and the important ones are asserted against real output
 * rather than reasoned about:
 *
 *  - the widget is rendered for real through react-dom/server, and the
 *    dormant case is proved by an empty string of HTML, not by reading the
 *    source;
 *  - the request supabase-js actually puts on the wire is captured with a
 *    stubbed fetch, so "dormant means byte-identical" is a comparison of
 *    two real request bodies rather than a claim about an options object.
 *
 * There is also a sweep, with no exceptions list, over every form whose
 * submission creates an account or sends mail. A new one of those that
 * forgets the widget fails this suite instead of failing live.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  CAPTCHA_TOKEN_FIELD,
  captchaOptions,
  isCaptchaError,
  readCaptchaToken,
} from '../lib/turnstile/captcha';
import {
  TURNSTILE_UNVERIFIED_MESSAGE,
  getTurnstileSiteKey,
  isTurnstileConfigured,
} from '../lib/turnstile/env';
import { TurnstileGate } from '../components/auth/TurnstileGate';
import { getFriendlyAuthError } from '../lib/auth/errors';
import { getFriendlyPasskeyError } from '../lib/passkey/errors';

const ROOT = path.resolve(__dirname, '..');
const ENV_VAR = 'NEXT_PUBLIC_TURNSTILE_SITE_KEY';

/** The real key this build was given, used so the tests exercise its shape. */
const SITE_KEY = '0x4AAAAAAETHfqmHDbl52GiI';

let originalKey: string | undefined;

beforeEach(() => {
  originalKey = process.env[ENV_VAR];
  delete process.env[ENV_VAR];
});

afterEach(() => {
  if (originalKey === undefined) delete process.env[ENV_VAR];
  else process.env[ENV_VAR] = originalKey;
});

// ---------------------------------------------------------------------------
// Dormant: the state this ships in
// ---------------------------------------------------------------------------

describe('dormant mode (no site key configured)', () => {
  it('reports itself unconfigured', () => {
    expect(getTurnstileSiteKey()).toBeNull();
    expect(isTurnstileConfigured()).toBe(false);
  });

  it('treats a blank or whitespace-only key as unset, not as a key', () => {
    process.env[ENV_VAR] = '';
    expect(isTurnstileConfigured()).toBe(false);
    process.env[ENV_VAR] = '   ';
    expect(isTurnstileConfigured()).toBe(false);
  });

  it('renders literally nothing: no widget, no script, no hidden field', () => {
    const html = renderToStaticMarkup(<TurnstileGate />);
    expect(html).toBe('');
  });

  it('contributes no options to a Supabase call', () => {
    expect(captchaOptions(undefined)).toEqual({});
    expect(captchaOptions(null)).toEqual({});
    expect(Object.keys(captchaOptions(undefined))).toHaveLength(0);
  });

  it('reads no token from a form that never carried one', () => {
    expect(readCaptchaToken(new FormData())).toBeUndefined();
  });

  it('never turns an empty field into an empty-string token', () => {
    // An empty string would reach GoTrue as a present-but-invalid token and
    // be refused, which is strictly worse than sending nothing.
    const form = new FormData();
    form.set(CAPTCHA_TOKEN_FIELD, '');
    expect(readCaptchaToken(form)).toBeUndefined();
    form.set(CAPTCHA_TOKEN_FIELD, '   ');
    expect(readCaptchaToken(form)).toBeUndefined();
    expect(captchaOptions('')).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Configured: the widget appears and a token is read
// ---------------------------------------------------------------------------

describe('configured mode (site key present)', () => {
  beforeEach(() => {
    process.env[ENV_VAR] = SITE_KEY;
  });

  it('reports itself configured and returns the key', () => {
    expect(getTurnstileSiteKey()).toBe(SITE_KEY);
    expect(isTurnstileConfigured()).toBe(true);
  });

  it('renders a container for the widget to mount into', () => {
    const html = renderToStaticMarkup(<TurnstileGate />);
    expect(html).not.toBe('');
    expect(html).toContain('turnstile-gate');
  });

  it('draws no chrome of its own around the container', () => {
    // The live run that caught this: a headless browser was correctly
    // refused by Turnstile, Cloudflare's challenge painted nothing into the
    // container, and any card or caption this component had drawn on the
    // strength of "a challenge is coming" would have been a labelled empty
    // box on every auth screen. The container is only ever a container.
    const html = renderToStaticMarkup(<TurnstileGate />);
    expect(html).not.toContain('One quick check');
    expect(html).not.toMatch(/\bborder-\[/);
    expect(html).not.toMatch(/\bbg-\[/);
    // Empty means genuinely absent, not an empty box taking up space.
    expect(html).toContain('empty:hidden');
    // Exactly one element, with nothing inside it: there is no wrapper that
    // could survive Cloudflare rendering nothing.
    expect(html.match(/<div/g)).toHaveLength(1);
    expect(html).toMatch(/><\/div>$/);
  });

  it('reads the token a form carries', () => {
    const form = new FormData();
    form.set(CAPTCHA_TOKEN_FIELD, 'a-real-looking-token');
    expect(readCaptchaToken(form)).toBe('a-real-looking-token');
    expect(captchaOptions('a-real-looking-token')).toEqual({
      captchaToken: 'a-real-looking-token',
    });
  });
});

// ---------------------------------------------------------------------------
// The wire: what supabase-js actually sends, both ways
// ---------------------------------------------------------------------------

/**
 * Runs a Supabase auth call against a stubbed fetch and hands back the JSON
 * body that was actually transmitted. This is the only place the dormant
 * promise can honestly be checked: the claim is about the request Supabase
 * receives, not about the arguments this app passes.
 */
async function capturedRequestBody(
  call: (client: SupabaseClient) => Promise<unknown>
): Promise<Record<string, unknown>> {
  let captured: Record<string, unknown> | null = null;
  const client = createClient('https://stub.supabase.co', 'stub-anon-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
        captured = JSON.parse(String(init?.body ?? '{}'));
        return new Response(JSON.stringify({ error: 'stub', error_description: 'stub' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      },
    },
  });
  await call(client);
  if (captured === null) throw new Error('no request was made');
  return captured;
}

describe('what reaches Supabase', () => {
  it('sends no captcha field at all when there is no token', async () => {
    const body = await capturedRequestBody((c) =>
      c.auth.signInWithPassword({
        email: 'someone@example.test',
        password: 'whatever',
        options: captchaOptions(undefined),
      })
    );
    expect(JSON.stringify(body)).not.toContain('captcha_token');
  });

  it('sends a request byte-identical to the one it sent before this feature existed', async () => {
    const withHelper = await capturedRequestBody((c) =>
      c.auth.signInWithPassword({
        email: 'someone@example.test',
        password: 'whatever',
        options: captchaOptions(undefined),
      })
    );
    const asItWasBefore = await capturedRequestBody((c) =>
      c.auth.signInWithPassword({ email: 'someone@example.test', password: 'whatever' })
    );
    expect(JSON.stringify(withHelper)).toBe(JSON.stringify(asItWasBefore));
  });

  it('carries NOTHING on sign-in, however much the app is holding', async () => {
    // The one endpoint that must never grow a token again. Four fixes were
    // spent trying to make one arrive here in time; the fifth took the
    // requirement away. See tests/login-without-captcha.test.tsx.
    const body = await capturedRequestBody((c) =>
      c.auth.signInWithPassword({ email: 'someone@example.test', password: 'whatever' })
    );
    expect(JSON.stringify(body)).not.toContain('captcha');
  });

  it('sends no token to Supabase on signup either, because Supabase stopped checking', async () => {
    // The token is spent against Cloudflare in lib/turnstile/verify.ts,
    // before this call is made at all. Forwarding it here as well would be
    // re-arming the project-wide switch by accident the day somebody turns
    // it back on.
    const body = await capturedRequestBody((c) =>
      c.auth.signUp({
        email: 'someone@example.test',
        password: 'whatever',
        options: {
          emailRedirectTo: 'https://app.mefwellness.com/api/auth/callback',
          data: { timezone: 'America/New_York' },
        },
      })
    );
    expect(JSON.stringify(body)).not.toContain('captcha');
    // ...and everything signup always sent is untouched.
    expect(body).toMatchObject({ data: { timezone: 'America/New_York' } });
  });

  it('the helper is still correct for anybody who does pass a token', async () => {
    // captchaOptions() is no longer called by any action, but it is the
    // one definition of "how a token would ride", and the dormant-mode
    // guarantees above are stated in terms of it.
    const body = await capturedRequestBody((c) =>
      c.auth.signInWithPassword({
        email: 'someone@example.test',
        password: 'whatever',
        options: captchaOptions('tok-if-ever-needed'),
      })
    );
    expect(body).toMatchObject({ gotrue_meta_security: { captcha_token: 'tok-if-ever-needed' } });
  });

  it('no auth action forwards a token to Supabase any more', () => {
    const source = fs.readFileSync(path.join(ROOT, 'app/actions/auth.ts'), 'utf8');
    expect(source).not.toContain('captchaOptions(');
  });
});

// ---------------------------------------------------------------------------
// What a member is told when the check refuses them
// ---------------------------------------------------------------------------

describe('the refusal message', () => {
  it('recognises the wordings GoTrue uses for a refused captcha', () => {
    expect(isCaptchaError('captcha protection: request disallowed (invalid-input-response)')).toBe(
      true
    );
    expect(isCaptchaError('captcha verification process failed')).toBe(true);
    expect(isCaptchaError('Captcha Protection: request disallowed')).toBe(true);
    expect(isCaptchaError('Invalid login credentials')).toBe(false);
    expect(isCaptchaError(null)).toBe(false);
  });

  it('replaces the raw error with calm human copy', () => {
    expect(getFriendlyAuthError('captcha protection: request disallowed')).toBe(
      TURNSTILE_UNVERIFIED_MESSAGE
    );
  });

  it('does not leak the raw text on the one screen that shows raw text', () => {
    // Signup opts into showing GoTrue's own message when nothing matches.
    // A captcha refusal must be matched before it can reach that fallback.
    const shown = getFriendlyAuthError(
      'captcha protection: request disallowed (invalid-input-response)',
      { includeRawOnFallback: true, fallbackPrefix: 'Account creation failed' }
    );
    expect(shown).toBe(TURNSTILE_UNVERIFIED_MESSAGE);
    expect(shown).not.toContain('invalid-input-response');
    expect(shown).not.toContain('captcha');
  });

  it('says the same thing when Face ID is the method that was refused', () => {
    expect(getFriendlyPasskeyError({ message: 'captcha protection: request disallowed' })).toBe(
      TURNSTILE_UNVERIFIED_MESSAGE
    );
  });

  it('is plain language: no jargon, no em dashes, no raw error shape', () => {
    expect(TURNSTILE_UNVERIFIED_MESSAGE).not.toContain('—');
    expect(TURNSTILE_UNVERIFIED_MESSAGE.toLowerCase()).not.toContain('captcha');
    expect(TURNSTILE_UNVERIFIED_MESSAGE.toLowerCase()).not.toContain('token');
    expect(TURNSTILE_UNVERIFIED_MESSAGE.toLowerCase()).not.toContain('cloudflare');
    expect(TURNSTILE_UNVERIFIED_MESSAGE.toLowerCase()).not.toContain('bot');
  });
});

// ---------------------------------------------------------------------------
// The sweep: every protected form carries the widget
// ---------------------------------------------------------------------------

/**
 * Every screen whose submission creates an account or sends mail to an
 * address a stranger typed. Deliberately a hand-written list of the files
 * rather than a grep: the point is that adding a new anonymous auth screen
 * should require thinking about this, and a list is the thing that makes
 * forgetting visible.
 *
 * SIGN-IN IS NOT ON IT, AND NEITHER IS CHANGE PASSWORD. Sign-in creates
 * nothing and sends nothing, and change-password needs a live session
 * before it can be reached at all. They were on this list only because
 * Supabase's single project-wide switch covered the endpoint they share,
 * and being on it is what made correct passwords fail. See
 * tests/login-without-captcha.test.tsx.
 */
const PROTECTED_FORMS = [
  'app/(auth)/signup/page.tsx',
  'app/(auth)/reset-password/ResetPasswordForm.tsx',
  'app/(auth)/verify/page.tsx',
];

/** And these must NOT carry one. */
const UNPROTECTED_FORMS = [
  'app/(auth)/login/page.tsx',
  'app/account/password/ChangePasswordForm.tsx',
];

describe('every captcha-protected form', () => {
  for (const file of PROTECTED_FORMS) {
    it(`${file} renders the widget and spends its token`, () => {
      const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
      expect(source).toContain('<TurnstileGate ref=');
      // Every protected form submits through the shared helper, which is
      // what reads a FRESH token, retries a refused check once with a
      // genuinely new one, and replaces the spent single-use token
      // afterwards. A form that rolls its own token handling reintroduces
      // the 2026-09-05 signup failure one screen at a time.
      expect(source).toContain('submitWithFreshCaptcha(');
      expect(source).toContain("from '@/lib/turnstile/submit'");
      // ...and none of them still does it by hand.
      expect(source).not.toContain('turnstileRef.current?.getToken()');
      expect(source).not.toContain('turnstileRef.current?.reset()');
    });
  }

  for (const file of UNPROTECTED_FORMS) {
    it(`${file} carries no widget, and must not grow one`, () => {
      const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
      expect(source).not.toContain('<TurnstileGate');
      expect(source).not.toContain('submitWithFreshCaptcha(');
    });
  }

  it('change-password no longer forwards a token to the sign-in call it makes', () => {
    const source = fs.readFileSync(path.join(ROOT, 'app/actions/auth.ts'), 'utf8');
    const changePassword = source.slice(source.indexOf('export async function changePassword'));
    expect(changePassword).not.toContain('captchaOptions');
    expect(changePassword).not.toContain('captchaToken');
  });
});

// ---------------------------------------------------------------------------
// The secret key never enters this repository
// ---------------------------------------------------------------------------

describe('secret key containment', () => {
  it('exactly one module reads the Turnstile secret key', () => {
    // It used to be none: the secret lived only in the Supabase dashboard.
    // The dashboard switch had to be turned off (it covered sign-in, which
    // is the bug), so this app verifies tokens itself now and therefore
    // needs the secret. One module reads it, from the environment, and it
    // is a server module: nothing under components/ and nothing carrying
    // 'use client' may ever touch it, because a NEXT_PUBLIC-style leak of
    // THIS key would let anybody mint verdicts.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '.next' || entry.name.startsWith('.git'))
          continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx|mjs|js)$/.test(entry.name)) continue;
        const text = fs.readFileSync(full, 'utf8');
        if (/process\.env\.TURNSTILE_SECRET_KEY/.test(text)) {
          offenders.push(path.relative(ROOT, full));
        }
      }
    };
    walk(path.join(ROOT, 'lib'));
    walk(path.join(ROOT, 'app'));
    walk(path.join(ROOT, 'components'));
    expect(offenders).toEqual(['lib/turnstile/verify.ts']);
  });

  it('that module is never pulled into a browser bundle', () => {
    const verify = fs.readFileSync(path.join(ROOT, 'lib/turnstile/verify.ts'), 'utf8');
    expect(verify).not.toContain("'use client'");
    // Reached only from Server Actions, which is what keeps the secret on
    // the server. A client component importing it would ship it.
    const importers: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '.next') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        const text = fs.readFileSync(full, 'utf8');
        // A real import, not a file that merely names it in a comment.
        const imports = /from\s+['"](?:@\/lib\/turnstile\/verify|\.\/verify|\.\.\/turnstile\/verify)['"]/.test(
          text
        );
        if (!imports) continue;
        if (/^\s*['"]use client['"]/m.test(text)) importers.push(path.relative(ROOT, full));
      }
    };
    walk(path.join(ROOT, 'lib'));
    walk(path.join(ROOT, 'app'));
    walk(path.join(ROOT, 'components'));
    expect(importers).toEqual([]);
  });

  it('no source file carries a secret key literal', () => {
    const verify = fs.readFileSync(path.join(ROOT, 'lib/turnstile/verify.ts'), 'utf8');
    // Cloudflare secret keys are '0x4AAA...' shaped, same as site keys.
    // The site key is public and appears in tests; a secret must only ever
    // arrive through the environment.
    expect(verify).not.toMatch(/secret\s*=\s*['"]0x/);
  });
});
