/**
 * MEF Food Lens — shared types for the food_lens_* tables and
 * primal_pattern_profiles in
 * supabase/migrations/00000000000055_food_lens.sql. Same convention as
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

/** Never an exact percentage or gram value — MEF Food Lens never presents macro estimates as exact facts. */
export type FoodLensMacroLevel = 'low' | 'moderate' | 'high';

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
  protein_level: FoodLensMacroLevel;
  carb_level: FoodLensMacroLevel;
  fat_level: FoodLensMacroLevel;
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
  mealLevel: FoodLensMacroLevel;
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
