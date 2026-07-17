/**
 * Default numeric cutoffs the MEF Nutrition Rules Engine uses. These mirror
 * the seed rows in supabase/migrations/00000000000059_food_products_barcode.sql
 * (nutrition_rule_thresholds) key-for-key — the DB table is what's actually
 * "configurable without a redeploy" (product requirement §5); this object
 * is the safe default any caller (including every unit test) gets when it
 * doesn't fetch overrides from the database, so the rules engine itself
 * never has an undefined-threshold failure mode.
 */

export type NutritionThresholds = {
  highSaturatedFatG: number;
  highTotalFatG: number;
  highAddedSugarG: number;
  highSodiumMg: number;
  lowFiberG: number;
  meaningfulFiberG: number;
  meaningfulProteinG: number;
  highProteinMarketingG: number;
  lowCalorieDensityKcal: number;
  highCalorieDensityKcal: number;
  longIngredientListCount: number;
  highCarbG: number;
};

export const DEFAULT_NUTRITION_THRESHOLDS: NutritionThresholds = {
  highSaturatedFatG: 5,
  highTotalFatG: 15,
  highAddedSugarG: 10,
  highSodiumMg: 600,
  lowFiberG: 2,
  meaningfulFiberG: 3,
  meaningfulProteinG: 5,
  highProteinMarketingG: 10,
  lowCalorieDensityKcal: 100,
  highCalorieDensityKcal: 350,
  longIngredientListCount: 12,
  highCarbG: 30,
};

const KEY_MAP: Record<keyof NutritionThresholds, string> = {
  highSaturatedFatG: 'high_saturated_fat_g',
  highTotalFatG: 'high_total_fat_g',
  highAddedSugarG: 'high_added_sugar_g',
  highSodiumMg: 'high_sodium_mg',
  lowFiberG: 'low_fiber_g',
  meaningfulFiberG: 'meaningful_fiber_g',
  meaningfulProteinG: 'meaningful_protein_g',
  highProteinMarketingG: 'high_protein_marketing_g',
  lowCalorieDensityKcal: 'low_calorie_density_kcal',
  highCalorieDensityKcal: 'high_calorie_density_kcal',
  longIngredientListCount: 'long_ingredient_list_count',
  highCarbG: 'high_carb_g',
};

/** Merges DB-sourced overrides (lib/food-products/data.ts's listNutritionRuleThresholds, keyed by the snake_case DB key) over the safe defaults — a missing or malformed override for one key never invalidates the rest. */
export function resolveNutritionThresholds(
  overrides: Record<string, number> = {}
): NutritionThresholds {
  const resolved = { ...DEFAULT_NUTRITION_THRESHOLDS };
  for (const key of Object.keys(KEY_MAP) as Array<keyof NutritionThresholds>) {
    const dbKey = KEY_MAP[key];
    const value = overrides[dbKey];
    if (typeof value === 'number' && Number.isFinite(value)) {
      resolved[key] = value;
    }
  }
  return resolved;
}
