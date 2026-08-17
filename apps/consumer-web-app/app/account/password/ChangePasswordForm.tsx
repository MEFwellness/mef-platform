'use client';

import { useRef, useState } from 'react';
import { Check } from 'lucide-react';
import Link from 'next/link';
import { changePassword } from '../../actions/auth';
import { checkPasswordStrength, passwordsMatch } from '@/lib/auth/validation';
import { getFriendlyAuthError } from '@/lib/auth/errors';
import { PasswordField } from '@/components/auth/PasswordField';
import { PasswordStrengthHint } from '@/components/auth/PasswordStrengthHint';
import { TurnstileGate, type TurnstileHandle } from '@/components/auth/TurnstileGate';
import { CAPTCHA_TOKEN_FIELD } from '@/lib/turnstile/captcha';

interface FieldErrors {
  currentPassword?: string | undefined;
  password?: string | undefined;
  confirmPassword?: string | undefined;
}

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const submittingRef = useRef(false);
  // This screen is behind a session, but the way it proves you know your
  // current password is a real sign-in attempt, and sign-in is one of the
  // endpoints Supabase protects with a captcha. See changePassword() in
  // app/actions/auth.ts. Dormant with no site key set.
  const turnstileRef = useRef<TurnstileHandle | null>(null);

  function confirmPasswordError(pw: string, confirm: string): string | undefined {
    if (!confirm) return undefined;
    return passwordsMatch(pw, confirm) ? undefined : 'Passwords do not match.';
  }

  function validateAll(): boolean {
    const errors: FieldErrors = {};
    if (!currentPassword) errors.currentPassword = 'Enter your current password.';

    const passwordCheck = checkPasswordStrength(password);
    if (!passwordCheck.valid) errors.password = passwordCheck.message;
    else if (password === currentPassword) {
      errors.password = 'Choose a password different from your current one.';
    }

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
    const token = await turnstileRef.current?.getToken();
    if (token) formData.set(CAPTCHA_TOKEN_FIELD, token);
    const result = await changePassword(formData);
    // Spent whatever the outcome: this form stays mounted on success too
    // (it swaps to a confirmation with a "Change it again" button).
    turnstileRef.current?.reset();

    if (result?.error && result.field) {
      // A wrong current password belongs on the field the member has to fix,
      // not in a banner at the bottom of the form. changePassword() is what
      // decides which field, because only the server can tell a genuine
      // credential rejection from a rate limit or an outage.
      setFieldErrors((prev) => ({ ...prev, [result.field!]: result.error }));
    } else if (result?.error) {
      setFormError(getFriendlyAuthError(result.error, { includeRawOnFallback: true }));
    } else {
      setDone(true);
      setCurrentPassword('');
      setPassword('');
      setConfirmPassword('');
      setConfirmTouched(false);
      setFieldErrors({});
    }

    submittingRef.current = false;
    setSubmitting(false);
  }

  if (done) {
    return (
      <div>
        <div className="flex items-center gap-2 text-[#1B3A2D]">
          <Check className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
          <p className="font-semibold">Password changed</p>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]" role="status">
          Your new password is in place and your old one no longer works. You are still signed in
          here.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setDone(false)}
            className="mef-press rounded-full border border-[#1B3A2D]/10 px-5 py-2.5 text-sm font-medium text-[#1B3A2D] transition hover:border-[#1B3A2D]/30"
          >
            Change it again
          </button>
          <Link
            href="/profile"
            className="mef-press rounded-full bg-[#1B3A2D] px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
          >
            Done
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form className="space-y-4" action={handleSubmit}>
      <PasswordField
        id="currentPassword"
        name="currentPassword"
        label="Current password"
        autoComplete="current-password"
        value={currentPassword}
        error={fieldErrors.currentPassword}
        onChange={(value) => {
          setCurrentPassword(value);
          if (fieldErrors.currentPassword) {
            setFieldErrors((prev) => ({ ...prev, currentPassword: undefined }));
          }
        }}
      />

      <div className="border-t border-[#1B3A2D]/10 pt-4">
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

      <TurnstileGate ref={turnstileRef} />

      {formError && (
        <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {formError}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="mef-press flex w-full items-center justify-center rounded-full bg-[#1B3A2D] px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
      >
        {submitting ? 'Saving…' : 'Change password'}
      </button>

      <p className="text-center text-sm">
        <Link
          href="/reset-password"
          className="font-medium text-[#6B7A72] underline underline-offset-2"
        >
          I do not remember my current password
        </Link>
      </p>
    </form>
  );
}
