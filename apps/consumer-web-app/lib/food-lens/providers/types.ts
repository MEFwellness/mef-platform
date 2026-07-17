/**
 * The provider boundary for Food Lens — mirrors
 * lib/body-assessment/providers/types.ts exactly on purpose: the analyze
 * server action must never import a vision SDK or a specific vendor
 * directly, or swapping providers becomes a rewrite instead of a config
 * change. An UnconfiguredFoodLensProvider stub (registry.ts) throws a
 * typed, catchable error rather than ever fabricating items or macro
 * levels — see docs/food-lens/02-ai-vision-models.md.
 */

import type {
  FoodLensAddedSugarLevel,
  FoodLensCaptureType,
  FoodLensCookingMethod,
  FoodLensFoodCategory,
  FoodLensMealMacroLevel,
  FoodLensNutrientDensity,
  FoodLensPortionUnit,
  FoodLensProcessingLevel,
} from '@mef/shared-types-contracts';

export type FoodLensCaptureInput = {
  captureId: string;
  captureType: FoodLensCaptureType;
  /** Short-lived signed URL — the provider fetches media from this, raw bytes never pass through this request object. */
  signedUrl: string;
};

export type FoodLensAnalysisRequest = {
  scanId: string;
  memberId: string;
  captures: FoodLensCaptureInput[];
  /** This member's recently confirmed label↔category pairs — injected as few-shot context to improve accuracy on their recurring meals. Phase 2 personalization (doc 6), harmless to pass even when empty. */
  personalizationContext?: Array<{ label: string; category: FoodLensFoodCategory }>;
};

/**
 * The vision model's honest read of this meal/item's broader nutritional
 * quality profile — separate from, and a finer-grained judgment than, the
 * macro emphasis levels above (a food can be carb-'high' and nutrient-
 * dense, e.g. lentils, or carb-'high' and nutrient-poor, e.g. a soda).
 * Feeds the deterministic Meal Quality rating (lib/food-lens/mealQuality.ts)
 * — the model reports facts/signals here, it never assigns the
 * green/yellow/red verdict itself.
 */
export type FoodLensQualitySignals = {
  nutrientDensity: FoodLensNutrientDensity;
  addedSugarLevel: FoodLensAddedSugarLevel;
  processingLevel: FoodLensProcessingLevel;
  hasMeaningfulProtein: boolean;
  hasMeaningfulFiber: boolean;
  hasHealthyFat: boolean;
  /** True when the item being judged is primarily a drink — used only to phrase Meal Quality feedback accurately ("sugary soda" vs. "sugary snack"), never to change the rating logic itself. See lib/food-lens/mealQuality.ts. */
  isBeverage: boolean;
  /** Confidence in these quality judgments specifically — may differ from item-identification confidence and macro-composition confidence below. */
  confidence: number;
};

export type FoodLensAnalysisResult = {
  provider: string;
  model: string;
  items: Array<{
    label: string;
    category: FoodLensFoodCategory;
    confidence: number;
    /** A calm, practical phrase ("about half a cup") — Meal Photo Intelligence 2.0 (Part 2). Never a bare precise gram figure from a photo alone. */
    portionDescription: string | null;
    portionConfidence: number | null;
    quantity: number | null;
    unit: FoodLensPortionUnit | null;
    /** Best-effort, honest guess at preparation method — null when not reasonably identifiable from the photo, never guessed with false confidence. */
    cookingMethod: FoodLensCookingMethod | null;
    /** True for a sauce, dressing, oil, or topping rather than a standalone food. */
    isCondiment: boolean;
  }>;
  macroEstimate: {
    protein: { level: FoodLensMealMacroLevel; confidence: number };
    carb: { level: FoodLensMealMacroLevel; confidence: number };
    fat: { level: FoodLensMealMacroLevel; confidence: number };
  };
  qualitySignals: FoodLensQualitySignals;
};

export interface FoodLensProvider {
  readonly name: string;
  analyzeMeal(request: FoodLensAnalysisRequest): Promise<FoodLensAnalysisResult>;
}
