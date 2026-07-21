'use client';

/**
 * Member-editable half of the Movement Profile — the "Automatic Updates"
 * write level (migration 81): goals, equipment access, and mobility/
 * stability/strength priorities. Saves through
 * updateMyMovementProfile → upsert_movement_profile_member_fields, which
 * only ever touches these columns — the coach-controlled fields rendered
 * alongside this form (see MovementProfileCoachSummary) are never
 * reachable from here.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { MovementEquipment } from '@mef/shared-types-contracts';
import { updateMyMovementProfile } from '@/app/actions/movement-profile';
import { TagListEditor } from './TagListEditor';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const EQUIPMENT_OPTIONS: { value: MovementEquipment; label: string }[] = [
  { value: 'none', label: 'None / bodyweight only' },
  { value: 'mat', label: 'Mat' },
  { value: 'resistance_band', label: 'Resistance band' },
  { value: 'light_dumbbells', label: 'Light dumbbells' },
  { value: 'moderate_dumbbells', label: 'Moderate dumbbells' },
  { value: 'kettlebell', label: 'Kettlebell' },
  { value: 'bench', label: 'Bench' },
  { value: 'foam_roller', label: 'Foam roller' },
  { value: 'stability_ball', label: 'Stability ball' },
  { value: 'pull_up_bar', label: 'Pull-up bar' },
  { value: 'other', label: 'Other' },
];

export function MovementProfileForm({
  initialGoals,
  initialEquipmentAccess,
  initialMobilityPriorities,
  initialStabilityPriorities,
  initialStrengthPriorities,
}: {
  initialGoals: string[];
  initialEquipmentAccess: string[];
  initialMobilityPriorities: string[];
  initialStabilityPriorities: string[];
  initialStrengthPriorities: string[];
}) {
  const router = useRouter();
  const [goals, setGoals] = useState(initialGoals);
  const [equipmentAccess, setEquipmentAccess] = useState<string[]>(initialEquipmentAccess);
  const [mobilityPriorities, setMobilityPriorities] = useState(initialMobilityPriorities);
  const [stabilityPriorities, setStabilityPriorities] = useState(initialStabilityPriorities);
  const [strengthPriorities, setStrengthPriorities] = useState(initialStrengthPriorities);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleEquipment(value: MovementEquipment) {
    setEquipmentAccess((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateMyMovementProfile({
        goals,
        equipmentAccess,
        mobilityPriorities,
        stabilityPriorities,
        strengthPriorities,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    });
  }

  return (
    <div className={`${CARD} space-y-5 p-6`}>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">Equipment access</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {EQUIPMENT_OPTIONS.map((option) => {
            const active = equipmentAccess.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => toggleEquipment(option.value)}
                aria-pressed={active}
                className={`rounded-full border px-3.5 py-2 text-xs font-medium transition ${
                  active
                    ? 'border-[#1B3A2D] bg-[#1B3A2D] text-white'
                    : 'border-[#1B3A2D]/15 bg-white text-[#1B3A2D] hover:border-[#1B3A2D]/40'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <TagListEditor
        label="Goals"
        placeholder="e.g. Reduce low back pain"
        values={goals}
        onChange={setGoals}
      />
      <TagListEditor
        label="Mobility priorities"
        placeholder="e.g. Hip flexors"
        values={mobilityPriorities}
        onChange={setMobilityPriorities}
      />
      <TagListEditor
        label="Stability priorities"
        placeholder="e.g. Single-leg balance"
        values={stabilityPriorities}
        onChange={setStabilityPriorities}
      />
      <TagListEditor
        label="Strength priorities"
        placeholder="e.g. Posterior chain"
        values={strengthPriorities}
        onChange={setStrengthPriorities}
      />

      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="flex items-center justify-between gap-3">
        {savedAt ? <p className="text-sm font-medium text-[#1B3A2D]">Saved.</p> : <span />}
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="rounded-full bg-[#1B3A2D] px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? 'Saving…' : 'Save Movement Profile'}
        </button>
      </div>
    </div>
  );
}
