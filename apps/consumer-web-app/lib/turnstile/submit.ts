/**
 * ONE SUBMISSION, WITH THE BOT CHECK ALLOWED ONE SILENT SECOND CHANCE.
 *
 * The other half of the 2026-09-05 signup failure. Even with a widget that
 * keeps itself armed (lib/turnstile/tokenLifecycle.ts), a token can still
 * be spent or expire in the seconds between being read and reaching
 * Supabase: a slow phone, a retried request, a tab that was backgrounded
 * mid-submit. When that happens the member has done nothing wrong and there
 * is nothing for her to fix, so telling her "we could not confirm that" and
 * making her press the button again is the app asking her to perform the
 * retry it could have performed itself.
 *
 * WHY RETRYING IS SAFE, AND WHY ONLY HERE. A captcha refusal is Supabase
 * declining the REQUEST. No account was created, no session was issued, no
 * email was sent and no password was checked, so running the same
 * submission again is not a second action, it is the first one arriving.
 * That is only true of this one error: every other failure (a wrong
 * password, an address already registered, a rate limit) is a real answer
 * about what was submitted and is returned untouched, immediately.
 *
 * EXACTLY ONE RETRY. If a genuinely fresh token is refused too, something
 * real is wrong and she is told so. A loop here would turn one bad minute
 * at Cloudflare into a form that spins forever.
 *
 * WHAT IT DOES NOT TOUCH. It never inspects, rewrites or resends anything
 * else the form is carrying. The signup form's one-time quiz reference
 * rides in its own hidden field and is only spent by the server AFTER
 * Supabase accepts the account, so it survives however many rounds this
 * takes. tests/turnstile-retry-path.test.ts holds that as a standing
 * assertion.
 */

import { isCaptchaError } from './captcha';

/**
 * The part of components/auth/TurnstileGate.tsx's handle this needs.
 * Structural on purpose: nothing in lib/ imports a component.
 */
export interface TurnstileTokenSource {
  getToken(): Promise<string | null>;
  refresh(): Promise<string | null>;
  reset(): void;
}

/** Every Server Action in this app answers with this shape, or redirects. */
export interface CaptchaAttemptResult {
  error?: string | null | undefined;
}

/** True when a result is the bot check refusing the request, rather than an answer about what was submitted. */
export function isCaptchaRefusal(result: CaptchaAttemptResult | null | undefined | void): boolean {
  if (!result || typeof result !== 'object') return false;
  return isCaptchaError(result.error ?? null);
}

/**
 * Runs one submission with a token that is fresh at the moment of
 * submitting, and re-runs it once with a genuinely new token if the check
 * refuses it.
 *
 * `attempt` receives the token and is responsible for putting it wherever
 * this particular call site puts it (a FormData field, a Supabase option).
 * It is called at most twice and never concurrently.
 *
 * Returns whatever the last attempt returned, so callers keep the exact
 * error handling they already had. A successful Server Action that
 * redirects never returns at all, which is why the reset below is only
 * ever reached on a submission the member is still sitting in front of.
 */
export async function submitWithFreshCaptcha<T extends CaptchaAttemptResult | null | undefined | void>(
  gate: TurnstileTokenSource | null | undefined,
  attempt: (token: string | null) => Promise<T>
): Promise<T> {
  const first = await attempt((await gate?.getToken()) ?? null);
  if (!isCaptchaRefusal(first)) {
    gate?.reset();
    return first;
  }
  const second = await attempt((await gate?.refresh()) ?? null);
  gate?.reset();
  return second;
}
