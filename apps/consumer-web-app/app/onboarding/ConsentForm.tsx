'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { recordAllConsents } from '../actions/consent';
import { CONSENT_ITEMS } from '@/lib/consent/copy';

export function ConsentForm() {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accepted) {
      setError('Please accept all required items before continuing.');
      return;
    }

    setSubmitting(true);
    setError('');

    const result = await recordAllConsents();

    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-5">
        {CONSENT_ITEMS.map((item) => (
          <section key={item.type}>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
              {item.title}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-[#6B7A72]">{item.body}</p>
          </section>
        ))}
      </div>

      <label className="mt-6 flex items-start gap-3 border-t border-[#1B3A2D]/10 pt-5 text-sm text-[#1B3A2D]">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(event) => setAccepted(event.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[#F5B700]"
        />
        I have reviewed and accept all of the items above.
      </label>

      {error ? (
        <p role="alert" className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="mt-5">
        <button
          type="submit"
          disabled={!accepted || submitting}
          className="flex w-full items-center justify-center rounded-full bg-[#1B3A2D] px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {submitting ? 'Saving...' : 'Accept and continue'}
        </button>
      </div>
    </form>
  );
}
