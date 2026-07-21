'use client';

/**
 * Manual pantry entry — name is the only required field, matching product
 * requirement §9 ("do not create an overly complex inventory-management
 * system"). Quantity/category/expiration are optional and only revealed
 * once the member starts typing a name, so the default state is a single
 * input + button, not a multi-field form up front. Barcode/label-scan/
 * search-based adds go through addPantryItemFromProductAction instead (from
 * those scan result screens, wired up separately) — this form only covers
 * the manual-entry path.
 */

import { useState, type FormEvent } from 'react';
import { addPantryItemManualAction, type PantryItemWithProduct } from '@/app/actions/pantry';

const CATEGORY_OPTIONS = [
  { value: '', label: 'Let Root guess the category' },
  { value: 'protein', label: 'Protein' },
  { value: 'carb', label: 'Carbohydrate' },
  { value: 'fat', label: 'Fat' },
  { value: 'vegetable', label: 'Vegetable' },
  { value: 'mixed', label: 'Mixed' },
];

export function AddPantryItemForm({ onAdded }: { onAdded: (item: PantryItemWithProduct) => void }) {
  const [name, setName] = useState('');
  const [quantityText, setQuantityText] = useState('');
  const [category, setCategory] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setSaving(true);
    setError(null);
    const result = await addPantryItemManualAction({
      name: trimmed,
      quantityText: quantityText.trim() || null,
      category: category || null,
      expirationDate: expirationDate || null,
    });
    setSaving(false);

    if (result.error || !result.item) {
      setError(result.error ?? 'Could not add this item.');
      return;
    }

    onAdded({ ...result.item, product: null });
    setName('');
    setQuantityText('');
    setCategory('');
    setExpirationDate('');
    setExpanded(false);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[28px] bg-white p-5 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]"
    >
      <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
        Add to your pantry
      </p>
      <div className="mt-3 flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onFocus={() => setExpanded(true)}
          placeholder="e.g. spinach, eggs, olive oil"
          className="flex-1 rounded-xl border border-[#1B3A2D]/15 px-3 py-2 text-base text-[#1B3A2D]"
        />
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="shrink-0 rounded-xl bg-[#1B3A2D] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Adding…' : 'Add'}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="text"
            value={quantityText}
            onChange={(e) => setQuantityText(e.target.value)}
            placeholder="Quantity (e.g. 1 bag)"
            className="min-w-[140px] flex-1 rounded-xl border border-[#1B3A2D]/15 px-3 py-2 text-base text-[#1B3A2D]"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="min-w-[140px] flex-1 rounded-xl border border-[#1B3A2D]/15 px-3 py-2 text-base text-[#1B3A2D]"
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={expirationDate}
            onChange={(e) => setExpirationDate(e.target.value)}
            aria-label="Expiration date"
            className="min-w-[140px] flex-1 rounded-xl border border-[#1B3A2D]/15 px-3 py-2 text-base text-[#1B3A2D]"
          />
        </div>
      )}

      {error && <p className="mt-2 text-xs text-[#B45309]">{error}</p>}
    </form>
  );
}
