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
      {CONSENT_ITEMS.map((item) => (
        <section key={item.type}>
          <h2>{item.title}</h2>
          <p>{item.body}</p>
        </section>
      ))}

      <label>
        <input
          type="checkbox"
          checked={accepted}
          onChange={(event) => setAccepted(event.target.checked)}
        />{' '}
        I have reviewed and accept all of the items above.
      </label>

      {error ? <p role="alert">{error}</p> : null}

      <div>
        <button type="submit" disabled={!accepted || submitting}>
          {submitting ? 'Saving...' : 'Accept and continue'}
        </button>
      </div>
    </form>
  );
}