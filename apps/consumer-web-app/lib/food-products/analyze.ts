/**
 * The MEF Nutrition Rules Engine + Root coaching pipeline for one already-
 * resolved product, factored out so every entry point that ends up with a
 * product_id (barcode lookup, a confirmed Nutrition Facts label scan, or
 * opening an already-cached product from search/favorites/pantry) runs the
 * exact same analysis — one reviewable code path, not three copies that
 * could quietly drift apart. Callers still own resolving *how* they got a
 * product_id; this only does "product_id -> food_analysis_results row."
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AllergenMatch, FoodAnalysisResult } from '@mef/shared-types-contracts';
import {
  getFoodProductWithDetails,
  getMemberFoodPreferences,
  insertFoodAnalysisResult,
  listNutritionRuleThresholds,
} from './data';
import { runFoodRulesEngine, resolveNutritionThresholds } from './rulesEngine';
import { matchMemberAllergens } from './rulesEngine/allergenCheck';
import { generateFoodCoachingNarrative } from './coachingNarrative';
import { upsertRegistryEntryFromFoodAnalysis } from '@/lib/registry/adapters/foodProducts';

export type RunProductAnalysisResult = {
  status: 'analyzed' | 'failed';
  analysis?: FoodAnalysisResult;
  error?: string;
};

export async function runProductAnalysisForScan(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string,
  scanId: string,
  productId: string
): Promise<RunProductAnalysisResult> {
  const details = await getFoodProductWithDetails(supabase, productId);
  if (!details) return { status: 'failed', error: 'Could not load the product record.' };

  const [thresholdOverrides, preferences] = await Promise.all([
    listNutritionRuleThresholds(supabase),
    getMemberFoodPreferences(supabase, memberId),
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

  const { result: coachingResult, promptVersion } = await generateFoodCoachingNarrative({
    supabase,
    memberId,
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
    productId,
    dataCompleteness: rulesResult.dataCompleteness,
    overallConfidence: rulesResult.overallConfidence,
    rulesResult,
    coachingResult,
    coachingPromptVersion: promptVersion,
    memberAllergenMatches: allergenMatches,
  });
  if (!analysis) return { status: 'failed', error: 'Could not save the analysis.' };

  try {
    await upsertRegistryEntryFromFoodAnalysis(supabase, memberId, analysis, details.product.name);
  } catch (err) {
    console.error('upsertRegistryEntryFromFoodAnalysis failed', err);
  }

  return { status: 'analyzed', analysis };
}
