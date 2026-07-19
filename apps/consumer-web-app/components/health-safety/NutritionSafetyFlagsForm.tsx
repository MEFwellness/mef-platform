'use client';

/**
 * Self-report entry point for migration 65's member_nutrition_safety_flags
 * — deliberately plain (checkboxes, one save action), matching this
 * prompt's "foundation, not polish" scope. Kept on the Primal Pattern
 * welcome screen because that's the natural moment a member is already
 * thinking about their nutrition, but the data itself is stored
 * independently of any assessment (see lib/health-safety/store.ts) and
 * has no relationship to this assessment's questions or scoring.
 */

import { useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { saveMyNutritionSafetyFlags } from '@/app/actions/primal-pattern';
import { EMPTY_NUTRITION_SAFETY_PROFILE_FLAGS } from '@/lib/health-safety/types';
import type { NutritionSafetyFlags, NutritionSafetyProfile } from '@/lib/health-safety/types';

const FLAG_OPTIONS: { key: keyof Omit<NutritionSafetyFlags, 'otherFlags'>; label: string }[] = [
  { key: 'hasDiabetes', label: 'Diabetes' },
  { key: 'hasPrediabetes', label: 'Prediabetes' },
  { key: 'hasGestationalDiabetes', label: 'Gestational diabetes' },
  { key: 'hasReactiveHypoglycemia', label: 'Reactive hypoglycemia' },
  { key: 'usesInsulin', label: 'Insulin use' },
  { key: 'hasClinicianNutritionPlan', label: 'I follow a nutrition plan from a clinician' },
  { key: 'isPregnant', label: 'Pregnancy' },
];

export function NutritionSafetyFlagsForm({
  initialProfile,
}: {
  initialProfile: NutritionSafetyProfile | null;
}) {
  const [flags, setFlags] = useState<NutritionSafetyFlags>(
    initialProfile?.flags ?? EMPTY_NUTRITION_SAFETY_PROFILE_FLAGS
  );
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  function toggle(key: keyof Omit<NutritionSafetyFlags, 'otherFlags'>) {
    setStatus('idle');
    setFlags((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function handleSave() {
    startTransition(async () => {
      const result = await saveMyNutritionSafetyFlags(flags);
      setStatus(result.ok ? 'saved' : 'error');
    });
  }

  return (
    <div className="rounded-[28px] bg-white p-6 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]">
      <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
        Health safety information
      </p>
      <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">
        Let us know if any of these apply to you. This stays separate from your assessment answers
        and helps keep your coach&apos;s guidance safe for you.
      </p>

      <div className="mt-4 space-y-2">
        {FLAG_OPTIONS.map((option) => (
          <label
            key={option.key}
            className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm text-[#1B3A2D] transition hover:bg-[#F3F6F4]"
          >
            <input
              type="checkbox"
              checked={flags[option.key]}
              onChange={() => toggle(option.key)}
              className="h-4 w-4 rounded border-[#B9C6BF] text-[#1B3A2D] focus:ring-[#1B3A2D]"
            />
            {option.label}
          </label>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-2xl bg-[#1B3A2D] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025] disabled:opacity-40"
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Save
        </button>
        {status === 'saved' && <span className="text-sm text-[#1B3A2D]">Saved.</span>}
        {status === 'error' && (
          <span className="text-sm text-red-600">Something went wrong. Please try again.</span>
        )}
      </div>
    </div>
  );
}
