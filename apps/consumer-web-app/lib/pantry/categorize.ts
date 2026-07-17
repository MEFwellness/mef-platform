/**
 * Pantry item categorization — product requirement §9. A pantry item gets
 * its `category` from exactly one of two deterministic sources, never both
 * at once (no member-facing item should ever carry two disagreeing category
 * guesses):
 *
 *  1. Linked to a food_products row (product_id set, e.g. added via
 *     barcode/label scan or product search) — category is derived from
 *     that product's own nutrient grams by deriveCategoryFromProductNutrients
 *     below. This reuses analyzeProteinQuality from
 *     lib/food-products/rulesEngine/proteinQuality.ts (and its
 *     DEFAULT_NUTRITION_THRESHOLDS "meaningful protein" cutoff) so "is there
 *     enough protein here to call this a protein item" is decided by the
 *     exact same rule the MEF Nutrition Rules Engine already uses for that
 *     product — not a second, incompatible threshold invented here.
 *     Carb/fat dominance is decided by comparing raw grams directly rather
 *     than calling analyzeCarbQuality/analyzeFatQuality: those two modules
 *     answer "is this carb/fat refined or whole-food," a different question
 *     from "is carb or fat the dominant macro by weight," so reusing them
 *     here would not actually avoid a second system — it would misuse them.
 *  2. No product_id (manual entry with just a name) — category is guessed
 *     from the name via categorizePantryItemName's keyword markers, the
 *     same plain-substring-match discipline as ingredientQuality.ts and
 *     fatQuality.ts use for their own keyword lists.
 *
 * Precedence: a product-derived category always wins when a product_id is
 * present; app/actions/pantry.ts is the only caller that decides which of
 * these two functions to invoke (or to skip both in favor of a category the
 * member picked explicitly), and lib/pantry/data.ts stores whatever single
 * string it's given — it never re-derives or overrides a category itself.
 */

import type { FoodLensFoodCategory } from '@mef/shared-types-contracts';
import { analyzeProteinQuality } from '../food-products/rulesEngine/proteinQuality';
import { DEFAULT_NUTRITION_THRESHOLDS } from '../food-products/rulesEngine/thresholds';

const PROTEIN_MARKERS = [
  'chicken',
  'beef',
  'turkey',
  'pork',
  'salmon',
  'tuna',
  'fish',
  'shrimp',
  'egg',
  'tofu',
  'tempeh',
  'yogurt',
  'cottage cheese',
  'lentil',
  'bean',
  'chickpea',
  'protein powder',
  'steak',
  'bacon',
  'sausage',
  'ground beef',
  'ground turkey',
];
const CARB_MARKERS = [
  'rice',
  'oat',
  'oats',
  'bread',
  'pasta',
  'quinoa',
  'potato',
  'cereal',
  'tortilla',
  'cracker',
  'bagel',
  'flour',
  'grain',
  'noodle',
  'granola',
];
const FAT_MARKERS = [
  'oil',
  'butter',
  'avocado',
  'nut butter',
  'peanut butter',
  'almond butter',
  'almonds',
  'walnut',
  'cashew',
  'peanut',
  'olive',
  'coconut',
  'cheese',
  'cream',
  'tahini',
  'seeds',
  'chia seed',
  'flax seed',
];
const VEGETABLE_MARKERS = [
  'spinach',
  'kale',
  'broccoli',
  'carrot',
  'pepper',
  'tomato',
  'cucumber',
  'lettuce',
  'zucchini',
  'onion',
  'garlic',
  'celery',
  'cabbage',
  'vegetable',
  'greens',
  'mushroom',
  'squash',
  'cauliflower',
  'asparagus',
  'green bean',
];

function includesAny(haystack: string, markers: string[]): boolean {
  return markers.some((m) => haystack.includes(m));
}

/** Deterministic keyword guess for a manually-entered pantry item with no linked product. */
export function categorizePantryItemName(name: string): FoodLensFoodCategory {
  const text = name.toLowerCase();
  const matched: FoodLensFoodCategory[] = [];
  if (includesAny(text, PROTEIN_MARKERS)) matched.push('protein');
  if (includesAny(text, CARB_MARKERS)) matched.push('carb');
  if (includesAny(text, FAT_MARKERS)) matched.push('fat');
  if (includesAny(text, VEGETABLE_MARKERS)) matched.push('vegetable');

  if (matched.length === 0) return 'unknown';
  if (matched.length > 1) return 'mixed';
  return matched[0] ?? 'unknown';
}

export type ProductNutrientSignals = {
  proteinG: number | null;
  totalCarbohydrateG: number | null;
  totalFatG: number | null;
  productName: string | null;
  ingredientsText: string | null;
};

/**
 * Category for a product-linked pantry item — see this file's header for
 * why protein dominance is gated by analyzeProteinQuality's
 * "meaningful amount" signal while carb/fat dominance compares raw grams.
 * Vegetables aren't distinguishable from macro grams alone (a cup of
 * broccoli and a cup of rice are both "mostly carbohydrate" by gram count),
 * so a product-linked item never resolves to 'vegetable' here — only the
 * name-based path can, since names carry that signal directly.
 */
export function deriveCategoryFromProductNutrients(
  input: ProductNutrientSignals
): FoodLensFoodCategory {
  const t = DEFAULT_NUTRITION_THRESHOLDS;
  const protein = analyzeProteinQuality({
    proteinG: input.proteinG,
    productName: input.productName,
    ingredientsText: input.ingredientsText,
    meaningfulProteinThresholdG: t.meaningfulProteinG,
    highProteinMarketingThresholdG: t.highProteinMarketingG,
  });

  const proteinG = protein.isMeaningfulAmount ? (input.proteinG ?? 0) : 0;
  const carbG = input.totalCarbohydrateG ?? 0;
  const fatG = input.totalFatG ?? 0;

  const values: Array<[FoodLensFoodCategory, number]> = [
    ['protein', proteinG],
    ['carb', carbG],
    ['fat', fatG],
  ];
  const max = Math.max(proteinG, carbG, fatG);
  if (max <= 0) return 'unknown';

  const dominant = values.filter(([, g]) => g === max);
  // A runner-up within 30% of the top macro's weight means no single macro
  // clearly dominates — reported as 'mixed' rather than picking one
  // arbitrarily.
  const closeRunnersUp = values.filter(([, g]) => g > 0 && g < max && g >= max * 0.7);
  if (dominant.length > 1 || closeRunnersUp.length > 0) return 'mixed';
  return dominant[0]?.[0] ?? 'unknown';
}
