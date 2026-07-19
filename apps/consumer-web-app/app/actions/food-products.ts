'use server';

/**
 * MEF Food Intelligence Engine — server actions for barcode scanning,
 * packaged-food lookup/caching, the MEF Nutrition Rules Engine, Root's
 * coaching explanation, food logging, and food preferences. Same
 * conventions as app/actions/food-lens.ts: a session-scoped Supabase
 * client, RLS (migration 59) as the real authorization boundary,
 * `{ error }`-shaped results for mutations. A barcode scan reuses
 * food_lens_scans/food_lens_captures directly (scan_type = 'barcode') —
 * see app/actions/food-lens.ts for scan creation and capture upload/record,
 * which are scan-type-agnostic and unchanged here.
 */

import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from './auth';
import { resolveLocalDate } from './checkin';
import type {
  BarcodeType,
  FoodAnalysisResult,
  FoodLensBarcodeScan,
  FoodProduct,
  MealCategory,
  MemberFoodLogEntry,
  MemberFoodPreferences,
  ProductAllergen,
  ProductIngredients,
  ProductNutrients,
} from '@mef/shared-types-contracts';
import { validateBarcode } from '@/lib/food-products/barcode';
import {
  getFoodProductProvider,
  resolveFoodProductProviderChain,
} from '@/lib/food-products/providers/registry';
import {
  deleteFoodLogEntry,
  findCachedFoodProduct,
  getFoodLensBarcodeScanByScanId,
  getFoodLogEntry,
  getFoodProductWithDetails,
  getLatestFoodAnalysisResult,
  getMemberFoodPreferences,
  insertFoodLensBarcodeScan,
  insertFoodLogEntry,
  listFoodLogForDateRange,
  updateFoodLensBarcodeScan,
  updateFoodLogEntry,
  upsertFoodProductFromProvider,
  upsertMemberFoodPreferences,
} from '@/lib/food-products/data';
import { runProductAnalysisForScan } from '@/lib/food-products/analyze';
import { getFoodLensScan, updateFoodLensScan } from '@/lib/food-lens/data';
import { getFoodLensLabelScanByScanId } from '@/lib/food-lens/labelScanData';

async function requireMember(): Promise<{
  supabase: ReturnType<typeof createClient>;
  userId: string;
} | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { supabase, userId: user.id };
}

async function memberLocalDate(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<string> {
  const { data } = await supabase.from('profiles').select('timezone').eq('id', userId).single();
  const timezone = data?.timezone ?? 'America/New_York';
  return resolveLocalDate(
    new Date(new Date().toLocaleString('en-US', { timeZone: timezone })),
    false
  );
}

// ---- Barcode lookup ----

export type LookupBarcodeResult = {
  status: 'found' | 'not_found' | 'invalid' | 'error';
  product?: FoodProduct;
  nutrients?: ProductNutrients | null;
  ingredients?: ProductIngredients | null;
  allergens?: ProductAllergen[];
  error?: string;
};

/**
 * Validates and resolves a decoded (or manually entered) barcode to a
 * product, caching the result. Checks the local cache first (product
 * requirement §3 — "repeated scans do not require unnecessary external API
 * requests") before trying the provider chain (Open Food Facts today,
 * future fallbacks per lib/food-products/providers/registry.ts). Never
 * fabricates a product for an unresolved barcode — a genuine "not found" is
 * reported as such, not guessed at.
 */
export async function lookupBarcodeAction(
  scanId: string,
  rawBarcode: string
): Promise<LookupBarcodeResult> {
  const ctx = await requireMember();
  if (!ctx) return { status: 'error', error: 'Not signed in.' };
  const { supabase, userId } = ctx;

  const scan = await getFoodLensScan(supabase, scanId);
  if (!scan || scan.member_id !== userId) return { status: 'error', error: 'Scan not found.' };

  const validation = validateBarcode(rawBarcode);
  if (!validation.valid) {
    return {
      status: 'invalid',
      error: "That doesn't look like a valid UPC-A, UPC-E, EAN-8, or EAN-13 barcode.",
    };
  }

  const barcodeType: BarcodeType = validation.type;
  const barcode = validation.normalized;

  const barcodeScan = await insertFoodLensBarcodeScan(supabase, { scanId, barcode, barcodeType });
  if (!barcodeScan) return { status: 'error', error: 'Could not record this scan.' };

  try {
    const cached = await findCachedFoodProduct(supabase, barcode);
    if (cached) {
      await updateFoodLensBarcodeScan(supabase, barcodeScan.id, {
        productId: cached.product.id,
        lookupStatus: 'found',
      });
      return {
        status: 'found',
        product: cached.product,
        nutrients: cached.nutrients,
        ingredients: cached.ingredients,
        allergens: cached.allergens,
      };
    }

    let lastError: string | null = null;

    for (const providerName of resolveFoodProductProviderChain()) {
      try {
        const provider = getFoodProductProvider(providerName);
        const normalized = await provider.lookupByBarcode(barcode);
        if (!normalized) continue; // this provider genuinely has no record — try the next one

        normalized.barcodeType = barcodeType;
        const saved = await upsertFoodProductFromProvider(supabase, normalized);
        if (!saved) {
          lastError = 'Found the product but could not save it.';
          continue;
        }

        await updateFoodLensBarcodeScan(supabase, barcodeScan.id, {
          productId: saved.product.id,
          lookupStatus: 'found',
        });
        return {
          status: 'found',
          product: saved.product,
          nutrients: saved.nutrients,
          ingredients: saved.ingredients,
          allergens: saved.allergens,
        };
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'Provider lookup failed.';
        // Try the next provider in the chain rather than failing the whole
        // lookup on one provider's outage.
      }
    }

    // Every provider in the chain either had no record or errored.
    await updateFoodLensBarcodeScan(supabase, barcodeScan.id, {
      lookupStatus: lastError ? 'error' : 'not_found',
      lookupError: lastError,
    });
    return lastError ? { status: 'error', error: lastError } : { status: 'not_found' };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lookup failed.';
    await updateFoodLensBarcodeScan(supabase, barcodeScan.id, {
      lookupStatus: 'error',
      lookupError: message,
    });
    return { status: 'error', error: message };
  }
}

// ---- Analysis (rules engine + Root coaching) ----

export type AnalyzeProductScanResult = {
  status: 'analyzed' | 'no_product' | 'failed';
  analysis?: FoodAnalysisResult;
  error?: string;
};

export async function analyzeProductScanAction(scanId: string): Promise<AnalyzeProductScanResult> {
  const ctx = await requireMember();
  if (!ctx) return { status: 'failed', error: 'Not signed in.' };
  const { supabase, userId } = ctx;

  const scan = await getFoodLensScan(supabase, scanId);
  if (!scan || scan.member_id !== userId) return { status: 'failed', error: 'Scan not found.' };

  const barcodeScan = await getFoodLensBarcodeScanByScanId(supabase, scanId);
  if (!barcodeScan || !barcodeScan.product_id) {
    return { status: 'no_product', error: 'No product is linked to this scan yet.' };
  }

  await updateFoodLensScan(supabase, scanId, { status: 'analyzing' });

  const localDate = await memberLocalDate(supabase, userId);
  const result = await runProductAnalysisForScan(
    supabase,
    userId,
    localDate,
    scanId,
    barcodeScan.product_id
  );
  await updateFoodLensScan(supabase, scanId, {
    status: result.status === 'analyzed' ? 'analyzed' : 'failed',
    provider_error: result.status === 'failed' ? (result.error ?? null) : null,
  });
  return result;
}

// ---- Read ----

export type ProductScanDetail = {
  scan: NonNullable<Awaited<ReturnType<typeof getFoodLensScan>>>;
  barcodeScan: FoodLensBarcodeScan | null;
  product: FoodProduct | null;
  nutrients: ProductNutrients | null;
  ingredients: ProductIngredients | null;
  allergens: ProductAllergen[];
  analysis: FoodAnalysisResult | null;
};

export async function getProductScanAction(scanId: string): Promise<ProductScanDetail | null> {
  const ctx = await requireMember();
  if (!ctx) return null;
  const { supabase, userId } = ctx;

  const scan = await getFoodLensScan(supabase, scanId);
  if (!scan || scan.member_id !== userId) return null;

  const barcodeScan = await getFoodLensBarcodeScanByScanId(supabase, scanId);
  let productId = barcodeScan?.product_id ?? null;

  // A nutrition-label scan (scan_type = 'nutrition_label') has no
  // food_lens_barcode_scans row — once the member confirms it, the
  // resolved product lives on food_lens_label_scans.confirmed_product_id
  // instead. Checking here (rather than a second result page) is what lets
  // this one page render a product scan's result regardless of whether it
  // arrived via barcode or label photo (Part 15's unified result design).
  if (!productId) {
    const labelScan = await getFoodLensLabelScanByScanId(supabase, scanId);
    productId = labelScan?.confirmed_product_id ?? null;
  }

  // A search result, favorite, or manual entry links its product directly
  // on the scan row itself (scan_type = 'manual_entry', or 'barcode' when
  // reopening an already-cached product) rather than through either child
  // table above — see migration 60.
  if (!productId) {
    productId = scan.linked_product_id ?? null;
  }

  const details = productId ? await getFoodProductWithDetails(supabase, productId) : null;
  const analysis = await getLatestFoodAnalysisResult(supabase, scanId);

  return {
    scan,
    barcodeScan,
    product: details?.product ?? null,
    nutrients: details?.nutrients ?? null,
    ingredients: details?.ingredients ?? null,
    allergens: details?.allergens ?? [],
    analysis,
  };
}

// ---- Food log ----

export type AddFoodLogEntryInput = {
  productId: string;
  scanId?: string | null;
  mealCategory: MealCategory;
  servings: number;
  consumedAt: string;
};

export async function addFoodLogEntryAction(
  input: AddFoodLogEntryInput
): Promise<ActionResult & { entry?: MemberFoodLogEntry }> {
  const ctx = await requireMember();
  if (!ctx) return { error: 'Not signed in.' };
  if (input.servings <= 0) return { error: 'Servings must be greater than zero.' };

  const entry = await insertFoodLogEntry(ctx.supabase, {
    memberId: ctx.userId,
    productId: input.productId,
    scanId: input.scanId ?? null,
    mealCategory: input.mealCategory,
    servings: input.servings,
    consumedAt: input.consumedAt,
  });
  if (!entry) return { error: 'Could not add this to your food log.' };
  return { entry };
}

export type FoodLogEntryWithProduct = MemberFoodLogEntry & {
  product: Pick<FoodProduct, 'id' | 'name' | 'brand' | 'image_url' | 'serving_size_text'> | null;
};

export async function listTodayFoodLogAction(): Promise<FoodLogEntryWithProduct[]> {
  const ctx = await requireMember();
  if (!ctx) return [];
  const { supabase, userId } = ctx;

  const localDate = await memberLocalDate(supabase, userId);
  const startIso = new Date(`${localDate}T00:00:00.000Z`).toISOString();
  const endIso = new Date(new Date(startIso).getTime() + 24 * 60 * 60 * 1000).toISOString();

  const entries = await listFoodLogForDateRange(supabase, userId, startIso, endIso);
  const productIds = [
    ...new Set(entries.map((e) => e.product_id).filter((id): id is string => Boolean(id))),
  ];
  if (productIds.length === 0) return entries.map((e) => ({ ...e, product: null }));

  const { data: products } = await supabase
    .from('food_products')
    .select('id, name, brand, image_url, serving_size_text')
    .in('id', productIds);
  const byId = new Map((products ?? []).map((p) => [p.id as string, p]));

  return entries.map((e) => ({
    ...e,
    product: e.product_id
      ? ((byId.get(e.product_id) as FoodLogEntryWithProduct['product']) ?? null)
      : null,
  }));
}

export async function removeFoodLogEntryAction(entryId: string): Promise<ActionResult> {
  const ctx = await requireMember();
  if (!ctx) return { error: 'Not signed in.' };
  const ok = await deleteFoodLogEntry(ctx.supabase, ctx.userId, entryId);
  if (!ok) return { error: 'Could not remove this entry.' };
  return {};
}

export type EditFoodLogEntryInput = Partial<{
  mealCategory: MealCategory;
  servings: number;
  consumedAt: string;
  notes: string | null;
}>;

/** Part 16 — editing servings/category/time/notes on an existing entry. Recalculates nothing on the server beyond what the UI already re-derives from servings × per-serving facts; product_nutrients itself is never touched. */
export async function editFoodLogEntryAction(
  entryId: string,
  input: EditFoodLogEntryInput
): Promise<ActionResult> {
  const ctx = await requireMember();
  if (!ctx) return { error: 'Not signed in.' };
  if (input.servings !== undefined && input.servings <= 0) {
    return { error: 'Servings must be greater than zero.' };
  }
  const ok = await updateFoodLogEntry(ctx.supabase, ctx.userId, entryId, input);
  if (!ok) return { error: 'Could not save your changes.' };
  return {};
}

/** Part 16 — "duplicate a previous meal": re-logs the same product/scan/manual entry at the current time, same servings/category, ready to adjust. */
export async function duplicateFoodLogEntryAction(
  entryId: string
): Promise<ActionResult & { entry?: MemberFoodLogEntry }> {
  const ctx = await requireMember();
  if (!ctx) return { error: 'Not signed in.' };
  const { supabase, userId } = ctx;

  const original = await getFoodLogEntry(supabase, userId, entryId);
  if (!original) return { error: 'Entry not found.' };

  const entry = await insertFoodLogEntry(supabase, {
    memberId: userId,
    productId: original.product_id,
    scanId: original.scan_id,
    mealCategory: original.meal_category,
    servings: original.servings,
    consumedAt: new Date().toISOString(),
    manualLabel: original.manual_label,
  });
  if (!entry) return { error: 'Could not duplicate this entry.' };
  return { entry };
}

// ---- Food preferences (allergies, intolerances, dietary pattern) ----

export async function getFoodPreferencesAction(): Promise<MemberFoodPreferences | null> {
  const ctx = await requireMember();
  if (!ctx) return null;
  return getMemberFoodPreferences(ctx.supabase, ctx.userId);
}

export type SetFoodPreferencesInput = {
  allergies: string[];
  intolerances: string[];
  avoidIngredients: string[];
  dietaryPattern: string | null;
};

export async function setFoodPreferencesAction(
  input: SetFoodPreferencesInput
): Promise<ActionResult & { preferences?: MemberFoodPreferences }> {
  const ctx = await requireMember();
  if (!ctx) return { error: 'Not signed in.' };
  const preferences = await upsertMemberFoodPreferences(ctx.supabase, ctx.userId, input);
  if (!preferences) return { error: 'Could not save your food preferences.' };
  return { preferences };
}
