'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { resendVerificationEmail } from '../../actions/auth';
import { getFriendlyAuthError, extractRetryAfterSeconds } from '@/lib/auth/errors';
import {
  clearCooldown,
  readNextAllowedAt,
  secondsRemaining,
  writeNextAllowedAt,
} from '@/lib/auth/resendCooldown';

const INITIAL_COOLDOWN_SECONDS = 60;
const PENDING_EMAIL_KEY = 'mef.auth.pendingEmail';

function VerifyPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const resendingRef = useRef(false);

  useEffect(() => {
    const paramEmail = searchParams.get('email');
    const resolvedEmail = paramEmail || window.localStorage.getItem(PENDING_EMAIL_KEY);
    if (!resolvedEmail) return;

    window.localStorage.setItem(PENDING_EMAIL_KEY, resolvedEmail);
    setEmail(resolvedEmail);

    // Supabase already sent one email during signup, so the first resend is
    // subject to the same cooldown a resend call would hit anyway.
    if (!readNextAllowedAt(window.localStorage, resolvedEmail)) {
      writeNextAllowedAt(
        window.localStorage,
        resolvedEmail,
        Date.now() + INITIAL_COOLDOWN_SECONDS * 1000
      );
    }
  }, [searchParams]);

  useEffect(() => {
    if (!email) return;
    const tick = () =>
      setSecondsLeft(secondsRemaining(readNextAllowedAt(window.localStorage, email)));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [email]);

  const handleResend = useCallback(async () => {
    if (!email || resendingRef.current || secondsLeft > 0) return;
    resendingRef.current = true;
    setResending(true);
    setResendMessage(null);
    setResendError(null);

    const result = await resendVerificationEmail(email);
    if (result?.error) {
      setResendError(getFriendlyAuthError(result.error));
      const retryAfter = extractRetryAfterSeconds(result.error) ?? INITIAL_COOLDOWN_SECONDS;
      writeNextAllowedAt(window.localStorage, email, Date.now() + retryAfter * 1000);
    } else {
      setResendMessage('Verification email resent. Please check your inbox.');
      writeNextAllowedAt(window.localStorage, email, Date.now() + INITIAL_COOLDOWN_SECONDS * 1000);
    }
    setSecondsLeft(secondsRemaining(readNextAllowedAt(window.localStorage, email)));
    resendingRef.current = false;
    setResending(false);
  }, [email, secondsLeft]);

  function handleUseDifferentEmail() {
    if (email) clearCooldown(window.localStorage, email);
    window.localStorage.removeItem(PENDING_EMAIL_KEY);
    router.push('/signup');
  }

  return (
    <>
      <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-2xl text-[#1B3A2D]">
        Check your email
      </h1>
      {email ? (
        <>
          <p className="mt-4 text-sm text-[#6B7A72]">We&apos;ve sent a verification link to:</p>
          <p className="mt-1 text-sm font-semibold text-[#1B3A2D]">{email}</p>
        </>
      ) : (
        <p className="mt-4 text-sm text-[#6B7A72]">
          We&apos;ve sent a verification link to your email address.
        </p>
      )}

      {resendMessage && (
        <p role="status" className="mt-4 rounded-2xl bg-[#EFF6F1] px-4 py-3 text-sm text-[#1B3A2D]">
          {resendMessage}
        </p>
      )}
      {resendError && (
        <p role="alert" className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {resendError}
        </p>
      )}

      <div className="mt-6 space-y-3">
        <button
          type="button"
          onClick={handleResend}
          disabled={!email || resending || secondsLeft > 0}
          className="flex w-full items-center justify-center rounded-full bg-[#1B3A2D] px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {resending
            ? 'Sending…'
            : secondsLeft > 0
              ? `Resend verification email (${secondsLeft}s)`
              : 'Resend verification email'}
        </button>
        <button
          type="button"
          onClick={handleUseDifferentEmail}
          className="flex w-full items-center justify-center rounded-full border border-[#1B3A2D]/15 px-6 py-3 text-sm font-semibold text-[#1B3A2D] transition hover:bg-[#EFF6F1]"
        >
          Use a different email
        </button>
        <Link
          href="/login"
          className="flex w-full items-center justify-center rounded-full px-6 py-3 text-sm font-medium text-[#6B7A72] underline underline-offset-2"
        >
          Return to login
        </Link>
      </div>
    </>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyPageContent />
    </Suspense>
  );
}
