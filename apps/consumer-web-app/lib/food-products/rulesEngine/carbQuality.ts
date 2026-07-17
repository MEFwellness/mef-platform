/**
 * Carbohydrate quality — product requirement §8. Distinguishes whole-food
 * carbohydrate, fiber-rich carbohydrate, refined starch, and added sugar
 * rather than treating "carbohydrate" as a single undifferentiated
 * negative. Never labels all carbs negatively — a food can be
 * carbohydrate-heavy and still be a whole-food, fiber-rich choice.
 */

import type { CarbQualityResult } from '@mef/shared-types-contracts';

const REFINED_FLOUR_MARKERS = [
  'enriched flour',
  'enriched wheat flour',
  'wheat flour',
  'white flour',
  'refined flour',
  'bleached flour',
];
const WHOLE_GRAIN_MARKERS = [
  'whole wheat',
  'whole grain',
  'whole oat',
  'whole rye',
  'whole corn',
  'brown rice',
];

function includesAny(haystack: string, markers: string[]): boolean {
  return markers.some((m) => haystack.includes(m));
}

export function analyzeCarbQuality(input: {
  totalCarbohydrateG: number | null;
  fiberG: number | null;
  totalSugarG: number | null;
  addedSugarG: number | null;
  ingredientsText: string | null;
  lowFiberThresholdG: number;
}): CarbQualityResult {
  const text = (input.ingredientsText ?? '').toLowerCase();
  const hasRefinedFlour =
    includesAny(text, REFINED_FLOUR_MARKERS) && !includesAny(text, WHOLE_GRAIN_MARKERS);
  const isWholeGrainIndicated = includesAny(text, WHOLE_GRAIN_MARKERS);

  const carbToFiberRatio =
    input.totalCarbohydrateG !== null && input.fiberG !== null && input.fiberG > 0
      ? input.totalCarbohydrateG / input.fiberG
      : null;

  // "Primarily refined carbohydrate" needs both a refined-flour/no-whole-
  // grain ingredient signal AND low fiber relative to carbohydrate — carb
  // content alone (e.g. a banana) must never trigger this.
  const isPrimarilyRefinedCarbohydrate =
    hasRefinedFlour &&
    input.totalCarbohydrateG !== null &&
    input.totalCarbohydrateG > 0 &&
    (input.fiberG === null || input.fiberG <= input.lowFiberThresholdG);

  const observations: string[] = [];
  if (isWholeGrainIndicated) observations.push('Contains whole grain carbohydrate sources.');
  if (hasRefinedFlour) observations.push('Contains refined flour.');
  if (input.fiberG !== null) {
    observations.push(
      input.fiberG <= input.lowFiberThresholdG
        ? `Low in fiber (${input.fiberG}g per serving).`
        : `Provides ${input.fiberG}g of fiber per serving.`
    );
  }
  if (input.addedSugarG !== null && input.addedSugarG > 0) {
    observations.push(`Contains ${input.addedSugarG}g of added sugar per serving.`);
  } else if (input.totalSugarG !== null && input.totalSugarG > 0 && input.addedSugarG === null) {
    observations.push(
      `Contains ${input.totalSugarG}g of total sugar per serving — the database did not separately report how much is added vs. naturally occurring.`
    );
  }

  return {
    totalCarbohydrateG: input.totalCarbohydrateG,
    fiberG: input.fiberG,
    totalSugarG: input.totalSugarG,
    addedSugarG: input.addedSugarG,
    isPrimarilyRefinedCarbohydrate,
    isWholeGrainIndicated,
    carbToFiberRatio,
    observations,
  };
}
