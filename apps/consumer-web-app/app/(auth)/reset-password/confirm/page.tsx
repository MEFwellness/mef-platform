'use client';

import { useState } from 'react';
import { updatePassword } from '../../../actions/auth';

export default function ConfirmResetPage() {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  return (
    <>
      <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-2xl text-[#1B3A2D]">
        Set a new password
      </h1>
      <form
        className="mt-5 space-y-4"
        action={async (formData) => {
          setSubmitting(true);
          const result = await updatePassword(formData);
          if (result?.error) setError(result.error);
          setSubmitting(false);
        }}
      >
        <div>
          <label className="text-sm font-medium text-[#1B3A2D]" htmlFor="password">
            New password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            minLength={8}
            required
            className="mt-1.5 w-full rounded-2xl border border-[#1B3A2D]/10 p-3 text-base text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
          />
        </div>
        {error && (
          <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
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
