'use client';

/**
 * Confirm/edit screen for an OCR-extracted Nutrition Facts label — product
 * requirement §1's "member confirmation before saving," "ability to edit
 * incorrect values," and "ability to add missing values manually" (a
 * null-valued field is simply an empty, editable input here — filling it
 * in IS the "add manually" path, no separate flow needed). Nothing is
 * written to the shared product cache until the member presses Confirm.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import {
  confirmFoodLensLabelScanAction,
  updateFoodLensLabelScanFieldsAction,
  type UpdateFoodLensLabelScanFieldsInput,
} from '@/app/actions/food-label';
import type { FoodLensLabelScan } from '@mef/shared-types-contracts';
import type { LabelValidationWarning } from '@/lib/food-lens/labelValidation';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

type NumericFieldKey =
  | 'servingsPerContainer'
  | 'calories'
  | 'proteinG'
  | 'totalCarbohydrateG'
  | 'fiberG'
  | 'totalSugarG'
  | 'addedSugarG'
  | 'totalFatG'
  | 'saturatedFatG'
  | 'transFatG'
  | 'monounsaturatedFatG'
  | 'polyunsaturatedFatG'
  | 'cholesterolMg'
  | 'sodiumMg'
  | 'potassiumMg';

const NUMERIC_FIELD_COLUMN: Record<NumericFieldKey, string> = {
  servingsPerContainer: 'servings_per_container',
  calories: 'calories',
  proteinG: 'protein_g',
  totalCarbohydrateG: 'total_carbohydrate_g',
  fiberG: 'fiber_g',
  totalSugarG: 'total_sugar_g',
  addedSugarG: 'added_sugar_g',
  totalFatG: 'total_fat_g',
  saturatedFatG: 'saturated_fat_g',
  transFatG: 'trans_fat_g',
  monounsaturatedFatG: 'monounsaturated_fat_g',
  polyunsaturatedFatG: 'polyunsaturated_fat_g',
  cholesterolMg: 'cholesterol_mg',
  sodiumMg: 'sodium_mg',
  potassiumMg: 'potassium_mg',
};

const MACRO_FIELDS: Array<{ key: NumericFieldKey; label: string; unit: string }> = [
  { key: 'calories', label: 'Calories', unit: '' },
  { key: 'proteinG', label: 'Protein', unit: 'g' },
  { key: 'totalCarbohydrateG', label: 'Total carbohydrate', unit: 'g' },
  { key: 'fiberG', label: 'Dietary fiber', unit: 'g' },
  { key: 'totalSugarG', label: 'Total sugars', unit: 'g' },
  { key: 'addedSugarG', label: 'Added sugars', unit: 'g' },
  { key: 'totalFatG', label: 'Total fat', unit: 'g' },
  { key: 'saturatedFatG', label: 'Saturated fat', unit: 'g' },
  { key: 'transFatG', label: 'Trans fat', unit: 'g' },
  { key: 'monounsaturatedFatG', label: 'Monounsaturated fat', unit: 'g' },
  { key: 'polyunsaturatedFatG', label: 'Polyunsaturated fat', unit: 'g' },
  { key: 'cholesterolMg', label: 'Cholesterol', unit: 'mg' },
  { key: 'sodiumMg', label: 'Sodium', unit: 'mg' },
  { key: 'potassiumMg', label: 'Potassium', unit: 'mg' },
];

function confidenceLabel(value: number | undefined): { text: string; className: string } {
  if (value === undefined)
    return { text: 'Not read', className: 'bg-[#1B3A2D]/[0.06] text-[#6B7A72]' };
  if (value >= 0.75)
    return { text: 'High confidence', className: 'bg-[#1B3A2D]/[0.08] text-[#1B3A2D]' };
  if (value >= 0.4) return { text: 'Likely', className: 'bg-[#F5B700]/15 text-[#854D0E]' };
  return { text: 'Needs confirmation', className: 'bg-[#B45309]/15 text-[#B45309]' };
}

type Props = {
  scanId: string;
  initialLabelScan: FoodLensLabelScan;
  initialWarnings: LabelValidationWarning[];
  captures: Array<{
    captureId: string;
    signedViewUrl: string | null;
    labelPhotoRole: string | null;
  }>;
};

export function LabelConfirmForm({ scanId, initialLabelScan, initialWarnings, captures }: Props) {
  const router = useRouter();
  const [labelScan, setLabelScan] = useState(initialLabelScan);
  const [warnings, setWarnings] = useState(initialWarnings);
  const [confidence] = useState(initialLabelScan.field_confidence);
  const [isSaving, startSaving] = useTransition();
  const [isConfirming, startConfirming] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function fieldValue(key: NumericFieldKey): number | null {
    const column = NUMERIC_FIELD_COLUMN[key];
    return (labelScan as unknown as Record<string, number | null>)[column] ?? null;
  }

  function saveField(patch: UpdateFoodLensLabelScanFieldsInput) {
    startSaving(async () => {
      const result = await updateFoodLensLabelScanFieldsAction(scanId, patch);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.labelScan) setLabelScan(result.labelScan);
      if (result.validationWarnings) setWarnings(result.validationWarnings);
    });
  }

  function handleConfirm() {
    setError(null);
    startConfirming(async () => {
      const result = await confirmFoodLensLabelScanAction(scanId);
      if (result.status !== 'analyzed') {
        setError(result.error ?? 'Could not confirm this label.');
        return;
      }
      router.push(`/food-lens/barcode/${scanId}` as Route);
    });
  }

  const busy = isSaving || isConfirming;

  return (
    <div className="space-y-5">
      {captures.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {captures.map((c) => (
            <div
              key={c.captureId}
              className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[#1B3A2D]/[0.06]"
            >
              {c.signedViewUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.signedViewUrl}
                  alt={c.labelPhotoRole ?? 'label photo'}
                  className="h-full w-full object-cover"
                />
              )}
            </div>
          ))}
        </div>
      )}

      {warnings.length > 0 && (
        <div className={`${CARD} space-y-2 p-4`}>
          {warnings.map((w) => (
            <div key={w.field} className="flex items-start gap-2">
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0 text-[#B45309]"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <p className="text-xs leading-relaxed text-[#854D0E]">{w.message}</p>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className={`${CARD} p-4`}>
          <p className="text-sm text-[#B45309]">{error}</p>
        </div>
      )}

      <div className={`${CARD} space-y-4 p-5`}>
        <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">Product</p>
        <TextField
          label="Product name"
          value={labelScan.product_name}
          confidence={confidence.product_name}
          disabled={busy}
          onCommit={(v) => saveField({ productName: v })}
        />
        <TextField
          label="Brand"
          value={labelScan.brand}
          confidence={confidence.brand}
          disabled={busy}
          onCommit={(v) => saveField({ brand: v })}
        />
        <TextField
          label="Serving size"
          value={labelScan.serving_size_text}
          confidence={confidence.serving_size_text}
          disabled={busy}
          onCommit={(v) => saveField({ servingSizeText: v })}
        />
        <NumberField
          label="Servings per container"
          value={labelScan.servings_per_container}
          confidence={confidence.servings_per_container}
          disabled={busy}
          onCommit={(v) => saveField({ servingsPerContainer: v })}
        />
      </div>

      <div className={`${CARD} space-y-4 p-5`}>
        <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
          Nutrition Facts
        </p>
        {MACRO_FIELDS.map((f) => (
          <NumberField
            key={f.key}
            label={`${f.label}${f.unit ? ` (${f.unit})` : ''}`}
            value={fieldValue(f.key)}
            confidence={confidence[NUMERIC_FIELD_COLUMN[f.key]]}
            disabled={busy}
            onCommit={(v) => saveField({ [f.key]: v } as UpdateFoodLensLabelScanFieldsInput)}
          />
        ))}
      </div>

      <div className={`${CARD} space-y-4 p-5`}>
        <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
          Ingredients &amp; allergens
        </p>
        <TextAreaField
          label="Ingredients"
          value={labelScan.ingredients_text}
          confidence={confidence.ingredients_text}
          disabled={busy}
          onCommit={(v) => saveField({ ingredientsText: v })}
        />
        <TextAreaField
          label="Allergen statement"
          value={labelScan.allergens_text}
          confidence={confidence.allergens_text}
          disabled={busy}
          onCommit={(v) => saveField({ allergensText: v })}
        />
      </div>

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={busy}
          className="w-full rounded-full bg-[#1B3A2D] py-3.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {isConfirming ? 'Saving…' : 'Confirm & get your guidance'}
        </button>
        <Link
          href={'/food-lens/label/new' as Route}
          className="text-center text-sm font-medium text-[#6B7A72]"
        >
          Start over with new photos
        </Link>
      </div>
    </div>
  );
}

function FieldShell({
  label,
  confidence,
  children,
}: {
  label: string;
  confidence: number | undefined;
  children: React.ReactNode;
}) {
  const badge = confidenceLabel(confidence);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className="text-sm font-medium text-[#1B3A2D]">{label}</label>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.className}`}
        >
          {badge.text}
        </span>
      </div>
      {children}
    </div>
  );
}

function TextField({
  label,
  value,
  confidence,
  disabled,
  onCommit,
}: {
  label: string;
  value: string | null;
  confidence: number | undefined;
  disabled: boolean;
  onCommit: (v: string | null) => void;
}) {
  const [local, setLocal] = useState(value ?? '');
  return (
    <FieldShell label={label} confidence={confidence}>
      <input
        type="text"
        value={local}
        disabled={disabled}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          const next = local.trim().length > 0 ? local.trim() : null;
          if (next !== (value ?? null)) onCommit(next);
        }}
        placeholder="Not read — add it yourself"
        className="w-full rounded-xl border border-[#1B3A2D]/15 px-3 py-2.5 text-base text-[#1B3A2D] placeholder:text-[#9AA79F]"
      />
    </FieldShell>
  );
}

function TextAreaField({
  label,
  value,
  confidence,
  disabled,
  onCommit,
}: {
  label: string;
  value: string | null;
  confidence: number | undefined;
  disabled: boolean;
  onCommit: (v: string | null) => void;
}) {
  const [local, setLocal] = useState(value ?? '');
  return (
    <FieldShell label={label} confidence={confidence}>
      <textarea
        value={local}
        disabled={disabled}
        rows={3}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          const next = local.trim().length > 0 ? local.trim() : null;
          if (next !== (value ?? null)) onCommit(next);
        }}
        placeholder="Not read — add it yourself"
        className="w-full rounded-xl border border-[#1B3A2D]/15 px-3 py-2.5 text-base text-[#1B3A2D] placeholder:text-[#9AA79F]"
      />
    </FieldShell>
  );
}

function NumberField({
  label,
  value,
  confidence,
  disabled,
  onCommit,
}: {
  label: string;
  value: number | null;
  confidence: number | undefined;
  disabled: boolean;
  onCommit: (v: number | null) => void;
}) {
  const [local, setLocal] = useState(value === null ? '' : String(value));
  return (
    <FieldShell label={label} confidence={confidence}>
      <input
        type="number"
        inputMode="decimal"
        value={local}
        disabled={disabled}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          const trimmed = local.trim();
          const next = trimmed.length === 0 ? null : Number(trimmed);
          const normalized = next !== null && Number.isNaN(next) ? null : next;
          if (normalized !== value) onCommit(normalized);
        }}
        placeholder="Not read — add it yourself"
        className="w-full rounded-xl border border-[#1B3A2D]/15 px-3 py-2.5 text-base text-[#1B3A2D] placeholder:text-[#9AA79F]"
      />
    </FieldShell>
  );
}
