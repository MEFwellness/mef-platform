import { describe, it, expect } from 'vitest';
import {
  compareMealToPattern,
  deriveMacroEstimateFromItems,
  overallConfidenceFor,
  type ComparisonMacroEstimate,
} from '../lib/food-lens/comparison';
import type { FoodLensDetectedItem, PrimalPatternProfile } from '@mef/shared-types-contracts';

function target(overrides: Partial<PrimalPatternProfile> = {}): Pick<
  PrimalPatternProfile,
  'protein_emphasis' | 'carb_emphasis' | 'fat_emphasis'
> {
  return {
    protein_emphasis: 'high',
    carb_emphasis: 'low',
    fat_emphasis: 'moderate',
    ...overrides,
  };
}

function meal(overrides: Partial<ComparisonMacroEstimate> = {}): ComparisonMacroEstimate {
  return {
    protein: { level: 'high', confidence: 0.8 },
    carb: { level: 'low', confidence: 0.8 },
    fat: { level: 'moderate', confidence: 0.8 },
    ...overrides,
  };
}

function item(overrides: Partial<FoodLensDetectedItem> = {}): Pick<
  FoodLensDetectedItem,
  'category' | 'confidence'
> {
  return { category: 'protein', confidence: 0.8, ...overrides };
}

describe('compareMealToPattern', () => {
  it('marks every dimension "match" when the meal exactly mirrors the target', () => {
    const { signals, confidence } = compareMealToPattern(meal(), target());
    expect(signals).toHaveLength(3);
    expect(signals.every((s) => s.direction === 'match')).toBe(true);
    expect(confidence).toBeCloseTo(0.8);
  });

  it('marks a dimension "heavy" when the meal ranks above the target', () => {
    const { signals } = compareMealToPattern(
      meal({ carb: { level: 'high', confidence: 0.8 } }),
      target({ carb_emphasis: 'low' })
    );
    const carbSignal = signals.find((s) => s.dimension === 'carb')!;
    expect(carbSignal.direction).toBe('heavy');
  });

  it('marks a dimension "light" when the meal ranks below the target', () => {
    const { signals } = compareMealToPattern(
      meal({ protein: { level: 'low', confidence: 0.8 } }),
      target({ protein_emphasis: 'high' })
    );
    const proteinSignal = signals.find((s) => s.dimension === 'protein')!;
    expect(proteinSignal.direction).toBe('light');
  });

  it('caps confidence at the lowest of the three dimension confidences', () => {
    const { confidence } = compareMealToPattern(
      meal({ fat: { level: 'moderate', confidence: 0.3 } }),
      target()
    );
    expect(confidence).toBeCloseTo(0.3);
  });
});

describe('overallConfidenceFor', () => {
  it('is the minimum across all three dimensions, never an average', () => {
    const estimate = meal({
      protein: { level: 'high', confidence: 0.9 },
      carb: { level: 'low', confidence: 0.9 },
      fat: { level: 'moderate', confidence: 0.2 },
    });
    expect(overallConfidenceFor(estimate)).toBeCloseTo(0.2);
  });
});

describe('deriveMacroEstimateFromItems', () => {
  it('is honest that "no items in a category" is real information, not a missing measurement', () => {
    const result = deriveMacroEstimateFromItems([item({ category: 'protein' })]);
    expect(result.carb.level).toBe('low');
    expect(result.carb.confidence).toBeLessThan(result.protein.confidence);
  });

  it('never lets "mixed"/"unknown" items inflate a specific dimension\'s share', () => {
    const result = deriveMacroEstimateFromItems([
      item({ category: 'protein' }),
      item({ category: 'mixed' }),
      item({ category: 'unknown' }),
    ]);
    // Only the one 'protein' item counts toward the countable total of 1,
    // so protein's share is 100% -> 'high', not diluted by the two
    // non-countable items.
    expect(result.protein.level).toBe('high');
  });

  it('assigns "high" when a category dominates the confirmed items', () => {
    const result = deriveMacroEstimateFromItems([
      item({ category: 'carb', confidence: 0.9 }),
      item({ category: 'carb', confidence: 0.7 }),
      item({ category: 'protein', confidence: 0.6 }),
    ]);
    expect(result.carb.level).toBe('high');
    expect(result.carb.confidence).toBeCloseTo(0.8);
  });
});
