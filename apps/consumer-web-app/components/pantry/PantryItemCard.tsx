'use client';

/**
 * One pantry item row — mark used, remove, favorite, and adjust quantity/
 * expiration inline. Same optimistic-update convention as
 * components/food-products/FoodLogList.tsx: the parent (PantryDashboard)
 * owns the item list in state and this component just calls the server
 * action and reports success back up via the on* callbacks, which the
 * parent uses to update state — this card never re-fetches the list itself.
 */

import { useState } from 'react';
import { CheckCircle2, Pencil, Star, Trash2 } from 'lucide-react';
import type { PantryItemWithProduct } from '@/app/actions/pantry';

const CATEGORY_LABEL: Record<string, string> = {
  protein: 'Protein',
  carb: 'Carbohydrate',
  fat: 'Fat',
  vegetable: 'Vegetable',
  mixed: 'Mixed',
  unknown: '',
};

function formatExpiration(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function isPastOrToday(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${dateStr}T00:00:00`).getTime() <= today.getTime();
}

export type PantryItemUpdatePatch = {
  quantityText?: string | null;
  expirationDate?: string | null;
};

export type PantryItemCardProps = {
  item: PantryItemWithProduct;
  onRemove: (id: string) => void | Promise<void>;
  onMarkUsed: (id: string) => void | Promise<void>;
  onToggleFavorite: (id: string) => void | Promise<void>;
  onUpdate: (id: string, patch: PantryItemUpdatePatch) => void | Promise<void>;
};

export function PantryItemCard({
  item,
  onRemove,
  onMarkUsed,
  onToggleFavorite,
  onUpdate,
}: PantryItemCardProps) {
  const [pending, setPending] = useState<'remove' | 'used' | 'favorite' | null>(null);
  const [editing, setEditing] = useState(false);
  const [quantityText, setQuantityText] = useState(item.quantity_text ?? '');
  const [expirationDate, setExpirationDate] = useState(item.expiration_date ?? '');
  const [savingEdit, setSavingEdit] = useState(false);

  const name = item.product?.name ?? item.name;
  const categoryLabel = item.category ? (CATEGORY_LABEL[item.category] ?? '') : '';
  const detailParts = [
    categoryLabel,
    item.quantity_text,
    item.expiration_date ? `Use by ${formatExpiration(item.expiration_date)}` : null,
  ].filter((p): p is string => Boolean(p));

  async function handleRemove() {
    setPending('remove');
    await onRemove(item.id);
    setPending(null);
  }

  async function handleUsed() {
    setPending('used');
    await onMarkUsed(item.id);
    setPending(null);
  }

  async function handleFavorite() {
    setPending('favorite');
    await onToggleFavorite(item.id);
    setPending(null);
  }

  async function handleSaveEdit() {
    setSavingEdit(true);
    await onUpdate(item.id, {
      quantityText: quantityText.trim() || null,
      expirationDate: expirationDate || null,
    });
    setSavingEdit(false);
    setEditing(false);
  }

  return (
    <li className="px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[#1B3A2D]">{name}</p>
          {detailParts.length > 0 && (
            <p className="mt-0.5 text-xs text-[#6B7A72]">{detailParts.join(' · ')}</p>
          )}
          {item.expiration_date && isPastOrToday(item.expiration_date) && (
            <span className="mt-1.5 inline-block rounded-full bg-[#B45309]/10 px-2 py-0.5 text-[11px] font-medium text-[#B45309]">
              Use soon
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={handleFavorite}
            disabled={pending === 'favorite'}
            aria-label={item.is_favorite ? 'Remove from favorites' : 'Mark as favorite'}
            className="rounded-full p-2 text-[#9AA79F] hover:bg-[#1B3A2D]/[0.06] disabled:opacity-50"
          >
            <Star
              className={`h-4 w-4 ${item.is_favorite ? 'fill-[#F5B700] text-[#F5B700]' : ''}`}
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            aria-label="Adjust quantity or expiration"
            className="rounded-full p-2 text-[#9AA79F] hover:bg-[#1B3A2D]/[0.06]"
          >
            <Pencil className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleUsed}
            disabled={pending === 'used'}
            aria-label="Mark used"
            className="rounded-full p-2 text-[#9AA79F] hover:bg-[#1B3A2D]/[0.06] disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleRemove}
            disabled={pending === 'remove'}
            aria-label="Remove item"
            className="rounded-full p-2 text-[#9AA79F] hover:bg-[#1B3A2D]/[0.06] hover:text-[#B45309] disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      </div>

      {editing && (
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-2xl bg-[#1B3A2D]/[0.03] p-3">
          <div className="min-w-[120px] flex-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7A72]">
              Quantity
            </label>
            <input
              type="text"
              value={quantityText}
              onChange={(e) => setQuantityText(e.target.value)}
              placeholder="e.g. 1 dozen"
              className="mt-1 w-full rounded-lg border border-[#1B3A2D]/15 px-2.5 py-1.5 text-base text-[#1B3A2D]"
            />
          </div>
          <div className="min-w-[140px] flex-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7A72]">
              Use by
            </label>
            <input
              type="date"
              value={expirationDate}
              onChange={(e) => setExpirationDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#1B3A2D]/15 px-2.5 py-1.5 text-base text-[#1B3A2D]"
            />
          </div>
          <button
            type="button"
            onClick={handleSaveEdit}
            disabled={savingEdit}
            className="rounded-full bg-[#1B3A2D] px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {savingEdit ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </li>
  );
}
