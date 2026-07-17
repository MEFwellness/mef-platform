/**
 * The deterministic comparison engine — pure functions, no I/O, no AI call.
 * Directly modeled on lib/body-assessment/comparison.ts's "compare an
 * estimate against a baseline/target -> structured signal" shape.
 *
 * Per the product decision (hybrid approach): this module produces ONLY
 * the structured, reviewable facts — which macro dimensions run heavy/
 * light/match against the member's Primal Pattern target, and the
 * confidence behind that read. It does NOT produce member-facing copy.
 * The coaching sentence is generated separately, dynamically, by
 * lib/food-lens/coachingNarrative.ts from these signals plus the member's
 * real context — never by this module, and never raw model output standing
 * in for these signals.
 */

import type {
  FoodLensComparisonSignal,
  FoodLensDetectedItem,
  FoodLensMacroLevel,
  FoodLensSignalDirection,
  PrimalPatternProfile,
} from '@mef/shared-types-contracts';

export type ComparisonMacroEstimate = {
  protein: { level: FoodLensMacroLevel; confidence: number };
  carb: { level: FoodLensMacroLevel; confidence: number };
  fat: { level: FoodLensMacroLevel; confidence: number };
};

const LEVEL_RANK: Record<FoodLensMacroLevel, number> = { low: 0, moderate: 1, high: 2 };

function directionFor(meal: FoodLensMacroLevel, target: FoodLensMacroLevel): FoodLensSignalDirection {
  const diff = LEVEL_RANK[meal] - LEVEL_RANK[target];
  if (diff === 0) return 'match';
  return diff > 0 ? 'heavy' : 'light';
}

export type MealPatternComparisonResult = {
  signals: FoodLensComparisonSignal[];
  /** min() across every confidence that fed this comparison — the meal's per-dimension confidences and the target's own (implicit 1.0 today, since primal_pattern_profiles carries no confidence column yet — see doc 5 §5.4). A single low-confidence input caps the whole comparison. */
  confidence: number;
};

export function compareMealToPattern(
  meal: ComparisonMacroEstimate,
  target: Pick<PrimalPatternProfile, 'protein_emphasis' | 'carb_emphasis' | 'fat_emphasis'>
): MealPatternComparisonResult {
  const signals: FoodLensComparisonSignal[] = [
    {
      dimension: 'protein',
      mealLevel: meal.protein.level,
      targetLevel: target.protein_emphasis,
      direction: directionFor(meal.protein.level, target.protein_emphasis),
    },
    {
      dimension: 'carb',
      mealLevel: meal.carb.level,
      targetLevel: target.carb_emphasis,
      direction: directionFor(meal.carb.level, target.carb_emphasis),
    },
    {
      dimension: 'fat',
      mealLevel: meal.fat.level,
      targetLevel: target.fat_emphasis,
      direction: directionFor(meal.fat.level, target.fat_emphasis),
    },
  ];

  const confidence = Math.min(meal.protein.confidence, meal.carb.confidence, meal.fat.confidence);

  return { signals, confidence };
}

/**
 * Derives a plate-level macro estimate from the member's currently
 * confirmed/ai_detected items — used both for the initial AI-derived
 * estimate's confidence discipline and for the deterministic recompute
 * after a member correction (doc 4 §4.3's recomputeFoodLensResultAction),
 * which never needs a new AI call.
 */
export function overallConfidenceFor(estimate: ComparisonMacroEstimate): number {
  return Math.min(estimate.protein.confidence, estimate.carb.confidence, estimate.fat.confidence);
}

/** No item counts toward a dimension it isn't tagged as — a category simply absent from the confirmed set is real information (this plate has nothing clearly of that type), not a missing measurement, so it's still scored 'low', just at a lower confidence since it's inferred from absence rather than observed directly. */
function levelForShare(share: number): FoodLensMacroLevel {
  if (share >= 0.5) return 'high';
  if (share >= 0.2) return 'moderate';
  return 'low';
}

/**
 * Deterministically re-derives the plate-level macro estimate from the
 * member's current (non-rejected, non-superseded) detected items — no AI
 * call. This is what recomputeFoodLensResultAction (doc 4 §4.3) runs after
 * any correction/confirm/add, and it's also how basis='member_adjusted'
 * estimates come to exist at all.
 */
export function deriveMacroEstimateFromItems(
  items: Pick<FoodLensDetectedItem, 'category' | 'confidence'>[]
): ComparisonMacroEstimate {
  const countable = items.filter((i) => i.category !== 'unknown' && i.category !== 'mixed');
  const total = countable.length;

  function dimension(category: 'protein' | 'carb' | 'fat'): { level: FoodLensMacroLevel; confidence: number } {
    const matches = countable.filter((i) => i.category === category);
    const share = total === 0 ? 0 : matches.length / total;
    const level = levelForShare(share);
    // Confidence comes from the matching items' own confidence when the
    // dimension is actually represented on the plate; a dimension inferred
    // purely from absence (no matching item at all) gets a flat, honestly
    // lower confidence rather than borrowing certainty from unrelated items.
    const confidence =
      matches.length > 0
        ? matches.reduce((sum, i) => sum + i.confidence, 0) / matches.length
        : 0.4;
    return { level, confidence };
  }

  return {
    protein: dimension('protein'),
    carb: dimension('carb'),
    fat: dimension('fat'),
  };
}
