/**
 * The MEF Nutrition Rules Engine — deterministic, no LLM call anywhere in
 * this module or anything it imports (product requirement §5). Analyzes a
 * normalized product record across separate dimensions rather than
 * collapsing everything into one health score (§5's explicit requirement).
 * Root's coaching layer (../coachingNarrative.ts) explains this result in
 * natural language afterward — it never re-derives or overrides it.
 */

import type { DataCompleteness, FoodRulesEngineResult } from '@mef/shared-types-contracts';
import { analyzeIngredientQuality } from './ingredientQuality';
import { analyzeFatQuality } from './fatQuality';
import { analyzeCarbQuality } from './carbQuality';
import { analyzeProteinQuality } from './proteinQuality';
import { estimateProcessingContext } from './processingContext';
import { analyzeNutrientCombinations } from './nutrientCombinations';
import { DEFAULT_NUTRITION_THRESHOLDS, type NutritionThresholds } from './thresholds';

export type FoodRulesEngineInput = {
  productName: string | null;
  dataCompleteness: DataCompleteness;
  nutrients: {
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
  thresholds?: NutritionThresholds;
};

const BASE_CONFIDENCE_BY_COMPLETENESS: Record<DataCompleteness, number> = {
  complete: 0.9,
  partial: 0.65,
  minimal: 0.35,
};

function computeOverallConfidence(
  dataCompleteness: DataCompleteness,
  hasIngredientsText: boolean
): number {
  let confidence = BASE_CONFIDENCE_BY_COMPLETENESS[dataCompleteness];
  // Fat-source, carb-refinement, protein-source, and processing-context all
  // lean on the ingredient list — its absence caps confidence regardless of
  // how complete the raw nutrient numbers are.
  if (!hasIngredientsText) confidence = Math.min(confidence, 0.5);
  return Math.max(0, Math.min(1, confidence));
}

export function runFoodRulesEngine(input: FoodRulesEngineInput): FoodRulesEngineResult {
  const thresholds = input.thresholds ?? DEFAULT_NUTRITION_THRESHOLDS;
  const n = input.nutrients;

  const ingredientQuality = analyzeIngredientQuality({
    ingredientsText: input.ingredientsText,
    ingredientsList: input.ingredientsList,
    additives: input.additives,
    longIngredientListThreshold: thresholds.longIngredientListCount,
  });

  const fatQuality = analyzeFatQuality({
    totalFatG: n?.totalFatG ?? null,
    saturatedFatG: n?.saturatedFatG ?? null,
    monounsaturatedFatG: n?.monounsaturatedFatG ?? null,
    polyunsaturatedFatG: n?.polyunsaturatedFatG ?? null,
    transFatG: n?.transFatG ?? null,
    ingredientsText: input.ingredientsText,
  });

  const carbQuality = analyzeCarbQuality({
    totalCarbohydrateG: n?.totalCarbohydrateG ?? null,
    fiberG: n?.fiberG ?? null,
    totalSugarG: n?.totalSugarG ?? null,
    addedSugarG: n?.addedSugarG ?? null,
    ingredientsText: input.ingredientsText,
    lowFiberThresholdG: thresholds.lowFiberG,
  });

  const proteinQuality = analyzeProteinQuality({
    proteinG: n?.proteinG ?? null,
    productName: input.productName,
    ingredientsText: input.ingredientsText,
    meaningfulProteinThresholdG: thresholds.meaningfulProteinG,
    highProteinMarketingThresholdG: thresholds.highProteinMarketingG,
  });

  const processingContext = estimateProcessingContext({
    ingredientsText: input.ingredientsText,
    ingredientCount: ingredientQuality.ingredientCount,
    ingredientQuality,
  });

  const nutrientCombinations = analyzeNutrientCombinations({
    calories: n?.calories ?? null,
    proteinG: n?.proteinG ?? null,
    fiberG: n?.fiberG ?? null,
    sodiumMg: n?.sodiumMg ?? null,
    fatQuality,
    carbQuality,
    proteinQuality,
    ingredientQuality,
    processingContext,
    thresholds,
  });

  return {
    dataCompleteness: input.dataCompleteness,
    ingredientQuality,
    fatQuality,
    carbQuality,
    proteinQuality,
    processingContext,
    nutrientCombinations,
    overallConfidence: computeOverallConfidence(
      input.dataCompleteness,
      Boolean(input.ingredientsText)
    ),
  };
}

export { DEFAULT_NUTRITION_THRESHOLDS, resolveNutritionThresholds } from './thresholds';
export type { NutritionThresholds } from './thresholds';
