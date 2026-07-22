'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { updatePassword } from '../../../actions/auth';
import { checkPasswordStrength, passwordsMatch } from '@/lib/auth/validation';
import { getFriendlyAuthError } from '@/lib/auth/errors';
import { PasswordField } from '@/components/auth/PasswordField';

interface FieldErrors {
  password?: string | undefined;
  confirmPassword?: string | undefined;
}

export default function ConfirmResetPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const submittingRef = useRef(false);

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
      setFormError(getFriendlyAuthError(result.error));
    } else {
      setSuccess(true);
    }
    submittingRef.current = false;
    setSubmitting(false);
  }

  if (success) {
    return (
      <>
        <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-2xl text-[#1B3A2D]">
          Password updated
        </h1>
        <p className="mt-4 text-sm text-[#6B7A72]">
          Your password has been successfully updated.
        </p>
        <Link
          href="/login"
          className="mt-6 flex w-full items-center justify-center rounded-full bg-[#1B3A2D] px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110"
        >
          Return to log in
        </Link>
      </>
    );
  }

  return (
    <>
      <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-2xl text-[#1B3A2D]">
        Set a new password
      </h1>
      <form className="mt-5 space-y-4" action={handleSubmit}>
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
          <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {formError}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center rounded-full bg-[#1B3A2D] px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {submitting ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </>
  );
}
