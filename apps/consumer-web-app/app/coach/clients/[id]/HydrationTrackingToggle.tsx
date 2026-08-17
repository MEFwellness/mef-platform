'use client';

/**
 * Conditional water tracking (migration 163) — the coach's override.
 *
 * A member decides this for herself at intake, or by answering Root's
 * one-time pop-up. Her coach can change it in either direction afterwards
 * and the member-facing app follows whatever the current value is, because
 * a coach may know she needs water tracked even though she answered that
 * she drinks plenty, and equally may know that she does not need it even
 * though she answered that she forgets.
 *
 * Turning it off hides and stops scoring water everywhere for her. It never
 * deletes anything: every cup she has logged stays on her check-in rows, so
 * turning it back on restores the full history rather than starting over.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Droplet } from 'lucide-react';
import { setClientHydrationFocusAction } from '@/app/actions/hydration';
import type { HydrationFocusSource } from '@/lib/hydration/data';

const SOURCE_LABEL: Record<HydrationFocusSource, string> = {
  intake: 'from her intake answer',
  member_popup: 'from her own answer to Root',
  coach: 'set by a coach',
};

export function HydrationTrackingToggle({
  memberId,
  focus,
  source,
}: {
  memberId: string;
  /** null means she has not been asked yet, which behaves as on. */
  focus: boolean | null;
  source: HydrationFocusSource | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState<boolean>(focus !== false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function set(next: boolean) {
    if (next === value && focus !== null) return;
    setError(null);
    startTransition(async () => {
      const result = await setClientHydrationFocusAction(memberId, next);
      if (result.error) {
        setError(result.error);
        return;
      }
      setValue(next);
      router.refresh();
    });
  }

  return (
    <section className="rounded-[28px] bg-white p-5 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]">
      <div className="flex items-center gap-2 text-[#6B7A72]">
        <Droplet className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">Hydration tracking</p>
      </div>

      <div className="mt-3 flex items-center gap-2" role="group" aria-label="Hydration tracking">
        {([true, false] as const).map((option) => {
          const selected = value === option;
          return (
            <button
              key={String(option)}
              type="button"
              aria-pressed={selected}
              disabled={isPending}
              onClick={() => set(option)}
              className={`mef-focus-ring mef-press rounded-2xl px-5 py-2 text-sm font-semibold transition disabled:opacity-50 ${
                selected
                  ? 'bg-[#1B3A2D] text-[#F5F0E4]'
                  : 'border border-[#1B3A2D]/15 text-[#1B3A2D] hover:border-[#1B3A2D]/35'
              }`}
            >
              {option ? 'On' : 'Off'}
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-[#6B7A72]">
        {value
          ? 'Water appears in her check-in, on her Today screen, and in her scores and trends.'
          : 'Water is hidden from her check-in and Today screen, and is left out of her scores, trends and insights. Everything she has already logged is kept.'}
      </p>

      <p className="mt-1 text-xs text-[#6B7A72]/80">
        {focus === null
          ? 'She has not answered the hydration question yet, so this is the default (on).'
          : `Currently ${SOURCE_LABEL[source ?? 'coach']}.`}
      </p>

      {error && <p className="mt-2 text-xs font-medium text-red-700">{error}</p>}
    </section>
  );
}
