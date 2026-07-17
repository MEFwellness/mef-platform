import type { ProductIngredients } from '@mef/shared-types-contracts';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

export function IngredientsPanel({ ingredients }: { ingredients: ProductIngredients | null }) {
  if (!ingredients?.ingredients_text) {
    return (
      <div className={`${CARD} p-6`}>
        <p className="mb-1 text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
          Ingredients
        </p>
        <p className="text-sm text-[#6B7A72]">No ingredient list was available for this product.</p>
      </div>
    );
  }

  return (
    <div className={`${CARD} p-6`}>
      <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
        Ingredients
      </p>
      <p className="text-sm leading-relaxed text-[#1B3A2D]">{ingredients.ingredients_text}</p>
      {ingredients.additives.length > 0 && (
        <p className="mt-3 text-xs text-[#9AA79F]">
          Additives noted: {ingredients.additives.join(', ')}
        </p>
      )}
    </div>
  );
}
