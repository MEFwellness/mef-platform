'use client';

/**
 * Food log (Part 16) — servings/category/time/notes are editable in place,
 * an entry can be duplicated (re-logged at the current time) or saved as a
 * repeatable meal, and removal is optimistic. member_adjusted (set by
 * editFoodLogEntryAction) marks an entry as member-corrected without ever
 * rewriting the underlying product_nutrients facts.
 */

import { useState, useTransition } from 'react';
import { Trash2, Pencil, Copy, Heart } from 'lucide-react';
import type { FoodLogEntryWithProduct } from '@/app/actions/food-products';
import {
  removeFoodLogEntryAction,
  editFoodLogEntryAction,
  duplicateFoodLogEntryAction,
} from '@/app/actions/food-products';
import { saveMealFromProductAction } from '@/app/actions/food-search';
import type { MealCategory } from '@mef/shared-types-contracts';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
const MEAL_CATEGORIES: MealCategory[] = ['breakfast', 'lunch', 'dinner', 'snack'];

const MEAL_LABEL: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function FoodLogList({ entries: initial }: { entries: FoodLogEntryWithProduct[] }) {
  const [entries, setEntries] = useState(initial);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleRemove(id: string) {
    setRemovingId(id);
    const result = await removeFoodLogEntryAction(id);
    if (!result.error) setEntries((prev) => prev.filter((e) => e.id !== id));
    setRemovingId(null);
  }

  function handleDuplicate(id: string) {
    startTransition(async () => {
      const result = await duplicateFoodLogEntryAction(id);
      if (result.entry) {
        const source = entries.find((e) => e.id === id);
        setEntries((prev) => [...prev, { ...result.entry!, product: source?.product ?? null }]);
        setMessage('Logged again just now.');
      }
    });
  }

  function handleFavorite(entry: FoodLogEntryWithProduct) {
    if (!entry.product) return;
    startTransition(async () => {
      await saveMealFromProductAction(entry.product!.id, entry.product!.name ?? 'Saved food', entry.product!.name ?? 'Saved food');
      setMessage('Saved — find it under repeatable meals from Search.');
    });
  }

  async function handleSaveEdit(id: string, patch: { mealCategory: MealCategory; servings: number; consumedAt: string; notes: string | null }) {
    const result = await editFoodLogEntryAction(id, patch);
    if (!result.error) {
      setEntries((prev) =>
        prev.map((e) =>
          e.id === id
            ? { ...e, meal_category: patch.mealCategory, servings: patch.servings, consumed_at: patch.consumedAt, notes: patch.notes, member_adjusted: true }
            : e
        )
      );
    }
    setEditingId(null);
  }

  if (entries.length === 0) {
    return (
      <div className={`${CARD} p-6`}>
        <p className="text-sm text-[#6B7A72]">
          Nothing logged yet today — scanned products can be added from their result screen.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {message && <p className="text-xs text-[#1B3A2D]">{message}</p>}
      <ul className={`${CARD} divide-y divide-[#1B3A2D]/5 px-2`}>
        {entries.map((entry) =>
          editingId === entry.id ? (
            <li key={entry.id} className="px-4 py-3.5">
              <EditEntryForm
                entry={entry}
                onSave={(patch) => handleSaveEdit(entry.id, patch)}
                onCancel={() => setEditingId(null)}
              />
            </li>
          ) : (
            <li key={entry.id} className="flex items-center justify-between gap-3 px-4 py-3.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[#1B3A2D]">
                  {entry.product?.name ?? entry.manual_label ?? 'Logged item'}
                </p>
                <p className="mt-0.5 text-xs text-[#6B7A72]">
                  {MEAL_LABEL[entry.meal_category] ?? entry.meal_category} · {entry.servings}× serving ·{' '}
                  {formatTime(entry.consumed_at)}
                  {entry.member_adjusted ? ' · edited' : ''}
                </p>
                {entry.notes && <p className="mt-0.5 truncate text-xs text-[#9AA79F]">{entry.notes}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {entry.product && (
                  <button
                    type="button"
                    onClick={() => handleFavorite(entry)}
                    disabled={isPending}
                    aria-label="Save as repeatable meal"
                    className="rounded-full p-2 text-[#9AA79F] hover:bg-[#1B3A2D]/[0.06] hover:text-[#1B3A2D] disabled:opacity-50"
                  >
                    <Heart className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleDuplicate(entry.id)}
                  disabled={isPending}
                  aria-label="Duplicate entry"
                  className="rounded-full p-2 text-[#9AA79F] hover:bg-[#1B3A2D]/[0.06] hover:text-[#1B3A2D] disabled:opacity-50"
                >
                  <Copy className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(entry.id)}
                  aria-label="Edit entry"
                  className="rounded-full p-2 text-[#9AA79F] hover:bg-[#1B3A2D]/[0.06] hover:text-[#1B3A2D]"
                >
                  <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(entry.id)}
                  disabled={removingId === entry.id}
                  aria-label="Remove entry"
                  className="rounded-full p-2 text-[#9AA79F] hover:bg-[#1B3A2D]/[0.06] hover:text-[#B45309] disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                </button>
              </div>
            </li>
          )
        )}
      </ul>
    </div>
  );
}

function EditEntryForm({
  entry,
  onSave,
  onCancel,
}: {
  entry: FoodLogEntryWithProduct;
  onSave: (patch: { mealCategory: MealCategory; servings: number; consumedAt: string; notes: string | null }) => void;
  onCancel: () => void;
}) {
  const [mealCategory, setMealCategory] = useState<MealCategory>(entry.meal_category);
  const [servings, setServings] = useState(String(entry.servings));
  const [consumedAt, setConsumedAt] = useState(toDatetimeLocal(entry.consumed_at));
  const [notes, setNotes] = useState(entry.notes ?? '');

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
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
          type="number"
          inputMode="decimal"
          min="0.25"
          step="0.25"
          value={servings}
          onChange={(e) => setServings(e.target.value)}
          className="rounded-xl border border-[#1B3A2D]/15 px-3 py-2 text-sm text-[#1B3A2D]"
        />
      </div>
      <input
        type="datetime-local"
        value={consumedAt}
        onChange={(e) => setConsumedAt(e.target.value)}
        className="w-full rounded-xl border border-[#1B3A2D]/15 px-3 py-2 text-sm text-[#1B3A2D]"
      />
      <input
        type="text"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Add a note (optional)"
        className="w-full rounded-xl border border-[#1B3A2D]/15 px-3 py-2 text-sm text-[#1B3A2D] placeholder:text-[#9AA79F]"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            const parsedServings = Number(servings);
            if (!Number.isFinite(parsedServings) || parsedServings <= 0) return;
            onSave({
              mealCategory,
              servings: parsedServings,
              consumedAt: new Date(consumedAt).toISOString(),
              notes: notes.trim().length > 0 ? notes.trim() : null,
            });
          }}
          className="rounded-full bg-[#1B3A2D] px-4 py-2 text-xs font-semibold text-white"
        >
          Save
        </button>
        <button type="button" onClick={onCancel} className="rounded-full px-4 py-2 text-xs font-medium text-[#6B7A72]">
          Cancel
        </button>
      </div>
    </div>
  );
}
