/**
 * Fat quality and source context — product requirement §7, the section
 * most central to the MEF philosophy. This module NEVER assigns a
 * good/bad verdict to total fat or saturated fat by themselves, and never
 * labels canola/corn/soybean/sunflower/safflower oil "toxic" or
 * "inflammatory" — it only reports which fat-source category the
 * ingredient list indicates (whole food, processed/industrial, mixed, or
 * unknown when there isn't enough ingredient data to tell), plus the
 * genuinely safety-relevant flags (partially hydrogenated oil, industrial
 * trans fat). Combination judgments (e.g. "high saturated fat AND high
 * added sugar AND low fiber") live in nutrientCombinations.ts, deliberately
 * separate — this module never editorializes about whether the amount
 * "fits" anything.
 */

import type { FatQualityResult, FatSourceCategory } from '@mef/shared-types-contracts';

const SEED_OIL_MARKERS = [
  'canola oil',
  'corn oil',
  'soybean oil',
  'sunflower oil',
  'safflower oil',
  'cottonseed oil',
  'grapeseed oil',
  'rice bran oil',
  'vegetable oil',
];
const WHOLE_FOOD_FAT_MARKERS = [
  'olive oil',
  'avocado',
  'almond',
  'walnut',
  'cashew',
  'peanut',
  'pecan',
  'macadamia',
  'hazelnut',
  'pistachio',
  'chia seed',
  'flax seed',
  'flaxseed',
  'sesame',
  'coconut',
  'butter',
  'cream',
  'egg yolk',
  'tahini',
  'nut butter',
];
const HYDROGENATED_OIL_MARKERS = ['partially hydrogenated', 'hydrogenated'];
// Refined fats that aren't botanically "seed oils" (so they stay out of
// containsSeedOil, which is specifically about the canola/corn/soybean/
// sunflower/safflower family the product requirements name) but are still
// an industrially refined fat source, not a whole food — without this, a
// product whose fat is mostly palm oil with a minor whole-food ingredient
// (e.g. a hazelnut spread) misclassifies as fatSourceCategory 'whole_food'
// purely because the whole-food marker happened to match too.
const OTHER_REFINED_FAT_MARKERS = ['palm oil', 'palm kernel oil', 'shortening', 'interesterified'];

function includesAny(haystack: string, markers: string[]): boolean {
  return markers.some((m) => haystack.includes(m));
}

function classifyFatSource(text: string): FatSourceCategory {
  if (!text.trim()) return 'unknown';
  const hasRefinedOil =
    includesAny(text, SEED_OIL_MARKERS) || includesAny(text, OTHER_REFINED_FAT_MARKERS);
  const hasWholeFood = includesAny(text, WHOLE_FOOD_FAT_MARKERS);
  if (hasRefinedOil && hasWholeFood) return 'mixed';
  if (hasRefinedOil) return 'processed_or_industrial';
  if (hasWholeFood) return 'whole_food';
  return 'unknown';
}

export function analyzeFatQuality(input: {
  totalFatG: number | null;
  saturatedFatG: number | null;
  monounsaturatedFatG: number | null;
  polyunsaturatedFatG: number | null;
  transFatG: number | null;
  ingredientsText: string | null;
}): FatQualityResult {
  const text = (input.ingredientsText ?? '').toLowerCase();
  const containsSeedOil = includesAny(text, SEED_OIL_MARKERS);
  const containsPartiallyHydrogenatedOil = includesAny(text, HYDROGENATED_OIL_MARKERS);
  const fatSourceCategory = classifyFatSource(text);

  // Product labels can legally round trans fat to 0g under 0.5g/serving —
  // partially hydrogenated oil in the ingredient list is treated as its own
  // positive signal for industrial trans fat, not just the printed number.
  const hasIndustrialTransFat =
    (input.transFatG !== null && input.transFatG > 0) || containsPartiallyHydrogenatedOil;

  const observations: string[] = [];
  if (containsPartiallyHydrogenatedOil) {
    observations.push('Contains partially hydrogenated oil — a source of industrial trans fat.');
  } else if (hasIndustrialTransFat) {
    observations.push('Lists trans fat.');
  }

  if (fatSourceCategory === 'whole_food') {
    observations.push(
      'The fat in this product appears to come largely from whole-food sources (e.g. nuts, seeds, olive oil, dairy, or eggs).'
    );
  } else if (fatSourceCategory === 'processed_or_industrial') {
    observations.push(
      'The fat in this product appears to come largely from refined vegetable/seed oils.'
    );
  } else if (fatSourceCategory === 'mixed') {
    observations.push(
      'The fat in this product comes from a mix of whole-food and refined oil sources.'
    );
  } else {
    observations.push(
      'The ingredient list did not provide enough detail to identify the fat source.'
    );
  }

  if (input.saturatedFatG !== null) {
    observations.push(
      `Saturated fat: ${input.saturatedFatG}g per serving — considered alongside the rest of the nutrient profile, not on its own.`
    );
  }

  return {
    totalFatG: input.totalFatG,
    saturatedFatG: input.saturatedFatG,
    monounsaturatedFatG: input.monounsaturatedFatG,
    polyunsaturatedFatG: input.polyunsaturatedFatG,
    transFatG: input.transFatG,
    fatSourceCategory,
    containsPartiallyHydrogenatedOil,
    containsSeedOil,
    hasIndustrialTransFat,
    observations,
  };
}
