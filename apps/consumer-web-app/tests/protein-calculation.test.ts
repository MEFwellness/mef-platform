import { describe, it, expect } from 'vitest';
import {
  computeProteinGrams,
  getSuggestedProteinRange,
  ACTIVITY_LEVELS,
} from '../lib/protein/calculation';
import { hasProteinSafetyOverride, EMPTY_NUTRITION_SAFETY_PROFILE_FLAGS } from '../lib/health-safety/types';
import { resolveProteinTrack } from '../lib/protein/track';

describe('computeProteinGrams — bodyWeightLb / 2.2 x multiplier, rounded to nearest 5g', () => {
  it('computes the 1.0 multiplier (general wellness)', () => {
    expect(computeProteinGrams(154, 'general_wellness')).toBe(70); // 154/2.2 = 70 exactly
  });

  it('computes the 1.2 multiplier (regular movement)', () => {
    expect(computeProteinGrams(154, 'regular_movement')).toBe(85); // 70 * 1.2 = 84 -> nearest 5 is 85
  });

  it('computes the 1.4 multiplier (resistance training / fat loss)', () => {
    expect(computeProteinGrams(154, 'resistance_training_or_fat_loss')).toBe(100); // 70 * 1.4 = 98 -> nearest 5 is 100
  });

  it('computes the 1.6 multiplier (muscle building)', () => {
    expect(computeProteinGrams(154, 'muscle_building_emphasis')).toBe(110); // 70 * 1.6 = 112 -> nearest 5 is 110
  });

  it('rounds to the nearest 5g when already exact', () => {
    // 165 lb / 2.2 = 75 exactly; 75 * 1.2 = 90, already a multiple of 5.
    expect(computeProteinGrams(165, 'regular_movement')).toBe(90);
  });

  it('rounds a raw value up to the nearest 5g', () => {
    // 160 / 2.2 = 72.7272..., * 1.0 = 72.7272 -> nearest 5g is 75 (72.7 is 2.7 from 70, 2.3 from 75).
    expect(computeProteinGrams(160, 'general_wellness')).toBe(75);
  });

  it('a tie exactly halfway between two 5g increments rounds up', () => {
    // 5.5 lb / 2.2 = 2.5 exactly, * 1.0 = 2.5 -> exactly halfway between 0 and 5.
    expect(computeProteinGrams(5.5, 'general_wellness')).toBe(5);
  });

  it('every result across a spread of weights and every activity level is a multiple of 5', () => {
    const weights = [98, 110.5, 133, 154, 187.25, 201, 250];
    for (const weight of weights) {
      for (const option of ACTIVITY_LEVELS) {
        const grams = computeProteinGrams(weight, option.key);
        expect(grams % 5).toBe(0);
        expect(grams).toBeGreaterThan(0);
      }
    }
  });
});

describe('getSuggestedProteinRange — self-guided/monthly guidance band', () => {
  it('is +/-10% rounded to the nearest 5g around the computed number', () => {
    expect(getSuggestedProteinRange(150)).toEqual({ low: 135, high: 165 });
  });

  it('has a 10g floor so small targets still get a meaningful spread', () => {
    // 10% of 50 is 5, below the 10g floor.
    expect(getSuggestedProteinRange(50)).toEqual({ low: 40, high: 60 });
  });

  it('the range is always centered on the computed number', () => {
    const range = getSuggestedProteinRange(120);
    expect((range.low + range.high) / 2).toBe(120);
  });
});

describe('hasProteinSafetyOverride — the 5 conditions that block automatic calculation', () => {
  it('is false when nothing is flagged', () => {
    expect(hasProteinSafetyOverride(EMPTY_NUTRITION_SAFETY_PROFILE_FLAGS)).toBe(false);
  });

  it('blocks on kidney disease alone', () => {
    expect(
      hasProteinSafetyOverride({ ...EMPTY_NUTRITION_SAFETY_PROFILE_FLAGS, hasKidneyDisease: true })
    ).toBe(true);
  });

  it('blocks on significant liver disease alone', () => {
    expect(
      hasProteinSafetyOverride({
        ...EMPTY_NUTRITION_SAFETY_PROFILE_FLAGS,
        hasSignificantLiverDisease: true,
      })
    ).toBe(true);
  });

  it('blocks on pregnancy alone', () => {
    expect(
      hasProteinSafetyOverride({ ...EMPTY_NUTRITION_SAFETY_PROFILE_FLAGS, isPregnant: true })
    ).toBe(true);
  });

  it('blocks on an active/recovering eating disorder alone', () => {
    expect(
      hasProteinSafetyOverride({ ...EMPTY_NUTRITION_SAFETY_PROFILE_FLAGS, hasEatingDisorder: true })
    ).toBe(true);
  });

  it('blocks on a medical instruction to limit protein alone', () => {
    expect(
      hasProteinSafetyOverride({
        ...EMPTY_NUTRITION_SAFETY_PROFILE_FLAGS,
        hasMedicalProteinLimit: true,
      })
    ).toBe(true);
  });

  it('does NOT block on diabetes-only flags — those are irrelevant to protein safety', () => {
    expect(
      hasProteinSafetyOverride({
        ...EMPTY_NUTRITION_SAFETY_PROFILE_FLAGS,
        hasDiabetes: true,
        usesInsulin: true,
        hasClinicianNutritionPlan: true,
      })
    ).toBe(false);
  });
});

describe('resolveProteinTrack — membership tier -> structured vs self-guided', () => {
  it('holistic_reset (the 24-week program tier) is the structured track', () => {
    expect(resolveProteinTrack('holistic_reset')).toBe('structured_program');
  });

  it('membership is self-guided', () => {
    expect(resolveProteinTrack('membership')).toBe('self_guided');
  });

  it('free_trial is self-guided', () => {
    expect(resolveProteinTrack('free_trial')).toBe('self_guided');
  });

  it('an unrecognized/null tier falls back to self-guided (the default membership tier)', () => {
    expect(resolveProteinTrack(null)).toBe('self_guided');
  });
});
