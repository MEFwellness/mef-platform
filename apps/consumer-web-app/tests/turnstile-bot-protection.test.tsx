/**
 * Bot and spam protection on the auth screens (Cloudflare Turnstile).
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
 * There is also a sweep, with no exceptions list, over every form that
 * calls one of the Supabase endpoints a captcha protects. A new auth form
 * that forgets the widget fails this suite instead of failing live the
 * moment the dashboard switch is flipped.
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

  it('carries the token on sign-in when one exists', async () => {
    const body = await capturedRequestBody((c) =>
      c.auth.signInWithPassword({
        email: 'someone@example.test',
        password: 'whatever',
        options: captchaOptions('tok-signin'),
      })
    );
    expect(body).toMatchObject({ gotrue_meta_security: { captcha_token: 'tok-signin' } });
  });

  it('carries the token on signup, alongside everything signup already sent', async () => {
    const body = await capturedRequestBody((c) =>
      c.auth.signUp({
        email: 'someone@example.test',
        password: 'whatever',
        options: {
          emailRedirectTo: 'https://app.mefwellness.com/api/auth/callback',
          data: { timezone: 'America/New_York' },
          ...captchaOptions('tok-signup'),
        },
      })
    );
    expect(body).toMatchObject({ gotrue_meta_security: { captcha_token: 'tok-signup' } });
    // The token is added to signup, it does not displace anything.
    expect(body).toMatchObject({ data: { timezone: 'America/New_York' } });
  });

  it('carries the token on the password reset request', async () => {
    const body = await capturedRequestBody((c) =>
      c.auth.resetPasswordForEmail('someone@example.test', {
        ...captchaOptions('tok-recover'),
        redirectTo: 'https://app.mefwellness.com/api/auth/recovery',
      })
    );
    expect(body).toMatchObject({ gotrue_meta_security: { captcha_token: 'tok-recover' } });
  });

  it('carries the token on the verification email resend', async () => {
    const body = await capturedRequestBody((c) =>
      c.auth.resend({
        type: 'signup',
        email: 'someone@example.test',
        options: {
          emailRedirectTo: 'https://app.mefwellness.com/api/auth/callback',
          ...captchaOptions('tok-resend'),
        },
      })
    );
    expect(body).toMatchObject({ gotrue_meta_security: { captcha_token: 'tok-resend' } });
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
 * Every screen whose submission reaches one of the Supabase endpoints a
 * captcha protects (signup, password sign-in, password recovery, email
 * resend, passkey sign-in). Deliberately a hand-written list of the files
 * rather than a grep for the action names: the point is that adding a new
 * auth screen should require thinking about this, and a list is the thing
 * that makes forgetting visible.
 */
const PROTECTED_FORMS = [
  'app/(auth)/login/page.tsx',
  'app/(auth)/signup/page.tsx',
  'app/(auth)/reset-password/ResetPasswordForm.tsx',
  'app/(auth)/verify/page.tsx',
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

  it('the change-password screen is included, because verifying the current password is a sign-in', () => {
    const source = fs.readFileSync(
      path.join(ROOT, 'app/actions/auth.ts'),
      'utf8'
    );
    // The proof this is not decoration: changePassword() forwards the token
    // to signInWithPassword, not to updateUser (which takes no token).
    const changePassword = source.slice(source.indexOf('export async function changePassword'));
    expect(changePassword).toContain('options: captchaOptions(captchaToken)');
    expect(changePassword).not.toContain('updateUser({ password, captchaToken');
  });
});

// ---------------------------------------------------------------------------
// The secret key never enters this repository
// ---------------------------------------------------------------------------

describe('secret key containment', () => {
  it('no source file reads a Turnstile secret key', () => {
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
        if (/TURNSTILE_SECRET|TURNSTILE_SECRET_KEY/.test(text)) {
          offenders.push(path.relative(ROOT, full));
        }
      }
    };
    walk(path.join(ROOT, 'lib'));
    walk(path.join(ROOT, 'app'));
    walk(path.join(ROOT, 'components'));
    expect(offenders).toEqual([]);
  });
});
