/**
 * MEF Food Intelligence Engine — shared types for the barcode/packaged-food
 * tables in supabase/migrations/00000000000059_food_products_barcode.sql.
 * Same convention as food-lens.types.ts: hand-authored, kept in sync with
 * the migration by hand, row/type contracts only — logic lives in
 * apps/consumer-web-app/lib/food-products/.
 */

export type BarcodeType = 'upc_a' | 'upc_e' | 'ean_8' | 'ean_13' | 'unknown';

export type FoodProductDataSource = 'open_food_facts' | 'usda_fdc' | 'mef_verified';

export type DataCompleteness = 'complete' | 'partial' | 'minimal';

export interface FoodProduct {
  id: string;
  barcode: string;
  barcode_type: BarcodeType;
  name: string | null;
  brand: string | null;
  image_url: string | null;
  serving_size_text: string | null;
  serving_size_grams: number | null;
  data_source: FoodProductDataSource;
  source_product_id: string | null;
  nutrition_grade: string | null;
  data_completeness: DataCompleteness;
  raw_source_data: Record<string, unknown>;
  last_fetched_at: string;
  created_at: string;
  updated_at: string;
}

export type NutrientBasis = 'per_serving' | 'per_100g';

export interface ProductNutrients {
  id: string;
  product_id: string;
  basis: NutrientBasis;
  calories: number | null;
  protein_g: number | null;
  total_carbohydrate_g: number | null;
  fiber_g: number | null;
  total_sugar_g: number | null;
  added_sugar_g: number | null;
  total_fat_g: number | null;
  saturated_fat_g: number | null;
  monounsaturated_fat_g: number | null;
  polyunsaturated_fat_g: number | null;
  trans_fat_g: number | null;
  sodium_mg: number | null;
  potassium_mg: number | null;
  created_at: string;
  updated_at: string;
}

export interface ProductIngredients {
  id: string;
  product_id: string;
  ingredients_text: string | null;
  ingredients_list: string[];
  additives: string[];
  created_at: string;
  updated_at: string;
}

export type ProductAllergenKind = 'contains' | 'may_contain';

export interface ProductAllergen {
  id: string;
  product_id: string;
  allergen: string;
  kind: ProductAllergenKind;
  created_at: string;
}

/** The fully normalized shape a data provider (Open Food Facts today, USDA/MEF-verified later) hands back — see lib/food-products/providers/types.ts for the provider interface this feeds. */
export interface NormalizedFoodProduct {
  barcode: string;
  barcodeType: BarcodeType;
  dataSource: FoodProductDataSource;
  sourceProductId: string | null;
  name: string | null;
  brand: string | null;
  imageUrl: string | null;
  servingSizeText: string | null;
  servingSizeGrams: number | null;
  nutritionGrade: string | null;
  dataCompleteness: DataCompleteness;
  rawSourceData: Record<string, unknown>;
  nutrients: {
    basis: NutrientBasis;
    calories: number | null;
    proteinG: number | null;
    totalCarbohydrateG: number | null;
    fiberG: number | null;
    totalSugarG: number | null;
    addedSugarG: number | null;
    totalFatG: number | null;
    saturatedFatG: number | null;
    monounsaturatedFatG: number | null;
    polyunsaturatedFatG: number | null;
    transFatG: number | null;
    sodiumMg: number | null;
    potassiumMg: number | null;
  } | null;
  ingredientsText: string | null;
  ingredientsList: string[];
  additives: string[];
  allergens: Array<{ allergen: string; kind: ProductAllergenKind }>;
}

// ---------------------------------------------------------------------------
// Barcode scan lifecycle (child of food_lens_scans, scan_type = 'barcode')
// ---------------------------------------------------------------------------

export type BarcodeLookupStatus = 'pending' | 'found' | 'not_found' | 'error';

export interface FoodLensBarcodeScan {
  id: string;
  scan_id: string;
  barcode: string;
  barcode_type: BarcodeType;
  product_id: string | null;
  lookup_status: BarcodeLookupStatus;
  lookup_error: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// MEF Nutrition Rules Engine — deterministic result contract
// ---------------------------------------------------------------------------

export type QualitativeLevel = 'low' | 'moderate' | 'high';

export interface IngredientQualityResult {
  wholeFoodIngredientsPresent: boolean;
  hasRefinedFlour: boolean;
  hasAddedSugar: boolean;
  hasArtificialSweeteners: boolean;
  hasSugarAlcohols: boolean;
  hasPartiallyHydrogenatedOil: boolean;
  hasArtificialColors: boolean;
  preservativeCount: number;
  additiveCount: number;
  ingredientCount: number | null;
  isLongIngredientList: boolean;
  dominantIngredients: string[];
  observations: string[];
}

export type FatSourceCategory = 'whole_food' | 'processed_or_industrial' | 'mixed' | 'unknown';

export interface FatQualityResult {
  totalFatG: number | null;
  saturatedFatG: number | null;
  monounsaturatedFatG: number | null;
  polyunsaturatedFatG: number | null;
  transFatG: number | null;
  fatSourceCategory: FatSourceCategory;
  containsPartiallyHydrogenatedOil: boolean;
  containsSeedOil: boolean;
  hasIndustrialTransFat: boolean;
  observations: string[];
}

export interface CarbQualityResult {
  totalCarbohydrateG: number | null;
  fiberG: number | null;
  totalSugarG: number | null;
  addedSugarG: number | null;
  isPrimarilyRefinedCarbohydrate: boolean;
  isWholeGrainIndicated: boolean;
  carbToFiberRatio: number | null;
  observations: string[];
}

export interface ProteinQualityResult {
  proteinG: number | null;
  isMeaningfulAmount: boolean;
  isMarketedHighProteinButModest: boolean;
  primaryProteinSourceWholeFood: boolean | null;
  observations: string[];
}

export type ProcessingLevelLabel =
  'minimally_processed' | 'lightly_processed' | 'moderately_processed' | 'highly_processed';

export interface ProcessingContextResult {
  label: ProcessingLevelLabel;
  reason: string;
}

export type NutrientCombinationCode =
  | 'high_sat_fat_high_added_sugar'
  | 'high_fat_refined_carb'
  | 'high_refined_carb_low_fiber'
  | 'high_added_sugar_low_protein'
  | 'high_calorie_low_protein_low_fiber'
  | 'high_sodium_low_nutrient_density'
  | 'useful_protein_high_sodium'
  | 'high_carb_low_everything_else'
  | 'high_fiber_good_protein_whole_food'
  | 'whole_food_fat_protein_fiber'
  | 'ultra_processed_concentrated_energy';

export interface NutrientCombinationFinding {
  code: NutrientCombinationCode;
  severity: 'informational' | 'worth_noting' | 'meaningful';
  narrative: string;
}

export interface AllergenMatch {
  allergen: string;
  kind: ProductAllergenKind;
}

/** The full MEF Nutrition Rules Engine output for one product — deterministic, no AI involvement. See lib/food-products/rulesEngine/index.ts. */
export interface FoodRulesEngineResult {
  dataCompleteness: DataCompleteness;
  ingredientQuality: IngredientQualityResult;
  fatQuality: FatQualityResult;
  carbQuality: CarbQualityResult;
  proteinQuality: ProteinQualityResult;
  processingContext: ProcessingContextResult;
  nutrientCombinations: NutrientCombinationFinding[];
  overallConfidence: number;
}

// ---------------------------------------------------------------------------
// Coaching layer output (Root, generated from rulesResult only)
// ---------------------------------------------------------------------------

export interface FoodCoachingResult {
  supportsYou: string | null;
  mindfulOf: string | null;
  bestFit: string | null;
  recommendation: string | null;
  missingInformation: string | null;
}

export interface FoodAnalysisResult {
  id: string;
  scan_id: string;
  product_id: string;
  data_completeness: DataCompleteness;
  overall_confidence: number;
  rules_result: FoodRulesEngineResult;
  coaching_result: FoodCoachingResult;
  coaching_prompt_version: string | null;
  member_allergen_matches: AllergenMatch[];
  created_at: string;
}

// ---------------------------------------------------------------------------
// Nutrition rule thresholds (configurable numeric cutoffs)
// ---------------------------------------------------------------------------

export interface NutritionRuleThreshold {
  key: string;
  value: number;
  description: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Food log
// ---------------------------------------------------------------------------

export type MealCategory = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface MemberFoodLogEntry {
  id: string;
  member_id: string;
  product_id: string | null;
  scan_id: string | null;
  meal_category: MealCategory;
  servings: number;
  consumed_at: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Member food preferences (phase-1 manual-entry placeholder — allergies,
// intolerances, dietary pattern; see migration 59's header for why this
// exists rather than reusing an onboarding field that doesn't exist yet)
// ---------------------------------------------------------------------------

export interface MemberFoodPreferences {
  member_id: string;
  allergies: string[];
  intolerances: string[];
  avoid_ingredients: string[];
  dietary_pattern: string | null;
  updated_at: string;
}
