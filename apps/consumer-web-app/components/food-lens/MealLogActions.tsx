'use client';

/**
 * "Does this look accurate?" gate (product requirement §2) — nothing from
 * a meal-photo scan reaches the food log until the member explicitly
 * confirms it here, separately from confirming individual items above.
 * Also offers saving the confirmed combination as a repeatable saved meal
 * (Part 4).
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { logMealScanToFoodLogAction } from '@/app/actions/food-lens';
import { saveMealFromScanAction } from '@/app/actions/food-search';
import type { MealCategory } from '@mef/shared-types-contracts';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
const MEAL_CATEGORIES: MealCategory[] = ['breakfast', 'lunch', 'dinner', 'snack'];

function nowForInput(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function MealLogActions({ scanId, hasConfirmedItems }: { scanId: string; hasConfirmedItems: boolean }) {
  const router = useRouter();
  const [mealCategory, setMealCategory] = useState<MealCategory>('snack');
  const [consumedAt, setConsumedAt] = useState(nowForInput());
  const [isLogging, startLogging] = useTransition();
  const [isSaving, startSaving] = useTransition();
  const [savingMeal, setSavingMeal] = useState(false);
  const [mealName, setMealName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!hasConfirmedItems) return null;

  function handleLog() {
    setError(null);
    setMessage(null);
    startLogging(async () => {
      const result = await logMealScanToFoodLogAction(scanId, {
        mealCategory,
        consumedAt: new Date(consumedAt).toISOString(),
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessage('Added to your food log.');
      router.refresh();
    });
  }

  function handleSaveMeal() {
    setError(null);
    startSaving(async () => {
      const result = await saveMealFromScanAction(scanId, mealName);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSavingMeal(false);
      setMealName('');
      setMessage('Saved — you can repeat-log this meal from Search.');
    });
  }

  return (
    <div className={`${CARD} p-5`}>
      <div className="flex items-center gap-2 text-[#1B3A2D]">
        <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold">Does this look accurate?</p>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-[#6B7A72]">
        Add this meal to today&apos;s log once the foods and portions above look right.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <select
          value={mealCategory}
          onChange={(e) => setMealCategory(e.target.value as MealCategory)}
          className="rounded-xl border border-[#1B3A2D]/15 px-3 py-2 text-sm capitalize text-[#1B3A2D]"
        >
          {MEAL_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          type="datetime-local"
          value={consumedAt}
          onChange={(e) => setConsumedAt(e.target.value)}
          className="rounded-xl border border-[#1B3A2D]/15 px-3 py-2 text-sm text-[#1B3A2D]"
        />
      </div>

      {error && <p className="mt-3 text-sm text-[#B45309]">{error}</p>}
      {message && <p className="mt-3 text-sm text-[#1B3A2D]">{message}</p>}

      <button
        type="button"
        onClick={handleLog}
        disabled={isLogging}
        className="mt-4 w-full rounded-full bg-[#1B3A2D] py-3 text-sm font-semibold text-white disabled:opacity-60"
      >
        {isLogging ? 'Adding…' : 'Yes — add to my food log'}
      </button>

      {savingMeal ? (
        <div className="mt-3 flex gap-2">
          <input
            value={mealName}
            onChange={(e) => setMealName(e.target.value)}
            placeholder="e.g. My usual breakfast"
            className="flex-1 rounded-xl border border-[#1B3A2D]/15 px-3 py-2 text-sm text-[#1B3A2D]"
          />
          <button
            type="button"
            onClick={handleSaveMeal}
            disabled={isSaving || !mealName.trim()}
            className="rounded-full bg-[#1B3A2D]/[0.08] px-4 py-2 text-xs font-semibold text-[#1B3A2D] disabled:opacity-50"
          >
            Save
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setSavingMeal(true)}
          className="mt-3 w-full text-center text-xs font-semibold text-[#1B3A2D]"
        >
          Save this combination as a repeatable meal
        </button>
      )}
    </div>
  );
}
