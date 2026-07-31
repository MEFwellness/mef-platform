'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { generateCorrectiveProgramDraftAction } from '@/app/actions/corrective-programs';

const EQUIPMENT_OPTIONS: { value: string; label: string; defaultOn: boolean }[] = [
  { value: 'bodyweight', label: 'Bodyweight', defaultOn: true },
  { value: 'foam roller', label: 'Foam Roller', defaultOn: true },
  { value: 'ball', label: 'Small Ball', defaultOn: true },
  { value: 'band', label: 'Resistance Band', defaultOn: false },
  { value: 'wall', label: 'Wall', defaultOn: false },
  { value: 'chair', label: 'Chair', defaultOn: false },
  { value: 'towel', label: 'Towel', defaultOn: false },
  { value: 'dumbbell', label: 'Dumbbell', defaultOn: false },
];

export function GenerateDraftPanel({ memberId }: { memberId: string }) {
  const router = useRouter();
  const [daysPerWeek, setDaysPerWeek] = useState<2 | 3>(3);
  const [equipment, setEquipment] = useState<string[]>(
    EQUIPMENT_OPTIONS.filter((e) => e.defaultOn).map((e) => e.value)
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleEquipment(value: string) {
    setEquipment((current) =>
      current.includes(value) ? current.filter((e) => e !== value) : [...current, value]
    );
  }

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      const result = await generateCorrectiveProgramDraftAction({ memberId, daysPerWeek, equipment });
      if (!('programGroupTag' in result)) {
        setError(result.error ?? 'Could not generate a draft. Please try again.');
        return;
      }
      router.push(
        `/coach/corrective-programs/${memberId}/${encodeURIComponent(result.programGroupTag)}` as Route
      );
    });
  }

  return (
    <div className="mt-4">
      <p className="text-xs font-medium text-[#6B7A72]">Days per week</p>
      <div className="mt-2 flex gap-2">
        {([2, 3] as const).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setDaysPerWeek(n)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              daysPerWeek === n
                ? 'bg-[#1B3A2D] text-white'
                : 'bg-[#1B3A2D]/[0.06] text-[#1B3A2D] hover:bg-[#1B3A2D]/[0.12]'
            }`}
          >
            {n}x/week
          </button>
        ))}
      </div>

      <p className="mt-5 text-xs font-medium text-[#6B7A72]">Available equipment</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {EQUIPMENT_OPTIONS.map((opt) => {
          const on = equipment.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggleEquipment(opt.value)}
              aria-pressed={on}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                on
                  ? 'bg-[#F5B700]/[0.2] text-[#854D0E]'
                  : 'bg-[#1B3A2D]/[0.06] text-[#6B7A72] hover:bg-[#1B3A2D]/[0.12]'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {error && <p className="mt-4 text-sm text-red-700">{error}</p>}

      <button
        type="button"
        onClick={handleGenerate}
        disabled={isPending}
        className="mt-5 w-full rounded-full bg-[#1B3A2D] px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? 'Generating…' : 'Generate Draft'}
      </button>
    </div>
  );
}
