/**
 * Nutrient-combination intelligence — product requirement §11, one of the
 * primary differentiators of this engine over a single-nutrient traffic
 * light. Every check here looks at two or more nutrients/signals together;
 * none of them fire off one nutrient alone. All language is hedged
 * ("may be", "worth considering") per the product's non-diagnostic,
 * non-alarmist voice requirement — no combination check here claims a
 * medical outcome.
 */

import type {
  CarbQualityResult,
  FatQualityResult,
  IngredientQualityResult,
  NutrientCombinationFinding,
  ProcessingContextResult,
  ProteinQualityResult,
} from '@mef/shared-types-contracts';
import type { NutritionThresholds } from './thresholds';

export type NutrientCombinationInput = {
  calories: number | null;
  proteinG: number | null;
  fiberG: number | null;
  sodiumMg: number | null;
  fatQuality: FatQualityResult;
  carbQuality: CarbQualityResult;
  proteinQuality: ProteinQualityResult;
  ingredientQuality: IngredientQualityResult;
  processingContext: ProcessingContextResult;
  thresholds: NutritionThresholds;
};

export function analyzeNutrientCombinations(
  input: NutrientCombinationInput
): NutrientCombinationFinding[] {
  const t = input.thresholds;
  const findings: NutrientCombinationFinding[] = [];

  const isHighSatFat = (input.fatQuality.saturatedFatG ?? 0) >= t.highSaturatedFatG;
  const isHighTotalFat = (input.fatQuality.totalFatG ?? 0) >= t.highTotalFatG;
  const isHighAddedSugar = (input.carbQuality.addedSugarG ?? 0) >= t.highAddedSugarG;
  const isLowFiber = input.fiberG === null || input.fiberG <= t.lowFiberG;
  const isMeaningfulFiber = input.fiberG !== null && input.fiberG >= t.meaningfulFiberG;
  const isMeaningfulProtein = input.proteinG !== null && input.proteinG >= t.meaningfulProteinG;
  const isHighSodium = (input.sodiumMg ?? 0) >= t.highSodiumMg;
  const isHighCalorie = (input.calories ?? 0) >= t.highCalorieDensityKcal;
  const isHighCarb = (input.carbQuality.totalCarbohydrateG ?? 0) >= t.highCarbG;
  const isLowFat = (input.fatQuality.totalFatG ?? 0) < 3;

  if (isHighSatFat && isHighAddedSugar) {
    findings.push({
      code: 'high_sat_fat_high_added_sugar',
      severity: 'meaningful',
      narrative:
        'This combination of saturated fat and added sugar together may be less supportive than either nutrient would suggest on its own — the combination matters more than any one nutrient alone.',
    });
  }

  if (isHighTotalFat && input.carbQuality.isPrimarilyRefinedCarbohydrate) {
    findings.push({
      code: 'high_fat_refined_carb',
      severity: 'worth_noting',
      narrative:
        'This pairs a notable amount of fat with mostly refined carbohydrate, which may be worth considering depending on your current goal.',
    });
  }

  if (input.carbQuality.isPrimarilyRefinedCarbohydrate && isLowFiber) {
    findings.push({
      code: 'high_refined_carb_low_fiber',
      severity: 'worth_noting',
      narrative:
        'This is primarily refined carbohydrate with little fiber, which may affect how satisfying it feels and how it interacts with your blood-sugar goal.',
    });
  }

  if (isHighAddedSugar && !isMeaningfulProtein) {
    findings.push({
      code: 'high_added_sugar_low_protein',
      severity: 'worth_noting',
      narrative:
        'Added sugar is notable here without a meaningful amount of protein alongside it to help balance it out.',
    });
  }

  if (isHighCalorie && !isMeaningfulProtein && isLowFiber) {
    findings.push({
      code: 'high_calorie_low_protein_low_fiber',
      severity: 'meaningful',
      narrative:
        'This is calorie-dense while providing limited protein or fiber, a combination that may be less supportive of feeling satisfied after eating it.',
    });
  }

  const lacksWholeFoodDensitySignal =
    !isMeaningfulProtein && isLowFiber && !input.ingredientQuality.wholeFoodIngredientsPresent;
  if (isHighSodium && lacksWholeFoodDensitySignal) {
    findings.push({
      code: 'high_sodium_low_nutrient_density',
      severity: 'worth_noting',
      narrative:
        'Sodium is notable here alongside limited protein, fiber, or whole-food content — worth considering if sodium is part of your current goal.',
    });
  }

  if (isMeaningfulProtein && isHighSodium) {
    findings.push({
      code: 'useful_protein_high_sodium',
      severity: 'worth_noting',
      narrative:
        'This provides a useful amount of protein, but the sodium level may be worth considering based on your current goals.',
    });
  }

  if (isHighCarb && isLowFiber && !isMeaningfulProtein && isLowFat) {
    findings.push({
      code: 'high_carb_low_everything_else',
      severity: 'worth_noting',
      narrative:
        'This is mostly carbohydrate without much fiber, fat, or protein alongside it to slow how quickly it digests.',
    });
  }

  if (
    isMeaningfulFiber &&
    isMeaningfulProtein &&
    input.ingredientQuality.wholeFoodIngredientsPresent
  ) {
    findings.push({
      code: 'high_fiber_good_protein_whole_food',
      severity: 'informational',
      narrative:
        'This combines meaningful fiber and protein with recognizable whole-food ingredients — a supportive combination for most goals.',
    });
  }

  if (
    input.fatQuality.fatSourceCategory === 'whole_food' &&
    (isMeaningfulProtein || isMeaningfulFiber)
  ) {
    findings.push({
      code: 'whole_food_fat_protein_fiber',
      severity: 'informational',
      narrative:
        'The fat here comes from whole-food sources and is paired with meaningful protein or fiber, rather than standing alone.',
    });
  }

  if (input.processingContext.label === 'highly_processed' && isHighCalorie) {
    findings.push({
      code: 'ultra_processed_concentrated_energy',
      severity: 'meaningful',
      narrative:
        'This is a heavily processed product that concentrates a meaningful amount of energy into one serving — worth keeping the serving size in mind.',
    });
  }

  return findings;
}
