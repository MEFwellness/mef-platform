'use client';

import { useState } from 'react';
import Link from 'next/link';
import { signIn } from '../../actions/auth';

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  return (
    <>
      <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-2xl text-[#1B3A2D]">
        Log in
      </h1>
      <form
        className="mt-5 space-y-4"
        action={async (formData) => {
          setSubmitting(true);
          const result = await signIn(formData);
          if (result?.error) setError(result.error);
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
            className="mt-1.5 w-full rounded-2xl border border-[#1B3A2D]/10 p-3 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
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
            className="mt-1.5 w-full rounded-2xl border border-[#1B3A2D]/10 p-3 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
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
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
      </form>
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
