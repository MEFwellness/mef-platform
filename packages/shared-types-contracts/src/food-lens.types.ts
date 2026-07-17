/**
 * MEF Food Lens — shared types for the food_lens_* tables and
 * primal_pattern_profiles in
 * supabase/migrations/00000000000055_food_lens.sql and
 * 00000000000056_food_lens_meal_quality.sql. Same convention as
 * body-assessment.types.ts: hand-authored, kept in sync with the migration
 * by hand, row/type contracts only — no logic (that lives in
 * apps/consumer-web-app/lib/food-lens/).
 *
 * Adapted from the design blueprint at docs/food-lens/interfaces/types.ts,
 * with one deliberate departure from that blueprint: `narrative` on
 * FoodLensPatternComparison is no longer template-selected copy. Per the
 * product decision to use a hybrid model, it is generated dynamically by
 * Root's coaching brain (lib/food-lens/coachingNarrative.ts) from this
 * scan's deterministic signals plus the member's real history — never
 * fabricated, never raw unconstrained model output. See that file's
 * docblock for the guardrails.
 */

/** Never an exact percentage or gram value — MEF Food Lens never presents macro estimates as exact facts. Used for a Primal Pattern *target* (nobody's target is "no protein at all", so this stays 3-valued). */
export type FoodLensMacroLevel = 'low' | 'moderate' | 'high';

/**
 * A *meal reading* can genuinely be 'none' — e.g. a can of regular soda has
 * no meaningful protein or fat, plain water has none of any macro. Forcing
 * every reading into low/moderate/high (the old FoodLensMacroLevel-only
 * shape) is what produced the misleading "Sprite: Protein Low, Fat Low"
 * result: 'low' reads to a member as "a small amount," not "essentially
 * none." Used for FoodLensMacroEstimate's levels and a comparison signal's
 * mealLevel — never for a Primal Pattern target (see FoodLensMacroLevel).
 */
export type FoodLensMealMacroLevel = FoodLensMacroLevel | 'none';

export type FoodLensFoodCategory = 'protein' | 'carb' | 'fat' | 'vegetable' | 'mixed' | 'unknown';

// ---------------------------------------------------------------------------
// Primal Pattern target (read-only contract from a separately-built system —
// see docs/food-lens/05-primal-pattern-integration.md)
// ---------------------------------------------------------------------------

export interface PrimalPatternProfile {
  id: string;
  member_id: string;
  pattern_label: string;
  protein_emphasis: FoodLensMacroLevel;
  carb_emphasis: FoodLensMacroLevel;
  fat_emphasis: FoodLensMacroLevel;
  source: string;
  is_active: boolean;
  supersedes_id: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Scan lifecycle
// ---------------------------------------------------------------------------

export type FoodLensScanType = 'meal_photo' | 'barcode' | 'nutrition_label';

export type FoodLensScanStatus =
  | 'pending'
  | 'analyzing'
  | 'analyzed'
  | 'not_configured'
  | 'failed'
  | 'member_reviewed';

export interface FoodLensScan {
  id: string;
  member_id: string;
  scan_type: FoodLensScanType;
  status: FoodLensScanStatus;
  provider_name: string | null;
  provider_status: string | null;
  provider_error: string | null;
  primal_pattern_profile_id: string | null;
  created_at: string;
  updated_at: string;
}

export type FoodLensCaptureType = 'photo' | 'barcode_image' | 'label_image';

export interface FoodLensCapture {
  id: string;
  scan_id: string;
  storage_path: string;
  capture_type: FoodLensCaptureType;
  device_info: Record<string, unknown>;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Detected items
// ---------------------------------------------------------------------------

export type FoodLensDetectedItemSource = 'ai_detected' | 'member_added' | 'member_corrected';
export type FoodLensDetectedItemStatus =
  | 'pending_confirmation'
  | 'confirmed'
  | 'rejected'
  | 'superseded';

export interface FoodLensDetectedItem {
  id: string;
  scan_id: string;
  label: string;
  category: FoodLensFoodCategory;
  confidence: number;
  source: FoodLensDetectedItemSource;
  status: FoodLensDetectedItemStatus;
  supersedes_id: string | null;
  created_at: string;
}

export type FoodLensCorrectionType =
  | 'label_fixed'
  | 'category_fixed'
  | 'item_removed'
  | 'item_added';

export interface FoodLensCorrection {
  id: string;
  member_id: string;
  detected_item_id: string;
  correction_type: FoodLensCorrectionType;
  original_value: Record<string, unknown>;
  corrected_value: Record<string, unknown>;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Macro estimate & comparison
// ---------------------------------------------------------------------------

export interface FoodLensMacroEstimate {
  id: string;
  scan_id: string;
  protein_level: FoodLensMealMacroLevel;
  carb_level: FoodLensMealMacroLevel;
  fat_level: FoodLensMealMacroLevel;
  protein_confidence: number;
  carb_confidence: number;
  fat_confidence: number;
  overall_confidence: number;
  basis: 'ai_estimated' | 'member_adjusted';
  created_at: string;
}

export type FoodLensSignalDirection = 'match' | 'heavy' | 'light';

export interface FoodLensComparisonSignal {
  dimension: 'protein' | 'carb' | 'fat';
  mealLevel: FoodLensMealMacroLevel;
  targetLevel: FoodLensMacroLevel;
  direction: FoodLensSignalDirection;
}

export interface FoodLensPatternComparison {
  id: string;
  scan_id: string;
  macro_estimate_id: string;
  primal_pattern_profile_id: string;
  signals: FoodLensComparisonSignal[];
  /** Root-generated coaching copy — see this file's docblock. */
  narrative: string;
  confidence: number;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Meal Quality indicator (green/yellow/red) — supabase/migrations/
// 00000000000056_food_lens_meal_quality.sql
// ---------------------------------------------------------------------------

export type FoodLensMealQualityRatingValue = 'green' | 'yellow' | 'red';

/** How much protein/fiber/micronutrient value a food has relative to its energy — a distinct judgment from the macro *emphasis* levels above (a food can be carb-'high' and still nutrient-dense, e.g. a bowl of lentils, or carb-'high' and nutrient-'low', e.g. a soda). */
export type FoodLensNutrientDensity = 'low' | 'moderate' | 'high';
export type FoodLensAddedSugarLevel = 'none' | 'some' | 'high';
export type FoodLensProcessingLevel = 'whole_or_minimally_processed' | 'processed' | 'ultra_processed';

/**
 * The deterministic Meal Quality rating for one scan. Kept as its own
 * table (not new columns on food_lens_pattern_comparisons) because a
 * rating is computable, and useful, even for a member with no Primal
 * Pattern target set yet — the same "still useful on its own" discipline
 * doc 5 §5.5 already applies to the macro estimate.
 */
export interface FoodLensMealQualityRating {
  id: string;
  scan_id: string;
  macro_estimate_id: string;
  rating: FoodLensMealQualityRatingValue;
  /** One short, reviewed explanation sentence shown beneath the rating — never generated per-call by an LLM; see lib/food-lens/mealQuality.ts. */
  explanation: string;
  nutrient_density: FoodLensNutrientDensity;
  added_sugar_level: FoodLensAddedSugarLevel;
  processing_level: FoodLensProcessingLevel;
  has_meaningful_protein: boolean;
  has_meaningful_fiber: boolean;
  has_healthy_fat: boolean;
  /** True when the rated item is primarily a drink — used only to phrase the explanation accurately ("sugary soda" vs. "sugary snack"), never to change the rating itself. */
  is_beverage: boolean;
  /** Confidence in these quality-signal judgments specifically — distinct from item-identification confidence (FoodLensDetectedItem.confidence) and macro-composition confidence (FoodLensMacroEstimate.*_confidence). */
  confidence: number;
  created_at: string;
}
