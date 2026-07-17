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
  AllergenMatch,
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
  getFoodProductWithDetails,
  getLatestFoodAnalysisResult,
  getMemberFoodPreferences,
  insertFoodAnalysisResult,
  insertFoodLensBarcodeScan,
  insertFoodLogEntry,
  listFoodLogForDateRange,
  listNutritionRuleThresholds,
  updateFoodLensBarcodeScan,
  upsertFoodProductFromProvider,
  upsertMemberFoodPreferences,
} from '@/lib/food-products/data';
import { runFoodRulesEngine, resolveNutritionThresholds } from '@/lib/food-products/rulesEngine';
import { matchMemberAllergens } from '@/lib/food-products/rulesEngine/allergenCheck';
import { generateFoodCoachingNarrative } from '@/lib/food-products/coachingNarrative';
import { upsertRegistryEntryFromFoodAnalysis } from '@/lib/registry/adapters/foodProducts';
import { getFoodLensScan, updateFoodLensScan } from '@/lib/food-lens/data';

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

  try {
    const details = await getFoodProductWithDetails(supabase, barcodeScan.product_id);
    if (!details) {
      await updateFoodLensScan(supabase, scanId, { status: 'failed' });
      return { status: 'failed', error: 'Could not load the product record.' };
    }

    const [thresholdOverrides, preferences] = await Promise.all([
      listNutritionRuleThresholds(supabase),
      getMemberFoodPreferences(supabase, userId),
    ]);
    const thresholds = resolveNutritionThresholds(thresholdOverrides);

    const rulesResult = runFoodRulesEngine({
      productName: details.product.name,
      dataCompleteness: details.product.data_completeness,
      nutrients: details.nutrients
        ? {
            calories: details.nutrients.calories,
            proteinG: details.nutrients.protein_g,
            totalCarbohydrateG: details.nutrients.total_carbohydrate_g,
            fiberG: details.nutrients.fiber_g,
            totalSugarG: details.nutrients.total_sugar_g,
            addedSugarG: details.nutrients.added_sugar_g,
            totalFatG: details.nutrients.total_fat_g,
            saturatedFatG: details.nutrients.saturated_fat_g,
            monounsaturatedFatG: details.nutrients.monounsaturated_fat_g,
            polyunsaturatedFatG: details.nutrients.polyunsaturated_fat_g,
            transFatG: details.nutrients.trans_fat_g,
            sodiumMg: details.nutrients.sodium_mg,
            potassiumMg: details.nutrients.potassium_mg,
          }
        : null,
      ingredientsText: details.ingredients?.ingredients_text ?? null,
      ingredientsList: details.ingredients?.ingredients_list ?? [],
      additives: details.ingredients?.additives ?? [],
      thresholds,
    });

    const allergenMatches: AllergenMatch[] = matchMemberAllergens(
      details.allergens.map((a) => ({ allergen: a.allergen, kind: a.kind })),
      preferences?.allergies ?? []
    );

    const localDate = await memberLocalDate(supabase, userId);
    const { result: coachingResult, promptVersion } = await generateFoodCoachingNarrative({
      supabase,
      memberId: userId,
      localDate,
      productName: details.product.name,
      brand: details.product.brand,
      servingSizeText: details.product.serving_size_text,
      rulesResult,
      allergenMatches,
      dietaryPattern: preferences?.dietary_pattern ?? null,
    });

    const analysis = await insertFoodAnalysisResult(supabase, {
      scanId,
      productId: details.product.id,
      dataCompleteness: rulesResult.dataCompleteness,
      overallConfidence: rulesResult.overallConfidence,
      rulesResult,
      coachingResult,
      coachingPromptVersion: promptVersion,
      memberAllergenMatches: allergenMatches,
    });
    if (!analysis) {
      await updateFoodLensScan(supabase, scanId, { status: 'failed' });
      return { status: 'failed', error: 'Could not save the analysis.' };
    }

    try {
      await upsertRegistryEntryFromFoodAnalysis(supabase, userId, analysis, details.product.name);
    } catch (err) {
      console.error('upsertRegistryEntryFromFoodAnalysis failed', err);
    }

    await updateFoodLensScan(supabase, scanId, { status: 'analyzed' });
    return { status: 'analyzed', analysis };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed.';
    await updateFoodLensScan(supabase, scanId, { status: 'failed', provider_error: message });
    return { status: 'failed', error: message };
  }
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
  const details = barcodeScan?.product_id
    ? await getFoodProductWithDetails(supabase, barcodeScan.product_id)
    : null;
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
