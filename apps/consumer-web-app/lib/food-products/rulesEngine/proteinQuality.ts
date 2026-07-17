/**
 * Protein quality — product requirement §9. Reports amount, whether it's
 * nutritionally meaningful, whether the product is marketed as high-protein
 * while actually providing only a modest amount, and — only when the
 * ingredient list actually supports it — whether the primary protein
 * source reads as whole-food or a processed/isolated protein source. Never
 * claims "complete" or "incomplete" protein; that requires amino-acid data
 * this app doesn't have.
 */

import type { ProteinQualityResult } from '@mef/shared-types-contracts';

const PROCESSED_PROTEIN_MARKERS = [
  'protein isolate',
  'protein concentrate',
  'whey protein',
  'soy protein isolate',
  'textured vegetable protein',
];
const WHOLE_FOOD_PROTEIN_MARKERS = [
  'chicken',
  'beef',
  'turkey',
  'salmon',
  'fish',
  'egg',
  'milk',
  'yogurt',
  'bean',
  'lentil',
  'tofu',
  'greek yogurt',
  'cottage cheese',
];

function includesAny(haystack: string, markers: string[]): boolean {
  return markers.some((m) => haystack.includes(m));
}

export function analyzeProteinQuality(input: {
  proteinG: number | null;
  productName: string | null;
  ingredientsText: string | null;
  meaningfulProteinThresholdG: number;
  highProteinMarketingThresholdG: number;
}): ProteinQualityResult {
  const text = (input.ingredientsText ?? '').toLowerCase();
  const nameText = (input.productName ?? '').toLowerCase();

  const isMeaningfulAmount =
    input.proteinG !== null && input.proteinG >= input.meaningfulProteinThresholdG;

  const marketedAsHighProtein =
    nameText.includes('protein') ||
    nameText.includes('high-protein') ||
    nameText.includes('high protein');
  const isMarketedHighProteinButModest =
    marketedAsHighProtein &&
    input.proteinG !== null &&
    input.proteinG < input.highProteinMarketingThresholdG;

  let primaryProteinSourceWholeFood: boolean | null = null;
  if (text.trim()) {
    const hasProcessedMarker = includesAny(text, PROCESSED_PROTEIN_MARKERS);
    const hasWholeFoodMarker = includesAny(text, WHOLE_FOOD_PROTEIN_MARKERS);
    if (hasProcessedMarker && !hasWholeFoodMarker) primaryProteinSourceWholeFood = false;
    else if (hasWholeFoodMarker && !hasProcessedMarker) primaryProteinSourceWholeFood = true;
    // Both or neither present: genuinely ambiguous from ingredient text
    // alone, left null rather than guessed.
  }

  const observations: string[] = [];
  if (input.proteinG === null) {
    observations.push('Protein amount was not available from the product database.');
  } else {
    observations.push(
      isMeaningfulAmount
        ? `Provides ${input.proteinG}g of protein per serving — a nutritionally meaningful amount.`
        : `Provides ${input.proteinG}g of protein per serving — a modest amount.`
    );
  }
  if (isMarketedHighProteinButModest) {
    observations.push(
      'The product name suggests a high-protein positioning, but the protein amount per serving is modest.'
    );
  }
  if (primaryProteinSourceWholeFood === true)
    observations.push('The protein appears to come primarily from a whole-food source.');
  if (primaryProteinSourceWholeFood === false)
    observations.push(
      'The protein appears to come primarily from an isolated or concentrated protein ingredient.'
    );

  return {
    proteinG: input.proteinG,
    isMeaningfulAmount,
    isMarketedHighProteinButModest,
    primaryProteinSourceWholeFood,
    observations,
  };
}
