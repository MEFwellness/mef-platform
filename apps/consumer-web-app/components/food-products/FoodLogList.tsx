'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { FoodLogEntryWithProduct } from '@/app/actions/food-products';
import { removeFoodLogEntryAction } from '@/app/actions/food-products';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const MEAL_LABEL: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function FoodLogList({ entries: initial }: { entries: FoodLogEntryWithProduct[] }) {
  const [entries, setEntries] = useState(initial);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function handleRemove(id: string) {
    setRemovingId(id);
    const result = await removeFoodLogEntryAction(id);
    if (!result.error) setEntries((prev) => prev.filter((e) => e.id !== id));
    setRemovingId(null);
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
    <ul className={`${CARD} divide-y divide-[#1B3A2D]/5 px-2`}>
      {entries.map((entry) => (
        <li key={entry.id} className="flex items-center justify-between gap-3 px-4 py-3.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-[#1B3A2D]">
              {entry.product?.name ?? 'Logged item'}
            </p>
            <p className="mt-0.5 text-xs text-[#6B7A72]">
              {MEAL_LABEL[entry.meal_category] ?? entry.meal_category} · {entry.servings}× serving ·{' '}
              {formatTime(entry.consumed_at)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleRemove(entry.id)}
            disabled={removingId === entry.id}
            aria-label="Remove entry"
            className="shrink-0 rounded-full p-2 text-[#9AA79F] hover:bg-[#1B3A2D]/[0.06] hover:text-[#B45309] disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}
