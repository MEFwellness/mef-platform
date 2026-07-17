/**
 * Provider registry for packaged-food lookup — same shape as
 * lib/food-lens/providers/registry.ts. 'usda_fdc' and 'mef_verified' stay
 * unregistered stubs until a real implementation is added (product
 * requirement §2's "prepare the architecture for a future fallback
 * provider" — a new file plus one line here, never a rewrite of
 * lookupBarcodeAction).
 */

import type { NormalizedFoodProduct } from '@mef/shared-types-contracts';
import type { FoodProductProvider } from './types';
import { OpenFoodFactsProvider } from './openFoodFacts';

export const FOOD_PRODUCT_PROVIDER_NAMES = ['open_food_facts', 'usda_fdc', 'mef_verified'] as const;

export type FoodProductProviderName = (typeof FOOD_PRODUCT_PROVIDER_NAMES)[number];

class UnconfiguredFoodProductProvider implements FoodProductProvider {
  constructor(public readonly name: string) {}

  async lookupByBarcode(_barcode: string): Promise<NormalizedFoodProduct | null> {
    throw new Error(
      `Food product provider "${this.name}" is not configured for this deployment yet.`
    );
  }
}

const PROVIDERS: Record<FoodProductProviderName, FoodProductProvider> = {
  open_food_facts: new OpenFoodFactsProvider(),
  usda_fdc: new UnconfiguredFoodProductProvider('usda_fdc'),
  mef_verified: new UnconfiguredFoodProductProvider('mef_verified'),
};

export function getFoodProductProvider(name: FoodProductProviderName): FoodProductProvider {
  return PROVIDERS[name];
}

export function registerFoodProductProvider(
  name: FoodProductProviderName,
  provider: FoodProductProvider
): void {
  PROVIDERS[name] = provider;
}

/**
 * The ordered fallback chain a lookup tries — Open Food Facts first (free,
 * huge packaged-food coverage), then any later-configured fallback
 * providers in the order listed. A provider that isn't really configured
 * (still the Unconfigured stub) throws, which the caller treats as "try the
 * next provider," never as a fatal lookup failure — only exhausting the
 * whole chain without a hit is reported as "not found."
 */
export function resolveFoodProductProviderChain(): FoodProductProviderName[] {
  const explicit = process.env.FOOD_PRODUCT_PROVIDER_CHAIN;
  if (explicit) {
    const names = explicit.split(',').map((s) => s.trim());
    const valid = names.filter((n): n is FoodProductProviderName =>
      (FOOD_PRODUCT_PROVIDER_NAMES as readonly string[]).includes(n)
    );
    if (valid.length > 0) return valid;
  }
  return ['open_food_facts'];
}
