'use client';

/**
 * Phase 1 manual-entry placeholder for allergies/intolerances/dietary
 * pattern — same discipline as PrimalPatternForm.tsx: nothing else in this
 * schema captures allergy or dietary-restriction data yet (migration 59's
 * header), so a member sets it directly. Powers AllergenAlert matching and
 * Root's packaged-food coaching personalization.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MemberFoodPreferences } from '@mef/shared-types-contracts';
import { setFoodPreferencesAction } from '@/app/actions/food-products';

const DIETARY_PATTERNS = [
  { value: '', label: 'Not set' },
  { value: 'omnivore', label: 'Omnivore' },
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'pescatarian', label: 'Pescatarian' },
  { value: 'keto', label: 'Keto' },
  { value: 'paleo', label: 'Paleo' },
  { value: 'mediterranean', label: 'Mediterranean' },
];

function toList(value: string): string[] {
  return value
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

export function FoodPreferencesForm({ initial }: { initial: MemberFoodPreferences | null }) {
  const router = useRouter();
  const [allergies, setAllergies] = useState(initial?.allergies.join(', ') ?? '');
  const [intolerances, setIntolerances] = useState(initial?.intolerances.join(', ') ?? '');
  const [avoidIngredients, setAvoidIngredients] = useState(
    initial?.avoid_ingredients.join(', ') ?? ''
  );
  const [dietaryPattern, setDietaryPattern] = useState(initial?.dietary_pattern ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    await setFoodPreferencesAction({
      allergies: toList(allergies),
      intolerances: toList(intolerances),
      avoidIngredients: toList(avoidIngredients),
      dietaryPattern: dietaryPattern || null,
    });
    setSaving(false);
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="rounded-[28px] bg-white p-6 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]">
      <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
        Food preferences
      </p>
      <p className="mt-2 text-xs leading-relaxed text-[#6B7A72]">
        Used to flag allergen matches on packaged foods and personalize Root&apos;s coaching.
        Separate multiple entries with commas.
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">Allergies</p>
          <input
            type="text"
            value={allergies}
            onChange={(e) => setAllergies(e.target.value)}
            placeholder="e.g. peanuts, shellfish"
            className="mt-1.5 w-full rounded-xl border border-[#1B3A2D]/15 px-3 py-2 text-base text-[#1B3A2D]"
          />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
            Intolerances
          </p>
          <input
            type="text"
            value={intolerances}
            onChange={(e) => setIntolerances(e.target.value)}
            placeholder="e.g. lactose, gluten"
            className="mt-1.5 w-full rounded-xl border border-[#1B3A2D]/15 px-3 py-2 text-base text-[#1B3A2D]"
          />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
            Ingredients you avoid
          </p>
          <input
            type="text"
            value={avoidIngredients}
            onChange={(e) => setAvoidIngredients(e.target.value)}
            placeholder="e.g. artificial sweeteners"
            className="mt-1.5 w-full rounded-xl border border-[#1B3A2D]/15 px-3 py-2 text-base text-[#1B3A2D]"
          />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
            Dietary pattern
          </p>
          <select
            value={dietaryPattern}
            onChange={(e) => setDietaryPattern(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-[#1B3A2D]/15 px-3 py-2 text-base text-[#1B3A2D]"
          >
            {DIETARY_PATTERNS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="mt-5 w-full rounded-full bg-[#1B3A2D] py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        {saving ? 'Saving…' : saved ? 'Saved' : 'Save preferences'}
      </button>
    </div>
  );
}
