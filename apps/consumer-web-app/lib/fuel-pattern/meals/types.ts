/**
 * Rooted Reset Fuel Pattern Assessment, Build 3 — the shapes the meal
 * layer is made of.
 *
 * THREE MEAL PATTERNS, FOUR READINGS. The assessment produces four
 * readings and the library holds three sets, because Flexible Fuel reads
 * the Balanced Fuel set with its own why-it-fits sentence appended
 * (lib/fuel-pattern/meals/copy.ts). That is deliberate: authoring a
 * fourth set would mean writing a set of meals nobody would be able to
 * tell apart from the balanced one, and a member who reads both would be
 * right to notice.
 *
 * NO NUMBER LIVES IN MEAL CONTENT. The three ranges are words, the
 * portions are described rather than counted, and the only number on the
 * whole meal card is the preparation time, which is a number of minutes
 * and is stored as one rather than written into a sentence.
 */

/** The four slots on the result page, in the order they are drawn. */
export const FPA_MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type FpaMealType = (typeof FPA_MEAL_TYPES)[number];

/** The three authored meal sets. Flexible Fuel reads the balanced one. */
export const FPA_MEAL_PATTERNS = ['protein_supportive', 'balanced_fuel', 'carb_supportive'] as const;
export type FpaMealPattern = (typeof FPA_MEAL_PATTERNS)[number];

/**
 * The five dietary facts a member can hold a standing preference about.
 * A flag is present on a meal only when it is TRUE of that meal, so a
 * filter reads "she excludes meals that do not carry this flag" rather
 * than guessing from an ingredient list.
 */
export const FPA_DIETARY_FLAGS = [
  'vegetarian',
  'dairy_free',
  'egg_free',
  'fish_free',
  'pork_free',
] as const;
export type FpaDietaryFlag = (typeof FPA_DIETARY_FLAGS)[number];

/** Allergen notes, present on a meal when that allergen is in it. */
export const FPA_ALLERGENS = [
  'nuts',
  'dairy',
  'eggs',
  'fish',
  'shellfish',
  'gluten',
  'soy',
] as const;
export type FpaAllergen = (typeof FPA_ALLERGENS)[number];

/** The word labels the three ranges are allowed to take. Never a gram, never a percentage. */
export type FpaRangeWord = 'Higher' | 'Moderate' | 'Lighter';

export type FpaMeal = {
  /** Stable id, stored on her rejections and her saves. Never shown to her. */
  id: string;
  name: string;
  type: FpaMealType;
  pattern: FpaMealPattern;
  protein: FpaRangeWord;
  carbohydrate: FpaRangeWord;
  fat: FpaRangeWord;
  /** Every whole food in the meal, in the order it reads naturally. */
  ingredients: string[];
  /** The one line under the name on the card. */
  summary: string;
  /** One or two sentences. Observational, never prescriptive. */
  whyItFits: string;
  flags: FpaDietaryFlag[];
  allergens: FpaAllergen[];
  /** Honest minutes. The only number on the card. */
  prepMinutes: number;
  /**
   * The image file this meal uses, relative to /images/fuel-meals, or
   * null when no honest open-license photograph of this meal was found
   * and the brand illustration stands in its place. See
   * docs/fuel-meal-image-manifest.json.
   */
  image: string | null;
};
