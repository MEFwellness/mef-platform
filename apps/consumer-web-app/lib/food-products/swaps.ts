/**
 * Smart Food Swaps (Part 7) — deterministic, no LLM, computed directly from
 * the MEF Nutrition Rules Engine's already-computed FoodRulesEngineResult
 * (never re-deriving nutrient judgments, same discipline as
 * coachingNarrative.ts). Every suggestion pairs a practical, non-shaming
 * recommendation with the specific reason it was surfaced — never a bare
 * "avoid this." When no cached alternative product genuinely fits better,
 * this suggests a food category or meal adjustment rather than inventing a
 * specific product (product requirement §7's explicit instruction).
 */

import type { FoodRulesEngineResult } from '@mef/shared-types-contracts';

export type SwapSuggestion = {
  reason: string;
  suggestion: string;
};

const MAX_SUGGESTIONS = 3;

/**
 * Category-level suggestions only — no product search. Kept separate from
 * any future "search the cache for a same-category higher-fiber/lower-
 * sugar product" step so that step can be added later without touching this
 * reviewable rule set.
 */
export function generateSwapSuggestions(rules: FoodRulesEngineResult): SwapSuggestion[] {
  const suggestions: SwapSuggestion[] = [];

  const highSatFatHighSugar = rules.nutrientCombinations.find(
    (f) => f.code === 'high_sat_fat_high_added_sugar'
  );
  if (highSatFatHighSugar) {
    suggestions.push({
      reason: 'This combines a notable amount of saturated fat with added sugar.',
      suggestion: 'Look for a version with less added sugar, or pair this with a whole-food protein source to help balance the meal.',
    });
  }

  if (rules.carbQuality.isPrimarilyRefinedCarbohydrate && (rules.carbQuality.fiberG ?? 0) < 3) {
    suggestions.push({
      reason: 'This is a refined-carbohydrate item without much fiber.',
      suggestion: 'Choose a version with at least 3 grams of fiber, or add a side of vegetables or beans.',
    });
  }

  if (!rules.proteinQuality.isMeaningfulAmount) {
    suggestions.push({
      reason: "This doesn't provide a meaningful amount of protein on its own.",
      suggestion: 'Add a whole-food protein source — eggs, Greek yogurt, beans, or a lean meat all work well alongside this.',
    });
  }

  if (rules.ingredientQuality.hasAddedSugar && rules.processingContext.label !== 'minimally_processed') {
    suggestions.push({
      reason: 'Added sugar shows up in the ingredient list.',
      suggestion: 'Look for an option with less added sugar, or reserve this for an occasional choice rather than an everyday one.',
    });
  }

  if (rules.processingContext.label === 'highly_processed') {
    suggestions.push({
      reason: 'This is on the more highly processed end.',
      suggestion: 'Pair this with a fresh vegetable, fruit, or side to round out the meal.',
    });
  }

  if (rules.fatQuality.hasIndustrialTransFat) {
    suggestions.push({
      reason: 'The ingredient list indicates a partially hydrogenated oil.',
      suggestion: 'Look for a similar product made without partially hydrogenated oils, if one is available to you.',
    });
  }

  // Only meaningful for a food where fiber is a reasonable expectation in
  // the first place — a carbohydrate-light item (a dairy product, a plain
  // protein source) failing a "low fiber" check is exactly the kind of
  // single-nutrient-in-isolation judgment this engine exists to avoid.
  if ((rules.carbQuality.fiberG ?? 0) < 2 && (rules.carbQuality.totalCarbohydrateG ?? 0) >= 15) {
    suggestions.push({
      reason: 'Fiber is low relative to the carbohydrate here.',
      suggestion: 'Pair this with plain Greek yogurt, a handful of nuts, or a vegetable side for more staying power.',
    });
  }

  // De-duplicate by suggestion text (a product can trigger overlapping
  // findings that would otherwise repeat the same practical advice twice).
  const seen = new Set<string>();
  const deduped = suggestions.filter((s) => {
    if (seen.has(s.suggestion)) return false;
    seen.add(s.suggestion);
    return true;
  });

  return deduped.slice(0, MAX_SUGGESTIONS);
}
