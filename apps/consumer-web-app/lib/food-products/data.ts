/**
 * Database access for the MEF Food Intelligence Engine — same shape as
 * lib/food-lens/data.ts: pure functions taking a SupabaseClient, RLS
 * (migration 59) decides who may read/write what. food_products and its
 * child tables are a shared reference cache (not member-owned), so writes
 * here run under whichever member's session triggered the lookup — see
 * migration 59's header for why that's safe.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type {
  AllergenMatch,
  BarcodeLookupStatus,
  BarcodeType,
  FoodAnalysisResult,
  FoodCoachingResult,
  FoodLensBarcodeScan,
  FoodProduct,
  FoodRulesEngineResult,
  MealCategory,
  MemberFoodLogEntry,
  MemberFoodPreferences,
  NormalizedFoodProduct,
  NutritionRuleThreshold,
  ProductAllergen,
  ProductIngredients,
  ProductNutrients,
} from '@mef/shared-types-contracts';

// ---- food_products (+ nutrients/ingredients/allergens) ----

export type FoodProductWithDetails = {
  product: FoodProduct;
  nutrients: ProductNutrients | null;
  ingredients: ProductIngredients | null;
  allergens: ProductAllergen[];
};

export async function findCachedFoodProduct(
  supabase: SupabaseClient,
  barcode: string,
  dataSource: NormalizedFoodProduct['dataSource'] = 'open_food_facts'
): Promise<FoodProductWithDetails | null> {
  const { data: product, error } = await supabase
    .from('food_products')
    .select('*')
    .eq('barcode', barcode)
    .eq('data_source', dataSource)
    .maybeSingle();
  if (error) {
    console.error('findCachedFoodProduct failed', error);
    return null;
  }
  if (!product) return null;
  return getFoodProductWithDetails(supabase, (product as FoodProduct).id);
}

export async function getFoodProductWithDetails(
  supabase: SupabaseClient,
  productId: string
): Promise<FoodProductWithDetails | null> {
  const [
    { data: product, error: productError },
    { data: nutrients },
    { data: ingredients },
    { data: allergens },
  ] = await Promise.all([
    supabase.from('food_products').select('*').eq('id', productId).maybeSingle(),
    supabase.from('product_nutrients').select('*').eq('product_id', productId).maybeSingle(),
    supabase.from('product_ingredients').select('*').eq('product_id', productId).maybeSingle(),
    supabase.from('product_allergens').select('*').eq('product_id', productId),
  ]);
  if (productError || !product) {
    if (productError) console.error('getFoodProductWithDetails failed', productError);
    return null;
  }
  return {
    product: product as FoodProduct,
    nutrients: (nutrients as ProductNutrients) ?? null,
    ingredients: (ingredients as ProductIngredients) ?? null,
    allergens: (allergens as ProductAllergen[]) ?? [],
  };
}

/** Writes (or refreshes) a product and its child rows from a freshly fetched provider result. Upserts by (barcode, data_source) — this is a shared reference cache, not append-only member data (migration 59's header). */
export async function upsertFoodProductFromProvider(
  supabase: SupabaseClient,
  normalized: NormalizedFoodProduct
): Promise<FoodProductWithDetails | null> {
  const existing = await supabase
    .from('food_products')
    .select('id')
    .eq('barcode', normalized.barcode)
    .eq('data_source', normalized.dataSource)
    .maybeSingle();

  const productId = (existing.data as { id: string } | null)?.id ?? randomUUID();
  const now = new Date().toISOString();

  const { error: productError } = await supabase.from('food_products').upsert(
    {
      id: productId,
      barcode: normalized.barcode,
      barcode_type: normalized.barcodeType,
      name: normalized.name,
      brand: normalized.brand,
      image_url: normalized.imageUrl,
      serving_size_text: normalized.servingSizeText,
      serving_size_grams: normalized.servingSizeGrams,
      data_source: normalized.dataSource,
      source_product_id: normalized.sourceProductId,
      nutrition_grade: normalized.nutritionGrade,
      data_completeness: normalized.dataCompleteness,
      raw_source_data: normalized.rawSourceData,
      last_fetched_at: now,
      updated_at: now,
    },
    { onConflict: 'barcode,data_source' }
  );
  if (productError) {
    console.error('upsertFoodProductFromProvider: food_products upsert failed', productError);
    return null;
  }

  if (normalized.nutrients) {
    const { error } = await supabase.from('product_nutrients').upsert(
      {
        product_id: productId,
        basis: normalized.nutrients.basis,
        calories: normalized.nutrients.calories,
        protein_g: normalized.nutrients.proteinG,
        total_carbohydrate_g: normalized.nutrients.totalCarbohydrateG,
        fiber_g: normalized.nutrients.fiberG,
        total_sugar_g: normalized.nutrients.totalSugarG,
        added_sugar_g: normalized.nutrients.addedSugarG,
        total_fat_g: normalized.nutrients.totalFatG,
        saturated_fat_g: normalized.nutrients.saturatedFatG,
        monounsaturated_fat_g: normalized.nutrients.monounsaturatedFatG,
        polyunsaturated_fat_g: normalized.nutrients.polyunsaturatedFatG,
        trans_fat_g: normalized.nutrients.transFatG,
        sodium_mg: normalized.nutrients.sodiumMg,
        potassium_mg: normalized.nutrients.potassiumMg,
        updated_at: now,
      },
      { onConflict: 'product_id' }
    );
    if (error)
      console.error('upsertFoodProductFromProvider: product_nutrients upsert failed', error);
  }

  if (normalized.ingredientsText || normalized.ingredientsList.length > 0) {
    const { error } = await supabase.from('product_ingredients').upsert(
      {
        product_id: productId,
        ingredients_text: normalized.ingredientsText,
        ingredients_list: normalized.ingredientsList,
        additives: normalized.additives,
        updated_at: now,
      },
      { onConflict: 'product_id' }
    );
    if (error)
      console.error('upsertFoodProductFromProvider: product_ingredients upsert failed', error);
  }

  if (normalized.allergens.length > 0) {
    await supabase.from('product_allergens').delete().eq('product_id', productId);
    const { error } = await supabase
      .from('product_allergens')
      .insert(
        normalized.allergens.map((a) => ({
          product_id: productId,
          allergen: a.allergen,
          kind: a.kind,
        }))
      );
    if (error)
      console.error('upsertFoodProductFromProvider: product_allergens insert failed', error);
  }

  return getFoodProductWithDetails(supabase, productId);
}

// ---- food_lens_barcode_scans ----

export async function insertFoodLensBarcodeScan(
  supabase: SupabaseClient,
  input: { scanId: string; barcode: string; barcodeType: BarcodeType }
): Promise<FoodLensBarcodeScan | null> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const { error } = await supabase.from('food_lens_barcode_scans').insert({
    id,
    scan_id: input.scanId,
    barcode: input.barcode,
    barcode_type: input.barcodeType,
    lookup_status: 'pending',
    created_at: now,
  });
  if (error) {
    console.error('insertFoodLensBarcodeScan failed', error);
    return null;
  }
  return {
    id,
    scan_id: input.scanId,
    barcode: input.barcode,
    barcode_type: input.barcodeType,
    product_id: null,
    lookup_status: 'pending',
    lookup_error: null,
    created_at: now,
  };
}

export async function updateFoodLensBarcodeScan(
  supabase: SupabaseClient,
  id: string,
  patch: {
    productId?: string | null;
    lookupStatus: BarcodeLookupStatus;
    lookupError?: string | null;
  }
): Promise<boolean> {
  const { error } = await supabase
    .from('food_lens_barcode_scans')
    .update({
      product_id: patch.productId ?? null,
      lookup_status: patch.lookupStatus,
      lookup_error: patch.lookupError ?? null,
    })
    .eq('id', id);
  if (error) {
    console.error('updateFoodLensBarcodeScan failed', error);
    return false;
  }
  return true;
}

export async function getFoodLensBarcodeScanByScanId(
  supabase: SupabaseClient,
  scanId: string
): Promise<FoodLensBarcodeScan | null> {
  const { data, error } = await supabase
    .from('food_lens_barcode_scans')
    .select('*')
    .eq('scan_id', scanId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('getFoodLensBarcodeScanByScanId failed', error);
    return null;
  }
  return data as FoodLensBarcodeScan | null;
}

// ---- food_analysis_results ----

export async function insertFoodAnalysisResult(
  supabase: SupabaseClient,
  input: {
    scanId: string;
    productId: string;
    dataCompleteness: FoodAnalysisResult['data_completeness'];
    overallConfidence: number;
    rulesResult: FoodRulesEngineResult;
    coachingResult: FoodCoachingResult;
    coachingPromptVersion: string | null;
    memberAllergenMatches: AllergenMatch[];
  }
): Promise<FoodAnalysisResult | null> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const { error } = await supabase.from('food_analysis_results').insert({
    id,
    scan_id: input.scanId,
    product_id: input.productId,
    data_completeness: input.dataCompleteness,
    overall_confidence: input.overallConfidence,
    rules_result: input.rulesResult,
    coaching_result: input.coachingResult,
    coaching_prompt_version: input.coachingPromptVersion,
    member_allergen_matches: input.memberAllergenMatches,
    created_at: now,
  });
  if (error) {
    console.error('insertFoodAnalysisResult failed', error);
    return null;
  }
  return {
    id,
    scan_id: input.scanId,
    product_id: input.productId,
    data_completeness: input.dataCompleteness,
    overall_confidence: input.overallConfidence,
    rules_result: input.rulesResult,
    coaching_result: input.coachingResult,
    coaching_prompt_version: input.coachingPromptVersion,
    member_allergen_matches: input.memberAllergenMatches,
    created_at: now,
  };
}

export async function getLatestFoodAnalysisResult(
  supabase: SupabaseClient,
  scanId: string
): Promise<FoodAnalysisResult | null> {
  const { data, error } = await supabase
    .from('food_analysis_results')
    .select('*')
    .eq('scan_id', scanId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('getLatestFoodAnalysisResult failed', error);
    return null;
  }
  return data as FoodAnalysisResult | null;
}

// ---- nutrition_rule_thresholds ----

export async function listNutritionRuleThresholds(
  supabase: SupabaseClient
): Promise<Record<string, number>> {
  const { data, error } = await supabase.from('nutrition_rule_thresholds').select('key, value');
  if (error) {
    console.error('listNutritionRuleThresholds failed', error);
    return {};
  }
  const map: Record<string, number> = {};
  for (const row of (data as NutritionRuleThreshold[]) ?? []) map[row.key] = Number(row.value);
  return map;
}

// ---- member_food_log ----

export async function insertFoodLogEntry(
  supabase: SupabaseClient,
  input: {
    memberId: string;
    productId?: string | null;
    scanId?: string | null;
    mealCategory: MealCategory;
    servings: number;
    consumedAt: string;
  }
): Promise<MemberFoodLogEntry | null> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const { error } = await supabase.from('member_food_log').insert({
    id,
    member_id: input.memberId,
    product_id: input.productId ?? null,
    scan_id: input.scanId ?? null,
    meal_category: input.mealCategory,
    servings: input.servings,
    consumed_at: input.consumedAt,
    created_at: now,
  });
  if (error) {
    console.error('insertFoodLogEntry failed', error);
    return null;
  }
  return {
    id,
    member_id: input.memberId,
    product_id: input.productId ?? null,
    scan_id: input.scanId ?? null,
    meal_category: input.mealCategory,
    servings: input.servings,
    consumed_at: input.consumedAt,
    created_at: now,
  };
}

export async function listFoodLogForDateRange(
  supabase: SupabaseClient,
  memberId: string,
  startIso: string,
  endIso: string
): Promise<MemberFoodLogEntry[]> {
  const { data, error } = await supabase
    .from('member_food_log')
    .select('*')
    .eq('member_id', memberId)
    .gte('consumed_at', startIso)
    .lt('consumed_at', endIso)
    .order('consumed_at', { ascending: true });
  if (error) {
    console.error('listFoodLogForDateRange failed', error);
    return [];
  }
  return data as MemberFoodLogEntry[];
}

export async function deleteFoodLogEntry(
  supabase: SupabaseClient,
  memberId: string,
  entryId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('member_food_log')
    .delete()
    .eq('id', entryId)
    .eq('member_id', memberId);
  if (error) {
    console.error('deleteFoodLogEntry failed', error);
    return false;
  }
  return true;
}

// ---- member_food_preferences ----

export async function getMemberFoodPreferences(
  supabase: SupabaseClient,
  memberId: string
): Promise<MemberFoodPreferences | null> {
  const { data, error } = await supabase
    .from('member_food_preferences')
    .select('*')
    .eq('member_id', memberId)
    .maybeSingle();
  if (error) {
    console.error('getMemberFoodPreferences failed', error);
    return null;
  }
  return data as MemberFoodPreferences | null;
}

export async function upsertMemberFoodPreferences(
  supabase: SupabaseClient,
  memberId: string,
  input: {
    allergies: string[];
    intolerances: string[];
    avoidIngredients: string[];
    dietaryPattern: string | null;
  }
): Promise<MemberFoodPreferences | null> {
  const now = new Date().toISOString();
  const { error } = await supabase.from('member_food_preferences').upsert(
    {
      member_id: memberId,
      allergies: input.allergies,
      intolerances: input.intolerances,
      avoid_ingredients: input.avoidIngredients,
      dietary_pattern: input.dietaryPattern,
      updated_at: now,
    },
    { onConflict: 'member_id' }
  );
  if (error) {
    console.error('upsertMemberFoodPreferences failed', error);
    return null;
  }
  return {
    member_id: memberId,
    allergies: input.allergies,
    intolerances: input.intolerances,
    avoid_ingredients: input.avoidIngredients,
    dietary_pattern: input.dietaryPattern,
    updated_at: now,
  };
}
