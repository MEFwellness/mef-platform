'use client';

/**
 * Estimated macros for a meal photo, and the one control that makes them
 * count (Phase 2).
 *
 * Three honest rules hold this screen together:
 *
 * 1. A photo number is an estimate and says so. A barcode or a label is
 *    exact; a photo is not, and the copy never blurs the two.
 * 2. Nothing counts until she confirms. Until the button at the bottom is
 *    tapped, the numbers here contribute exactly zero to her day. Leaving
 *    the screen is a decision, and it is respected.
 * 3. The total is the items. Adjusting a serving or removing a food moves
 *    the total by construction, because the total is summed from the rows
 *    right above it (lib/food-lens/macroGrams.ts), never held as a second
 *    figure that has to remember to agree.
 *
 * Protein is the only macro with a daily target in this app, so protein is
 * the only one shown against anything. Carbohydrate and fat are printed as
 * plain information: no bar, no goal, no verdict.
 */

import { useState } from 'react';
import { Minus, Plus, RotateCcw, X } from 'lucide-react';
import type { FoodLensDetectedItem, FoodLensItemMacroEstimate } from '@mef/shared-types-contracts';
import { MealLogActions } from '@/components/food-lens/MealLogActions';
import {
  formatGrams,
  hasAnyGrams,
  mealMacroGrams,
  scaleMacroGrams,
  type AdjustableMacroItem,
  type MacroGrams,
} from '@/lib/food-lens/macroGrams';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
const SERVING_STEP = 0.25;
const MIN_SERVINGS = 0.25;

function servingsLabel(servings: number): string {
  return `${Number(servings.toFixed(2))}x`;
}

function MacroTotal({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex-1 rounded-2xl bg-[#1B3A2D]/[0.04] px-3 py-3 text-center">
      <p className="font-[family-name:var(--font-cormorant-garamond)] text-2xl leading-none text-[#1B3A2D] [font-variant-numeric:lining-nums]">
        {formatGrams(value)}
      </p>
      <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#6B7A72]">
        {label}
      </p>
    </div>
  );
}

export function EstimatedMacrosPanel({
  scanId,
  items,
  itemMacroEstimates,
  nowLocalInputValue,
  timeZone,
}: {
  scanId: string;
  /** Current, non-rejected detected items, in the order the result screen lists them. */
  items: FoodLensDetectedItem[];
  /** Latest gram estimate per detected item id. An item missing from this map was never sized. */
  itemMacroEstimates: Record<string, FoodLensItemMacroEstimate>;
  nowLocalInputValue: string;
  timeZone: string;
}) {
  const [adjustments, setAdjustments] = useState<Record<string, { servings: number; included: boolean }>>(
    {}
  );

  const rows: Array<{
    item: FoodLensDetectedItem;
    base: MacroGrams;
    portionDescription: string | null;
    servings: number;
    included: boolean;
  }> = items.map((item) => {
    const estimate = itemMacroEstimates[item.id];
    const state = adjustments[item.id];
    return {
      item,
      base: {
        proteinG: estimate?.protein_g ?? null,
        carbG: estimate?.carb_g ?? null,
        fatG: estimate?.fat_g ?? null,
      },
      portionDescription: estimate?.portion_description ?? item.portion_description,
      servings: state?.servings ?? 1,
      included: state?.included ?? true,
    };
  });

  const adjustable: AdjustableMacroItem[] = rows.map((row) => ({
    itemId: row.item.id,
    base: row.base,
    servings: row.servings,
    included: row.included,
  }));
  const totals = mealMacroGrams(adjustable);
  const anyGramsAtAll = rows.some((row) => hasAnyGrams(row.base));
  const includedCount = rows.filter((row) => row.included).length;

  function setServings(itemId: string, next: number) {
    setAdjustments((prev) => ({
      ...prev,
      [itemId]: {
        servings: Math.max(MIN_SERVINGS, Number(next.toFixed(2))),
        included: prev[itemId]?.included ?? true,
      },
    }));
  }

  function setIncluded(itemId: string, included: boolean) {
    setAdjustments((prev) => ({
      ...prev,
      [itemId]: { servings: prev[itemId]?.servings ?? 1, included },
    }));
  }

  return (
    <div className="space-y-5">
      {anyGramsAtAll && (
        <div className={`${CARD} p-6`}>
          <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
            Estimated macros
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[#6B7A72]">
            Estimated from your photo. Confirm or adjust before it counts toward your day.
          </p>

          <div className="mt-4 flex gap-2.5">
            <MacroTotal label="Protein" value={totals.proteinG} />
            <MacroTotal label="Carbs" value={totals.carbG} />
            <MacroTotal label="Fat" value={totals.fatG} />
          </div>

          <p className="mt-2.5 text-[11px] leading-relaxed text-[#9AA79F]">
            Protein counts toward your daily protein. Carbs and fat are here for the full picture,
            there is no daily target for either.
          </p>

          <ul className="mt-4 space-y-2.5">
            {rows.map((row) => {
              const scaled = scaleMacroGrams(row.base, row.servings);
              return (
                <li
                  key={row.item.id}
                  className={`rounded-2xl border p-3 ${
                    row.included
                      ? 'border-[#1B3A2D]/10'
                      : 'border-dashed border-[#1B3A2D]/15 opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium capitalize text-[#1B3A2D]">
                        {row.item.label}
                      </p>
                      {row.portionDescription && (
                        <p className="mt-0.5 text-xs text-[#9AA79F]">{row.portionDescription}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setIncluded(row.item.id, !row.included)}
                      aria-label={row.included ? 'Remove from this meal' : 'Add back to this meal'}
                      className="mef-press shrink-0 rounded-full bg-[#1B3A2D]/[0.06] p-2 text-[#6B7A72]"
                    >
                      {row.included ? (
                        <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                      )}
                    </button>
                  </div>

                  {hasAnyGrams(row.base) ? (
                    <p className="mt-2 text-xs text-[#6B7A72]">
                      {formatGrams(scaled.proteinG)} protein, {formatGrams(scaled.carbG)} carbs,{' '}
                      {formatGrams(scaled.fatG)} fat
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-[#9AA79F]">
                      Root could not size this one, so it adds nothing to the totals above.
                    </p>
                  )}

                  {row.included && (
                    <div className="mt-2.5 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setServings(row.item.id, row.servings - SERVING_STEP)}
                        disabled={row.servings <= MIN_SERVINGS}
                        aria-label={`Less ${row.item.label}`}
                        className="mef-press rounded-full bg-[#1B3A2D]/[0.06] p-2 text-[#1B3A2D] disabled:opacity-40"
                      >
                        <Minus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                      </button>
                      <span className="min-w-[3.5rem] text-center text-sm font-semibold text-[#1B3A2D] [font-variant-numeric:lining-nums]">
                        {servingsLabel(row.servings)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setServings(row.item.id, row.servings + SERVING_STEP)}
                        aria-label={`More ${row.item.label}`}
                        className="mef-press rounded-full bg-[#1B3A2D]/[0.06] p-2 text-[#1B3A2D]"
                      >
                        <Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                      </button>
                      <span className="text-xs text-[#9AA79F]">of the amount Root saw</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <MealLogActions
        scanId={scanId}
        // With gram estimates on screen, the confirm button below IS the
        // confirmation, so it is offered as soon as one food is in the
        // meal. Without them, the older rule stands: tick the items first.
        hasConfirmedItems={
          anyGramsAtAll ? includedCount > 0 : items.some((i) => i.status === 'confirmed')
        }
        adjustments={
          anyGramsAtAll
            ? adjustable
                .filter((a) => a.included)
                .map((a) => ({ detectedItemId: a.itemId, servings: a.servings }))
            : undefined
        }
        showsEstimatedGrams={anyGramsAtAll}
        nowLocalInputValue={nowLocalInputValue}
        timeZone={timeZone}
      />
    </div>
  );
}
