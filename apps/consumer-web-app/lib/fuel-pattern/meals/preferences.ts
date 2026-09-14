/**
 * Rooted Reset Fuel Pattern Assessment, Build 3 — what she has told the
 * meal layer she does not eat, and what that excludes.
 *
 * =====================================================================
 * TWO KINDS OF "NO", AND THEY BEHAVE DIFFERENTLY.
 * =====================================================================
 *
 *   A REJECTION is about one meal. She tapped I do not eat this on that
 *   card. That meal never comes back, whatever reason she gave and even
 *   if she gave none at all.
 *
 *   A STANDING EXCLUSION is about a whole class of food. From the moment
 *   she records one, every meal that carries that food is gone from
 *   every slot, on this screen and on every later one, through a retake
 *   and through a change of pattern.
 *
 * An allergy is a standing exclusion with a different label on it. It
 * excludes exactly as hard, it is expressed through the allergen tags
 * rather than the dietary flags, and it is stored with is_allergy set so
 * a coach reading her card can tell the difference between "she prefers
 * not to" and "she cannot". Nothing here offers medical advice, adds a
 * warning or treats an allergy as a clinical fact: it is a surfacing
 * rule, and that is all it is.
 *
 * =====================================================================
 * HER FOOD LENS PREFERENCES ARE READ TOO, AND NOT WRITTEN.
 * =====================================================================
 *
 * member_food_preferences (migration 59) already holds a dietary pattern
 * and an allergy list she filled in on the Food Lens preferences screen.
 * A member who has already said she is vegetarian there should not have
 * to say it again to a meal card, so the filter reads that row as a
 * second source of standing exclusions. It never writes to it: that
 * screen is hers to edit and this one records its own answers in its own
 * table, so the two can never disagree about who said what.
 */

import type { FpaAllergen, FpaDietaryFlag, FpaMeal } from './types';

/**
 * Every standing exclusion this feature can hold. Five come from the
 * reason sheet's dietary options and seven are allergen tags. The
 * database check constraint on fuel_meal_exclusions.exclusion_key holds
 * exactly this list (migration 237).
 */
export const FPA_EXCLUSION_KEYS = [
  'vegetarian',
  'no_dairy',
  'no_fish',
  'no_eggs',
  'no_pork',
  'allergen_nuts',
  'allergen_dairy',
  'allergen_eggs',
  'allergen_fish',
  'allergen_shellfish',
  'allergen_gluten',
  'allergen_soy',
] as const;
export type FpaExclusionKey = (typeof FPA_EXCLUSION_KEYS)[number];

/** The dietary exclusions, each satisfied only by a meal carrying the matching flag. */
const FLAG_FOR_EXCLUSION: Partial<Record<FpaExclusionKey, FpaDietaryFlag>> = {
  vegetarian: 'vegetarian',
  no_dairy: 'dairy_free',
  no_fish: 'fish_free',
  no_eggs: 'egg_free',
  no_pork: 'pork_free',
};

/** The allergen exclusions, each violated by a meal carrying the matching allergen. */
const ALLERGEN_FOR_EXCLUSION: Partial<Record<FpaExclusionKey, FpaAllergen>> = {
  allergen_nuts: 'nuts',
  allergen_dairy: 'dairy',
  allergen_eggs: 'eggs',
  allergen_fish: 'fish',
  allergen_shellfish: 'shellfish',
  allergen_gluten: 'gluten',
  allergen_soy: 'soy',
};

/** The allergen tag an allergen exclusion is expressed through, for the coach card and for tests. */
export function allergenForExclusion(key: FpaExclusionKey): FpaAllergen | null {
  return ALLERGEN_FOR_EXCLUSION[key] ?? null;
}

/** The exclusion key that stands for an allergen tag, so a rejected meal's allergens can be recorded. */
export function exclusionForAllergen(allergen: FpaAllergen): FpaExclusionKey {
  return `allergen_${allergen}` as FpaExclusionKey;
}

export function isFpaExclusionKey(value: string): value is FpaExclusionKey {
  return (FPA_EXCLUSION_KEYS as readonly string[]).includes(value);
}

/** True when this meal is allowed under this one exclusion. */
export function mealSatisfiesExclusion(meal: FpaMeal, key: FpaExclusionKey): boolean {
  const flag = FLAG_FOR_EXCLUSION[key];
  if (flag) return meal.flags.includes(flag);
  const allergen = ALLERGEN_FOR_EXCLUSION[key];
  if (allergen) return !meal.allergens.includes(allergen);
  // An unknown key excludes nothing rather than everything. A key added
  // to the database and not to this map would otherwise empty her library
  // silently, which is the worse of the two failures.
  return true;
}

/** True when this meal is allowed under all of them. */
export function mealSatisfiesExclusions(meal: FpaMeal, keys: readonly FpaExclusionKey[]): boolean {
  return keys.every((key) => mealSatisfiesExclusion(meal, key));
}

/**
 * The reasons the sheet offers, in the order it offers them. Five of
 * them become a standing exclusion, one records an allergy, one records
 * a dislike and one is free text. Every one of them also records the
 * single meal rejection, because she tapped the button on a card.
 */
export const FPA_REJECTION_REASONS = [
  'dislike',
  'vegetarian',
  'no_dairy',
  'no_fish',
  'no_eggs',
  'no_pork',
  'allergy',
  'other',
] as const;
export type FpaRejectionReason = (typeof FPA_REJECTION_REASONS)[number];

export function isFpaRejectionReason(value: string): value is FpaRejectionReason {
  return (FPA_REJECTION_REASONS as readonly string[]).includes(value);
}

/** The standing exclusion a dietary reason creates, or null when the reason is about one meal only. */
export function exclusionForReason(reason: FpaRejectionReason): FpaExclusionKey | null {
  switch (reason) {
    case 'vegetarian':
      return 'vegetarian';
    case 'no_dairy':
      return 'no_dairy';
    case 'no_fish':
      return 'no_fish';
    case 'no_eggs':
      return 'no_eggs';
    case 'no_pork':
      return 'no_pork';
    default:
      return null;
  }
}

/**
 * The dietary pattern values on the Food Lens preferences screen that
 * this filter can honour, and what each one excludes here.
 *
 * DELIBERATELY SHORT. Only the values whose meaning is unambiguous in
 * terms of the five flags this library carries are mapped. Keto, paleo
 * and mediterranean describe how a plate is built rather than which
 * foods are off it, so they exclude nothing and are left alone. Reading
 * more into them than they say would take meals away from a member who
 * never asked for that.
 */
export function exclusionsForDietaryPattern(pattern: string | null): FpaExclusionKey[] {
  if (pattern === 'vegetarian') return ['vegetarian'];
  if (pattern === 'vegan') return ['vegetarian', 'no_dairy', 'no_eggs'];
  return [];
}

/**
 * Her Food Lens allergy list, matched to allergen tags.
 *
 * The field is free text, so this matches on whole words in a lowercased
 * string and nothing cleverer. A word it does not recognise excludes
 * nothing, which is the right way round: this is a convenience that
 * saves her repeating herself, not the record of her allergies.
 */
const ALLERGY_WORDS: Array<{ allergen: FpaAllergen; words: string[] }> = [
  { allergen: 'nuts', words: ['nut', 'nuts', 'peanut', 'peanuts', 'almond', 'almonds', 'walnut', 'walnuts', 'tree nut', 'tree nuts'] },
  { allergen: 'dairy', words: ['dairy', 'milk', 'lactose', 'cheese'] },
  { allergen: 'eggs', words: ['egg', 'eggs'] },
  { allergen: 'fish', words: ['fish', 'salmon', 'tuna', 'cod'] },
  { allergen: 'shellfish', words: ['shellfish', 'prawn', 'prawns', 'shrimp', 'crab', 'lobster'] },
  { allergen: 'gluten', words: ['gluten', 'wheat', 'coeliac', 'celiac'] },
  { allergen: 'soy', words: ['soy', 'soya', 'soybean'] },
];

export function exclusionsForAllergyList(allergies: readonly string[]): FpaExclusionKey[] {
  const found = new Set<FpaExclusionKey>();
  for (const entry of allergies) {
    const text = entry.toLowerCase();
    for (const { allergen, words } of ALLERGY_WORDS) {
      if (words.some((word) => new RegExp(`(^|[^a-z])${word}([^a-z]|$)`).test(text))) {
        found.add(exclusionForAllergen(allergen));
      }
    }
  }
  return [...found];
}
