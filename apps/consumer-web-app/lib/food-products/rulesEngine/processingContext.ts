/**
 * Processing-context estimate — product requirement §10. An estimate, not
 * a verdict: the result is a label plus the specific reason behind it, and
 * this module never uses the label alone to declare a food good or bad
 * (that judgment, if any, happens only in nutrientCombinations.ts /
 * the coaching layer, and even then never from processing level alone).
 */

import type {
  IngredientQualityResult,
  ProcessingContextResult,
  ProcessingLevelLabel,
} from '@mef/shared-types-contracts';

export function estimateProcessingContext(input: {
  ingredientsText: string | null;
  ingredientCount: number | null;
  ingredientQuality: IngredientQualityResult;
}): ProcessingContextResult {
  if (!input.ingredientsText || input.ingredientsText.trim().length === 0) {
    return {
      label: 'moderately_processed' as ProcessingLevelLabel,
      reason:
        'No ingredient list was available, so this is a neutral estimate based on it being a packaged product rather than the ingredients themselves.',
    };
  }

  const iq = input.ingredientQuality;
  const industrialMarkerCount =
    (iq.hasPartiallyHydrogenatedOil ? 1 : 0) +
    (iq.hasArtificialColors ? 1 : 0) +
    (iq.hasArtificialSweeteners ? 1 : 0) +
    (iq.hasSugarAlcohols ? 1 : 0) +
    (iq.preservativeCount > 0 ? 1 : 0);

  const count = input.ingredientCount ?? iq.ingredientCount ?? 0;

  if (count <= 1) {
    return {
      label: 'minimally_processed',
      reason: 'This is a single, unprocessed or barely processed ingredient.',
    };
  }

  if (iq.wholeFoodIngredientsPresent && count <= 5 && industrialMarkerCount === 0) {
    return {
      label: 'lightly_processed',
      reason: `A short ingredient list (${count}) led by whole-food ingredients, with no industrial additives detected.`,
    };
  }

  if (
    iq.hasPartiallyHydrogenatedOil ||
    industrialMarkerCount >= 3 ||
    (count >= 15 && industrialMarkerCount >= 2)
  ) {
    return {
      label: 'highly_processed',
      reason: iq.hasPartiallyHydrogenatedOil
        ? 'Contains partially hydrogenated oil, an industrial processing marker.'
        : `Contains several industrial processing markers (artificial colors, sweeteners, or preservatives) alongside a ${count}-ingredient list.`,
    };
  }

  return {
    label: 'moderately_processed',
    reason: `A ${count}-ingredient list with some processed components but not the concentration of industrial markers that would indicate heavy processing.`,
  };
}
