'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { Check } from 'lucide-react';
import type { MealCategory } from '@mef/shared-types-contracts';
import { addFoodLogEntryAction } from '@/app/actions/food-products';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const MEAL_OPTIONS: Array<{ value: MealCategory; label: string }> = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
];

function defaultLocalTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

/** Recalculates displayed totals live as servings change, but only ever writes the servings multiplier — product_nutrients (the per-serving source-of-truth) is never overwritten, per product requirement §16. */
export function AddToFoodLogSheet({
  productId,
  scanId,
  servingSizeText,
  caloriesPerServing,
}: {
  productId: string;
  scanId: string;
  servingSizeText: string | null;
  caloriesPerServing: number | null;
}) {
  const router = useRouter();
  const [servings, setServings] = useState(1);
  const [mealCategory, setMealCategory] = useState<MealCategory>('snack');
  const [time, setTime] = useState(defaultLocalTime());
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    setStatus('saving');
    setError(null);
    const [hours, minutes] = time.split(':').map(Number);
    const consumedAt = new Date();
    consumedAt.setHours(hours ?? 0, minutes ?? 0, 0, 0);

    const result = await addFoodLogEntryAction({
      productId,
      scanId,
      mealCategory,
      servings,
      consumedAt: consumedAt.toISOString(),
    });
    if (result.error) {
      setError(result.error);
      setStatus('error');
      return;
    }
    setStatus('done');
  }

  const scaledCalories =
    caloriesPerServing !== null ? Math.round(caloriesPerServing * servings) : null;

  if (status === 'done') {
    return (
      <div className={`${CARD} flex items-center gap-3 p-6`}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1B3A2D]/[0.08]">
          <Check className="h-4 w-4 text-[#1B3A2D]" strokeWidth={2} aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-medium text-[#1B3A2D]">Added to today&apos;s food log</p>
          <button
            type="button"
            onClick={() => router.push('/food-lens' as Route)}
            className="mt-1 text-xs font-medium text-[#6B7A72] underline"
          >
            Scan another product
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`${CARD} p-6`}>
      <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
        Add to today&apos;s log
      </p>

      <div className="flex items-center gap-3">
        <label className="flex-1">
          <span className="text-xs text-[#6B7A72]">Servings</span>
          <input
            type="number"
            min={0.25}
            step={0.25}
            value={servings}
            onChange={(e) => setServings(Math.max(0.25, Number(e.target.value) || 1))}
            className="mt-1 w-full rounded-xl border border-[#1B3A2D]/15 px-3 py-2 text-sm text-[#1B3A2D] outline-none focus:border-[#1B3A2D]/40"
          />
        </label>
        <label className="flex-1">
          <span className="text-xs text-[#6B7A72]">Meal</span>
          <select
            value={mealCategory}
            onChange={(e) => setMealCategory(e.target.value as MealCategory)}
            className="mt-1 w-full rounded-xl border border-[#1B3A2D]/15 px-3 py-2 text-sm text-[#1B3A2D] outline-none focus:border-[#1B3A2D]/40"
          >
            {MEAL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex-1">
          <span className="text-xs text-[#6B7A72]">Time</span>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="mt-1 w-full rounded-xl border border-[#1B3A2D]/15 px-3 py-2 text-sm text-[#1B3A2D] outline-none focus:border-[#1B3A2D]/40"
          />
        </label>
      </div>

      {servingSizeText && (
        <p className="mt-2 text-xs text-[#9AA79F]">
          {servings}× {servingSizeText}
          {scaledCalories !== null ? ` — approximately ${scaledCalories} calories` : ''}
        </p>
      )}

      {error && <p className="mt-2 text-xs text-[#B45309]">{error}</p>}

      <button
        type="button"
        onClick={handleAdd}
        disabled={status === 'saving'}
        className="mt-4 w-full rounded-full bg-[#1B3A2D] py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        {status === 'saving' ? 'Adding…' : 'Add to food log'}
      </button>
    </div>
  );
}
