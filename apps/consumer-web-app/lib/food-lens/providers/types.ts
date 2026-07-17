/**
 * The provider boundary for Food Lens — mirrors
 * lib/body-assessment/providers/types.ts exactly on purpose: the analyze
 * server action must never import a vision SDK or a specific vendor
 * directly, or swapping providers becomes a rewrite instead of a config
 * change. An UnconfiguredFoodLensProvider stub (registry.ts) throws a
 * typed, catchable error rather than ever fabricating items or macro
 * levels — see docs/food-lens/02-ai-vision-models.md.
 */

import type { FoodLensCaptureType, FoodLensFoodCategory, FoodLensMacroLevel } from '@mef/shared-types-contracts';

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

export type FoodLensAnalysisResult = {
  provider: string;
  model: string;
  items: Array<{
    label: string;
    category: FoodLensFoodCategory;
    confidence: number;
  }>;
  macroEstimate: {
    protein: { level: FoodLensMacroLevel; confidence: number };
    carb: { level: FoodLensMacroLevel; confidence: number };
    fat: { level: FoodLensMacroLevel; confidence: number };
  };
};

export interface FoodLensProvider {
  readonly name: string;
  analyzeMeal(request: FoodLensAnalysisRequest): Promise<FoodLensAnalysisResult>;
}
