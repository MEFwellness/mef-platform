/**
 * The provider boundary for packaged-food product lookup — mirrors
 * lib/food-lens/providers/types.ts exactly on purpose. The lookup server
 * action must never import a specific vendor's fetch/response shape
 * directly, so adding a fallback provider (USDA FoodData Central, a
 * licensed branded-food database, manually verified MEF product records —
 * product requirement §2) is a new file plus a registry entry, never a
 * rewrite of the calling code.
 *
 * A provider's only job is to return an honest NormalizedFoodProduct or
 * null ("not found" / "lookup failed") — it must never fabricate a field
 * that wasn't actually present in the source response. Missing data stays
 * null and is reflected in dataCompleteness, never guessed.
 */

import type { NormalizedFoodProduct } from '@mef/shared-types-contracts';

/** A lightweight, unverified search hit — enough to show a name/brand/image in a results list and let the member pick one, NOT a full NormalizedFoodProduct. Selecting one always goes through a real lookupByBarcode (or an equivalent full fetch) before anything is trusted as nutrition fact — a search hit is a pointer, never itself a source of truth. */
export type FoodProductSearchHit = {
  barcode: string;
  name: string | null;
  brand: string | null;
  imageUrl: string | null;
};

export interface FoodProductProvider {
  readonly name: string;
  lookupByBarcode(barcode: string): Promise<NormalizedFoodProduct | null>;
  /** Optional — not every provider supports free-text search (product requirement §4's "external search results" is explicitly the lowest-priority tier). */
  searchByName?(query: string, limit?: number): Promise<FoodProductSearchHit[]>;
}
