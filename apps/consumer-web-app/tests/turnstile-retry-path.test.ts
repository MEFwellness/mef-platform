/**
 * THE RETRY THE MEMBER NEVER SEES, AND THE PASS THAT HAS TO SURVIVE IT.
 *
 * Second half of the 2026-09-05 signup fix. lib/turnstile/submit.ts gives
 * one refused submission one silent second attempt with a genuinely new
 * token, and this file holds the three things that has to be true of:
 *
 *   IT RETRIES THE RIGHT FAILURE, AND ONLY THAT ONE. A refused check is
 *   Supabase declining the request, so nothing happened and running it
 *   again is the first action arriving. A wrong password is an answer and
 *   is returned untouched.
 *   IT RETRIES ONCE. Not twice, not until it works.
 *   THE ONE-TIME QUIZ REFERENCE SURVIVES EVERY ROUND. The pass her
 *   create-account button carried is what binds a stranger's nine answers
 *   to the account she is creating (lib/public-entry/signupRef.ts). If a
 *   failed bot check could spend it, burn it or drop it from the form, the
 *   member who had the worst experience of the funnel would also be the one
 *   who arrives with nothing.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  isCaptchaRefusal,
  submitWithFreshCaptcha,
  type TurnstileTokenSource,
} from '../lib/turnstile/submit';
import { CAPTCHA_TOKEN_FIELD, readCaptchaToken } from '../lib/turnstile/captcha';
import { PUBLIC_ENTRY_REF_FIELD } from '../lib/public-entry/signupField';
import { TURNSTILE_UNVERIFIED_MESSAGE } from '../lib/turnstile/env';
import { getFriendlyAuthError } from '../lib/auth/errors';

const ROOT = path.resolve(__dirname, '..');

/** GoTrue's own wording when the dashboard captcha switch refuses a request. */
const REFUSED = 'captcha protection: request disallowed (invalid-input-response)';

/** A widget that always answers, handing back a different token every time. */
function fakeGate(): TurnstileTokenSource & { tokens: string[]; resets: number } {
  let issued = 0;
  const state = {
    tokens: [] as string[],
    resets: 0,
    async getToken() {
      issued += 1;
      const t = `tok-${issued}`;
      state.tokens.push(t);
      return t;
    },
    async refresh() {
      issued += 1;
      const t = `tok-${issued}`;
      state.tokens.push(t);
      return t;
    },
    reset() {
      state.resets += 1;
    },
  };
  return state;
}

describe('which failure is retried', () => {
  it('recognises a refused check as the one retryable failure', () => {
    expect(isCaptchaRefusal({ error: REFUSED })).toBe(true);
    expect(isCaptchaRefusal({ error: 'captcha verification process failed' })).toBe(true);
    expect(isCaptchaRefusal({ error: 'Invalid login credentials' })).toBe(false);
    expect(isCaptchaRefusal({ error: 'An account with this email already exists' })).toBe(false);
    expect(isCaptchaRefusal({})).toBe(false);
    expect(isCaptchaRefusal(undefined)).toBe(false);
    expect(isCaptchaRefusal(null)).toBe(false);
  });

  it('does not run a wrong password twice', async () => {
    const gate = fakeGate();
    let calls = 0;
    const result = await submitWithFreshCaptcha(gate, async () => {
      calls += 1;
      return { error: 'Invalid login credentials' };
    });
    expect(calls).toBe(1);
    expect(result.error).toBe('Invalid login credentials');
  });

  it('does not run a successful submission twice', async () => {
    const gate = fakeGate();
    let calls = 0;
    await submitWithFreshCaptcha(gate, async () => {
      calls += 1;
      return {};
    });
    expect(calls).toBe(1);
  });
});

describe('the silent second attempt', () => {
  it('runs the submission again with a token the first attempt never used', async () => {
    const gate = fakeGate();
    const sent: (string | null)[] = [];
    const result = await submitWithFreshCaptcha(gate, async (token) => {
      sent.push(token);
      return sent.length === 1 ? { error: REFUSED } : {};
    });
    expect(sent).toHaveLength(2);
    expect(sent[0]).not.toBe(sent[1]);
    expect(sent[1]).not.toBeNull();
    expect(result.error).toBeUndefined();
  });

  it('gets that second token from refresh(), never from the held value', async () => {
    const calls: string[] = [];
    const gate: TurnstileTokenSource = {
      async getToken() {
        calls.push('getToken');
        return 'tok-held';
      },
      async refresh() {
        calls.push('refresh');
        return 'tok-new';
      },
      reset() {
        calls.push('reset');
      },
    };
    await submitWithFreshCaptcha(gate, async () => ({ error: REFUSED }));
    expect(calls).toEqual(['getToken', 'refresh', 'reset']);
  });

  it('stops after one retry and tells her, rather than looping', async () => {
    const gate = fakeGate();
    let calls = 0;
    const result = await submitWithFreshCaptcha(gate, async () => {
      calls += 1;
      return { error: REFUSED };
    });
    expect(calls).toBe(2);
    // Only now does the member read anything, and it is the calm sentence.
    expect(getFriendlyAuthError(result.error, { includeRawOnFallback: true })).toBe(
      TURNSTILE_UNVERIFIED_MESSAGE
    );
  });

  it('replaces the spent single-use token whatever the outcome', async () => {
    const ok = fakeGate();
    await submitWithFreshCaptcha(ok, async () => ({}));
    expect(ok.resets).toBe(1);
    const refused = fakeGate();
    await submitWithFreshCaptcha(refused, async () => ({ error: REFUSED }));
    expect(refused.resets).toBe(1);
  });

  it('submits with no captcha field at all when the widget yields nothing', async () => {
    const silent: TurnstileTokenSource = {
      async getToken() {
        return null;
      },
      async refresh() {
        return null;
      },
      reset() {},
    };
    const seen: (string | null)[] = [];
    await submitWithFreshCaptcha(silent, async (token) => {
      seen.push(token);
      return {};
    });
    expect(seen).toEqual([null]);
  });

  it('is a no-op wrapper when bot protection is dormant and there is no widget', async () => {
    const seen: (string | null)[] = [];
    const result = await submitWithFreshCaptcha(null, async (token) => {
      seen.push(token);
      return {};
    });
    expect(seen).toEqual([null]);
    expect(result).toEqual({});
  });
});

describe('the one-time quiz pass survives every retry', () => {
  /** What the signup form does inside the helper, field for field. */
  function signupAttempt(formData: FormData, seen: FormData[]) {
    return async (token: string | null) => {
      if (token) formData.set(CAPTCHA_TOKEN_FIELD, token);
      else formData.delete(CAPTCHA_TOKEN_FIELD);
      const snapshot = new FormData();
      for (const [k, v] of formData.entries()) snapshot.set(k, v);
      seen.push(snapshot);
      return { error: REFUSED };
    };
  }

  it('carries the same reference, unchanged, on every attempt', async () => {
    const form = new FormData();
    form.set('email', 'someone@example.test');
    form.set('password', 'a-real-password');
    form.set(PUBLIC_ENTRY_REF_FIELD, 'a-server-minted-reference');
    const seen: FormData[] = [];
    await submitWithFreshCaptcha(fakeGate(), signupAttempt(form, seen));

    expect(seen).toHaveLength(2);
    for (const attempt of seen) {
      expect(attempt.get(PUBLIC_ENTRY_REF_FIELD)).toBe('a-server-minted-reference');
      expect(attempt.get('email')).toBe('someone@example.test');
    }
    // Only the token differs between the two.
    expect(readCaptchaToken(seen[0]!)).not.toBe(readCaptchaToken(seen[1]!));
  });

  it('still holds the reference after the last attempt fails, so her next tap carries it too', async () => {
    const form = new FormData();
    form.set(PUBLIC_ENTRY_REF_FIELD, 'a-server-minted-reference');
    await submitWithFreshCaptcha(fakeGate(), signupAttempt(form, []));
    expect(form.get(PUBLIC_ENTRY_REF_FIELD)).toBe('a-server-minted-reference');
  });

  it('is never spent by a refused round, because the server only redeems it after Supabase accepts', () => {
    // The property that makes the two tests above mean anything. signUp()
    // returns on a Supabase error BEFORE linkArrival, which is the only
    // caller of bindArrivalFromSignupRef. A reorder here would let a
    // refused bot check burn a member's one-time pass.
    const source = fs.readFileSync(path.join(ROOT, 'app/actions/auth.ts'), 'utf8');
    const start = source.indexOf('export async function signUp(');
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf('\n}\n', start));
    const refusal = body.indexOf('return toResult(error);');
    const bind = body.indexOf('await linkArrival(');
    expect(refusal).toBeGreaterThan(-1);
    expect(bind).toBeGreaterThan(-1);
    expect(refusal).toBeLessThan(bind);
  });

  it('the signup form only drops its stashed reference on a submission that went through', () => {
    const source = fs.readFileSync(path.join(ROOT, 'app/(auth)/signup/page.tsx'), 'utf8');
    expect(source).toContain('if (!result?.error) {');
    // clearSignupRef sits inside that branch and nowhere else in the file.
    expect(source.match(/clearSignupRef\(\)/g)).toHaveLength(1);
    const clear = source.indexOf('clearSignupRef();');
    const branch = source.indexOf('if (!result?.error) {');
    expect(branch).toBeLessThan(clear);
    expect(clear - branch).toBeLessThan(300);
  });
});
