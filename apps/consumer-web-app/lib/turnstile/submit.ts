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
import { RETRY_TOPUP_WAIT_MS } from './tokenLifecycle';

/**
 * The part of components/auth/TurnstileGate.tsx's handle this needs.
 * Structural on purpose: nothing in lib/ imports a component.
 */
export interface TurnstileTokenSource {
  /**
   * `maxWaitMs` is how long to wait for a challenge that has not finished.
   * Optional, and the default is the full window, so a caller that does
   * not care reads exactly as it did before.
   */
  getToken(maxWaitMs?: number): Promise<string | null>;
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
 * submitting, and re-runs it once if the check refuses it.
 *
 * `attempt` receives the token and is responsible for putting it wherever
 * this particular call site puts it (a FormData field, a Supabase option).
 * It is called at most twice and never concurrently.
 *
 * Returns whatever the last attempt returned, so callers keep the exact
 * error handling they already had. A successful Server Action that
 * redirects never returns at all, which is why the reset below is only
 * ever reached on a submission the member is still sitting in front of.
 *
 * =====================================================================
 * THE SECOND TRY ONLY STARTS A NEW CHALLENGE IF THE FIRST ONE SPENT A
 * TOKEN. (2026-09-11)
 * =====================================================================
 *
 * `refresh()` exists because a token is single use: once one has been
 * sent to Supabase it is spent, so sending it again is guaranteed to be
 * refused and the retry has to throw the challenge away and run another.
 *
 * That reasoning only holds when a token was actually sent. The login
 * failure reported from a real phone on 2026-09-11 is the other case, and
 * it is the common one: the challenge had not finished yet, the first
 * attempt went out carrying NOTHING, Supabase refused it for exactly that
 * reason, and the challenge then finished while that request was in
 * flight. At that moment a perfectly good, unspent, seconds-old token was
 * sitting in the widget, and `refresh()` deleted it and started the whole
 * challenge again from nothing, so the retry spent a second full wait
 * getting back to where it already was. When that one also ran out she
 * was told "We could not confirm that in time" while holding a correct
 * password.
 *
 * So the retry asks the question that matches what actually happened.
 * Nothing was spent, therefore ask for a token, which returns the one
 * that has just arrived, immediately, and only starts a challenge if
 * there genuinely still is not one. A token WAS spent, therefore refresh,
 * exactly as before.
 *
 * EXACTLY ONE RETRY EITHER WAY. If a token that is genuinely fresh, by
 * whichever of the two routes, is refused too, something real is wrong
 * and she is told so.
 *
 * AND THE SECOND ASK IS A TOP-UP RATHER THAN A SECOND FULL WAIT. Measured
 * against production: a submission the check would never clear took
 * seventeen seconds to admit it, because both asks waited the full window
 * with a round trip between them. The retry is waiting for the challenge
 * to finish during the round trip that was just refused, which takes as
 * long as a round trip, so RETRY_TOPUP_WAIT_MS is what it gets. The FIRST
 * ask still gets its whole window, because a real member on a genuinely
 * slow phone needs every second of it. Eleven seconds to a truthful
 * failure instead of seventeen.
 */
export async function submitWithFreshCaptcha<T extends CaptchaAttemptResult | null | undefined | void>(
  gate: TurnstileTokenSource | null | undefined,
  attempt: (token: string | null) => Promise<T>
): Promise<T> {
  const firstToken = (await gate?.getToken()) ?? null;
  const first = await attempt(firstToken);
  if (!isCaptchaRefusal(first)) {
    gate?.reset();
    return first;
  }
  const retryToken =
    firstToken === null ? await gate?.getToken(RETRY_TOPUP_WAIT_MS) : await gate?.refresh();
  const second = await attempt(retryToken ?? null);
  gate?.reset();
  return second;
}
