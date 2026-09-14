/**
 * The shape of the meal payload, and the one function that reads it.
 *
 * =====================================================================
 * WHY THIS IS SPLIT FROM memberPayload.ts.
 * =====================================================================
 *
 * Her meal cards are client components, so they import these types and
 * this function. memberPayload.ts BUILDS the payload, which means it
 * reaches the Supabase client, the meal data layer and, through
 * lib/food-products/data.ts, node:crypto. A client component importing
 * from there drags all of that into the browser bundle, and the
 * production build says so plainly: "Reading from node:crypto is not
 * handled by plugins". A type import would have been erased, but
 * fpaWhyItFits is a real value and values are not.
 *
 * So the pure half lives here and nothing in this file can reach a
 * database. The builder imports it, her cards import it, and the two no
 * longer share a bundle.
 */

import { FPA_FLEXIBLE_WHY_SUFFIX } from './copy';
import type { FpaExclusionKey } from './preferences';
import type { FpaSlotState } from './selection';
import type { FpaMeal, FpaMealType } from './types';
import type { FuelPattern } from '../types';

/** One slot, with everything its own rotation could ever need. */
export type FpaMealSlotPayload = {
  type: FpaMealType;
  /** Her set for this slot, in her own order. Six meals. */
  ownPool: FpaMeal[];
  /** The same meal type in the neighbouring sets. Only ever used when her own is empty. */
  widerPool: FpaMeal[];
  /** Where this slot had got to when the page was built. */
  state: FpaSlotState;
  /** The meal on the card, already chosen. Null only when nothing at all is left. */
  mealId: string | null;
  /** True when that meal came from a neighbouring set. */
  widened: boolean;
};

export type FpaMealsPayload = {
  pattern: FuelPattern;
  /** The four slots, in the order the page draws them. */
  slots: FpaMealSlotPayload[];
  /** Meal ids she has told us she does not eat. */
  rejectedMealIds: string[];
  /** Her standing exclusions, from this feature and from Food Lens alike. */
  exclusions: FpaExclusionKey[];
  /** Meal ids she has saved. */
  savedMealIds: string[];
};

/** One saved meal, as My Meals draws it. */
export type FpaSavedMealEntry = {
  meal: FpaMeal;
  /** The reading she held when she saved it, which may not be the one she holds now. */
  patternAtSave: FuelPattern;
  /** True when that reading is not her current one, which is when the card carries its quiet label. */
  fromAnotherPattern: boolean;
};

/** The why-it-fits line as she reads it, with the Flexible Fuel sentence added when it applies. */
export function fpaWhyItFits(meal: FpaMeal, pattern: FuelPattern): string {
  if (pattern !== 'flexible_fuel') return meal.whyItFits;
  return `${meal.whyItFits} ${FPA_FLEXIBLE_WHY_SUFFIX}`;
}
