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
  FoodLensMealMacroLevel,
  FoodLensSignalDirection,
  PrimalPatternProfile,
} from '@mef/shared-types-contracts';

export type ComparisonMacroEstimate = {
  protein: { level: FoodLensMealMacroLevel; confidence: number };
  carb: { level: FoodLensMealMacroLevel; confidence: number };
  fat: { level: FoodLensMealMacroLevel; confidence: number };
};

// A meal reading can be 'none' (see FoodLensMealMacroLevel's docblock); a
// Primal Pattern target cannot, so it only ever needs the low/moderate/high
// ranks. Both share one rank scale so 'none' sits unambiguously below 'low'.
const MEAL_LEVEL_RANK: Record<FoodLensMealMacroLevel, number> = {
  none: 0,
  low: 1,
  moderate: 2,
  high: 3,
};
const TARGET_LEVEL_RANK: Record<FoodLensMacroLevel, number> = { low: 1, moderate: 2, high: 3 };

function directionFor(
  meal: FoodLensMealMacroLevel,
  target: FoodLensMacroLevel
): FoodLensSignalDirection {
  const diff = MEAL_LEVEL_RANK[meal] - TARGET_LEVEL_RANK[target];
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

/** No item counts toward a dimension it isn't tagged as — a category simply absent from the confirmed set is real information (this plate genuinely has nothing of that type among what the member vouched for), so it's scored 'none', not 'low'. 'low' is reserved for a category that IS represented, just as a small share of the plate. This is the fix for the misleading "Sprite: Protein Low, Fat Low" result — a member confirming only a soda as their one item has zero protein/fat items, which should never read as "a small amount." */
function levelForShare(share: number): FoodLensMealMacroLevel {
  if (share === 0) return 'none';
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

  function dimension(category: 'protein' | 'carb' | 'fat'): { level: FoodLensMealMacroLevel; confidence: number } {
    const matches = countable.filter((i) => i.category === category);
    const share = total === 0 ? 0 : matches.length / total;
    const level = levelForShare(share);
    // Confidence comes from the matching items' own confidence when the
    // dimension is actually represented on the plate. A 'none' read from
    // total absence is well-supported precisely because it's read from the
    // member's own confirmed set (everything they vouched for is
    // accounted for, and none of it is this category) — a reasoned
    // confidence, not a shrug, but still not as strong as directly
    // confirmed matches.
    // matches.length === 0 always means level === 'none' here (levelForShare
    // returns 'none' exactly when share is 0), so there's only one absence
    // case to give a flat confidence to, not a separate "low from absence"
    // case.
    const confidence =
      matches.length > 0
        ? matches.reduce((sum, i) => sum + i.confidence, 0) / matches.length
        : 0.6;
    return { level, confidence };
  }

  return {
    protein: dimension('protein'),
    carb: dimension('carb'),
    fat: dimension('fat'),
  };
}
