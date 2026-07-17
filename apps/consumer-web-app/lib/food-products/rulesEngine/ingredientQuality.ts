/**
 * Ingredient-quality analysis — pure functions, no I/O, no AI call. Reads
 * only the product's own ingredient list/text (product requirement §6);
 * never infers a health verdict from list length alone, and never treats
 * every additive as equally concerning (a preservative and an artificial
 * dye are flagged as distinct, separately named observations, not lumped
 * into one "contains additives" scare line).
 */

import type { IngredientQualityResult } from '@mef/shared-types-contracts';

// Keyword lists are intentionally plain substring matches against
// lowercased ingredient text — reviewable and extendable by a human editing
// this file, the same "no AI improvisation over member-facing facts"
// discipline lib/food-lens/mealQuality.ts already applies to meal photos.
const REFINED_FLOUR_MARKERS = [
  'enriched flour',
  'enriched wheat flour',
  'wheat flour',
  'white flour',
  'refined flour',
  'bleached flour',
];
const WHOLE_GRAIN_MARKERS = ['whole wheat', 'whole grain', 'whole oat', 'whole rye', 'whole corn'];
const ADDED_SUGAR_MARKERS = [
  'sugar',
  'corn syrup',
  'high fructose corn syrup',
  'cane sugar',
  'dextrose',
  'maltodextrin',
  'invert sugar',
  'agave',
  'brown sugar',
  'fruit juice concentrate',
  'glucose syrup',
  'molasses',
];
const ARTIFICIAL_SWEETENER_MARKERS = [
  'sucralose',
  'aspartame',
  'acesulfame',
  'saccharin',
  'neotame',
];
const SUGAR_ALCOHOL_MARKERS = [
  'sorbitol',
  'xylitol',
  'erythritol',
  'maltitol',
  'mannitol',
  'isomalt',
];
const HYDROGENATED_OIL_MARKERS = ['partially hydrogenated', 'hydrogenated'];
const ARTIFICIAL_COLOR_MARKERS = [
  'red 40',
  'red 3',
  'yellow 5',
  'yellow 6',
  'blue 1',
  'blue 2',
  'fd&c',
  'artificial color',
  'artificial colour',
];
const PRESERVATIVE_MARKERS = [
  'sodium benzoate',
  'potassium sorbate',
  'bha',
  'bht',
  'sodium nitrite',
  'sodium nitrate',
  'calcium propionate',
  'sulfite',
  'sulfur dioxide',
  'potassium benzoate',
];
const WHOLE_FOOD_FIRST_INGREDIENT_MARKERS = [
  'chicken',
  'beef',
  'turkey',
  'salmon',
  'fish',
  'egg',
  'oat',
  'bean',
  'lentil',
  'vegetable',
  'fruit',
  'tomato',
  'potato',
  'rice',
  'quinoa',
  'nut',
  'seed',
  'milk',
  'yogurt',
  'water',
];

function includesAny(haystack: string, markers: string[]): string[] {
  return markers.filter((m) => haystack.includes(m));
}

export function analyzeIngredientQuality(input: {
  ingredientsText: string | null;
  ingredientsList: string[];
  additives: string[];
  longIngredientListThreshold: number;
}): IngredientQualityResult {
  const text = (input.ingredientsText ?? '').toLowerCase();
  const hasText = text.trim().length > 0;

  const ingredientCount =
    input.ingredientsList.length > 0
      ? input.ingredientsList.length
      : hasText
        ? text.split(',').filter((s) => s.trim().length > 0).length
        : null;

  const refinedFlourHits = includesAny(text, REFINED_FLOUR_MARKERS);
  const wholeGrainHits = includesAny(text, WHOLE_GRAIN_MARKERS);
  const addedSugarHits = includesAny(text, ADDED_SUGAR_MARKERS);
  const artificialSweetenerHits = includesAny(text, ARTIFICIAL_SWEETENER_MARKERS);
  const sugarAlcoholHits = includesAny(text, SUGAR_ALCOHOL_MARKERS);
  const hydrogenatedOilHits = includesAny(text, HYDROGENATED_OIL_MARKERS);
  const artificialColorHits = includesAny(text, ARTIFICIAL_COLOR_MARKERS);
  const preservativeHits = includesAny(text, PRESERVATIVE_MARKERS);

  const dominantIngredients =
    input.ingredientsList.length > 0
      ? input.ingredientsList.slice(0, 3)
      : hasText
        ? text
            .split(',')
            .slice(0, 3)
            .map((s) => s.trim())
        : [];

  const firstIngredient = dominantIngredients[0] ?? '';
  const wholeFoodIngredientsPresent =
    WHOLE_FOOD_FIRST_INGREDIENT_MARKERS.some((m) => firstIngredient.includes(m)) ||
    wholeGrainHits.length > 0;

  const additiveCount = input.additives.length;
  const isLongIngredientList =
    ingredientCount !== null && ingredientCount >= input.longIngredientListThreshold;

  const observations: string[] = [];
  if (!hasText) {
    observations.push('No ingredient list was available from the product database.');
  } else {
    if (wholeFoodIngredientsPresent)
      observations.push('The ingredient list leads with a recognizable whole-food ingredient.');
    if (refinedFlourHits.length > 0 && wholeGrainHits.length === 0)
      observations.push('Contains refined flour.');
    if (wholeGrainHits.length > 0) observations.push('Contains whole grain ingredients.');
    if (addedSugarHits.length > 0)
      observations.push(`Contains added sugar (as ${addedSugarHits[0]}).`);
    if (artificialSweetenerHits.length > 0) observations.push('Contains artificial sweeteners.');
    if (sugarAlcoholHits.length > 0) observations.push('Contains sugar alcohols.');
    if (hydrogenatedOilHits.length > 0)
      observations.push('Contains hydrogenated or partially hydrogenated oil.');
    if (artificialColorHits.length > 0) observations.push('Contains artificial coloring.');
    if (preservativeHits.length > 0)
      observations.push(`Contains preservatives (${preservativeHits.slice(0, 2).join(', ')}).`);
    if (isLongIngredientList)
      observations.push('Has a long ingredient list — length alone is not treated as good or bad.');
  }

  return {
    wholeFoodIngredientsPresent,
    hasRefinedFlour: refinedFlourHits.length > 0 && wholeGrainHits.length === 0,
    hasAddedSugar: addedSugarHits.length > 0,
    hasArtificialSweeteners: artificialSweetenerHits.length > 0,
    hasSugarAlcohols: sugarAlcoholHits.length > 0,
    hasPartiallyHydrogenatedOil: hydrogenatedOilHits.length > 0,
    hasArtificialColors: artificialColorHits.length > 0,
    preservativeCount: preservativeHits.length,
    additiveCount,
    ingredientCount,
    isLongIngredientList,
    dominantIngredients,
    observations,
  };
}
