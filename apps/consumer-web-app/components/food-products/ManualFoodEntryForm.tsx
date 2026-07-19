'use client';

/**
 * Manual food entry (Part 3's fifth option) — the member types what they
 * know; any nutrient field left blank is genuinely null, never guessed at.
 * Submitting creates a real product + runs the full MEF Nutrition Rules
 * Engine, exactly like every other entry point.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { createManualFoodEntryAction } from '@/app/actions/food-manual';

const INPUT =
  'w-full rounded-xl border border-[#1B3A2D]/15 px-3 py-2.5 text-sm text-[#1B3A2D] placeholder:text-[#9AA79F]';
const LABEL = 'mb-1.5 block text-sm font-medium text-[#1B3A2D]';

export function ManualFoodEntryForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [servingSizeText, setServingSizeText] = useState('');
  const [calories, setCalories] = useState('');
  const [proteinG, setProteinG] = useState('');
  const [totalCarbohydrateG, setTotalCarbohydrateG] = useState('');
  const [fiberG, setFiberG] = useState('');
  const [totalFatG, setTotalFatG] = useState('');
  const [saturatedFatG, setSaturatedFatG] = useState('');
  const [sodiumMg, setSodiumMg] = useState('');
  const [ingredientsText, setIngredientsText] = useState('');

  function toNumberOrNull(v: string): number | null {
    const trimmed = v.trim();
    if (trimmed.length === 0) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createManualFoodEntryAction({
        name,
        brand: brand.trim() || null,
        servingSizeText: servingSizeText.trim() || null,
        calories: toNumberOrNull(calories),
        proteinG: toNumberOrNull(proteinG),
        totalCarbohydrateG: toNumberOrNull(totalCarbohydrateG),
        fiberG: toNumberOrNull(fiberG),
        totalFatG: toNumberOrNull(totalFatG),
        saturatedFatG: toNumberOrNull(saturatedFatG),
        sodiumMg: toNumberOrNull(sodiumMg),
        ingredientsText: ingredientsText.trim() || null,
      });
      if (result.error || !result.scanId) {
        setError(result.error ?? 'Could not save this food.');
        return;
      }
      router.push(`/food-lens/barcode/${result.scanId}` as Route);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="rounded-[28px] bg-white p-5 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]">
        <p className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
          What are you adding?
        </p>
        <div className="space-y-4">
          <div>
            <label className={LABEL}>Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Homemade lentil soup"
              className={INPUT}
            />
          </div>
          <div>
            <label className={LABEL}>Brand (optional)</label>
            <input value={brand} onChange={(e) => setBrand(e.target.value)} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Serving size (optional)</label>
            <input
              value={servingSizeText}
              onChange={(e) => setServingSizeText(e.target.value)}
              placeholder="e.g. 1 bowl (about 1.5 cups)"
              className={INPUT}
            />
          </div>
        </div>
      </div>

      <div className="rounded-[28px] bg-white p-5 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]">
        <p className="mb-1 text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
          Nutrition (if you know it)
        </p>
        <p className="mb-4 text-xs text-[#9AA79F]">
          Leave anything blank you&apos;re not sure about — Root will never guess a number for you.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>Calories</label>
            <input
              type="number"
              inputMode="decimal"
              value={calories}
              onChange={(e) => setCalories(e.target.value)}
              className={INPUT}
            />
          </div>
          <div>
            <label className={LABEL}>Protein (g)</label>
            <input
              type="number"
              inputMode="decimal"
              value={proteinG}
              onChange={(e) => setProteinG(e.target.value)}
              className={INPUT}
            />
          </div>
          <div>
            <label className={LABEL}>Total carbohydrate (g)</label>
            <input
              type="number"
              inputMode="decimal"
              value={totalCarbohydrateG}
              onChange={(e) => setTotalCarbohydrateG(e.target.value)}
              className={INPUT}
            />
          </div>
          <div>
            <label className={LABEL}>Fiber (g)</label>
            <input
              type="number"
              inputMode="decimal"
              value={fiberG}
              onChange={(e) => setFiberG(e.target.value)}
              className={INPUT}
            />
          </div>
          <div>
            <label className={LABEL}>Total fat (g)</label>
            <input
              type="number"
              inputMode="decimal"
              value={totalFatG}
              onChange={(e) => setTotalFatG(e.target.value)}
              className={INPUT}
            />
          </div>
          <div>
            <label className={LABEL}>Saturated fat (g)</label>
            <input
              type="number"
              inputMode="decimal"
              value={saturatedFatG}
              onChange={(e) => setSaturatedFatG(e.target.value)}
              className={INPUT}
            />
          </div>
          <div className="col-span-2">
            <label className={LABEL}>Sodium (mg)</label>
            <input
              type="number"
              inputMode="decimal"
              value={sodiumMg}
              onChange={(e) => setSodiumMg(e.target.value)}
              className={INPUT}
            />
          </div>
        </div>
      </div>

      <div className="rounded-[28px] bg-white p-5 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]">
        <label className={LABEL}>Ingredients (optional)</label>
        <textarea
          rows={3}
          value={ingredientsText}
          onChange={(e) => setIngredientsText(e.target.value)}
          placeholder="Comma-separated, in order if you know it"
          className={INPUT}
        />
      </div>

      {error && <p className="text-sm text-[#B45309]">{error}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-full bg-[#1B3A2D] py-3.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {isPending ? 'Saving…' : 'Save & get your guidance'}
      </button>
    </form>
  );
}
