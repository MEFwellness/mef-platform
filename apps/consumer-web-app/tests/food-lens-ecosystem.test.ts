import { describe, it, expect } from 'vitest';
import { validateLabelExtraction } from '../lib/food-lens/labelValidation';
import { computeDailyCoachingMessage } from '../lib/food-lens/dailyCoaching';
import {
  computeHistoryPatterns,
  MIN_DISTINCT_DAYS_FOR_HISTORY,
  MIN_TOTAL_ENTRIES_FOR_HISTORY,
} from '../lib/food-lens/historyPatterns';
import { generateSwapSuggestions } from '../lib/food-products/swaps';
import { runFoodRulesEngine } from '../lib/food-products/rulesEngine';

describe('validateLabelExtraction', () => {
  it('flags fat components exceeding total fat', () => {
    const warnings = validateLabelExtraction({
      totalFatG: 5,
      saturatedFatG: 3,
      transFatG: 0,
      monounsaturatedFatG: 2,
      polyunsaturatedFatG: 2,
      totalCarbohydrateG: null,
      fiberG: null,
      totalSugarG: null,
      addedSugarG: null,
      calories: null,
    });
    expect(warnings.some((w) => w.field === 'total_fat_g')).toBe(true);
  });

  it('flags added sugar exceeding total sugar', () => {
    const warnings = validateLabelExtraction({
      totalFatG: null,
      saturatedFatG: null,
      transFatG: null,
      monounsaturatedFatG: null,
      polyunsaturatedFatG: null,
      totalCarbohydrateG: null,
      fiberG: null,
      totalSugarG: 5,
      addedSugarG: 10,
      calories: null,
    });
    expect(warnings.some((w) => w.field === 'added_sugar_g')).toBe(true);
  });

  it('produces no warnings for an internally consistent, complete reading', () => {
    const warnings = validateLabelExtraction({
      totalFatG: 10,
      saturatedFatG: 3,
      transFatG: 0,
      monounsaturatedFatG: 4,
      polyunsaturatedFatG: 3,
      totalCarbohydrateG: 30,
      fiberG: 4,
      totalSugarG: 8,
      addedSugarG: 5,
      calories: 200,
    });
    expect(warnings).toEqual([]);
  });

  it('does not fabricate a warning from all-null input', () => {
    const warnings = validateLabelExtraction({
      totalFatG: null,
      saturatedFatG: null,
      transFatG: null,
      monounsaturatedFatG: null,
      polyunsaturatedFatG: null,
      totalCarbohydrateG: null,
      fiberG: null,
      totalSugarG: null,
      addedSugarG: null,
      calories: null,
    });
    expect(warnings).toEqual([]);
  });
});

describe('computeDailyCoachingMessage', () => {
  const morning = 9;
  const afternoon = 15;

  it('stays silent (no nag) when nothing is logged and it is still morning', () => {
    const result = computeDailyCoachingMessage({
      localHour: morning,
      logEntries: [],
      mealQualityRatings: [],
      hasWorkoutToday: false,
    });
    expect(result.messages).toEqual([]);
    expect(result.insufficientToday).toBe(true);
  });

  it('gives the exact "not enough logged" message once it is afternoon and nothing is logged', () => {
    const result = computeDailyCoachingMessage({
      localHour: afternoon,
      logEntries: [],
      mealQualityRatings: [],
      hasWorkoutToday: false,
    });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toMatch(/not enough information/i);
  });

  it('flags light protein in the afternoon when nothing logged has meaningful protein', () => {
    const result = computeDailyCoachingMessage({
      localHour: afternoon,
      logEntries: [
        {
          mealCategory: 'breakfast',
          packagedFoodSignal: {
            processingLabel: 'moderately_processed',
            isMeaningfulProtein: false,
            fiberG: 1,
            addedSugarG: 2,
          },
        },
      ],
      mealQualityRatings: [],
      hasWorkoutToday: false,
    });
    expect(result.messages.some((m) => /protein has been light/i.test(m))).toBe(true);
  });

  it('does not flag light protein in the morning even with no protein logged yet', () => {
    const result = computeDailyCoachingMessage({
      localHour: morning,
      logEntries: [
        {
          mealCategory: 'breakfast',
          packagedFoodSignal: {
            processingLabel: 'moderately_processed',
            isMeaningfulProtein: false,
            fiberG: 1,
            addedSugarG: 2,
          },
        },
      ],
      mealQualityRatings: [],
      hasWorkoutToday: false,
    });
    expect(result.messages.some((m) => /protein has been light/i.test(m))).toBe(false);
  });

  it('flags protein+fat present without fiber using the spec example phrasing', () => {
    const result = computeDailyCoachingMessage({
      localHour: afternoon,
      logEntries: [],
      mealQualityRatings: [
        {
          localDate: '2024-01-01',
          rating: 'yellow',
          nutrientDensity: 'moderate',
          addedSugarLevel: 'none',
          processingLevel: 'processed',
          hasMeaningfulProtein: true,
          hasMeaningfulFiber: false,
          hasHealthyFat: true,
          isBeverage: false,
        },
      ],
      hasWorkoutToday: false,
    });
    expect(result.messages.some((m) => /protein and fat, but very little fiber/i.test(m))).toBe(
      true
    );
  });

  it('surfaces a workout-day recovery nudge using the spec example phrasing', () => {
    const result = computeDailyCoachingMessage({
      localHour: afternoon,
      logEntries: [
        {
          mealCategory: 'lunch',
          packagedFoodSignal: {
            processingLabel: 'minimally_processed',
            isMeaningfulProtein: true,
            fiberG: 5,
            addedSugarG: 0,
          },
        },
      ],
      mealQualityRatings: [],
      hasWorkoutToday: true,
    });
    expect(result.messages.some((m) => /trained today/i.test(m))).toBe(true);
  });

  it('never returns more than two messages', () => {
    const result = computeDailyCoachingMessage({
      localHour: afternoon,
      logEntries: [
        {
          mealCategory: 'breakfast',
          packagedFoodSignal: {
            processingLabel: 'highly_processed',
            isMeaningfulProtein: false,
            fiberG: 0,
            addedSugarG: 20,
          },
        },
        {
          mealCategory: 'lunch',
          packagedFoodSignal: {
            processingLabel: 'highly_processed',
            isMeaningfulProtein: false,
            fiberG: 0,
            addedSugarG: 15,
          },
        },
      ],
      mealQualityRatings: [],
      hasWorkoutToday: true,
    });
    expect(result.messages.length).toBeLessThanOrEqual(2);
  });

  it('never fabricates a workout that was not logged', () => {
    const result = computeDailyCoachingMessage({
      localHour: afternoon,
      logEntries: [
        {
          mealCategory: 'lunch',
          packagedFoodSignal: {
            processingLabel: 'minimally_processed',
            isMeaningfulProtein: true,
            fiberG: 5,
            addedSugarG: 0,
          },
        },
      ],
      mealQualityRatings: [],
      hasWorkoutToday: false,
    });
    expect(result.messages.some((m) => /trained today/i.test(m))).toBe(false);
  });
});

describe('computeHistoryPatterns', () => {
  it('reports insufficient data below the minimum-days threshold', () => {
    const result = computeHistoryPatterns({
      windowDays: 30,
      logEntries: [{ localDate: '2024-01-01', mealCategory: 'lunch' }],
      mealQualityRatings: [],
      detectedItems: [],
    });
    expect(result.insufficientData).toBe(true);
  });

  const ENOUGH_DAYS = Math.max(MIN_DISTINCT_DAYS_FOR_HISTORY, MIN_TOTAL_ENTRIES_FOR_HISTORY) + 2;

  it('produces observations once the minimum-data threshold is met', () => {
    const logEntries = Array.from({ length: ENOUGH_DAYS }, (_, i) => ({
      localDate: `2024-01-${String(i + 1).padStart(2, '0')}`,
      mealCategory: 'lunch' as const,
      packagedFoodSignal: {
        processingLabel: 'highly_processed' as const,
        isMeaningfulProtein: false,
        fiberG: 0,
        addedSugarG: 15,
      },
    }));
    const result = computeHistoryPatterns({
      windowDays: 30,
      logEntries,
      mealQualityRatings: [],
      detectedItems: [],
    });
    expect(result.insufficientData).toBe(false);
    if (!result.insufficientData) {
      expect(result.observations.length).toBeGreaterThan(0);
      expect(result.observations.join(' ')).not.toMatch(/\bbad\b|\bunhealthy\b|\bfailure\b/i);
    }
  });

  it('produces different observations for different underlying data (not a generic summary)', () => {
    const highProteinDays = Array.from({ length: ENOUGH_DAYS }, (_, i) => ({
      localDate: `2024-02-${String(i + 1).padStart(2, '0')}`,
      mealCategory: 'lunch' as const,
      packagedFoodSignal: {
        processingLabel: 'minimally_processed' as const,
        isMeaningfulProtein: true,
        fiberG: 5,
        addedSugarG: 0,
      },
    }));
    const lowProteinDays = Array.from({ length: ENOUGH_DAYS }, (_, i) => ({
      localDate: `2024-03-${String(i + 1).padStart(2, '0')}`,
      mealCategory: 'lunch' as const,
      packagedFoodSignal: {
        processingLabel: 'highly_processed' as const,
        isMeaningfulProtein: false,
        fiberG: 0,
        addedSugarG: 15,
      },
    }));
    const a = computeHistoryPatterns({
      windowDays: 30,
      logEntries: highProteinDays,
      mealQualityRatings: [],
      detectedItems: [],
    });
    const b = computeHistoryPatterns({
      windowDays: 30,
      logEntries: lowProteinDays,
      mealQualityRatings: [],
      detectedItems: [],
    });
    expect(a).not.toEqual(b);
  });
});

describe('generateSwapSuggestions', () => {
  it('suggests a protein source when protein is not meaningful', () => {
    const rules = runFoodRulesEngine({
      productName: 'Fruit snack',
      dataCompleteness: 'complete',
      nutrients: {
        calories: 150,
        proteinG: 0,
        totalCarbohydrateG: 35,
        fiberG: 1,
        totalSugarG: 20,
        addedSugarG: 18,
        totalFatG: 0,
        saturatedFatG: 0,
        monounsaturatedFatG: null,
        polyunsaturatedFatG: null,
        transFatG: 0,
        sodiumMg: 20,
        potassiumMg: null,
      },
      ingredientsText: 'corn syrup, sugar, fruit juice concentrate, citric acid',
      ingredientsList: [],
      additives: [],
    });
    const suggestions = generateSwapSuggestions(rules);
    expect(suggestions.some((s) => /protein/i.test(s.suggestion))).toBe(true);
  });

  it('never emits more than 3 suggestions and never uses judgmental language', () => {
    const rules = runFoodRulesEngine({
      productName: 'Ultra snack cake',
      dataCompleteness: 'complete',
      nutrients: {
        calories: 400,
        proteinG: 1,
        totalCarbohydrateG: 55,
        fiberG: 1,
        totalSugarG: 30,
        addedSugarG: 28,
        totalFatG: 20,
        saturatedFatG: 12,
        monounsaturatedFatG: null,
        polyunsaturatedFatG: null,
        transFatG: 1,
        sodiumMg: 300,
        potassiumMg: null,
      },
      ingredientsText:
        'enriched flour, sugar, partially hydrogenated palm oil, high fructose corn syrup, artificial flavor, red 40, sodium benzoate',
      ingredientsList: [],
      additives: [],
    });
    const suggestions = generateSwapSuggestions(rules);
    expect(suggestions.length).toBeLessThanOrEqual(3);
    const text = suggestions
      .map((s) => s.suggestion + s.reason)
      .join(' ')
      .toLowerCase();
    expect(text).not.toMatch(/\bbad\b|\bunhealthy\b|\bavoid this\b|\btoxic\b/);
  });

  it('produces no suggestions for a genuinely well-rounded whole food', () => {
    const rules = runFoodRulesEngine({
      productName: 'Plain Greek yogurt',
      dataCompleteness: 'complete',
      nutrients: {
        calories: 120,
        proteinG: 17,
        totalCarbohydrateG: 6,
        fiberG: 0,
        totalSugarG: 6,
        addedSugarG: 0,
        totalFatG: 0,
        saturatedFatG: 0,
        monounsaturatedFatG: null,
        polyunsaturatedFatG: null,
        transFatG: 0,
        sodiumMg: 60,
        potassiumMg: null,
      },
      ingredientsText: 'cultured pasteurized nonfat milk, live active cultures',
      ingredientsList: [],
      additives: [],
    });
    const suggestions = generateSwapSuggestions(rules);
    expect(suggestions.length).toBe(0);
  });
});
