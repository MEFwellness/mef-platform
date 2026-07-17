/**
 * Database access for Nutrition Facts label scanning
 * (food_lens_label_scans / food_lens_label_field_corrections — migration
 * 60). Same shape as lib/food-lens/data.ts: pure functions taking a
 * SupabaseClient, RLS decides who may read/write what. Kept as its own
 * file rather than added to lib/food-lens/data.ts to keep that already
 * large file scoped to the meal-photo flow it was written for.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type {
  FoodLensLabelFieldCorrection,
  FoodLensLabelScan,
  FoodLensLabelScanStatus,
} from '@mef/shared-types-contracts';
import type { FoodLabelOcrResult } from './providers/labelOcr/types';

export async function insertFoodLensLabelScanFromExtraction(
  supabase: SupabaseClient,
  scanId: string,
  extraction: FoodLabelOcrResult
): Promise<FoodLensLabelScan | null> {
  const id = randomUUID();
  const now = new Date().toISOString();

  const vitaminsMinerals: Record<string, number> = {};
  for (const v of extraction.vitaminsMinerals) {
    vitaminsMinerals[v.name] = v.amount;
  }

  const row = {
    id,
    scan_id: scanId,
    product_name: extraction.productName,
    brand: extraction.brand,
    serving_size_text: extraction.servingSizeText,
    servings_per_container: extraction.numeric.servingsPerContainer,
    calories: extraction.numeric.calories,
    protein_g: extraction.numeric.proteinG,
    total_carbohydrate_g: extraction.numeric.totalCarbohydrateG,
    fiber_g: extraction.numeric.fiberG,
    total_sugar_g: extraction.numeric.totalSugarG,
    added_sugar_g: extraction.numeric.addedSugarG,
    total_fat_g: extraction.numeric.totalFatG,
    saturated_fat_g: extraction.numeric.saturatedFatG,
    trans_fat_g: extraction.numeric.transFatG,
    monounsaturated_fat_g: extraction.numeric.monounsaturatedFatG,
    polyunsaturated_fat_g: extraction.numeric.polyunsaturatedFatG,
    cholesterol_mg: extraction.numeric.cholesterolMg,
    sodium_mg: extraction.numeric.sodiumMg,
    potassium_mg: extraction.numeric.potassiumMg,
    vitamins_minerals: vitaminsMinerals,
    ingredients_text: extraction.ingredientsText,
    allergens_text: extraction.allergensText,
    field_confidence: extraction.fieldConfidence,
    status: 'extracted' as const,
    created_at: now,
    updated_at: now,
  };

  const { error } = await supabase.from('food_lens_label_scans').insert(row);
  if (error) {
    console.error('insertFoodLensLabelScanFromExtraction failed', error);
    return null;
  }
  return { ...row, confirmed_product_id: null } as FoodLensLabelScan;
}

export async function getFoodLensLabelScanByScanId(
  supabase: SupabaseClient,
  scanId: string
): Promise<FoodLensLabelScan | null> {
  const { data, error } = await supabase
    .from('food_lens_label_scans')
    .select('*')
    .eq('scan_id', scanId)
    .maybeSingle();
  if (error) {
    console.error('getFoodLensLabelScanByScanId failed', error);
    return null;
  }
  return data as FoodLensLabelScan | null;
}

/** Patches editable fields ahead of confirmation — member corrections. Never allowed once status is 'member_confirmed' (enforced by the caller action, since a confirmed scan's materialized food_products row is what the rest of the app now reads). */
export async function updateFoodLensLabelScanFields(
  supabase: SupabaseClient,
  id: string,
  patch: Record<string, unknown>
): Promise<boolean> {
  const { error } = await supabase
    .from('food_lens_label_scans')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) {
    console.error('updateFoodLensLabelScanFields failed', error);
    return false;
  }
  return true;
}

export async function markFoodLensLabelScanConfirmed(
  supabase: SupabaseClient,
  id: string,
  confirmedProductId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('food_lens_label_scans')
    .update({
      status: 'member_confirmed' as FoodLensLabelScanStatus,
      confirmed_product_id: confirmedProductId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) {
    console.error('markFoodLensLabelScanConfirmed failed', error);
    return false;
  }
  return true;
}

export async function insertFoodLensLabelFieldCorrection(
  supabase: SupabaseClient,
  input: {
    memberId: string;
    labelScanId: string;
    fieldName: string;
    originalValue: unknown;
    correctedValue: unknown;
  }
): Promise<FoodLensLabelFieldCorrection | null> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const { error } = await supabase.from('food_lens_label_field_corrections').insert({
    id,
    member_id: input.memberId,
    label_scan_id: input.labelScanId,
    field_name: input.fieldName,
    original_value: input.originalValue,
    corrected_value: input.correctedValue,
    created_at: now,
  });
  if (error) {
    console.error('insertFoodLensLabelFieldCorrection failed', error);
    return null;
  }
  return {
    id,
    member_id: input.memberId,
    label_scan_id: input.labelScanId,
    field_name: input.fieldName,
    original_value: input.originalValue,
    corrected_value: input.correctedValue,
    created_at: now,
  };
}
