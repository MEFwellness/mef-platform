'use client';

/**
 * Not Yet's own day-7 reflection for The Noticing — the one place in
 * Readiness Pulse that needs the build brief's exact tap-count-tiered
 * copy (0 taps / 1-2 taps / 3+ taps, lib/readiness-pulse/copy.ts's
 * rplNoticingDay7Text) rather than the generic Day7Pattern classification
 * every other experience/pattern shares via CvsDay7FollowUp. Structurally
 * a near-twin of CvsDay7FollowUp (components/core-values-snapshot/
 * CvsFollowUpCards.tsx) — same acknowledge affordance, same "From Root"
 * card shape — just its own copy source.
 */

import { useState, useTransition } from 'react';
import { CVS_CARD } from '@/components/core-values-snapshot/theme';
import { rplNoticingDay7Text } from '@/lib/readiness-pulse/copy';
import type { CvsDailyLogRow } from '@/lib/core-values-snapshot/experiment';

function HighPriorityBadge() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-[#C4A050]/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#854D0E]">
      Waiting on you
    </span>
  );
}

export function RplNotYetDay7({
  experimentId,
  logs,
  cardClassName = CVS_CARD,
  isHighPriority = false,
  onAcknowledge,
}: {
  experimentId: string;
  logs: CvsDailyLogRow[];
  cardClassName?: string;
  isHighPriority?: boolean;
  onAcknowledge: (experimentId: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [isPending, startTransition] = useTransition();
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (acknowledged) return null;

  const yesCount = logs.filter((l) => l.completed === true).length;

  return (
    <div className={`${cardClassName} mef-animate-in p-7`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">From Root</p>
        {isHighPriority && <HighPriorityBadge />}
      </div>
      <p className="mt-2 text-[15px] leading-relaxed text-[#1B3A2D]">{rplNoticingDay7Text(yesCount)}</p>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await onAcknowledge(experimentId);
            if (!result.ok) {
              setError(result.error ?? 'Could not save that.');
              return;
            }
            setAcknowledged(true);
          });
        }}
        className="mef-focus-ring mt-5 inline-flex items-center justify-center rounded-2xl bg-[#1B3A2D] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#163025] disabled:opacity-50"
      >
        Got it
      </button>
    </div>
  );
}
