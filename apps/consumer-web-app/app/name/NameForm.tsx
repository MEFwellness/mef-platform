'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { setDisplayName } from '../actions/profile';

/**
 * Single-field, single-purpose: no email/password here (the account
 * already exists by the time this renders — see app/name/page.tsx), just
 * a name and a "Skip for now" out. Skipping is a real, first-class path
 * (a plain Link, not a disabled/hidden affordance) since display_name has
 * always been optional.
 */
export function NameForm() {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  async function handleSubmit(formData: FormData) {
    if (submittingRef.current) return;

    setError(null);
    if (!name.trim()) {
      setError('Please enter a name, or skip for now.');
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    const result = await setDisplayName(formData);
    if (result?.error) {
      setError(result.error);
      submittingRef.current = false;
      setSubmitting(false);
    }
    // On success, setDisplayName() redirects server-side — nothing else to do here.
  }

  return (
    <>
      <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-2xl text-[#1B3A2D]">
        What should we call you?
      </h1>
      <p className="mt-1.5 text-sm leading-relaxed text-[#6B7A72]">
        This is how we&apos;ll greet you — in the app, and from your coach.
      </p>

      <form className="mt-5 space-y-4" action={handleSubmit}>
        <div>
          <label className="text-sm font-medium text-[#1B3A2D]" htmlFor="displayName">
            Your name
          </label>
          <input
            id="displayName"
            name="displayName"
            type="text"
            required
            autoFocus
            placeholder="e.g. Alex"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'displayName-error' : undefined}
            className="mt-1.5 w-full rounded-2xl border border-[#1B3A2D]/10 p-3 text-base text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
          />
          {error && (
            <p id="displayName-error" role="alert" className="mt-1.5 text-sm text-red-600">
              {error}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center rounded-full bg-[#1B3A2D] px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {submitting ? 'Saving…' : 'Continue'}
        </button>
      </form>

      <p className="mt-5 text-center text-sm">
        <Link href="/" className="font-medium text-[#6B7A72] underline underline-offset-2">
          Skip for now
        </Link>
      </p>
    </>
  );
}
