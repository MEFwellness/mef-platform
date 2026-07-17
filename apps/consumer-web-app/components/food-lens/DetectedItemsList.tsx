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
import type { FoodLensDetectedItem, FoodLensFoodCategory } from '@mef/shared-types-contracts';
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

  async function handleCorrect(itemId: string, correctedLabel: string, correctedCategory: FoodLensFoodCategory) {
    setBusyId(itemId);
    await correctDetectedItemAction({ itemId, correctedLabel, correctedCategory });
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
      <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">Detected items</p>
      <p className="mt-1 text-xs text-[#9AA79F]">
        Correct anything Root got wrong — it helps your future scans too.
      </p>

      <ul className="mt-4 space-y-2">
        {visibleItems.map((item) => (
          <li key={item.id} className="rounded-2xl border border-[#1B3A2D]/10 p-3">
            {editingId === item.id ? (
              <EditRow
                item={item}
                busy={busyId === item.id}
                onSave={(label, category) => handleCorrect(item.id, label, category)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium capitalize text-[#1B3A2D]">{item.label}</p>
                  <p className="mt-0.5 text-xs text-[#9AA79F]">
                    {item.category} · {(item.confidence * 100).toFixed(0)}% confidence ·{' '}
                    {STATUS_LABEL[item.status]}
                  </p>
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
  onSave: (label: string, category: FoodLensFoodCategory) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(item.label);
  const [category, setCategory] = useState<FoodLensFoodCategory>(item.category);

  return (
    <div>
      <input
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className="w-full rounded-xl border border-[#1B3A2D]/15 px-3 py-2 text-sm text-[#1B3A2D]"
      />
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value as FoodLensFoodCategory)}
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
          onClick={() => onSave(label.trim(), category)}
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
