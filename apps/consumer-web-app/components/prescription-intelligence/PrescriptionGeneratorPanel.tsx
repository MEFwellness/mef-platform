'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { generatePrescriptionAction } from '@/app/actions/prescription-intelligence';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
const INPUT =
  'w-full rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] p-3 text-base text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none';

/** Triggers a new engine run for this member. The engine decides strategy from real Movement Profile / readiness / assessment data — this panel only collects the two inputs that data can't supply on its own (time available today, and an optional goal override). */
export function PrescriptionGeneratorPanel({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [timeAvailableMinutes, setTimeAvailableMinutes] = useState(30);
  const [goalsText, setGoalsText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      const goals = goalsText
        .split(',')
        .map((g) => g.trim())
        .filter(Boolean);
      const result = await generatePrescriptionAction({
        memberId: clientId,
        timeAvailableMinutes,
        goals: goals.length > 0 ? goals : undefined,
      });
      if ('error' in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className={`${CARD} p-6`}>
      <div className="flex items-center gap-2 text-[#854D0E]">
        <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">
          Generate Today&apos;s Strategy
        </p>
      </div>
      <p className="mt-2 text-sm text-[#6B7A72]">
        The engine reads this member&apos;s Movement Profile, today&apos;s readiness, and assessment
        history before selecting a single exercise. Nothing is assigned until you review and approve
        it below.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-[#6B7A72]">
          Time available (minutes)
          <input
            type="number"
            min={10}
            max={90}
            value={timeAvailableMinutes}
            onChange={(e) => setTimeAvailableMinutes(Number(e.target.value))}
            className={INPUT}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-[#6B7A72]">
          Goal override (optional, comma-separated)
          <input
            type="text"
            value={goalsText}
            onChange={(e) => setGoalsText(e.target.value)}
            placeholder="e.g. fat loss, general fitness"
            className={INPUT}
          />
        </label>
      </div>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      <button
        type="button"
        disabled={isPending}
        onClick={handleGenerate}
        className="mt-4 rounded-full bg-[#1B3A2D] px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
      >
        {isPending ? 'Generating…' : 'Generate Prescription'}
      </button>
    </section>
  );
}
