'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { beginPasswordRecovery, updatePassword } from '../../../actions/auth';
import { checkPasswordStrength, passwordsMatch } from '@/lib/auth/validation';
import { getFriendlyAuthError } from '@/lib/auth/errors';
import { PasswordField } from '@/components/auth/PasswordField';
import { PasswordStrengthHint } from '@/components/auth/PasswordStrengthHint';
import { createClient } from '@/lib/supabase/client';
import {
  expiredLinkPath,
  nextRecoveryScreen,
  parseRecoveryLanding,
  type RecoveryScreen,
} from '@/lib/auth/recovery';

interface FieldErrors {
  password?: string | undefined;
  confirmPassword?: string | undefined;
}

/**
 * "checking" only ever appears for the fragment landing, and only for the
 * moment it takes to read the URL. Every other arrival is already decided
 * by the server, so there is no flash of the wrong screen.
 */
type Screen = RecoveryScreen;

export function ConfirmResetForm({ serverReady }: { serverReady: boolean }) {
  const [screen, setScreen] = useState<Screen>(serverReady ? 'ready' : 'checking');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  /**
   * Resolves the one landing the server is blind to. GoTrue's implicit flow
   * returns the session in the URL fragment and reports a dead link the same
   * way, and a fragment is never sent to a server, so this is the only place
   * either can be read. See lib/auth/recovery.ts for the full set of shapes.
   *
   * location.hash is captured before any Supabase client is constructed:
   * the browser client detects sessions in the URL by itself and clears the
   * fragment when it does, so reading it first is what keeps this
   * deterministic instead of a race.
   */
  useEffect(() => {
    let cancelled = false;

    /**
     * Every transition this effect makes goes through nextRecoveryScreen, so
     * a completed change can never be walked back. That matters because a
     * successful save clears the recovery marker, which flips serverReady to
     * false and runs this effect again against a URL whose tokens have
     * already been used and stripped. See nextRecoveryScreen's own comment.
     */
    const settle = (next: Screen) => {
      if (!cancelled) setScreen((current) => nextRecoveryScreen(current, next));
    };

    if (serverReady) return;

    const { hash, search } = window.location;
    const landing = parseRecoveryLanding(search, hash);

    if (landing.kind !== 'tokens') {
      // Either GoTrue said the link is dead, or there is nothing here at all
      // because the screen was opened directly or the link was stripped on
      // the way. Both leave nothing to set a password against.
      settle('expired');
      return;
    }

    (async () => {
      const { error } = await createClient().auth.setSession({
        access_token: landing.accessToken,
        refresh_token: landing.refreshToken,
      });
      if (error) {
        settle('expired');
        return;
      }
      // Raise the same gate the server-visible landings raise, so this
      // session cannot wander into the app either.
      await beginPasswordRecovery();
      if (cancelled) return;
      // Drop the tokens from the address bar so they are not left in
      // history or leaked by a shared or bookmarked URL.
      window.history.replaceState(null, '', window.location.pathname);
      settle('ready');
    })();

    return () => {
      cancelled = true;
    };
  }, [serverReady]);

  function confirmPasswordError(pw: string, confirm: string): string | undefined {
    if (!confirm) return undefined;
    return passwordsMatch(pw, confirm) ? undefined : 'Passwords do not match.';
  }

  function validateAll(): boolean {
    const errors: FieldErrors = {};
    const passwordCheck = checkPasswordStrength(password);
    if (!passwordCheck.valid) errors.password = passwordCheck.message;

    const confirmError = confirmPasswordError(password, confirmPassword);
    if (confirmError) errors.confirmPassword = confirmError;

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(formData: FormData) {
    if (submittingRef.current) return;

    setFormError(null);
    setConfirmTouched(true);
    if (!validateAll()) return;

    submittingRef.current = true;
    setSubmitting(true);
    const result = await updatePassword(formData);
    if (result?.error) {
      setFormError(getFriendlyAuthError(result.error, { includeRawOnFallback: true }));
    } else {
      setScreen('done');
    }
    submittingRef.current = false;
    setSubmitting(false);
  }

  if (screen === 'checking') {
    return (
      <>
        <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-2xl text-[#1B3A2D]">
          Checking your link
        </h1>
        <p className="mt-4 text-sm text-[#6B7A72]">One moment.</p>
      </>
    );
  }

  if (screen === 'expired') {
    return (
      <>
        <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-2xl text-[#1B3A2D]">
          This link has expired
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-[#6B7A72]">
          Reset links can only be used once, and they stop working after a while. Request a fresh
          one and it will work straight away.
        </p>
        <Link
          href={expiredLinkPath() as Route}
          className="mef-press mt-6 flex w-full items-center justify-center rounded-full bg-[#1B3A2D] px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110"
        >
          Send a new reset link
        </Link>
        <p className="mt-5 text-center text-sm">
          <Link href="/login" className="font-medium text-[#6B7A72] underline underline-offset-2">
            Back to log in
          </Link>
        </p>
      </>
    );
  }

  if (screen === 'done') {
    return (
      <>
        <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-2xl text-[#1B3A2D]">
          Password updated
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-[#6B7A72]">
          Your new password is ready and your old one no longer works. You are signed in.
        </p>
        {/*
          A plain link, not a router push. The recovery gate in middleware.ts
          reads a cookie that the server action just cleared, and a full
          navigation is what guarantees the browser sends the updated cookie
          rather than following a cached client-side route.
        */}
        <a
          href="/"
          className="mef-press mt-6 flex w-full items-center justify-center rounded-full bg-[#1B3A2D] px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110"
        >
          Continue
        </a>
      </>
    );
  }

  return (
    <>
      <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-2xl text-[#1B3A2D]">
        Set a new password
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">
        Choose something you have not used here before. Your old password stops working as soon as
        you save.
      </p>
      <form className="mt-5 space-y-4" action={handleSubmit}>
        <div>
          <PasswordField
            id="password"
            name="password"
            label="New password"
            autoComplete="new-password"
            minLength={8}
            value={password}
            error={fieldErrors.password}
            onChange={(value) => {
              setPassword(value);
              if (fieldErrors.password && checkPasswordStrength(value).valid) {
                setFieldErrors((prev) => ({ ...prev, password: undefined }));
              }
              if (confirmTouched && !confirmPasswordError(value, confirmPassword)) {
                setFieldErrors((prev) => ({ ...prev, confirmPassword: undefined }));
              }
            }}
            onBlur={() => {
              const check = checkPasswordStrength(password);
              if (!check.valid) {
                setFieldErrors((prev) => ({ ...prev, password: check.message }));
              }
            }}
          />
          <PasswordStrengthHint password={password} />
        </div>

        <PasswordField
          id="confirmPassword"
          name="confirmPassword"
          label="Confirm new password"
          autoComplete="new-password"
          value={confirmPassword}
          error={confirmTouched ? fieldErrors.confirmPassword : undefined}
          onChange={(value) => {
            setConfirmPassword(value);
            if (confirmTouched && !confirmPasswordError(password, value)) {
              setFieldErrors((prev) => ({ ...prev, confirmPassword: undefined }));
            }
          }}
          onBlur={() => {
            setConfirmTouched(true);
            setFieldErrors((prev) => ({
              ...prev,
              confirmPassword: confirmPasswordError(password, confirmPassword),
            }));
          }}
        />

        {formError && (
          <div role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
            <p>{formError}</p>
            <Link
              href={expiredLinkPath() as Route}
              className="mt-1 inline-block font-medium underline underline-offset-2"
            >
              Send a new reset link
            </Link>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mef-press flex w-full items-center justify-center rounded-full bg-[#1B3A2D] px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {submitting ? 'Saving…' : 'Save new password'}
        </button>
      </form>
    </>
  );
}
