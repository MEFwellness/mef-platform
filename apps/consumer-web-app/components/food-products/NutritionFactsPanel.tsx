import type { ProductNutrients } from '@mef/shared-types-contracts';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

function Row({
  label,
  value,
  unit,
  indent = false,
}: {
  label: string;
  value: number | null;
  unit: string;
  indent?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between py-2 text-sm ${indent ? 'pl-4 text-[#6B7A72]' : 'text-[#1B3A2D]'}`}
    >
      <span>{label}</span>
      <span className="font-medium">{value !== null ? `${value}${unit}` : '—'}</span>
    </div>
  );
}

export function NutritionFactsPanel({ nutrients }: { nutrients: ProductNutrients | null }) {
  if (!nutrients) {
    return (
      <div className={`${CARD} p-6`}>
        <p className="text-sm text-[#6B7A72]">
          Nutrition facts were not available for this product.
        </p>
      </div>
    );
  }

  return (
    <div className={`${CARD} p-6`}>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-lg font-semibold text-[#1B3A2D]">{nutrients.calories ?? '—'}</p>
          <p className="text-[11px] uppercase tracking-wide text-[#9AA79F]">Calories</p>
        </div>
        <div>
          <p className="text-lg font-semibold text-[#1B3A2D]">{nutrients.protein_g ?? '—'}g</p>
          <p className="text-[11px] uppercase tracking-wide text-[#9AA79F]">Protein</p>
        </div>
        <div>
          <p className="text-lg font-semibold text-[#1B3A2D]">
            {nutrients.total_carbohydrate_g ?? '—'}g
          </p>
          <p className="text-[11px] uppercase tracking-wide text-[#9AA79F]">Carbs</p>
        </div>
      </div>

      <p className="mt-3 text-center text-[11px] text-[#9AA79F]">
        Per {nutrients.basis === 'per_100g' ? '100g' : 'serving'}
      </p>

      <details className="mt-4 group">
        <summary className="cursor-pointer list-none text-center text-xs font-semibold uppercase tracking-wider text-[#1B3A2D]">
          Complete nutrition facts
        </summary>
        <div className="mt-3 divide-y divide-[#1B3A2D]/5 border-t border-[#1B3A2D]/5">
          <Row label="Total fat" value={nutrients.total_fat_g} unit="g" />
          <Row label="Saturated fat" value={nutrients.saturated_fat_g} unit="g" indent />
          <Row
            label="Monounsaturated fat"
            value={nutrients.monounsaturated_fat_g}
            unit="g"
            indent
          />
          <Row
            label="Polyunsaturated fat"
            value={nutrients.polyunsaturated_fat_g}
            unit="g"
            indent
          />
          <Row label="Trans fat" value={nutrients.trans_fat_g} unit="g" indent />
          <Row label="Total carbohydrate" value={nutrients.total_carbohydrate_g} unit="g" />
          <Row label="Fiber" value={nutrients.fiber_g} unit="g" indent />
          <Row label="Total sugar" value={nutrients.total_sugar_g} unit="g" indent />
          <Row label="Added sugar" value={nutrients.added_sugar_g} unit="g" indent />
          <Row label="Protein" value={nutrients.protein_g} unit="g" />
          <Row label="Sodium" value={nutrients.sodium_mg} unit="mg" />
          <Row label="Potassium" value={nutrients.potassium_mg} unit="mg" />
        </div>
      </details>
    </div>
  );
}
