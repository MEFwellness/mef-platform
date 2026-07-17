/**
 * MEF Food Lens — reference type definitions.
 *
 * This file is documentation, not application code: it lives under docs/ and
 * is not imported by apps/consumer-web-app. It exists so the contracts
 * described in docs/food-lens/03-database-schema.md, 04-api-contracts.md,
 * and 05-primal-pattern-integration.md have a single, precise, copy-pasteable
 * source of truth for whoever implements this feature — rather than each
 * implementer re-deriving shapes from prose.
 *
 * When implementation begins, these types should move into
 * apps/consumer-web-app/lib/food-lens/types.ts (mirroring the shape of
 * lib/body-assessment/providers/types.ts) and be adjusted to match whatever
 * that implementation actually needs.
 */

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/** Never an exact percentage or gram value — see docs/food-lens/01-architecture.md §1.5. */
export type MacroLevel = 'low' | 'moderate' | 'high';

export type FoodCategory = 'protein' | 'carb' | 'fat' | 'vegetable' | 'mixed' | 'unknown';

/** 0–1. Every AI-derived value in this feature carries one. */
export type Confidence = number;

// ---------------------------------------------------------------------------
// Primal Pattern target (read-only contract from a separately-built system —
// see docs/food-lens/05-primal-pattern-integration.md)
// ---------------------------------------------------------------------------

export interface PrimalPatternProfile {
  id: string;
  memberId: string;
  patternLabel: string;
  proteinEmphasis: MacroLevel;
  carbEmphasis: MacroLevel;
  fatEmphasis: MacroLevel;
  isActive: boolean;
  createdAt: string;
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
  memberId: string;
  scanType: FoodLensScanType;
  status: FoodLensScanStatus;
  providerName: string | null;
  providerStatus: string | null;
  providerError: string | null;
  primalPatternProfileId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FoodLensScanSummary {
  id: string;
  scanType: FoodLensScanType;
  status: FoodLensScanStatus;
  createdAt: string;
  /** Denormalized for list rendering without a join — the comparison verdict's short form. */
  headline: string | null;
}

export type FoodLensCaptureType = 'photo' | 'barcode_image' | 'label_image';

export interface FoodLensCapture {
  id: string;
  scanId: string;
  storagePath: string;
  captureType: FoodLensCaptureType;
  deviceInfo: Record<string, unknown>;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Detected items
// ---------------------------------------------------------------------------

export type DetectedItemSource = 'ai_detected' | 'member_added' | 'member_corrected';
export type DetectedItemStatus = 'pending_confirmation' | 'confirmed' | 'rejected' | 'superseded';

export interface DetectedItem {
  id: string;
  scanId: string;
  label: string;
  category: FoodCategory;
  confidence: Confidence;
  source: DetectedItemSource;
  status: DetectedItemStatus;
  supersedesId: string | null;
  createdAt: string;
}

export type FoodLensCorrectionType =
  | 'label_fixed'
  | 'category_fixed'
  | 'item_removed'
  | 'item_added';

export interface FoodLensCorrection {
  id: string;
  memberId: string;
  detectedItemId: string;
  correctionType: FoodLensCorrectionType;
  originalValue: Record<string, unknown>;
  correctedValue: Record<string, unknown>;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Macro estimate & comparison
// ---------------------------------------------------------------------------

export interface MacroEstimate {
  id: string;
  scanId: string;
  protein: { level: MacroLevel; confidence: Confidence };
  carb: { level: MacroLevel; confidence: Confidence };
  fat: { level: MacroLevel; confidence: Confidence };
  /** min() of every confidence that fed this estimate — see docs/food-lens/03-database-schema.md §3.3. */
  overallConfidence: Confidence;
  basis: 'ai_estimated' | 'member_adjusted';
  createdAt: string;
}

export type SignalDirection = 'match' | 'heavy' | 'light';

export interface ComparisonSignal {
  dimension: 'protein' | 'carb' | 'fat';
  mealLevel: MacroLevel;
  targetLevel: MacroLevel;
  direction: SignalDirection;
}

export interface PatternComparison {
  id: string;
  scanId: string;
  macroEstimateId: string;
  primalPatternProfileId: string;
  signals: ComparisonSignal[];
  /** Selected from a reviewed template library — never raw model output. See doc 05 §5.4. */
  narrative: string;
  confidence: Confidence;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Vision provider contract — mirrors lib/body-assessment/providers/types.ts's
// BodyAssessmentProvider shape. See docs/food-lens/02-ai-vision-models.md.
// ---------------------------------------------------------------------------

export interface FoodLensAnalysisRequest {
  scanId: string;
  memberId: string;
  scanType: FoodLensScanType;
  captures: Array<{
    captureId: string;
    captureType: FoodLensCaptureType;
    /** Short-lived signed URL — raw image bytes never pass through application code. */
    signedUrl: string;
  }>;
  /** Per-member few-shot context from prior corrections — phase 2, see doc 06. */
  personalizationContext?: Array<{ label: string; category: FoodCategory }>;
}

export interface FoodLensAnalysisResult {
  provider: string;
  model: string;
  items: Array<{
    label: string;
    category: FoodCategory;
    confidence: Confidence;
  }>;
  macroEstimate: {
    protein: { level: MacroLevel; confidence: Confidence };
    carb: { level: MacroLevel; confidence: Confidence };
    fat: { level: MacroLevel; confidence: Confidence };
  };
}

/**
 * Mirrors BodyAssessmentProvider — a real implementation calls a vision API;
 * an UnconfiguredFoodLensProvider stub throws a typed, catchable error rather
 * than ever fabricating items or macro levels.
 */
export interface FoodLensProvider {
  analyzeMeal(request: FoodLensAnalysisRequest): Promise<FoodLensAnalysisResult>;
}

// ---------------------------------------------------------------------------
// Future: barcode & label (phase 3 — see docs/food-lens/06-roadmap.md)
// ---------------------------------------------------------------------------

export interface PackagedProduct {
  upc: string;
  name: string;
  brand: string | null;
  source: 'open_food_facts' | 'nutritionix';
  macroEstimate: MacroEstimate | null;
}

export interface NutritionLabelFields {
  servingSize: string | null;
  /** Verbatim from the label — the one place exact values are legitimate, since the label states them, not MEF's AI. See doc 02 §2.3. */
  protein: string | null;
  totalCarbohydrate: string | null;
  totalFat: string | null;
  confidence: Confidence;
}
