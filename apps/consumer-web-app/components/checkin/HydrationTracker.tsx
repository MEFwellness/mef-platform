'use client';

/**
 * Live hydration tracker — the dashboard/Today's replacement for the old
 * static "Water: N of 8 cups, read from today's check-in" card. Same
 * plus/minus control the check-in form used to own, now backed by
 * app/actions/events.ts's logHydrationChange, which is the single write
 * path into the standardized member event stream (lib/events/service.ts).
 * A tap here updates the live total immediately (optimistic) and writes
 * one hydration_logged event — there is no "remember your total water
 * intake" step anywhere in this app anymore.
 */

import { useState, useTransition } from 'react';
import { Droplet } from 'lucide-react';
import { logHydrationChange } from '@/app/actions/events';
import { STATUS_STYLES, waterStatus } from '@/lib/wellness/status';

const TRACKER_CARD =
  'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)] flex min-h-[172px] flex-col p-5';

export function HydrationTracker({ initialTotal }: { initialTotal: number }) {
  const [total, setTotal] = useState(initialTotal);
  const [isPending, startTransition] = useTransition();

  function adjust(delta: 1 | -1) {
    setTotal((current) => Math.max(0, current + delta)); // optimistic
    startTransition(async () => {
      const result = await logHydrationChange(delta);
      if (result.total !== undefined) {
        setTotal(result.total); // reconcile with the real server-computed total
      }
    });
  }

  const status = waterStatus(total);

  return (
    <div className={TRACKER_CARD}>
      <div className="flex items-center gap-2 text-[#6B7A72]">
        <Droplet className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">Water</p>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => adjust(-1)}
          disabled={isPending || total === 0}
          aria-label="Remove a cup"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#1B3A2D]/10 text-base text-[#1B3A2D] transition-all duration-150 ease-out hover:border-[#1B3A2D]/30 active:scale-90 disabled:opacity-30"
        >
          −
        </button>
        <p className={`min-w-[3.5rem] text-2xl font-semibold ${STATUS_STYLES[status].text}`}>
          <span key={total} className="mef-pop-in inline-block">
            {total}
          </span>
        </p>
        <button
          type="button"
          onClick={() => adjust(1)}
          disabled={isPending}
          aria-label="Add a cup"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#1B3A2D]/10 text-base text-[#1B3A2D] transition-all duration-150 ease-out hover:border-[#1B3A2D]/30 active:scale-90 disabled:opacity-30"
        >
          +
        </button>
      </div>
      <p className="text-sm font-normal text-[#6B7A72]">of 8 cups today</p>

      <div className="mt-auto pt-3">
        <div className="h-2 w-full overflow-hidden rounded-full bg-[#EFE9DB]">
          <div
            className={`h-full rounded-full transition-all duration-300 ${STATUS_STYLES[status].bar}`}
            style={{ width: `${Math.min(100, (total / 8) * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
