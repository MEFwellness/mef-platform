import { describe, it, expect } from 'vitest';
import { computeMealQualityRating } from '../lib/food-lens/mealQuality';
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
  it('rates a regular sugary soda (Sprite) red, with an explanation naming added sugar and low nutrient density', () => {
    const result = computeMealQualityRating(
      signals({
        nutrientDensity: 'low',
        addedSugarLevel: 'high',
        processingLevel: 'ultra_processed',
        hasMeaningfulProtein: false,
        hasMeaningfulFiber: false,
        hasHealthyFat: false,
        confidence: 0.85,
      }),
      macro({
        protein: { level: 'none', confidence: 0.7 },
        carb: { level: 'high', confidence: 0.85 },
        fat: { level: 'none', confidence: 0.7 },
      })
    );
    expect(result.rating).toBe('red');
    expect(result.explanation.toLowerCase()).toContain('sugar');
    expect(result.explanation.toLowerCase()).not.toMatch(/bad food|unhealthy person|failure|should not eat/);
  });

  it('rates plain water green, as a no-added-sugar, unprocessed hydration source — not red or yellow just for having no nutrients', () => {
    const result = computeMealQualityRating(
      signals({
        nutrientDensity: 'low',
        addedSugarLevel: 'none',
        processingLevel: 'whole_or_minimally_processed',
        hasMeaningfulProtein: false,
        hasMeaningfulFiber: false,
        hasHealthyFat: false,
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
    expect(result.explanation).toBe('The photo does not provide enough information for a stronger rating.');
  });

  it('never uses judgmental wording in any explanation', () => {
    const scenarios: Array<[FoodLensQualitySignals, ComparisonMacroEstimate]> = [
      [signals({ addedSugarLevel: 'high', nutrientDensity: 'low', processingLevel: 'ultra_processed' }), macro()],
      [signals({ nutrientDensity: 'high', processingLevel: 'whole_or_minimally_processed', hasMeaningfulProtein: true }), macro()],
      [signals({ confidence: 0.1 }), macro()],
    ];
    for (const [s, m] of scenarios) {
      const { explanation } = computeMealQualityRating(s, m);
      expect(explanation.toLowerCase()).not.toMatch(
        /bad food|unhealthy person|failure|you should not eat|you failed/
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
});
