'use client';

import { useMemo, useState } from 'react';
import { updateProfile } from '@/app/actions/profile';

type Props = {
  displayName: string;
  timezone: string;
};

function getTimezoneOptions(current: string): string[] {
  const supported =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  const options =
    supported.length > 0
      ? supported
      : ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles'];
  return options.includes(current) ? options : [current, ...options];
}

export function ProfileForm({ displayName, timezone }: Props) {
  const timezoneOptions = useMemo(() => getTimezoneOptions(timezone), [timezone]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    setError('');
    setSaved(false);

    const result = await updateProfile(formData);
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    setSaved(true);
  }

  return (
    <form action={handleSubmit}>
      <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">Your details</p>

      <div className="mt-3">
        <label className="text-sm text-[#6B7A72]" htmlFor="displayName">
          Display name
        </label>
        <input
          id="displayName"
          name="displayName"
          type="text"
          required
          defaultValue={displayName}
          className="mt-1.5 w-full rounded-2xl border border-[#1B3A2D]/10 p-3 text-base text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
        />
      </div>

      <div className="mt-4">
        <label className="text-sm text-[#6B7A72]" htmlFor="timezone">
          Timezone
        </label>
        <select
          id="timezone"
          name="timezone"
          defaultValue={timezone}
          className="mt-1.5 w-full rounded-2xl border border-[#1B3A2D]/10 bg-white p-3 text-base text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
        >
          {timezoneOptions.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-[#6B7A72]">
          Used to compute which day your check-ins belong to.
        </p>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {saved && !error && (
        <p role="status" className="mt-4 rounded-2xl bg-[#EFF6F1] px-4 py-3 text-sm text-[#1B3A2D]">
          Saved.
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="mt-4 flex w-full items-center justify-center rounded-full bg-[#1B3A2D] px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
      >
        {submitting ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  );
}
