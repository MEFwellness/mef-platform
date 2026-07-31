import { describe, it, expect } from 'vitest';
import { computeMealQualityRating, primaryMealSubjectLabel } from '../lib/food-lens/mealQuality';
import type { ComparisonMacroEstimate } from '../lib/food-lens/comparison';
import type { FoodLensQualitySignals } from '../lib/food-lens/providers/types';

function signals(overrides: Partial<FoodLensQualitySignals> = {}): FoodLensQualitySignals {
  return {
    nutrientDensity: 'moderate',
    addedSugarLevel: 'none',
    processingLevel: 'processed',
    hasMeaningfulProtein: false,
    hasMeaningfulFiber: false,
    hasHealthyFat: false,
    isBeverage: false,
    confidence: 0.8,
    ...overrides,
  };
}

function macro(overrides: Partial<ComparisonMacroEstimate> = {}): ComparisonMacroEstimate {
  return {
    protein: { level: 'low', confidence: 0.8 },
    carb: { level: 'moderate', confidence: 0.8 },
    fat: { level: 'low', confidence: 0.8 },
    ...overrides,
  };
}

describe('computeMealQualityRating', () => {
  it('rates a regular sugary soda (Sprite) red, naming the actual detected item — never the hedged "beverage or snack" phrasing', () => {
    const result = computeMealQualityRating(
      signals({
        nutrientDensity: 'low',
        addedSugarLevel: 'high',
        processingLevel: 'ultra_processed',
        hasMeaningfulProtein: false,
        hasMeaningfulFiber: false,
        hasHealthyFat: false,
        isBeverage: true,
        confidence: 0.85,
      }),
      macro({
        protein: { level: 'none', confidence: 0.7 },
        // The root-cause fix under test: a sugary soda's carbohydrate
        // reading must be 'high' (composition-based), never 'low' just
        // because it "looks small" or because a container is partly empty.
        carb: { level: 'high', confidence: 0.85 },
        fat: { level: 'none', confidence: 0.7 },
      }),
      null,
      'Sprite'
    );
    expect(result.rating).toBe('red');
    expect(result.explanation).toContain('Sprite');
    expect(result.explanation.toLowerCase()).not.toContain('beverage or snack');
    expect(result.explanation.toLowerCase()).not.toMatch(
      /bad food|unhealthy person|failure|should not eat/
    );
  });

  it('rates a confidently identified sugary snack (not a beverage) red with food-specific wording, not beverage wording', () => {
    const result = computeMealQualityRating(
      signals({
        nutrientDensity: 'low',
        addedSugarLevel: 'high',
        processingLevel: 'ultra_processed',
        hasMeaningfulProtein: false,
        hasMeaningfulFiber: false,
        hasHealthyFat: false,
        isBeverage: false,
        confidence: 0.85,
      }),
      macro({ carb: { level: 'high', confidence: 0.85 } }),
      null,
      'Frosted Cereal Bar'
    );
    expect(result.rating).toBe('red');
    expect(result.explanation).toContain('Frosted Cereal Bar');
    expect(result.explanation.toLowerCase()).toContain('snack');
    expect(result.explanation.toLowerCase()).not.toContain('soda');
  });

  it('regression: no item label falls back to a generic subject, never a category guess like "soda"', () => {
    const result = computeMealQualityRating(
      signals({
        nutrientDensity: 'low',
        addedSugarLevel: 'high',
        processingLevel: 'ultra_processed',
        isBeverage: true,
        confidence: 0.85,
      }),
      macro({ carb: { level: 'high', confidence: 0.85 } })
    );
    expect(result.rating).toBe('red');
    expect(result.explanation.toLowerCase()).not.toContain('soda');
    expect(result.explanation.toLowerCase()).toContain('this drink');
  });

  it('regression: a sweetened latte with real cream/sauce fat never claims "little meaningful fat" — the banner-vs-Macro-Balance contradiction bug', () => {
    // The real production scenario that broke: iced matcha latte with
    // vanilla sweet cream and pistachio sauce. High added sugar and low
    // nutrient density earn a red verdict on their own, but the cream/sauce
    // are a real, moderate fat contribution per the SAME macro estimate
    // Macro Balance renders — the red explanation must not contradict that.
    const result = computeMealQualityRating(
      signals({
        nutrientDensity: 'low',
        addedSugarLevel: 'high',
        processingLevel: 'processed',
        hasMeaningfulProtein: false,
        hasMeaningfulFiber: false,
        hasHealthyFat: true,
        isBeverage: true,
        confidence: 0.85,
      }),
      macro({
        protein: { level: 'low', confidence: 0.8 },
        carb: { level: 'high', confidence: 0.85 },
        fat: { level: 'moderate', confidence: 0.8 },
      }),
      null,
      'Iced Matcha Latte with Vanilla Sweet Cream and Pistachio Sauce'
    );
    expect(result.rating).toBe('red');
    expect(result.explanation).toContain('Iced Matcha Latte with Vanilla Sweet Cream and Pistachio Sauce');
    expect(result.explanation.toLowerCase()).not.toContain('soda');
    expect(result.explanation.toLowerCase()).not.toContain('little meaningful fat');
    expect(result.explanation.toLowerCase()).not.toMatch(/little meaningful .*\bfat\b/);
  });

  it('rates plain water green, as hydration — not red or yellow just for having no nutrients', () => {
    const result = computeMealQualityRating(
      signals({
        nutrientDensity: 'low',
        addedSugarLevel: 'none',
        processingLevel: 'whole_or_minimally_processed',
        hasMeaningfulProtein: false,
        hasMeaningfulFiber: false,
        hasHealthyFat: false,
        isBeverage: true,
        confidence: 0.9,
      }),
      macro({
        protein: { level: 'none', confidence: 0.9 },
        carb: { level: 'none', confidence: 0.9 },
        fat: { level: 'none', confidence: 0.9 },
      })
    );
    expect(result.rating).toBe('green');
  });

  it('rates plain grilled chicken green — nutrient-dense, whole/minimally processed, meaningful protein, no added sugar', () => {
    const result = computeMealQualityRating(
      signals({
        nutrientDensity: 'high',
        addedSugarLevel: 'none',
        processingLevel: 'whole_or_minimally_processed',
        hasMeaningfulProtein: true,
        hasMeaningfulFiber: false,
        hasHealthyFat: true,
        confidence: 0.85,
      }),
      macro({
        protein: { level: 'high', confidence: 0.85 },
        carb: { level: 'none', confidence: 0.7 },
        fat: { level: 'moderate', confidence: 0.75 },
      })
    );
    expect(result.rating).toBe('green');
  });

  it('rates sweet potato green even though its carbohydrate reading is high — nutrient density and processing decide the color, not the carb amount', () => {
    const result = computeMealQualityRating(
      signals({
        nutrientDensity: 'high',
        addedSugarLevel: 'none',
        processingLevel: 'whole_or_minimally_processed',
        hasMeaningfulProtein: false,
        hasMeaningfulFiber: true,
        hasHealthyFat: false,
        confidence: 0.8,
      }),
      macro({
        protein: { level: 'none', confidence: 0.7 },
        carb: { level: 'high', confidence: 0.85 },
        fat: { level: 'none', confidence: 0.7 },
      })
    );
    expect(result.rating).toBe('green');
  });

  it('rates potato chips yellow or red depending on signals, never green — moderate/high carb and fat with low nutrient density and no fiber', () => {
    const result = computeMealQualityRating(
      signals({
        nutrientDensity: 'low',
        addedSugarLevel: 'none',
        processingLevel: 'ultra_processed',
        hasMeaningfulProtein: false,
        hasMeaningfulFiber: false,
        hasHealthyFat: false,
        confidence: 0.8,
      }),
      macro({
        protein: { level: 'low', confidence: 0.75 },
        carb: { level: 'high', confidence: 0.8 },
        fat: { level: 'moderate', confidence: 0.8 },
      })
    );
    expect(['yellow', 'red']).toContain(result.rating);
  });

  it('rates a balanced whole-food meal (protein + carb + vegetables) green', () => {
    const result = computeMealQualityRating(
      signals({
        nutrientDensity: 'high',
        addedSugarLevel: 'none',
        processingLevel: 'whole_or_minimally_processed',
        hasMeaningfulProtein: true,
        hasMeaningfulFiber: true,
        hasHealthyFat: true,
        confidence: 0.8,
      }),
      macro({
        protein: { level: 'moderate', confidence: 0.8 },
        carb: { level: 'moderate', confidence: 0.8 },
        fat: { level: 'moderate', confidence: 0.8 },
      })
    );
    expect(result.rating).toBe('green');
  });

  it('rates a mixed/uncertain meal (some protein, processed, no clear added sugar, but low fiber) yellow — not confidently red or green', () => {
    const result = computeMealQualityRating(
      signals({
        nutrientDensity: 'moderate',
        addedSugarLevel: 'some',
        processingLevel: 'processed',
        hasMeaningfulProtein: true,
        hasMeaningfulFiber: false,
        hasHealthyFat: false,
        confidence: 0.75,
      }),
      macro({
        protein: { level: 'moderate', confidence: 0.75 },
        carb: { level: 'moderate', confidence: 0.75 },
        fat: { level: 'moderate', confidence: 0.75 },
      })
    );
    expect(result.rating).toBe('yellow');
  });

  it('never confidently rates red when the quality-signal confidence itself is low — uses yellow with the required "not enough information" explanation', () => {
    const result = computeMealQualityRating(
      signals({
        nutrientDensity: 'low',
        addedSugarLevel: 'high',
        processingLevel: 'ultra_processed',
        hasMeaningfulProtein: false,
        hasMeaningfulFiber: false,
        hasHealthyFat: false,
        confidence: 0.3, // below the low-confidence threshold
      }),
      macro()
    );
    expect(result.rating).toBe('yellow');
    expect(result.explanation).toBe(
      'The photo does not provide enough information for a stronger rating.'
    );
  });

  it('never uses judgmental wording in any explanation', () => {
    const scenarios: Array<[FoodLensQualitySignals, ComparisonMacroEstimate]> = [
      [
        signals({
          addedSugarLevel: 'high',
          nutrientDensity: 'low',
          processingLevel: 'ultra_processed',
        }),
        macro(),
      ],
      [
        signals({
          nutrientDensity: 'high',
          processingLevel: 'whole_or_minimally_processed',
          hasMeaningfulProtein: true,
        }),
        macro(),
      ],
      [signals({ confidence: 0.1 }), macro()],
    ];
    for (const [s, m] of scenarios) {
      const { explanation } = computeMealQualityRating(s, m);
      expect(explanation.toLowerCase()).not.toMatch(
        /bad food|unhealthy person|failure|you should not eat|you failed|cheat food/
      );
    }
  });

  it('never rates red based only on the presence of carbohydrates or fat', () => {
    // High-carb, high-fat, but nutrient-dense, whole, no added sugar (e.g. avocado + rice + salmon).
    const result = computeMealQualityRating(
      signals({
        nutrientDensity: 'high',
        addedSugarLevel: 'none',
        processingLevel: 'whole_or_minimally_processed',
        hasMeaningfulProtein: true,
        hasMeaningfulFiber: true,
        hasHealthyFat: true,
        confidence: 0.8,
      }),
      macro({
        protein: { level: 'high', confidence: 0.8 },
        carb: { level: 'high', confidence: 0.8 },
        fat: { level: 'high', confidence: 0.8 },
      })
    );
    expect(result.rating).not.toBe('red');
  });

  // "Empty or partially consumed packaging" (a half-drunk soda bottle, an
  // almost-finished bag of chips) is a vision-reasoning concern, not a
  // parameter this deterministic function ever receives — it has no
  // "amount remaining" input at all, only the quality signals and macro
  // estimate the vision model already resolved. That's enforced by the
  // prompt in lib/food-lens/providers/anthropicVision.ts (which explicitly
  // instructs judging composition, not fill level), not testable at this
  // layer; the Sprite regression test above is the closest unit-level
  // proxy: a soda always reads carb-'high' regardless of any notion of
  // "how much is left."
});

describe('primaryMealSubjectLabel', () => {
  it('picks the first non-condiment item over its own condiments', () => {
    expect(
      primaryMealSubjectLabel([
        { label: 'Iced Matcha Latte', isCondiment: false },
        { label: 'Vanilla Sweet Cream', isCondiment: true },
        { label: 'Pistachio Sauce', isCondiment: true },
      ])
    ).toBe('Iced Matcha Latte');
  });

  it('falls back to the first item when every detected item is a condiment', () => {
    expect(
      primaryMealSubjectLabel([
        { label: 'Ranch Dressing', isCondiment: true },
        { label: 'Hot Sauce', isCondiment: true },
      ])
    ).toBe('Ranch Dressing');
  });

  it('returns null for an empty item list', () => {
    expect(primaryMealSubjectLabel([])).toBeNull();
  });
});
