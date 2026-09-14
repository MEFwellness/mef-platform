'use client';

/**
 * LOG IN. NOTHING STANDS BETWEEN THE BUTTON AND SUPABASE.
 *
 * This screen carried a Cloudflare Turnstile widget for a month and it was
 * the single largest source of failed sign-ins in the app: a member typed a
 * correct password, pressed the button, and read "We could not confirm that
 * in time" because a third party's challenge had not finished on her phone.
 * Four fixes tried to make that challenge finish sooner. The fifth, this
 * one, removed it: there is no widget here, no script from Cloudflare
 * loaded by this route, no token read and no token sent.
 *
 * lib/turnstile/verify.ts explains where the check went and why sign-in was
 * the wrong place for it. The short version is that sign-in creates nothing
 * and sends nothing, so there was never anything for a captcha to protect,
 * and what does protect it is Supabase's own per-IP rate limiting plus the
 * cooldown below.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { signIn } from '../../actions/auth';
import { getFriendlyAuthError } from '@/lib/auth/errors';
import { PasskeyLoginButton } from '@/components/auth/PasskeyLoginButton';
import {
  IDLE_THROTTLE,
  cooldownMessage,
  isWrongCredentials,
  recordFailure,
  secondsRemaining,
  type LoginThrottleState,
} from '@/lib/auth/loginThrottle';

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  // Several wrong passwords in a row earn a short, visible pause. It is a
  // courtesy, not the defence: see lib/auth/loginThrottle.ts.
  const [throttle, setThrottle] = useState<LoginThrottleState>(IDLE_THROTTLE);
  const [waitSeconds, setWaitSeconds] = useState(0);
  // middleware.ts sets this when a signed-out visit to a protected page
  // (a deep link) got bounced here — carried through so signIn() can send
  // the member back to it instead of always landing on the default
  // destination. See lib/auth/postLoginRoute.ts's isSafePostLoginRedirect
  // for why this is safe to trust even though it's a query param.
  const redirectedFrom = useSearchParams().get('redirectedFrom');

  // One ticker, running only while a pause is actually running, so the
  // number she is reading is the number of seconds that are left.
  useEffect(() => {
    if (throttle.cooldownUntil === 0) {
      setWaitSeconds(0);
      return;
    }
    const tick = () => setWaitSeconds(secondsRemaining(throttle, Date.now()));
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [throttle]);

  const cooling = waitSeconds > 0;

  const handleSubmit = useCallback(
    async (formData: FormData) => {
      if (submittingRef.current) return;
      if (secondsRemaining(throttle, Date.now()) > 0) return;
      submittingRef.current = true;
      setError(null);
      setSubmitting(true);
      // The whole submission: her email, her password, and the deep link
      // she was bounced from. A success never returns at all, because
      // signIn() redirects.
      const result = await signIn(formData);
      if (result?.error) {
        if (isWrongCredentials(result.error)) {
          setThrottle((previous) => recordFailure(previous, Date.now()));
        }
        setError(
          getFriendlyAuthError(result.error, {
            includeRawOnFallback: true,
            fallbackPrefix: 'Sign in failed',
          })
        );
      }
      submittingRef.current = false;
      setSubmitting(false);
    },
    [throttle]
  );

  return (
    <>
      <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-2xl text-[#1B3A2D]">
        Log in
      </h1>
      <form className="mt-5 space-y-4" action={handleSubmit}>
        {redirectedFrom && <input type="hidden" name="redirectedFrom" value={redirectedFrom} />}
        <div>
          <label className="text-sm font-medium text-[#1B3A2D]" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="mt-1.5 w-full rounded-2xl border border-[#1B3A2D]/10 p-3 text-base text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-[#1B3A2D]" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            className="mt-1.5 w-full rounded-2xl border border-[#1B3A2D]/10 p-3 text-base text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
          />
        </div>
        {/* The pause replaces the error rather than stacking under it: they
            are one statement about the same attempt, and two red boxes
            saying different things about one tap reads as two problems. */}
        {cooling ? (
          <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {cooldownMessage(waitSeconds)}
          </p>
        ) : (
          error && (
            <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )
        )}
        <button
          type="submit"
          disabled={submitting || cooling}
          className="mef-press flex w-full items-center justify-center rounded-full bg-[#1B3A2D] px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {submitting ? 'Logging in…' : cooling ? `Try again in ${waitSeconds}s` : 'Log in'}
        </button>
      </form>
      <PasskeyLoginButton redirectedFrom={redirectedFrom} onError={setError} />
      <div className="mt-5 space-y-1.5 text-center text-sm">
        <p>
          <Link href="/signup" className="font-medium text-[#6B7A72] underline underline-offset-2">
            Need an account? Sign up
          </Link>
        </p>
        <p>
          <Link
            href="/reset-password"
            className="font-medium text-[#6B7A72] underline underline-offset-2"
          >
            Forgot password?
          </Link>
        </p>
      </div>
    </>
  );
}
