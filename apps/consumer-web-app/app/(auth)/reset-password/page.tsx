'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { requestPasswordReset } from '../../actions/auth';
import { getFriendlyAuthError } from '@/lib/auth/errors';

export default function ResetPasswordPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  return (
    <>
      <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-2xl text-[#1B3A2D]">
        Reset password
      </h1>
      <form
        className="mt-5 space-y-4"
        action={async (formData) => {
          if (submittingRef.current) return;
          submittingRef.current = true;
          setSubmitting(true);
          const result = await requestPasswordReset(formData);
          setMessage(
            result?.error
              ? getFriendlyAuthError(result.error)
              : 'If that email exists, a reset link has been sent.'
          );
          submittingRef.current = false;
          setSubmitting(false);
        }}
      >
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
        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center rounded-full bg-[#1B3A2D] px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {submitting ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
      {message && (
        <p role="status" className="mt-4 rounded-2xl bg-[#EFF6F1] px-4 py-3 text-sm text-[#1B3A2D]">
          {message}
        </p>
      )}
      <p className="mt-5 text-center text-sm">
        <Link href="/login" className="font-medium text-[#6B7A72] underline underline-offset-2">
          Back to log in
        </Link>
      </p>
    </>
  );
}
