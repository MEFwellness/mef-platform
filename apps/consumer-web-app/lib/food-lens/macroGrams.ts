/**
 * Food Lens Phase 2 — the one place gram estimates are scaled, summed and
 * rounded. Pure: no database, no Next.js request scope, so every rule
 * below is provable in a unit test.
 *
 * ONE SOURCE OF TRUTH PER NUMBER. A meal total is never a second figure
 * the model reports alongside its items, because two figures can disagree
 * and then a screen showing both is lying about one of them. A meal total
 * is always `sumMacroGrams` over the item estimates that are actually in
 * the meal right now, so removing an item or halving its serving moves the
 * total by construction rather than by a second calculation remembering to
 * agree.
 *
 * NULL IS NOT ZERO. A model that cannot honestly size an item leaves its
 * grams null. Null stays null all the way to the screen, where it reads
 * "not estimated", never "0g", which a member would read as "this food has
 * no protein in it."
 *
 * ALL THREE MOVE TOGETHER. Serving adjustment multiplies protein,
 * carbohydrate and fat by the same number, because they describe one
 * physical amount of food. There is no path here that scales one without
 * the others.
 */

export type MacroGrams = {
  proteinG: number | null;
  carbG: number | null;
  fatG: number | null;
};

export const NO_MACRO_GRAMS: MacroGrams = { proteinG: null, carbG: null, fatG: null };

/** True when at least one of the three dimensions carries a real estimate. A meal where every item came back unsized shows no gram section at all rather than three dashes. */
export function hasAnyGrams(macros: MacroGrams): boolean {
  return macros.proteinG !== null || macros.carbG !== null || macros.fatG !== null;
}

function scaleOne(value: number | null, multiplier: number): number | null {
  if (value === null) return null;
  if (!Number.isFinite(multiplier) || multiplier <= 0) return null;
  return value * multiplier;
}

/** One serving multiplier, applied to all three macros together. A non-finite or non-positive multiplier yields nulls rather than a fabricated zero. */
export function scaleMacroGrams(base: MacroGrams, multiplier: number): MacroGrams {
  return {
    proteinG: scaleOne(base.proteinG, multiplier),
    carbG: scaleOne(base.carbG, multiplier),
    fatG: scaleOne(base.fatG, multiplier),
  };
}

function sumOne(values: Array<number | null>): number | null {
  const known = values.filter((v): v is number => v !== null);
  if (known.length === 0) return null;
  return known.reduce((total, v) => total + v, 0);
}

/**
 * The meal total. A dimension with no known value on any item stays null
 * (nothing was estimated, so nothing is claimed); a dimension known on some
 * items sums those, which is the honest floor rather than a guess at the
 * rest.
 */
export function sumMacroGrams(items: MacroGrams[]): MacroGrams {
  return {
    proteinG: sumOne(items.map((i) => i.proteinG)),
    carbG: sumOne(items.map((i) => i.carbG)),
    fatG: sumOne(items.map((i) => i.fatG)),
  };
}

/** Whole grams for display. Shares roundGrams' job in lib/protein/ledger.ts: a member never sees 37.99999999999999. */
export function roundMacroGrams(macros: MacroGrams): MacroGrams {
  return {
    proteinG: macros.proteinG === null ? null : Math.round(macros.proteinG),
    carbG: macros.carbG === null ? null : Math.round(macros.carbG),
    fatG: macros.fatG === null ? null : Math.round(macros.fatG),
  };
}

/** What a single gram figure reads as. A missing estimate says so in words instead of borrowing zero's meaning. */
export function formatGrams(value: number | null): string {
  return value === null ? 'not estimated' : `${Math.round(value)}g`;
}

export type AdjustableMacroItem = {
  /** The detected item this estimate belongs to. */
  itemId: string;
  /** The model's estimate for the portion it actually saw, which is one serving. */
  base: MacroGrams;
  /** How many of that portion the member says she ate. */
  servings: number;
  /** False once she removes the item from the meal, which takes it out of the total and out of the confirm. */
  included: boolean;
};

/** Every included item scaled by its own serving multiplier, summed. This is the number the result screen shows and the number the confirmed entries add up to. */
export function mealMacroGrams(items: AdjustableMacroItem[]): MacroGrams {
  return sumMacroGrams(
    items.filter((i) => i.included).map((i) => scaleMacroGrams(i.base, i.servings))
  );
}
