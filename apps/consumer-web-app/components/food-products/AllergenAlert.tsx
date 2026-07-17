import { AlertTriangle } from 'lucide-react';
import type { AllergenMatch, ProductAllergen } from '@mef/shared-types-contracts';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Strong red warning styling is reserved for a genuine safety concern — a
 * member allergen match — per product requirement §14 ("reserve stronger
 * warning styling for genuine safety concerns"). The product's general
 * declared-allergen list (no match) gets neutral styling, since most
 * members viewing it have no allergy to it at all.
 */
export function AllergenAlert({
  allergens,
  memberMatches,
}: {
  allergens: ProductAllergen[];
  memberMatches: AllergenMatch[];
}) {
  if (allergens.length === 0 && memberMatches.length === 0) return null;

  const contains = allergens.filter((a) => a.kind === 'contains');
  const traces = allergens.filter((a) => a.kind === 'may_contain');

  return (
    <div className={`${CARD} p-6`}>
      {memberMatches.length > 0 && (
        <div className="mb-4 flex items-start gap-2.5 rounded-2xl bg-[#B91C1C]/10 p-4">
          <AlertTriangle
            className="mt-0.5 h-5 w-5 shrink-0 text-[#B91C1C]"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <div>
            <p className="text-sm font-semibold text-[#B91C1C]">
              Matches an allergy on your profile
            </p>
            <p className="mt-1 text-sm leading-relaxed text-[#7F1D1D]">
              This product{' '}
              {memberMatches.some((m) => m.kind === 'contains')
                ? 'declares'
                : 'may contain traces of'}{' '}
              {memberMatches.map((m) => titleCase(m.allergen)).join(', ')}. Please double-check the
              label yourself before eating.
            </p>
          </div>
        </div>
      )}

      <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
        Allergens
      </p>
      {contains.length > 0 && (
        <p className="text-sm text-[#1B3A2D]">
          Contains: {contains.map((a) => titleCase(a.allergen)).join(', ')}
        </p>
      )}
      {traces.length > 0 && (
        <p className="mt-1 text-sm text-[#6B7A72]">
          May contain traces of: {traces.map((a) => titleCase(a.allergen)).join(', ')}
        </p>
      )}
      {contains.length === 0 && traces.length === 0 && (
        <p className="text-sm text-[#6B7A72]">No allergens were declared for this product.</p>
      )}
    </div>
  );
}
