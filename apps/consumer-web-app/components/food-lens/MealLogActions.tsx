'use client';

/**
 * "Does this look accurate?" gate (product requirement §2) — nothing from
 * a meal-photo scan reaches the food log until the member explicitly
 * confirms it here, separately from confirming individual items above.
 * Also offers saving the confirmed combination as a repeatable saved meal
 * (Part 4).
 *
 * Phase 2 made this the confirm-to-count control for gram estimates too.
 * When the result screen has grams to show, EstimatedMacrosPanel wraps this
 * component and hands down the items she kept with the serving multiplier
 * she set for each; this is still the only button, so there is exactly one
 * moment where a photo's estimates start counting toward her day. When
 * there are no grams (a scan analyzed before Phase 2), no adjustments come
 * down and this behaves exactly as it always did.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { logMealScanToFoodLogAction } from '@/app/actions/food-lens';
import { saveMealFromScanAction } from '@/app/actions/food-search';
import type { MealCategory } from '@mef/shared-types-contracts';
import { SuccessCheck } from '@/components/motion/SuccessCheck';
import { zonedInputValueToInstant } from '@/lib/time/localDate';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
const MEAL_CATEGORIES: MealCategory[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/**
 * `nowForInput()` used to sit in the useState initializer below, reading
 * `new Date()` and the runtime's own offset while rendering. A client
 * component renders twice, so the server pass wrote UTC's clock into the
 * input's value and the browser pass wrote hers, which is the coach-panel
 * defect from B3 wearing a member's clothes. The default is decided on the
 * server now, in her timezone, and handed down, and the same timezone
 * turns what she types back into an instant when she logs it.
 */
export function MealLogActions({
  scanId,
  hasConfirmedItems,
  adjustments,
  showsEstimatedGrams = false,
  nowLocalInputValue,
  timeZone,
}: {
  scanId: string;
  hasConfirmedItems: boolean;
  /** The items she kept and how much of each, when gram estimates are on screen. Undefined for a scan with none, which logs whatever is already confirmed. */
  adjustments?: Array<{ detectedItemId: string; servings: number }> | undefined;
  /** True when estimated grams are being shown above, which is what the copy on this card has to be honest about. */
  showsEstimatedGrams?: boolean | undefined;
  /** Right now as `YYYY-MM-DDTHH:mm` in the member's own timezone, resolved on the server. */
  nowLocalInputValue: string;
  /** The member's own timezone. What the wall clock above, and anything she edits it to, means. */
  timeZone: string;
}) {
  const router = useRouter();
  const [mealCategory, setMealCategory] = useState<MealCategory>('snack');
  const [consumedAt, setConsumedAt] = useState(nowLocalInputValue);
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
        consumedAt: zonedInputValueToInstant(consumedAt, timeZone).toISOString(),
        ...(adjustments ? { adjustments } : {}),
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      // The number quoted back is the number the action actually wrote, not
      // the one this component was displaying, so what she is told counted
      // is what counted.
      const logged = result.proteinGrams;
      setMessage(
        logged !== null && logged !== undefined
          ? `Added to your day. ${Math.round(logged)}g of protein counted.`
          : 'Added to your food log.'
      );
      router.refresh();
    });
  }

  function handleSaveMeal() {
    setError(null);
    setMessage(null);
    startSaving(async () => {
      const result = await saveMealFromScanAction(scanId, mealName);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSavingMeal(false);
      setMealName('');
      setMessage('Saved. You can repeat-log this meal from Search.');
    });
  }

  return (
    <div className={`${CARD} p-5`}>
      <div className="flex items-center gap-2 text-[#1B3A2D]">
        <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold">Does this look accurate?</p>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-[#6B7A72]">
        {showsEstimatedGrams
          ? 'Nothing counts until you confirm. Adjust the amounts above first if any of them look off.'
          : "Add this meal to today's log once the foods and portions above look right."}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <select
          value={mealCategory}
          onChange={(e) => setMealCategory(e.target.value as MealCategory)}
          className="rounded-xl border border-[#1B3A2D]/15 px-3 py-2 text-base capitalize text-[#1B3A2D]"
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
          className="rounded-xl border border-[#1B3A2D]/15 px-3 py-2 text-base text-[#1B3A2D]"
        />
      </div>

      {error && <p className="mt-3 text-sm text-[#B45309]">{error}</p>}
      {message && (
        <div className="mt-3 flex items-center gap-2.5">
          <SuccessCheck size={24} />
          <p className="text-sm text-[#1B3A2D]">{message}</p>
        </div>
      )}

      <button
        type="button"
        onClick={handleLog}
        disabled={isLogging}
        className="mef-press mt-4 w-full rounded-full bg-[#1B3A2D] py-3 text-sm font-semibold text-white disabled:opacity-60"
      >
        {isLogging
          ? 'Adding…'
          : showsEstimatedGrams
            ? 'Confirm and count toward my day'
            : 'Yes, add to my food log'}
      </button>

      {savingMeal ? (
        <div className="mt-3 flex gap-2">
          <input
            value={mealName}
            onChange={(e) => setMealName(e.target.value)}
            placeholder="e.g. My usual breakfast"
            className="flex-1 rounded-xl border border-[#1B3A2D]/15 px-3 py-2 text-base text-[#1B3A2D]"
          />
          <button
            type="button"
            onClick={handleSaveMeal}
            disabled={isSaving || !mealName.trim()}
            className="mef-press rounded-full bg-[#1B3A2D]/[0.08] px-4 py-2 text-xs font-semibold text-[#1B3A2D] disabled:opacity-50"
          >
            Save
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setSavingMeal(true)}
          className="mef-press mt-3 w-full text-center text-xs font-semibold text-[#1B3A2D]"
        >
          Save this combination as a repeatable meal
        </button>
      )}
    </div>
  );
}
