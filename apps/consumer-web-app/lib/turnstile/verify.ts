/**
 * THE BOT CHECK IS OURS NOW, AND IT IS NOT ON THE SIGN-IN PATH AT ALL.
 *
 * ==================================================================
 * WHY THIS FILE EXISTS (2026-09-14, the fifth attempt at one bug)
 * ==================================================================
 *
 * Members with correct passwords kept reading "we could not confirm that"
 * on the login screen. Four previous fixes all treated it as a timing
 * problem and tried to make the check finish sooner: preloading
 * Cloudflare's script during page parse, keeping the token re-armed,
 * retrying once with a fresh token, topping up instead of restarting.
 * Every one of them narrowed the window. None of them closed it, because
 * the window cannot be closed. A sign-in that is only allowed to happen
 * after a third party finishes a round trip will fail whenever that third
 * party is slow, and on a phone on a weak connection it is slow.
 *
 * So the window is gone rather than narrowed: SIGN-IN NO LONGER CARRIES A
 * BOT CHECK. Tap Log in and the password goes to Supabase.
 *
 * THAT REQUIRED MOVING THE CHECK OFF SUPABASE. Supabase's captcha setting
 * is one project-wide switch (`auth.captcha.enabled`); GoTrue applies it to
 * every protected endpoint, so there is no way to protect /signup while
 * leaving /token alone. Verified directly against production on
 * 2026-09-14: an unauthenticated sign-in with no token came back
 * `captcha_failed: "captcha protection: request disallowed (no
 * captcha_token found)"`, and so did a signup. One switch, both endpoints.
 *
 * The switch is therefore OFF, and the endpoints that genuinely need bot
 * protection verify the token here instead, against Cloudflare's own
 * siteverify API, before they call Supabase at all. Those are the three
 * anonymous endpoints that make this app create a row or send mail:
 *
 *     signUp()                    creates an account, sends mail
 *     requestPasswordReset()      sends mail to any address given
 *     resendVerificationEmail()   sends mail to any address given
 *
 * Sign-in is not one of them and never was: it creates nothing and sends
 * nothing, and Supabase's own per-IP rate limiting plus the cooldown in
 * lib/auth/loginThrottle.ts is the right shape of protection for a
 * password guess.
 *
 * ==================================================================
 * WHAT HAPPENS WITH NO SECRET KEY CONFIGURED, AND WHY IT IS NOT A LOCK
 * ==================================================================
 *
 * The site key is public and lives in NEXT_PUBLIC_TURNSTILE_SITE_KEY. The
 * matching SECRET key used to live only in the Supabase dashboard, which
 * does not reveal it back through its API, so it has to be pasted into
 * Vercel as TURNSTILE_SECRET_KEY for this file to be able to verify
 * anything.
 *
 * Until it is, this reports `unconfigured` and the three call sites above
 * proceed. That is deliberate and it is the safe direction: a signup form
 * that refuses every real member because one environment variable is
 * missing is a worse outage than the spam it would be preventing, and
 * signup still sits behind Supabase's per-IP rate limits, its 30-emails-
 * per-hour ceiling and mandatory email confirmation. It is logged once per
 * process, loudly, so it cannot be the silent state forever.
 *
 * NOTHING HERE EVER GUESSES. A token that is absent, malformed or refused
 * by Cloudflare is a refusal. Cloudflare failing to answer is NOT a
 * refusal, it is `unreachable`, which the call sites turn into a retryable
 * result so lib/turnstile/submit.ts runs the submission once more before
 * anybody is told anything. A member on a bad minute of Cloudflare's day
 * has done nothing wrong.
 */

/** Cloudflare's server-side token verification endpoint. */
export const TURNSTILE_SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * How long to wait for Cloudflare to answer before calling it unreachable.
 * Short on purpose: this runs inside a Server Action a member is waiting
 * on, and an unreachable verdict is retried rather than shown to her, so
 * waiting longer buys nothing she can feel.
 */
export const SITEVERIFY_TIMEOUT_MS = 4_000;

/** The secret key, or null when this deployment cannot verify anything. */
export function getTurnstileSecretKey(): string | null {
  const key = process.env.TURNSTILE_SECRET_KEY;
  if (typeof key !== 'string') return null;
  const trimmed = key.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** True only when a secret key is configured and verification can run. */
export function isTurnstileVerifiedHere(): boolean {
  return getTurnstileSecretKey() !== null;
}

export type HumanCheckReason = 'ok' | 'unconfigured' | 'missing' | 'rejected' | 'unreachable';

export interface HumanCheck {
  /** True when the submission may proceed. */
  ok: boolean;
  reason: HumanCheckReason;
}

/**
 * Injectable so the tests can drive every branch without a network and
 * without touching process.env.
 */
export interface VerifyDeps {
  secret?: string | null;
  fetchImpl?: typeof fetch;
  remoteIp?: string | null;
  timeoutMs?: number;
}

let warnedAboutMissingSecret = false;

/**
 * Asks Cloudflare whether this token is genuine.
 *
 * Returns `ok` for a real token and for a deployment with no secret key
 * configured (see the header). `missing` and `rejected` are refusals.
 * `unreachable` is not a refusal and must be retried, never shown.
 */
export async function verifyTurnstileToken(
  token: string | null | undefined,
  deps: VerifyDeps = {}
): Promise<HumanCheck> {
  const secret = deps.secret === undefined ? getTurnstileSecretKey() : deps.secret;
  if (secret === null || secret === undefined || secret.trim().length === 0) {
    if (!warnedAboutMissingSecret) {
      warnedAboutMissingSecret = true;
      console.warn(
        'TURNSTILE_SECRET_KEY is not set: signup, password reset and verification resend are running without a bot check. Set it in Vercel to re-arm them.'
      );
    }
    return { ok: true, reason: 'unconfigured' };
  }

  const trimmed = typeof token === 'string' ? token.trim() : '';
  if (trimmed.length === 0) return { ok: false, reason: 'missing' };

  const fetchImpl = deps.fetchImpl ?? fetch;
  const body = new URLSearchParams({ secret, response: trimmed });
  if (deps.remoteIp) body.set('remoteip', deps.remoteIp);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? SITEVERIFY_TIMEOUT_MS);
  try {
    const response = await fetchImpl(TURNSTILE_SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: controller.signal,
      cache: 'no-store',
    });
    // Cloudflare answering with anything but a 200 is Cloudflare having a
    // problem, not the member having one.
    if (!response.ok) return { ok: false, reason: 'unreachable' };
    const payload: unknown = await response.json();
    const success =
      typeof payload === 'object' && payload !== null && (payload as { success?: unknown }).success;
    return success === true ? { ok: true, reason: 'ok' } : { ok: false, reason: 'rejected' };
  } catch {
    // A timeout, an abort, a DNS failure, a torn connection. None of them
    // are an answer about the token.
    return { ok: false, reason: 'unreachable' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The error string a refused check returns to the browser.
 *
 * It deliberately contains the word "captcha": that is what
 * lib/turnstile/captcha.ts's isCaptchaError() matches on, which is what
 * makes lib/auth/errors.ts substitute calm copy for it and what makes
 * lib/turnstile/submit.ts run the submission one more time with a
 * genuinely fresh token before anybody reads anything. A member never sees
 * this string.
 */
export const HUMAN_CHECK_REFUSED_ERROR = 'captcha verification failed';

/** Same, for a check that could not be completed rather than one that failed. */
export const HUMAN_CHECK_UNREACHABLE_ERROR = 'captcha verification could not be completed';
