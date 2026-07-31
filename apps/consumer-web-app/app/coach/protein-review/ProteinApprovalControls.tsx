'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { Loader2 } from 'lucide-react';
import { approveProteinTargetAction } from '@/app/actions/protein-review';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

export function ProteinApprovalControls({
  targetId,
  computedGrams,
}: {
  targetId: string;
  computedGrams: number;
}) {
  const router = useRouter();
  const [activeGrams, setActiveGrams] = useState(String(computedGrams));
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleApprove() {
    setError(null);
    const parsed = Number(activeGrams);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Enter a valid protein target.');
      return;
    }
    startTransition(async () => {
      const result = await approveProteinTargetAction(targetId, parsed);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push('/coach/protein-review' as Route);
      router.refresh();
    });
  }

  const isEdited = Number(activeGrams) !== computedGrams;

  return (
    <div className={`${CARD} p-6`}>
      <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
        Approve target
      </p>
      <label className="mt-3 block text-sm text-[#1B3A2D]">
        Protein target (grams/day)
        <input
          type="number"
          inputMode="decimal"
          value={activeGrams}
          onChange={(e) => setActiveGrams(e.target.value)}
          className="mt-1.5 w-full rounded-2xl border border-[#B9C6BF] px-4 py-2.5 text-sm text-[#1B3A2D] focus:border-[#1B3A2D] focus:outline-none"
        />
      </label>
      {isEdited && (
        <p className="mt-2 text-xs text-[#854D0E]">
          Different from the computed value ({computedGrams}g) — this will be recorded as a coach
          edit.
        </p>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={handleApprove}
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-2xl bg-[#1B3A2D] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025] disabled:opacity-40"
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {isEdited ? 'Save edited target' : 'Approve as calculated'}
        </button>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}
