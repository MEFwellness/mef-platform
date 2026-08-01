/**
 * The deterministic Meal Quality engine — pure functions, no I/O, no AI
 * call. Same discipline as lib/food-lens/comparison.ts: the vision model
 * (lib/food-lens/providers/anthropicVision.ts) reports honest structured
 * facts about a meal's nutritional quality profile (nutrient density,
 * added sugar, processing level, whether it has meaningful protein/fiber/
 * healthy fat), and this module — plain TypeScript, reviewable, testable —
 * turns those facts into one of three ratings plus a short, reviewed
 * explanation. The AI never assigns green/yellow/red itself, and never
 * writes the explanation sentence; both come from this file, the same way
 * `narrative` selection worked before the coaching-brain hybrid decision.
 *
 * Design constraints from the product requirements, encoded as code so
 * they can't silently drift:
 * - The color is never based on carb/fat presence alone — it reads
 *   nutrient density, added sugar, processing level, and protein/fiber/
 *   healthy-fat presence together.
 * - Red is reserved for clearly limited nutritional value (heavy added
 *   sugar with low nutrient density, or ultra-processed with nothing to
 *   offer) — not any normal whole food.
 * - Low confidence in the quality signals themselves never produces a
 *   confident red; it produces yellow with an explicit "not enough
 *   information" explanation instead (never a shaming or certain-sounding
 *   verdict built on a shaky read).
 */

import type { FoodLensComparisonSignal, FoodLensMealMacroLevel } from '@mef/shared-types-contracts';
import type { ComparisonMacroEstimate } from './comparison';
import type { FoodLensQualitySignals } from './providers/types';

export type MealQualityRatingValue = 'green' | 'yellow' | 'red';

export type MealQualityResult = {
  rating: MealQualityRatingValue;
  explanation: string;
};

/** Below this, the quality signals themselves aren't trustworthy enough to rate confidently in either direction — rule: "use yellow and state the photo doesn't provide enough information," never a confident red. */
const LOW_CONFIDENCE_THRESHOLD = 0.45;

const LOW_CONFIDENCE_EXPLANATION =
  'The photo does not provide enough information for a stronger rating.';

const HYDRATION_EXPLANATION =
  'Plain water (or a similar zero-calorie beverage) supports hydration with no added sugar or processing concerns.';

function joinWithOr(parts: string[]): string {
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(', ')} or ${parts[parts.length - 1]}`;
}

const lowOrNone = (level: FoodLensMealMacroLevel) => level === 'none' || level === 'low';

/**
 * The red "sugar-driven" explanation, built from THIS scan's actual
 * detected-item label and its actual macro estimate — never a hardcoded
 * "regular sugary soda" guess (that text used to render for anything with
 * high added sugar and low nutrient density, including e.g. a sweetened
 * latte, misdescribing the real item) and never an unconditional "little
 * meaningful protein, fat, fiber" claim (that used to render even when the
 * SAME macro estimate feeding Macro Balance read fat as moderate/high —
 * the exact banner-vs-Macro-Balance-vs-Root's-Take contradiction this was
 * built to fix). Only claims a macro is absent here when both the quality
 * signals AND the shared macro estimate agree it's low or none.
 */
function sugarDrivenExplanation(
  itemLabel: string | null,
  signals: FoodLensQualitySignals,
  macro: ComparisonMacroEstimate
): string {
  const subject = itemLabel ?? (signals.isBeverage ? 'This drink' : 'This item');
  const kind = signals.isBeverage ? 'a sweetened beverage' : 'a sugary snack';

  const absentParts: string[] = [];
  if (!signals.hasMeaningfulProtein && lowOrNone(macro.protein.level)) absentParts.push('protein');
  if (!signals.hasHealthyFat && lowOrNone(macro.fat.level)) absentParts.push('fat');
  if (!signals.hasMeaningfulFiber) absentParts.push('fiber');

  const tail = absentParts.length > 0 ? ` and little meaningful ${joinWithOr(absentParts)}` : '';

  return `${subject} reads as ${kind}, with carbohydrates coming primarily from added sugar and low nutrient density${tail}.`;
}

/**
 * The ultra-processed red explanation, item-named for the same reason as
 * sugarDrivenExplanation above. Unlike that branch, this one's "little
 * meaningful protein, fiber, healthy fat" claim is already gated on those
 * exact three signals by ultraProcessedAndEmpty's own condition below
 * (never reached unless all three are already false), so there's no
 * separate absence check needed here — it can't contradict Macro Balance
 * by construction.
 */
function ultraProcessedExplanation(itemLabel: string | null): string {
  const subject = itemLabel ?? 'This item';
  return `${subject} reads as a heavily processed item with little meaningful protein, fiber, healthy fat, or nutrient density.`;
}

const GREEN_EXPLANATION =
  'This meal appears nutrient-dense and includes a balanced combination of protein, whole-food carbohydrates, and healthy fats.';

const GREEN_PATTERN_MISMATCH_EXPLANATION =
  "This meal looks nutrient-dense on its own, but doesn't closely match your saved Primal Pattern target today.";

const MISSING_PROTEIN_FIBER_EXPLANATION =
  'This choice may fit occasionally, but the meal appears low in protein and fiber.';

const MIXED_MODERATE_EXPLANATION =
  'This looks like a mixed or moderate choice: not clearly nutrient-dense, but not a poor choice either.';

/**
 * A meal read as having none of any macro, no added sugar, and no
 * processing concerns (the water/black-coffee/plain-tea case) is a
 * distinct, deliberately-carved-out green case — it would otherwise fail
 * the "has meaningful protein/fiber/healthy fat" green requirement below
 * for the wrong reason (it's not nutrient-poor food, it's simply not food).
 */
function isPlainHydration(
  signals: FoodLensQualitySignals,
  macro: ComparisonMacroEstimate
): boolean {
  return (
    signals.addedSugarLevel === 'none' &&
    signals.processingLevel === 'whole_or_minimally_processed' &&
    !signals.hasMeaningfulProtein &&
    !signals.hasMeaningfulFiber &&
    !signals.hasHealthyFat &&
    macro.protein.level === 'none' &&
    macro.carb.level === 'none' &&
    macro.fat.level === 'none'
  );
}

/**
 * Computes the Meal Quality rating for one scan from the vision model's
 * quality signals plus its macro estimate, and — when available — the
 * member's Primal Pattern comparison signals (used only to cap an
 * otherwise-green rating down to yellow on a poor target match, per
 * "green should align reasonably well with the member's target"; never
 * used to push a rating down to red, and never required — a member with
 * no Primal Pattern target set yet still gets a rating).
 */
export function computeMealQualityRating(
  signals: FoodLensQualitySignals,
  macro: ComparisonMacroEstimate,
  patternSignals?: FoodLensComparisonSignal[] | null,
  itemLabel?: string | null
): MealQualityResult {
  if (signals.confidence < LOW_CONFIDENCE_THRESHOLD) {
    return { rating: 'yellow', explanation: LOW_CONFIDENCE_EXPLANATION };
  }

  if (isPlainHydration(signals, macro)) {
    return { rating: 'green', explanation: HYDRATION_EXPLANATION };
  }

  // Red is reserved for one of two clearly-limited-value patterns — never
  // just "this has carbs" or "this has fat" alone.
  const sugarDriven = signals.addedSugarLevel === 'high' && signals.nutrientDensity === 'low';
  const ultraProcessedAndEmpty =
    signals.processingLevel === 'ultra_processed' &&
    signals.nutrientDensity === 'low' &&
    !signals.hasMeaningfulProtein &&
    !signals.hasMeaningfulFiber &&
    !signals.hasHealthyFat;

  if (sugarDriven) {
    return {
      rating: 'red',
      explanation: sugarDrivenExplanation(itemLabel ?? null, signals, macro),
    };
  }
  if (ultraProcessedAndEmpty) {
    return { rating: 'red', explanation: ultraProcessedExplanation(itemLabel ?? null) };
  }

  const isNutrientDenseWhole =
    signals.nutrientDensity === 'high' &&
    signals.processingLevel === 'whole_or_minimally_processed' &&
    signals.addedSugarLevel !== 'high' &&
    (signals.hasMeaningfulProtein || signals.hasHealthyFat || signals.hasMeaningfulFiber);

  if (isNutrientDenseWhole) {
    const mismatchCount = (patternSignals ?? []).filter((s) => s.direction !== 'match').length;
    if (patternSignals && patternSignals.length > 0 && mismatchCount >= 2) {
      return { rating: 'yellow', explanation: GREEN_PATTERN_MISMATCH_EXPLANATION };
    }
    return { rating: 'green', explanation: GREEN_EXPLANATION };
  }

  if (!signals.hasMeaningfulProtein && !signals.hasMeaningfulFiber) {
    return { rating: 'yellow', explanation: MISSING_PROTEIN_FIBER_EXPLANATION };
  }

  return { rating: 'yellow', explanation: MIXED_MODERATE_EXPLANATION };
}

/**
 * The subject to name in a Meal Quality explanation — the first
 * non-condiment detected item (a latte over its own vanilla-cream/
 * pistachio-sauce condiments), falling back to the first item at all when
 * every detected item is a condiment. Pure/no I/O so it's callable from
 * both the fresh-analysis and recompute-after-correction call sites in
 * app/actions/food-lens.ts.
 */
export function primaryMealSubjectLabel(
  items: Array<{ label: string; isCondiment: boolean }>
): string | null {
  const primary = items.find((i) => !i.isCondiment) ?? items[0];
  return primary?.label ?? null;
}
