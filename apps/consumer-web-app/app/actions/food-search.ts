'use server';

/**
 * MEF Food Lens — search & product memory (Part 4), and favorites/saved
 * meals. Opening any result (recent/frequent/cached/external) reuses the
 * exact same scan -> rules-engine -> coaching pipeline every other entry
 * point uses (lib/food-products/analyze.ts) via food_lens_scans.
 * linked_product_id (migration 60) — search never has its own, parallel
 * "quick view" rendering path.
 */

import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from './auth';
import { resolveLocalDate } from './checkin';
import type { FoodFavoriteType, MealCategory, SavedMeal } from '@mef/shared-types-contracts';
import {
  listRecentProductsForMember,
  listFrequentProductsForMember,
  searchCachedFoodProducts,
  type FoodSearchResult,
} from '@/lib/food-products/search';
import { getFoodProductProvider, resolveFoodProductProviderChain } from '@/lib/food-products/providers/registry';
import { findCachedFoodProduct, upsertFoodProductFromProvider } from '@/lib/food-products/data';
import { validateBarcode } from '@/lib/food-products/barcode';
import { runProductAnalysisForScan } from '@/lib/food-products/analyze';
import {
  addFavorite,
  getSavedMealWithItems,
  insertSavedMealFromDetectedItems,
  insertSavedMealFromProduct,
  isProductFavorited,
  listMyFavorites,
  listMySavedMeals,
  removeFavoriteByProduct,
} from '@/lib/food-products/savedMeals';
import { insertFoodLensScan, listCurrentFoodLensDetectedItems, getFoodLensScan } from '@/lib/food-lens/data';
import { insertFoodLogEntry } from '@/lib/food-products/data';

async function requireMember(): Promise<{ supabase: ReturnType<typeof createClient>; userId: string } | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { supabase, userId: user.id };
}

async function memberLocalDate(supabase: ReturnType<typeof createClient>, userId: string): Promise<string> {
  const { data } = await supabase.from('profiles').select('timezone').eq('id', userId).single();
  const timezone = data?.timezone ?? 'America/New_York';
  return resolveLocalDate(new Date(new Date().toLocaleString('en-US', { timeZone: timezone })), false);
}

// ---- Search ----

export type FoodSearchResponse = {
  recent: FoodSearchResult[];
  frequent: FoodSearchResult[];
  cached: FoodSearchResult[];
  external: FoodSearchResult[];
  favoritedProductIds: string[];
};

export async function searchFoodsAction(query: string = ''): Promise<FoodSearchResponse> {
  const ctx = await requireMember();
  if (!ctx) return { recent: [], frequent: [], cached: [], external: [], favoritedProductIds: [] };
  const { supabase, userId } = ctx;

  const recent = await listRecentProductsForMember(supabase, userId, 8);
  const frequent = await listFrequentProductsForMember(
    supabase,
    userId,
    recent.map((r) => r.productId).filter((id): id is string => Boolean(id)),
    8
  );

  const shownIds = [...recent, ...frequent].map((r) => r.productId).filter((id): id is string => Boolean(id));

  let cached: FoodSearchResult[] = [];
  let external: FoodSearchResult[] = [];
  const trimmed = query.trim();
  if (trimmed.length > 0) {
    cached = await searchCachedFoodProducts(supabase, trimmed, shownIds, 10);

    // Only reach for external results when the member's own history/cache
    // didn't turn up much — product requirement §4's explicit lowest
    // priority tier.
    if (cached.length < 5) {
      for (const providerName of resolveFoodProductProviderChain()) {
        const provider = getFoodProductProvider(providerName);
        if (!provider.searchByName) continue;
        try {
          const hits = await provider.searchByName(trimmed, 10 - cached.length);
          external = hits
            .filter((h) => !shownIds.includes(h.barcode) && !cached.some((c) => c.barcode === h.barcode))
            .map((h) => ({
              source: 'external' as const,
              productId: null,
              barcode: h.barcode,
              name: h.name,
              brand: h.brand,
              imageUrl: h.imageUrl,
              servingSizeText: null,
            }));
        } catch (err) {
          console.error(`searchFoodsAction: external search via ${providerName} failed`, err);
        }
        break;
      }
    }
  }

  const favoritedProductIds = (await listMyFavorites(supabase, userId))
    .filter((f) => f.favorite_type === 'product' && f.product_id)
    .map((f) => f.product_id as string);

  return { recent, frequent, cached, external, favoritedProductIds };
}

// ---- Opening a result (any source) through the unified pipeline ----

export type OpenFoodSearchResultInput = { productId: string } | { barcode: string };

export async function openFoodSearchResultAction(
  input: OpenFoodSearchResultInput
): Promise<ActionResult & { scanId?: string }> {
  const ctx = await requireMember();
  if (!ctx) return { error: 'Not signed in.' };
  const { supabase, userId } = ctx;

  let productId: string | null = 'productId' in input ? input.productId : null;

  if (!productId && 'barcode' in input) {
    const validation = validateBarcode(input.barcode);
    const barcode = validation.valid ? validation.normalized : input.barcode;

    const cached = await findCachedFoodProduct(supabase, barcode);
    if (cached) {
      productId = cached.product.id;
    } else {
      for (const providerName of resolveFoodProductProviderChain()) {
        try {
          const provider = getFoodProductProvider(providerName);
          const normalized = await provider.lookupByBarcode(barcode);
          if (!normalized) continue;
          if (validation.valid) normalized.barcodeType = validation.type;
          const saved = await upsertFoodProductFromProvider(supabase, normalized);
          if (saved) {
            productId = saved.product.id;
            break;
          }
        } catch (err) {
          console.error('openFoodSearchResultAction: provider lookup failed', err);
        }
      }
    }
  }

  if (!productId) return { error: 'Could not find this product.' };

  const scan = await insertFoodLensScan(supabase, userId, 'barcode', null, productId);
  if (!scan) return { error: 'Could not open this product.' };

  const localDate = await memberLocalDate(supabase, userId);
  const result = await runProductAnalysisForScan(supabase, userId, localDate, scan.id, productId);
  if (result.status !== 'analyzed') return { error: result.error ?? 'Could not analyze this product.' };

  return { scanId: scan.id };
}

// ---- Favorites ----

export async function toggleFavoriteProductAction(productId: string): Promise<ActionResult & { isFavorited?: boolean }> {
  const ctx = await requireMember();
  if (!ctx) return { error: 'Not signed in.' };
  const { supabase, userId } = ctx;

  const already = await isProductFavorited(supabase, userId, productId);
  if (already) {
    const ok = await removeFavoriteByProduct(supabase, userId, productId);
    return ok ? { isFavorited: false } : { error: 'Could not remove favorite.' };
  }
  const created = await addFavorite(supabase, { memberId: userId, favoriteType: 'product' as FoodFavoriteType, productId });
  return created ? { isFavorited: true } : { error: 'Could not save favorite.' };
}

// ---- Saved meals ----

export async function saveMealFromScanAction(scanId: string, name: string): Promise<ActionResult & { savedMeal?: SavedMeal }> {
  const ctx = await requireMember();
  if (!ctx) return { error: 'Not signed in.' };
  const { supabase, userId } = ctx;

  const scan = await getFoodLensScan(supabase, scanId);
  if (!scan || scan.member_id !== userId) return { error: 'Scan not found.' };

  const items = (await listCurrentFoodLensDetectedItems(supabase, scanId)).filter((i) => i.status === 'confirmed');
  if (items.length === 0) return { error: 'Confirm at least one food before saving this meal.' };

  const savedMeal = await insertSavedMealFromDetectedItems(supabase, {
    memberId: userId,
    name: name.trim() || 'Saved meal',
    sourceScanId: scanId,
    items,
  });
  if (!savedMeal) return { error: 'Could not save this meal.' };
  return { savedMeal };
}

export async function saveMealFromProductAction(
  productId: string,
  productName: string,
  name: string
): Promise<ActionResult & { savedMeal?: SavedMeal }> {
  const ctx = await requireMember();
  if (!ctx) return { error: 'Not signed in.' };
  const savedMeal = await insertSavedMealFromProduct(ctx.supabase, {
    memberId: ctx.userId,
    name: name.trim() || productName,
    productId,
    label: productName,
  });
  return savedMeal ? { savedMeal } : { error: 'Could not save this meal.' };
}

export async function listMySavedMealsAction(): Promise<SavedMeal[]> {
  const ctx = await requireMember();
  if (!ctx) return [];
  return listMySavedMeals(ctx.supabase, ctx.userId);
}

/** Repeat-logs every item in a saved meal at once — one action for the whole combo, with a single adjustable serving multiplier applied uniformly (Part 4's "easy repeat logging with adjustable portions"). Per-item portion tuning can still happen afterward from the food log itself. */
export async function repeatSavedMealAction(
  savedMealId: string,
  input: { mealCategory: MealCategory; consumedAt: string; servingsMultiplier?: number }
): Promise<ActionResult & { entriesCreated?: number }> {
  const ctx = await requireMember();
  if (!ctx) return { error: 'Not signed in.' };
  const { supabase, userId } = ctx;

  const detail = await getSavedMealWithItems(supabase, savedMealId);
  if (!detail || detail.meal.member_id !== userId) return { error: 'Saved meal not found.' };

  const multiplier = input.servingsMultiplier ?? 1;
  let created = 0;
  for (const item of detail.items) {
    const entry = await insertFoodLogEntry(supabase, {
      memberId: userId,
      productId: item.product_id,
      scanId: null,
      mealCategory: input.mealCategory,
      servings: item.servings * multiplier,
      consumedAt: input.consumedAt,
      manualLabel: item.product_id ? null : item.label,
    });
    if (entry) created += 1;
  }
  return created > 0 ? { entriesCreated: created } : { error: 'Could not log this meal.' };
}
