'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { signIn } from '../../actions/auth';
import { getFriendlyAuthError } from '@/lib/auth/errors';
import { PasskeyLoginButton } from '@/components/auth/PasskeyLoginButton';
import { TurnstileGate, type TurnstileHandle } from '@/components/auth/TurnstileGate';
import { CAPTCHA_TOKEN_FIELD } from '@/lib/turnstile/captcha';
import { submitWithFreshCaptcha } from '@/lib/turnstile/submit';

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  // Null on every deployment where NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset:
  // TurnstileGate renders nothing, getToken() is never reached through a
  // real widget, and the form submits the exact fields it always has.
  const turnstileRef = useRef<TurnstileHandle | null>(null);
  // middleware.ts sets this when a signed-out visit to a protected page
  // (a deep link) got bounced here — carried through so signIn() can send
  // the member back to it instead of always landing on the default
  // destination. See lib/auth/postLoginRoute.ts's isSafePostLoginRedirect
  // for why this is safe to trust even though it's a query param.
  const redirectedFrom = useSearchParams().get('redirectedFrom');

  return (
    <>
      <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-2xl text-[#1B3A2D]">
        Log in
      </h1>
      <form
        className="mt-5 space-y-4"
        action={async (formData) => {
          if (submittingRef.current) return;
          submittingRef.current = true;
          setError(null);
          setSubmitting(true);
          // A token that is fresh at the moment of submitting, one silent
          // second try if the check refuses it anyway, and the spent
          // single-use token replaced afterwards whatever the outcome. See
          // lib/turnstile/submit.ts for why retrying exactly this one
          // failure is safe and why nothing else is retried.
          const result = await submitWithFreshCaptcha(turnstileRef.current, async (token) => {
            if (token) formData.set(CAPTCHA_TOKEN_FIELD, token);
            else formData.delete(CAPTCHA_TOKEN_FIELD);
            return await signIn(formData);
          });
          if (result?.error) {
            setError(
              getFriendlyAuthError(result.error, {
                includeRawOnFallback: true,
                fallbackPrefix: 'Sign in failed',
              })
            );
          }
          submittingRef.current = false;
          setSubmitting(false);
        }}
      >
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
        <TurnstileGate ref={turnstileRef} />
        {error && (
          <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="mef-press flex w-full items-center justify-center rounded-full bg-[#1B3A2D] px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
      </form>
      {/* Shares the one widget the form above already renders rather than
          starting a second challenge: Face ID sign-in goes through the same
          protected Supabase endpoint family and needs the same token. */}
      <PasskeyLoginButton
        redirectedFrom={redirectedFrom}
        onError={setError}
        turnstile={turnstileRef}
      />
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
