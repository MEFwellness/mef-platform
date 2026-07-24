'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { signUp } from '../../actions/auth';
import { isValidEmail, checkPasswordStrength, passwordsMatch } from '@/lib/auth/validation';
import { getFriendlyAuthError } from '@/lib/auth/errors';
import { PasswordField } from '@/components/auth/PasswordField';
import { hasPendingGuestOnboardingData } from '@/lib/onboarding/guestStorage';

const JOURNEY_REASSURANCES = [
  "Save today's assessment",
  'Continue building your Wellness Timeline',
  'Unlock personalized coaching over time',
  'Watch patterns emerge',
];

interface FieldErrors {
  email?: string | undefined;
  password?: string | undefined;
  confirmPassword?: string | undefined;
}

export default function SignUpPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  // False on the server and on first client render (avoids a hydration
  // mismatch), flipped true in an effect if a guest's onboarding answers
  // are waiting in localStorage — see lib/onboarding/guestStorage.ts. A
  // visitor who lands here directly (no prior assessment) sees the
  // unchanged, generic form.
  const [fromOnboarding, setFromOnboarding] = useState(false);

  useEffect(() => {
    setFromOnboarding(hasPendingGuestOnboardingData());
  }, []);

  function confirmPasswordError(pw: string, confirm: string): string | undefined {
    if (!confirm) return undefined;
    return passwordsMatch(pw, confirm) ? undefined : 'Passwords do not match.';
  }

  function validateAll(): boolean {
    const errors: FieldErrors = {};
    if (!isValidEmail(email)) errors.email = 'Enter a valid email address.';

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
    const result = await signUp(formData);
    if (result?.error) {
      setFormError(
        getFriendlyAuthError(result.error, {
          includeRawOnFallback: true,
          fallbackPrefix: 'Account creation failed',
        })
      );
    }
    submittingRef.current = false;
    setSubmitting(false);
  }

  return (
    <>
      {fromOnboarding ? (
        <>
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-2xl text-[#1B3A2D]">
            Save the beginning of your story
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-[#6B7A72]">
            Your reflection is saved on this device for now. Create a free account to carry it
            forward.
          </p>
          <ul className="mt-4 space-y-2">
            {JOURNEY_REASSURANCES.map((line) => (
              <li key={line} className="flex items-center gap-2 text-sm text-[#1B3A2D]">
                <Check className="h-4 w-4 shrink-0 text-[#1B3A2D]/60" strokeWidth={2.5} aria-hidden="true" />
                {line}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-2xl text-[#1B3A2D]">
          Create account
        </h1>
      )}
      <form className="mt-5 space-y-4" action={handleSubmit}>
        <div>
          <label className="text-sm font-medium text-[#1B3A2D]" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (fieldErrors.email && isValidEmail(e.target.value)) {
                setFieldErrors((prev) => ({ ...prev, email: undefined }));
              }
            }}
            onBlur={() => {
              if (email && !isValidEmail(email)) {
                setFieldErrors((prev) => ({ ...prev, email: 'Enter a valid email address.' }));
              }
            }}
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? 'email-error' : undefined}
            className="mt-1.5 w-full rounded-2xl border border-[#1B3A2D]/10 p-3 text-base text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
          />
          {fieldErrors.email && (
            <p id="email-error" role="alert" className="mt-1.5 text-sm text-red-600">
              {fieldErrors.email}
            </p>
          )}
        </div>

        <PasswordField
          id="password"
          name="password"
          label="Password"
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
          label="Confirm password"
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

        <div>
          <label className="text-sm font-medium text-[#1B3A2D]" htmlFor="displayName">
            Display name <span className="font-normal text-[#6B7A72]">(optional)</span>
          </label>
          <input
            id="displayName"
            name="displayName"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1.5 w-full rounded-2xl border border-[#1B3A2D]/10 p-3 text-base text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
          />
        </div>

        <input
          type="hidden"
          name="timezone"
          value={
            typeof Intl !== 'undefined'
              ? Intl.DateTimeFormat().resolvedOptions().timeZone
              : 'America/New_York'
          }
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
          {submitting
            ? 'Saving your story…'
            : fromOnboarding
              ? 'Continue my wellness journey'
              : 'Sign up'}
        </button>
      </form>
      <p className="mt-5 text-center text-sm">
        <Link href="/login" className="font-medium text-[#6B7A72] underline underline-offset-2">
          Already have an account? Log in
        </Link>
      </p>
    </>
  );
}
