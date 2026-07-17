/**
 * Matches a product's declared allergens/traces against a member's own
 * stated allergies (member_food_preferences) — never inferred, never
 * guessed from ingredient text beyond what the product database itself
 * flagged as an allergen or trace. member_food_preferences is a real,
 * member-provided source (product requirement §12's "use only data the
 * member has actually provided") — this returns an empty list, not a
 * fabricated "no known allergens" claim, when the member hasn't set any
 * preferences yet.
 */

import type { AllergenMatch, ProductAllergenKind } from '@mef/shared-types-contracts';

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function matchMemberAllergens(
  productAllergens: Array<{ allergen: string; kind: ProductAllergenKind }>,
  memberAllergies: string[]
): AllergenMatch[] {
  if (productAllergens.length === 0 || memberAllergies.length === 0) return [];

  const memberSet = new Set(memberAllergies.map(normalize));
  const matches: AllergenMatch[] = [];

  for (const pa of productAllergens) {
    const normalizedAllergen = normalize(pa.allergen);
    const isMatch = [...memberSet].some(
      (m) => normalizedAllergen.includes(m) || m.includes(normalizedAllergen)
    );
    if (isMatch) matches.push({ allergen: pa.allergen, kind: pa.kind });
  }

  return matches;
}
