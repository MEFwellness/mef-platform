'use client';

/**
 * Today's logged entries — edit (servings, which rescales the confirmed
 * grams proportionally) or delete, reusing the exact same
 * editFoodLogEntryAction/removeFoodLogEntryAction the general Food Lens
 * food log already uses (components/food-products/FoodLogList.tsx) rather
 * than a parallel mutation path, since these are the same member_food_log
 * rows (see app/actions/protein-ledger.ts's header).
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Pencil } from 'lucide-react';
import {
  editFoodLogEntryAction,
  removeFoodLogEntryAction,
} from '@/app/actions/food-products';
import { roundGrams } from '@/lib/protein/ledger';
import type { LedgerEntrySource } from '@/lib/protein/ledger';
import type { FoodLensMealMacroLevel } from '@mef/shared-types-contracts';
import { formatInTimeZone } from '@/lib/time/displayDate';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const SOURCE_LABEL: Record<LedgerEntrySource, string> = {
  scan: 'Scanned',
  search: 'Searched',
  quick_add: 'Quick add',
  meal_photo: 'Meal photo',
};

/**
 * What a meal-photo entry shows in place of a gram figure. Root reads a
 * meal photo as a relative level, never as a measurement, so this is the
 * honest answer rather than a number: the row is present (the meal was
 * logged, and the member can see that it was) and it adds nothing to the
 * tally.
 */
const ESTIMATED_LEVEL_LABEL: Record<FoodLensMealMacroLevel, string> = {
  none: 'No protein read',
  low: 'Low protein',
  moderate: 'Moderate protein',
  high: 'High protein',
};

export type LedgerEntryRow = {
  id: string;
  productName: string | null;
  manualLabel: string | null;
  servings: number;
  consumedAt: string;
  proteinGrams: number | null;
  source: LedgerEntrySource;
  estimatedProteinLevel: FoodLensMealMacroLevel | null;
};

/**
 * `consumed_at` is an instant, and a clock time is the one thing that must
 * never be pinned to UTC: "8:30 PM" would read as "12:30 AM". Her own zone
 * is resolved on the server and handed down, which is both the correct
 * clock and the same string in both render passes.
 */
function formatTime(iso: string, timeZone: string): string {
  return formatInTimeZone(iso, { hour: 'numeric', minute: '2-digit' }, timeZone);
}

export function ProteinLedgerEntries({
  entries: initial,
  timeZone,
}: {
  entries: LedgerEntryRow[];
  /** The member's own timezone, resolved on the server. See formatTime above. */
  timeZone: string;
}) {
  const router = useRouter();
  const [entries, setEntries] = useState(initial);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // The Today view's running-total card (ProteinLedgerProgress) is a
  // sibling fed by the same server page, not by this component's state —
  // router.refresh() re-runs that server fetch so the total stays in sync
  // with every edit/delete made here. Re-syncing local state from the
  // resulting fresh `initial` prop (this effect) is what makes that new
  // total and this list agree, rather than the list being stuck on its own
  // first-render optimistic snapshot forever.
  useEffect(() => {
    setEntries(initial);
  }, [initial]);

  async function handleRemove(id: string) {
    setRemovingId(id);
    const result = await removeFoodLogEntryAction(id);
    if (!result.error) {
      setEntries((prev) => prev.filter((e) => e.id !== id));
      router.refresh();
    }
    setRemovingId(null);
  }

  async function handleSaveServings(id: string, newServings: number) {
    const result = await editFoodLogEntryAction(id, { servings: newServings });
    if (!result.error) {
      setEntries((prev) =>
        prev.map((e) => {
          if (e.id !== id) return e;
          const perServing = e.servings > 0 && e.proteinGrams !== null ? e.proteinGrams / e.servings : null;
          return {
            ...e,
            servings: newServings,
            proteinGrams: perServing !== null ? perServing * newServings : e.proteinGrams,
          };
        })
      );
      router.refresh();
    }
    setEditingId(null);
  }

  if (entries.length === 0) {
    return (
      <div className={`${CARD} p-6`}>
        <p className="text-sm text-[#6B7A72]">
          Nothing logged yet today. Scan, search, or quick add above and I&apos;ll start your tally.
        </p>
      </div>
    );
  }

  return (
    <ul className={`${CARD} divide-y divide-[#1B3A2D]/5 px-2`}>
      {entries.map((entry) =>
        editingId === entry.id ? (
          <li key={entry.id} className="px-4 py-3.5">
            <EditServingsForm
              entry={entry}
              onSave={(servings) => handleSaveServings(entry.id, servings)}
              onCancel={() => setEditingId(null)}
            />
          </li>
        ) : (
          <li key={entry.id} className="flex items-center justify-between gap-3 px-4 py-3.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[#1B3A2D]">
                {entry.productName ?? entry.manualLabel ?? 'Logged item'}
              </p>
              <p className="mt-0.5 text-xs text-[#6B7A72]">
                {formatTime(entry.consumedAt, timeZone)} · {SOURCE_LABEL[entry.source]}
              </p>
              {entry.source === 'meal_photo' && (
                <p className="mt-0.5 text-xs text-[#9AA79F]">
                  Estimated from your photo, so it isn&apos;t counted in grams.
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <p
                className={
                  entry.source === 'meal_photo'
                    ? 'text-right text-xs font-medium text-[#9AA79F]'
                    : 'text-sm font-semibold text-[#1B3A2D]'
                }
              >
                {entry.source === 'meal_photo'
                  ? (entry.estimatedProteinLevel
                      ? ESTIMATED_LEVEL_LABEL[entry.estimatedProteinLevel]
                      : 'Estimated')
                  : entry.proteinGrams !== null
                    ? `${roundGrams(entry.proteinGrams)}g`
                    : '-'}
              </p>
              {entry.source !== 'meal_photo' && (
                <button
                  type="button"
                  onClick={() => setEditingId(entry.id)}
                  aria-label="Edit entry"
                  className="mef-press rounded-full p-2 text-[#9AA79F] hover:bg-[#1B3A2D]/[0.06] hover:text-[#1B3A2D]"
                >
                  <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                onClick={() => handleRemove(entry.id)}
                disabled={removingId === entry.id}
                aria-label="Remove entry"
                className="mef-press rounded-full p-2 text-[#9AA79F] hover:bg-[#1B3A2D]/[0.06] hover:text-[#B45309] disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>
          </li>
        )
      )}
    </ul>
  );
}

function EditServingsForm({
  entry,
  onSave,
  onCancel,
}: {
  entry: LedgerEntryRow;
  onSave: (servings: number) => void;
  onCancel: () => void;
}) {
  const [servings, setServings] = useState(String(entry.servings));
  const perServing =
    entry.servings > 0 && entry.proteinGrams !== null ? entry.proteinGrams / entry.servings : null;
  const parsed = Number(servings);
  const previewGrams =
    perServing !== null && Number.isFinite(parsed) && parsed > 0 ? roundGrams(perServing * parsed) : null;

  return (
    <div className="space-y-2">
      <p className="text-xs text-[#6B7A72]">{entry.productName ?? entry.manualLabel ?? 'Logged item'}</p>
      <div className="flex items-center gap-3">
        <input
          type="number"
          inputMode="decimal"
          min="0.25"
          step="0.25"
          value={servings}
          onChange={(e) => setServings(e.target.value)}
          className="w-24 rounded-xl border border-[#1B3A2D]/15 px-3 py-2 text-base text-[#1B3A2D]"
        />
        <span className="text-xs text-[#6B7A72]">servings</span>
        {previewGrams !== null && (
          <span className="text-sm font-medium text-[#1B3A2D]">= {previewGrams}g</span>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            if (Number.isFinite(parsed) && parsed > 0) onSave(parsed);
          }}
          className="mef-press rounded-full bg-[#1B3A2D] px-4 py-2 text-xs font-semibold text-white"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="mef-press rounded-full px-4 py-2 text-xs font-medium text-[#6B7A72]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
