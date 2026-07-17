'use client';

/**
 * Editable list of AI-identified foods — confirm/edit/remove/add-manually.
 * Not a "nice to have": this is core to the "never present estimates as
 * exact facts" requirement and to collecting the correction data phase 2's
 * personalization depends on (docs/food-lens/06-roadmap.md phase 1).
 * After any change, recomputeFoodLensResultAction re-derives the macro
 * estimate/comparison deterministically and regenerates Root's coaching
 * sentence, then this component refreshes the server-rendered page.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, Pencil, Plus } from 'lucide-react';
import type { FoodLensCookingMethod, FoodLensDetectedItem, FoodLensFoodCategory, FoodLensPortionUnit } from '@mef/shared-types-contracts';
import {
  confirmDetectedItemAction,
  rejectDetectedItemAction,
  correctDetectedItemAction,
  addManualFoodItemAction,
  recomputeFoodLensResultAction,
} from '@/app/actions/food-lens';

const CATEGORY_OPTIONS: FoodLensFoodCategory[] = [
  'protein',
  'carb',
  'fat',
  'vegetable',
  'mixed',
  'unknown',
];

const COOKING_METHOD_OPTIONS: FoodLensCookingMethod[] = [
  'unknown',
  'grilled',
  'fried',
  'baked',
  'roasted',
  'steamed',
  'boiled',
  'raw',
  'sauteed',
];

const UNIT_OPTIONS: FoodLensPortionUnit[] = ['servings', 'cups', 'tablespoons', 'teaspoons', 'pieces', 'grams', 'ounces'];

function portionConfidenceLabel(confidence: number | null): string | null {
  if (confidence === null) return null;
  if (confidence >= 0.7) return 'High confidence';
  if (confidence >= 0.4) return 'Likely';
  return 'Needs confirmation';
}

const STATUS_LABEL: Record<FoodLensDetectedItem['status'], string> = {
  pending_confirmation: 'Tap to confirm',
  confirmed: 'Confirmed',
  rejected: 'Removed',
  superseded: 'Corrected',
};

export function DetectedItemsList({
  scanId,
  items,
}: {
  scanId: string;
  items: FoodLensDetectedItem[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingManual, setAddingManual] = useState(false);
  const [manualLabel, setManualLabel] = useState('');
  const [manualCategory, setManualCategory] = useState<FoodLensFoodCategory>('unknown');

  async function afterChange() {
    await recomputeFoodLensResultAction(scanId);
    router.refresh();
  }

  async function handleConfirm(itemId: string) {
    setBusyId(itemId);
    await confirmDetectedItemAction(itemId);
    await afterChange();
    setBusyId(null);
  }

  async function handleReject(itemId: string) {
    setBusyId(itemId);
    await rejectDetectedItemAction(itemId);
    await afterChange();
    setBusyId(null);
  }

  async function handleCorrect(
    itemId: string,
    correctedLabel: string,
    correctedCategory: FoodLensFoodCategory,
    correctedPortionDescription: string | null,
    correctedQuantity: number | null,
    correctedUnit: FoodLensPortionUnit | null,
    correctedCookingMethod: FoodLensCookingMethod,
    correctedIsCondiment: boolean
  ) {
    setBusyId(itemId);
    await correctDetectedItemAction({
      itemId,
      correctedLabel,
      correctedCategory,
      correctedPortionDescription,
      correctedQuantity,
      correctedUnit,
      correctedCookingMethod,
      correctedIsCondiment,
    });
    setEditingId(null);
    await afterChange();
    setBusyId(null);
  }

  async function handleAddManual() {
    if (!manualLabel.trim()) return;
    setBusyId('manual');
    await addManualFoodItemAction({ scanId, label: manualLabel.trim(), category: manualCategory });
    setManualLabel('');
    setManualCategory('unknown');
    setAddingManual(false);
    await afterChange();
    setBusyId(null);
  }

  const visibleItems = items.filter((item) => item.status !== 'rejected' && item.status !== 'superseded');

  return (
    <div className="rounded-[28px] bg-white p-6 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]">
      <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">Detected items</p>
      <p className="mt-1 text-xs text-[#6B7A72]">
        Correct anything Root got wrong — it helps your future scans too. The confidence below is
        how sure Root is that this is the right food, separate from the nutrient-amount confidence
        shown in Macro Balance.
      </p>

      <ul className="mt-4 space-y-2">
        {visibleItems.map((item) => (
          <li key={item.id} className="rounded-2xl border border-[#1B3A2D]/10 p-3">
            {editingId === item.id ? (
              <EditRow
                item={item}
                busy={busyId === item.id}
                onSave={(label, category, portionDescription, quantity, unit, cookingMethod, isCondiment) =>
                  handleCorrect(item.id, label, category, portionDescription, quantity, unit, cookingMethod, isCondiment)
                }
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium capitalize text-[#1B3A2D]">
                    {item.label}
                    {item.is_condiment && (
                      <span className="ml-1.5 rounded-full bg-[#1B3A2D]/[0.06] px-2 py-0.5 text-[10px] font-medium normal-case text-[#6B7A72]">
                        sauce/condiment
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-[#6B7A72]">
                    {item.category} · {(item.confidence * 100).toFixed(0)}% confident this is right ·{' '}
                    {STATUS_LABEL[item.status]}
                  </p>
                  {(item.portion_description || item.cooking_method) && (
                    <p className="mt-0.5 text-xs text-[#9AA79F]">
                      {item.portion_description ?? 'Portion not estimated'}
                      {item.cooking_method && item.cooking_method !== 'unknown' ? ` · ${item.cooking_method}` : ''}
                      {portionConfidenceLabel(item.portion_confidence)
                        ? ` · ${portionConfidenceLabel(item.portion_confidence)}`
                        : ''}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {item.status === 'pending_confirmation' && (
                    <button
                      type="button"
                      onClick={() => handleConfirm(item.id)}
                      disabled={busyId === item.id}
                      aria-label="Confirm"
                      className="rounded-full bg-[#1B3A2D]/10 p-2 text-[#1B3A2D] disabled:opacity-50"
                    >
                      <Check className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditingId(item.id)}
                    disabled={busyId === item.id}
                    aria-label="Edit"
                    className="rounded-full bg-[#1B3A2D]/[0.06] p-2 text-[#1B3A2D] disabled:opacity-50"
                  >
                    <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReject(item.id)}
                    disabled={busyId === item.id}
                    aria-label="Remove"
                    className="rounded-full bg-[#B45309]/10 p-2 text-[#B45309] disabled:opacity-50"
                  >
                    <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {addingManual ? (
        <div className="mt-3 rounded-2xl border border-[#1B3A2D]/10 p-3">
          <input
            type="text"
            value={manualLabel}
            onChange={(e) => setManualLabel(e.target.value)}
            placeholder="e.g. grilled chicken breast"
            className="w-full rounded-xl border border-[#1B3A2D]/15 px-3 py-2 text-sm text-[#1B3A2D]"
          />
          <select
            value={manualCategory}
            onChange={(e) => setManualCategory(e.target.value as FoodLensFoodCategory)}
            className="mt-2 w-full rounded-xl border border-[#1B3A2D]/15 px-3 py-2 text-sm capitalize text-[#1B3A2D]"
          >
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={handleAddManual}
              disabled={busyId === 'manual' || !manualLabel.trim()}
              className="rounded-full bg-[#1B3A2D] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              Add item
            </button>
            <button
              type="button"
              onClick={() => setAddingManual(false)}
              className="rounded-full px-4 py-2 text-xs font-medium text-[#6B7A72]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAddingManual(true)}
          className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-[#1B3A2D]"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          Add something Root missed
        </button>
      )}
    </div>
  );
}

function EditRow({
  item,
  busy,
  onSave,
  onCancel,
}: {
  item: FoodLensDetectedItem;
  busy: boolean;
  onSave: (
    label: string,
    category: FoodLensFoodCategory,
    portionDescription: string | null,
    quantity: number | null,
    unit: FoodLensPortionUnit | null,
    cookingMethod: FoodLensCookingMethod,
    isCondiment: boolean
  ) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(item.label);
  const [category, setCategory] = useState<FoodLensFoodCategory>(item.category);
  const [portionDescription, setPortionDescription] = useState(item.portion_description ?? '');
  const [quantity, setQuantity] = useState(item.quantity === null ? '' : String(item.quantity));
  const [unit, setUnit] = useState<FoodLensPortionUnit>(item.unit ?? 'servings');
  const [cookingMethod, setCookingMethod] = useState<FoodLensCookingMethod>(item.cooking_method ?? 'unknown');
  const [isCondiment, setIsCondiment] = useState(item.is_condiment);

  function handleSave() {
    const trimmedQuantity = quantity.trim();
    const parsedQuantity = trimmedQuantity.length === 0 ? null : Number(trimmedQuantity);
    onSave(
      label.trim(),
      category,
      portionDescription.trim().length > 0 ? portionDescription.trim() : null,
      parsedQuantity !== null && Number.isNaN(parsedQuantity) ? null : parsedQuantity,
      parsedQuantity !== null ? unit : null,
      cookingMethod,
      isCondiment
    );
  }

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className="w-full rounded-xl border border-[#1B3A2D]/15 px-3 py-2 text-sm text-[#1B3A2D]"
      />
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value as FoodLensFoodCategory)}
        className="w-full rounded-xl border border-[#1B3A2D]/15 px-3 py-2 text-sm capitalize text-[#1B3A2D]"
      >
        {CATEGORY_OPTIONS.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <input
        type="text"
        value={portionDescription}
        onChange={(e) => setPortionDescription(e.target.value)}
        placeholder="Portion, e.g. about half a cup"
        className="w-full rounded-xl border border-[#1B3A2D]/15 px-3 py-2 text-sm text-[#1B3A2D] placeholder:text-[#9AA79F]"
      />
      <div className="flex gap-2">
        <input
          type="number"
          inputMode="decimal"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="Amount (optional)"
          className="w-1/2 rounded-xl border border-[#1B3A2D]/15 px-3 py-2 text-sm text-[#1B3A2D] placeholder:text-[#9AA79F]"
        />
        <select
          value={unit}
          onChange={(e) => setUnit(e.target.value as FoodLensPortionUnit)}
          className="w-1/2 rounded-xl border border-[#1B3A2D]/15 px-3 py-2 text-sm text-[#1B3A2D]"
        >
          {UNIT_OPTIONS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </div>
      <select
        value={cookingMethod}
        onChange={(e) => setCookingMethod(e.target.value as FoodLensCookingMethod)}
        className="w-full rounded-xl border border-[#1B3A2D]/15 px-3 py-2 text-sm capitalize text-[#1B3A2D]"
      >
        {COOKING_METHOD_OPTIONS.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2 text-xs text-[#6B7A72]">
        <input type="checkbox" checked={isCondiment} onChange={(e) => setIsCondiment(e.target.checked)} />
        This is a sauce, dressing, or condiment
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={busy || !label.trim()}
          className="rounded-full bg-[#1B3A2D] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full px-4 py-2 text-xs font-medium text-[#6B7A72]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
