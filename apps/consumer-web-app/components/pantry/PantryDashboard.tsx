'use client';

/**
 * Client-side orchestrator for the pantry page — holds the member's active
 * pantry items in state (seeded from the server-rendered list) so
 * mark-used/remove/favorite/edit/add all feel instant, same optimistic
 * convention as components/food-products/FoodLogList.tsx. "Use soon" and
 * "Favorites" are derived views over this single list rather than
 * separately-fetched, separately-updated arrays — that way removing or
 * using an item can never leave it behind in another section, which a
 * three-way-synced-state design would risk. Suggestions are recomputed from
 * this same list with the same pure lib/pantry/suggestions.ts function the
 * server action uses, so they update the instant the pantry's contents
 * change instead of only on next page load.
 */

import { useMemo, useState } from 'react';
import type { FoodLensFoodCategory } from '@mef/shared-types-contracts';
import {
  markPantryItemUsedAction,
  removePantryItemAction,
  toggleFavoritePantryItemAction,
  updatePantryItemAction,
  type PantryItemWithProduct,
} from '@/app/actions/pantry';
import { generatePantrySuggestions } from '@/lib/pantry/suggestions';
import { AddPantryItemForm } from './AddPantryItemForm';
import { PantryItemCard, type PantryItemUpdatePatch } from './PantryItemCard';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
const EXPIRING_WITHIN_DAYS = 5;

function isExpiringSoon(item: PantryItemWithProduct): boolean {
  if (!item.expiration_date) return false;
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() + EXPIRING_WITHIN_DAYS);
  return new Date(`${item.expiration_date}T00:00:00`).getTime() <= cutoff.getTime();
}

export function PantryDashboard({ initialActive }: { initialActive: PantryItemWithProduct[] }) {
  const [items, setItems] = useState(initialActive);

  const expiringSoon = useMemo(
    () =>
      items
        .filter(isExpiringSoon)
        .sort((a, b) => (a.expiration_date ?? '').localeCompare(b.expiration_date ?? '')),
    [items]
  );
  const favorites = useMemo(() => items.filter((i) => i.is_favorite), [items]);
  const suggestions = useMemo(
    () =>
      generatePantrySuggestions(
        items.map((i) => ({
          name: i.product?.name ?? i.name,
          category: (i.category as FoodLensFoodCategory) ?? null,
        }))
      ),
    [items]
  );

  function handleAdded(item: PantryItemWithProduct) {
    setItems((prev) => [item, ...prev]);
  }

  async function handleRemove(id: string) {
    const result = await removePantryItemAction(id);
    if (!result.error) setItems((prev) => prev.filter((i) => i.id !== id));
  }

  async function handleMarkUsed(id: string) {
    const result = await markPantryItemUsedAction(id);
    if (!result.error) setItems((prev) => prev.filter((i) => i.id !== id));
  }

  async function handleToggleFavorite(id: string) {
    const result = await toggleFavoritePantryItemAction(id);
    if (!result.error) {
      setItems((prev) =>
        prev.map((i) =>
          i.id === id ? { ...i, is_favorite: result.isFavorite ?? !i.is_favorite } : i
        )
      );
    }
  }

  async function handleUpdate(id: string, patch: PantryItemUpdatePatch) {
    const result = await updatePantryItemAction(id, patch);
    if (!result.error) {
      setItems((prev) =>
        prev.map((i) =>
          i.id === id
            ? {
                ...i,
                quantity_text:
                  patch.quantityText !== undefined ? patch.quantityText : i.quantity_text,
                expiration_date:
                  patch.expirationDate !== undefined ? patch.expirationDate : i.expiration_date,
              }
            : i
        )
      );
    }
  }

  const cardActions = {
    onRemove: handleRemove,
    onMarkUsed: handleMarkUsed,
    onToggleFavorite: handleToggleFavorite,
    onUpdate: handleUpdate,
  };

  return (
    <div className="mt-6 space-y-6">
      <AddPantryItemForm onAdded={handleAdded} />

      {suggestions.length > 0 && (
        <section className={`${CARD} p-5`}>
          <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
            Root&apos;s pantry suggestions
          </p>
          <ul className="mt-3 space-y-3">
            {suggestions.map((suggestion, idx) => (
              <li key={idx} className="text-[15px] leading-relaxed text-[#1B3A2D]">
                {suggestion}
              </li>
            ))}
          </ul>
        </section>
      )}

      {expiringSoon.length > 0 && (
        <section>
          <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#B45309]">
            Use soon
          </p>
          <ul className={`${CARD} divide-y divide-[#1B3A2D]/5 px-2`}>
            {expiringSoon.map((item) => (
              <PantryItemCard key={item.id} item={item} {...cardActions} />
            ))}
          </ul>
        </section>
      )}

      {favorites.length > 0 && (
        <section>
          <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
            Favorites
          </p>
          <ul className={`${CARD} divide-y divide-[#1B3A2D]/5 px-2`}>
            {favorites.map((item) => (
              <PantryItemCard key={item.id} item={item} {...cardActions} />
            ))}
          </ul>
        </section>
      )}

      <section>
        <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
          Everything on hand
        </p>
        {items.length === 0 ? (
          <div className={`${CARD} p-6`}>
            <p className="text-sm text-[#6B7A72]">
              Nothing in your pantry yet — add an item above, or add one straight from a barcode or
              label scan result.
            </p>
          </div>
        ) : (
          <ul className={`${CARD} divide-y divide-[#1B3A2D]/5 px-2`}>
            {items.map((item) => (
              <PantryItemCard key={item.id} item={item} {...cardActions} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
