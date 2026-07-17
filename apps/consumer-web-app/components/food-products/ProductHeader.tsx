import type { DataCompleteness, FoodProduct } from '@mef/shared-types-contracts';

const COMPLETENESS_LABEL: Record<DataCompleteness, string> = {
  complete: 'Complete data',
  partial: 'Some data missing',
  minimal: 'Limited data available',
};

const COMPLETENESS_STYLE: Record<DataCompleteness, string> = {
  complete: 'bg-[#1B3A2D]/[0.08] text-[#1B3A2D]',
  partial: 'bg-[#F5B700]/15 text-[#854D0E]',
  minimal: 'bg-[#F5B700]/15 text-[#854D0E]',
};

const DATA_SOURCE_LABEL: Record<FoodProduct['data_source'], string> = {
  open_food_facts: 'Open Food Facts',
  usda_fdc: 'USDA FoodData Central',
  mef_verified: 'MEF Verified',
};

export function ProductHeader({ product }: { product: FoodProduct }) {
  return (
    <div className="rounded-[28px] bg-white p-6 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]">
      <div className="flex gap-4">
        {product.image_url ? (
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-black/5">
            <img
              src={product.image_url}
              alt={product.name ?? 'Product'}
              className="h-full w-full object-cover"
            />
          </div>
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-[#1B3A2D]/[0.06] text-xs text-[#9AA79F]">
            No image
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-2xl leading-tight text-[#1B3A2D]">
            {product.name ?? 'Unnamed product'}
          </h1>
          {product.brand && <p className="mt-0.5 text-sm text-[#6B7A72]">{product.brand}</p>}
          {product.serving_size_text && (
            <p className="mt-1 text-xs text-[#9AA79F]">Serving size: {product.serving_size_text}</p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${COMPLETENESS_STYLE[product.data_completeness]}`}
        >
          {COMPLETENESS_LABEL[product.data_completeness]}
        </span>
        <span className="rounded-full bg-[#1B3A2D]/[0.06] px-2.5 py-1 text-xs font-medium text-[#6B7A72]">
          Source: {DATA_SOURCE_LABEL[product.data_source]}
        </span>
        {product.nutrition_grade && (
          <span className="rounded-full bg-[#1B3A2D]/[0.06] px-2.5 py-1 text-xs font-medium text-[#6B7A72] uppercase">
            Nutri-Score {product.nutrition_grade}
          </span>
        )}
      </div>

      {product.data_completeness !== 'complete' && (
        <p className="mt-3 text-xs leading-relaxed text-[#6B7A72]">
          We found this product, but some nutrient or ingredient information is missing. The
          analysis below is based only on the available data.
        </p>
      )}
    </div>
  );
}
