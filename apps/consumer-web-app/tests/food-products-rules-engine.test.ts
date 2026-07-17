import { describe, it, expect } from 'vitest';
import { analyzeIngredientQuality } from '../lib/food-products/rulesEngine/ingredientQuality';
import { analyzeFatQuality } from '../lib/food-products/rulesEngine/fatQuality';
import { analyzeCarbQuality } from '../lib/food-products/rulesEngine/carbQuality';
import { analyzeProteinQuality } from '../lib/food-products/rulesEngine/proteinQuality';
import { estimateProcessingContext } from '../lib/food-products/rulesEngine/processingContext';
import { analyzeNutrientCombinations } from '../lib/food-products/rulesEngine/nutrientCombinations';
import { matchMemberAllergens } from '../lib/food-products/rulesEngine/allergenCheck';
import { runFoodRulesEngine, DEFAULT_NUTRITION_THRESHOLDS } from '../lib/food-products/rulesEngine';
import type { FoodRulesEngineInput } from '../lib/food-products/rulesEngine';

const T = DEFAULT_NUTRITION_THRESHOLDS;

describe('analyzeIngredientQuality', () => {
  it('flags refined flour, added sugar, and a long list without calling it good or bad', () => {
    const result = analyzeIngredientQuality({
      ingredientsText:
        'enriched wheat flour, sugar, corn syrup, vegetable oil, salt, sodium benzoate, red 40, soy lecithin, water, yeast, dextrose, xanthan gum, natural flavor',
      ingredientsList: [],
      additives: [],
      longIngredientListThreshold: T.longIngredientListCount,
    });
    expect(result.hasRefinedFlour).toBe(true);
    expect(result.hasAddedSugar).toBe(true);
    expect(result.hasArtificialColors).toBe(true);
    expect(result.preservativeCount).toBeGreaterThan(0);
    expect(result.isLongIngredientList).toBe(true);
    expect(result.observations.join(' ')).not.toMatch(/\bhealthy\b|\bunhealthy\b|this is (good|bad)/i);
  });

  it('does not flag refined flour when whole grain is also present', () => {
    const result = analyzeIngredientQuality({
      ingredientsText: 'whole wheat flour, water, yeast, salt',
      ingredientsList: [],
      additives: [],
      longIngredientListThreshold: T.longIngredientListCount,
    });
    expect(result.hasRefinedFlour).toBe(false);
    expect(result.wholeFoodIngredientsPresent).toBe(true);
  });

  it('recognizes a short whole-food ingredient list as leading with a whole food', () => {
    const result = analyzeIngredientQuality({
      ingredientsText: 'chicken breast, salt, pepper',
      ingredientsList: ['chicken breast', 'salt', 'pepper'],
      additives: [],
      longIngredientListThreshold: T.longIngredientListCount,
    });
    expect(result.wholeFoodIngredientsPresent).toBe(true);
    expect(result.isLongIngredientList).toBe(false);
  });

  it('reports null ingredient count and a clear observation when no ingredient text is available', () => {
    const result = analyzeIngredientQuality({
      ingredientsText: null,
      ingredientsList: [],
      additives: [],
      longIngredientListThreshold: T.longIngredientListCount,
    });
    expect(result.ingredientCount).toBeNull();
    expect(result.observations[0]).toMatch(/no ingredient list/i);
  });
});

describe('analyzeFatQuality', () => {
  it('never labels total fat or saturated fat as good/bad on their own', () => {
    const result = analyzeFatQuality({
      totalFatG: 20,
      saturatedFatG: 8,
      monounsaturatedFatG: 5,
      polyunsaturatedFatG: 5,
      transFatG: 0,
      ingredientsText: 'almonds, cashews, sea salt',
    });
    expect(result.observations.join(' ')).not.toMatch(/\b(good|bad|healthy|unhealthy|toxic)\b/i);
  });

  it('classifies whole-food fat sources (nuts/olive oil) as whole_food, not flagged negatively', () => {
    const result = analyzeFatQuality({
      totalFatG: 14,
      saturatedFatG: 2,
      monounsaturatedFatG: 10,
      polyunsaturatedFatG: 2,
      transFatG: 0,
      ingredientsText: 'roasted almonds, olive oil, sea salt',
    });
    expect(result.fatSourceCategory).toBe('whole_food');
    expect(result.containsSeedOil).toBe(false);
    expect(result.hasIndustrialTransFat).toBe(false);
  });

  it('identifies seed oils as a processed/industrial source without calling them toxic', () => {
    const result = analyzeFatQuality({
      totalFatG: 10,
      saturatedFatG: 1,
      monounsaturatedFatG: 3,
      polyunsaturatedFatG: 6,
      transFatG: 0,
      ingredientsText: 'potatoes, canola oil, salt',
    });
    expect(result.fatSourceCategory).toBe('processed_or_industrial');
    expect(result.containsSeedOil).toBe(true);
    expect(result.observations.join(' ')).not.toMatch(/toxic|inflammatory|dangerous/i);
  });

  it('flags partially hydrogenated oil as an industrial trans fat source even when labeled trans fat is 0', () => {
    const result = analyzeFatQuality({
      totalFatG: 12,
      saturatedFatG: 5,
      monounsaturatedFatG: 2,
      polyunsaturatedFatG: 1,
      transFatG: 0,
      ingredientsText: 'enriched flour, sugar, partially hydrogenated soybean oil, salt',
    });
    expect(result.containsPartiallyHydrogenatedOil).toBe(true);
    expect(result.hasIndustrialTransFat).toBe(true);
    expect(result.observations[0]).toMatch(/partially hydrogenated/i);
  });

  it('reports fat source as unknown when there is no ingredient text to judge it from', () => {
    const result = analyzeFatQuality({
      totalFatG: 5,
      saturatedFatG: 2,
      monounsaturatedFatG: null,
      polyunsaturatedFatG: null,
      transFatG: null,
      ingredientsText: null,
    });
    expect(result.fatSourceCategory).toBe('unknown');
  });
});

describe('analyzeCarbQuality', () => {
  it('does not label all carbohydrate negatively for a fiber-rich whole-food carb', () => {
    const result = analyzeCarbQuality({
      totalCarbohydrateG: 40,
      fiberG: 8,
      totalSugarG: 1,
      addedSugarG: 0,
      ingredientsText: 'rolled oats',
      lowFiberThresholdG: T.lowFiberG,
    });
    expect(result.isPrimarilyRefinedCarbohydrate).toBe(false);
  });

  it('flags a refined, low-fiber carbohydrate as primarily refined', () => {
    const result = analyzeCarbQuality({
      totalCarbohydrateG: 35,
      fiberG: 1,
      totalSugarG: 15,
      addedSugarG: 12,
      ingredientsText: 'enriched wheat flour, sugar, vegetable oil',
      lowFiberThresholdG: T.lowFiberG,
    });
    expect(result.isPrimarilyRefinedCarbohydrate).toBe(true);
  });

  it('recognizes whole grain ingredients', () => {
    const result = analyzeCarbQuality({
      totalCarbohydrateG: 22,
      fiberG: 4,
      totalSugarG: 2,
      addedSugarG: 0,
      ingredientsText: 'whole grain oats, water',
      lowFiberThresholdG: T.lowFiberG,
    });
    expect(result.isWholeGrainIndicated).toBe(true);
  });
});

describe('analyzeProteinQuality', () => {
  it('flags a product marketed as high-protein but with a modest amount', () => {
    const result = analyzeProteinQuality({
      proteinG: 4,
      productName: 'High Protein Snack Bar',
      ingredientsText: null,
      meaningfulProteinThresholdG: T.meaningfulProteinG,
      highProteinMarketingThresholdG: T.highProteinMarketingG,
    });
    expect(result.isMarketedHighProteinButModest).toBe(true);
  });

  it('does not flag a plain product name with a modest protein amount as misleading marketing', () => {
    const result = analyzeProteinQuality({
      proteinG: 4,
      productName: 'Rice Crackers',
      ingredientsText: null,
      meaningfulProteinThresholdG: T.meaningfulProteinG,
      highProteinMarketingThresholdG: T.highProteinMarketingG,
    });
    expect(result.isMarketedHighProteinButModest).toBe(false);
  });

  it('never claims a protein is "complete" or "incomplete"', () => {
    const result = analyzeProteinQuality({
      proteinG: 20,
      productName: 'Chicken Breast',
      ingredientsText: 'chicken breast',
      meaningfulProteinThresholdG: T.meaningfulProteinG,
      highProteinMarketingThresholdG: T.highProteinMarketingG,
    });
    expect(result.observations.join(' ')).not.toMatch(/complete protein|incomplete protein/i);
  });
});

describe('estimateProcessingContext', () => {
  it('never declares a food good or bad from processing level alone', () => {
    const iq = analyzeIngredientQuality({
      ingredientsText: 'chicken, salt, pepper',
      ingredientsList: ['chicken', 'salt', 'pepper'],
      additives: [],
      longIngredientListThreshold: T.longIngredientListCount,
    });
    const result = estimateProcessingContext({ ingredientsText: 'chicken, salt, pepper', ingredientCount: 3, ingredientQuality: iq });
    expect(result.label).toBe('lightly_processed');
    expect(result.reason).not.toMatch(/\b(good|bad|healthy|unhealthy)\b/i);
  });

  it('rates a product with partially hydrogenated oil as highly processed', () => {
    const iq = analyzeIngredientQuality({
      ingredientsText: 'enriched flour, sugar, partially hydrogenated oil, red 40, sodium benzoate',
      ingredientsList: [],
      additives: [],
      longIngredientListThreshold: T.longIngredientListCount,
    });
    const result = estimateProcessingContext({
      ingredientsText: 'enriched flour, sugar, partially hydrogenated oil, red 40, sodium benzoate',
      ingredientCount: iq.ingredientCount,
      ingredientQuality: iq,
    });
    expect(result.label).toBe('highly_processed');
  });
});

describe('matchMemberAllergens', () => {
  it('matches a declared allergen against the member\'s stated allergies', () => {
    const matches = matchMemberAllergens([{ allergen: 'peanuts', kind: 'contains' }], ['Peanuts']);
    expect(matches).toEqual([{ allergen: 'peanuts', kind: 'contains' }]);
  });

  it('returns nothing when the member has no stated allergies', () => {
    const matches = matchMemberAllergens([{ allergen: 'milk', kind: 'contains' }], []);
    expect(matches).toEqual([]);
  });

  it('does not match an unrelated allergen', () => {
    const matches = matchMemberAllergens([{ allergen: 'soy', kind: 'contains' }], ['peanuts']);
    expect(matches).toEqual([]);
  });
});

describe('analyzeNutrientCombinations', () => {
  const iq = analyzeIngredientQuality({
    ingredientsText: 'enriched flour, sugar, palm oil, salt',
    ingredientsList: [],
    additives: [],
    longIngredientListThreshold: T.longIngredientListCount,
  });
  const processing = estimateProcessingContext({
    ingredientsText: 'enriched flour, sugar, palm oil, salt',
    ingredientCount: iq.ingredientCount,
    ingredientQuality: iq,
  });

  it('flags high saturated fat + high added sugar together', () => {
    const fat = analyzeFatQuality({
      totalFatG: 15,
      saturatedFatG: 8,
      monounsaturatedFatG: 2,
      polyunsaturatedFatG: 2,
      transFatG: 0,
      ingredientsText: 'palm oil',
    });
    const carb = analyzeCarbQuality({
      totalCarbohydrateG: 30,
      fiberG: 1,
      totalSugarG: 15,
      addedSugarG: 15,
      ingredientsText: 'enriched flour, sugar',
      lowFiberThresholdG: T.lowFiberG,
    });
    const protein = analyzeProteinQuality({
      proteinG: 2,
      productName: 'Snack Cake',
      ingredientsText: null,
      meaningfulProteinThresholdG: T.meaningfulProteinG,
      highProteinMarketingThresholdG: T.highProteinMarketingG,
    });
    const findings = analyzeNutrientCombinations({
      calories: 250,
      proteinG: 2,
      fiberG: 1,
      sodiumMg: 150,
      fatQuality: fat,
      carbQuality: carb,
      proteinQuality: protein,
      ingredientQuality: iq,
      processingContext: processing,
      thresholds: T,
    });
    expect(findings.map((f) => f.code)).toContain('high_sat_fat_high_added_sugar');
  });

  it('does not flag the sat-fat+sugar combination for a product high in saturated fat but low in refined carb and added sugar', () => {
    const fat = analyzeFatQuality({
      totalFatG: 14,
      saturatedFatG: 9,
      monounsaturatedFatG: 3,
      polyunsaturatedFatG: 1,
      transFatG: 0,
      ingredientsText: 'grass-fed beef',
    });
    const carb = analyzeCarbQuality({
      totalCarbohydrateG: 0,
      fiberG: 0,
      totalSugarG: 0,
      addedSugarG: 0,
      ingredientsText: 'grass-fed beef, salt',
      lowFiberThresholdG: T.lowFiberG,
    });
    const protein = analyzeProteinQuality({
      proteinG: 22,
      productName: 'Grass-Fed Ground Beef',
      ingredientsText: 'grass-fed beef',
      meaningfulProteinThresholdG: T.meaningfulProteinG,
      highProteinMarketingThresholdG: T.highProteinMarketingG,
    });
    const findings = analyzeNutrientCombinations({
      calories: 250,
      proteinG: 22,
      fiberG: 0,
      sodiumMg: 75,
      fatQuality: fat,
      carbQuality: carb,
      proteinQuality: protein,
      ingredientQuality: analyzeIngredientQuality({
        ingredientsText: 'grass-fed beef, salt',
        ingredientsList: [],
        additives: [],
        longIngredientListThreshold: T.longIngredientListCount,
      }),
      processingContext: estimateProcessingContext({
        ingredientsText: 'grass-fed beef, salt',
        ingredientCount: 2,
        ingredientQuality: iq,
      }),
      thresholds: T,
    });
    expect(findings.map((f) => f.code)).not.toContain('high_sat_fat_high_added_sugar');
  });

  it('flags useful protein alongside high sodium as its own distinct combination', () => {
    const fat = analyzeFatQuality({
      totalFatG: 3,
      saturatedFatG: 1,
      monounsaturatedFatG: 1,
      polyunsaturatedFatG: 1,
      transFatG: 0,
      ingredientsText: 'chicken breast, water, salt, sodium phosphate',
    });
    const carb = analyzeCarbQuality({
      totalCarbohydrateG: 2,
      fiberG: 0,
      totalSugarG: 0,
      addedSugarG: 0,
      ingredientsText: 'chicken breast, water, salt, sodium phosphate',
      lowFiberThresholdG: T.lowFiberG,
    });
    const protein = analyzeProteinQuality({
      proteinG: 24,
      productName: 'Deli Chicken Breast',
      ingredientsText: 'chicken breast, water, salt, sodium phosphate',
      meaningfulProteinThresholdG: T.meaningfulProteinG,
      highProteinMarketingThresholdG: T.highProteinMarketingG,
    });
    const findings = analyzeNutrientCombinations({
      calories: 120,
      proteinG: 24,
      fiberG: 0,
      sodiumMg: 850,
      fatQuality: fat,
      carbQuality: carb,
      proteinQuality: protein,
      ingredientQuality: iq,
      processingContext: processing,
      thresholds: T,
    });
    expect(findings.map((f) => f.code)).toContain('useful_protein_high_sodium');
  });

  it('flags whole-food fat paired with protein or fiber positively', () => {
    const fat = analyzeFatQuality({
      totalFatG: 14,
      saturatedFatG: 2,
      monounsaturatedFatG: 9,
      polyunsaturatedFatG: 2,
      transFatG: 0,
      ingredientsText: 'almonds, walnuts, sea salt',
    });
    const carb = analyzeCarbQuality({
      totalCarbohydrateG: 8,
      fiberG: 4,
      totalSugarG: 1,
      addedSugarG: 0,
      ingredientsText: 'almonds, walnuts, sea salt',
      lowFiberThresholdG: T.lowFiberG,
    });
    const protein = analyzeProteinQuality({
      proteinG: 7,
      productName: 'Mixed Nuts',
      ingredientsText: 'almonds, walnuts, sea salt',
      meaningfulProteinThresholdG: T.meaningfulProteinG,
      highProteinMarketingThresholdG: T.highProteinMarketingG,
    });
    const findings = analyzeNutrientCombinations({
      calories: 170,
      proteinG: 7,
      fiberG: 4,
      sodiumMg: 90,
      fatQuality: fat,
      carbQuality: carb,
      proteinQuality: protein,
      ingredientQuality: analyzeIngredientQuality({
        ingredientsText: 'almonds, walnuts, sea salt',
        ingredientsList: [],
        additives: [],
        longIngredientListThreshold: T.longIngredientListCount,
      }),
      processingContext: processing,
      thresholds: T,
    });
    expect(findings.map((f) => f.code)).toContain('whole_food_fat_protein_fiber');
  });

  it('never produces a finding with a forbidden diagnostic phrase', () => {
    const fat = analyzeFatQuality({
      totalFatG: 20,
      saturatedFatG: 10,
      monounsaturatedFatG: 3,
      polyunsaturatedFatG: 3,
      transFatG: 1,
      ingredientsText: 'palm oil, partially hydrogenated soybean oil',
    });
    const carb = analyzeCarbQuality({
      totalCarbohydrateG: 40,
      fiberG: 1,
      totalSugarG: 20,
      addedSugarG: 18,
      ingredientsText: 'sugar, enriched flour',
      lowFiberThresholdG: T.lowFiberG,
    });
    const protein = analyzeProteinQuality({
      proteinG: 1,
      productName: 'Frosted Snack Cake',
      ingredientsText: null,
      meaningfulProteinThresholdG: T.meaningfulProteinG,
      highProteinMarketingThresholdG: T.highProteinMarketingG,
    });
    const findings = analyzeNutrientCombinations({
      calories: 400,
      proteinG: 1,
      fiberG: 1,
      sodiumMg: 700,
      fatQuality: fat,
      carbQuality: carb,
      proteinQuality: protein,
      ingredientQuality: iq,
      processingContext: { label: 'highly_processed', reason: 'test' },
      thresholds: T,
    });
    const text = findings.map((f) => f.narrative).join(' ').toLowerCase();
    expect(text).not.toMatch(/this will cause|prevents disease|toxic|inflammatory/);
  });
});

describe('runFoodRulesEngine (end to end)', () => {
  function input(overrides: Partial<FoodRulesEngineInput> = {}): FoodRulesEngineInput {
    return {
      productName: 'Test Product',
      dataCompleteness: 'complete',
      nutrients: {
        calories: 150,
        proteinG: 5,
        totalCarbohydrateG: 20,
        fiberG: 3,
        totalSugarG: 5,
        addedSugarG: 2,
        totalFatG: 6,
        saturatedFatG: 2,
        monounsaturatedFatG: 2,
        polyunsaturatedFatG: 2,
        transFatG: 0,
        sodiumMg: 200,
        potassiumMg: 100,
      },
      ingredientsText: 'oats, water, salt',
      ingredientsList: [],
      additives: [],
      ...overrides,
    };
  }

  it('lowers overall confidence when data completeness is minimal', () => {
    const complete = runFoodRulesEngine(input({ dataCompleteness: 'complete' }));
    const minimal = runFoodRulesEngine(input({ dataCompleteness: 'minimal' }));
    expect(minimal.overallConfidence).toBeLessThan(complete.overallConfidence);
  });

  it('lowers confidence further when no ingredient text is available at all', () => {
    const withText = runFoodRulesEngine(input({ ingredientsText: 'oats, water, salt' }));
    const withoutText = runFoodRulesEngine(input({ ingredientsText: null, dataCompleteness: 'complete' }));
    expect(withoutText.overallConfidence).toBeLessThanOrEqual(withText.overallConfidence);
  });

  it('does not fabricate nutrients that are null in the input', () => {
    const result = runFoodRulesEngine(
      input({
        nutrients: {
          calories: null,
          proteinG: null,
          totalCarbohydrateG: null,
          fiberG: null,
          totalSugarG: null,
          addedSugarG: null,
          totalFatG: null,
          saturatedFatG: null,
          monounsaturatedFatG: null,
          polyunsaturatedFatG: null,
          transFatG: null,
          sodiumMg: null,
          potassiumMg: null,
        },
        dataCompleteness: 'minimal',
      })
    );
    expect(result.fatQuality.totalFatG).toBeNull();
    expect(result.proteinQuality.proteinG).toBeNull();
    expect(result.nutrientCombinations).toEqual([]);
  });

  it('produces the sugar+refined-carb combination for a product combining saturated fat, refined carbohydrate, and added sugar', () => {
    const result = runFoodRulesEngine(
      input({
        productName: 'Iced Toaster Pastry',
        nutrients: {
          calories: 380,
          proteinG: 3,
          totalCarbohydrateG: 55,
          fiberG: 1,
          totalSugarG: 30,
          addedSugarG: 28,
          totalFatG: 12,
          saturatedFatG: 6,
          monounsaturatedFatG: 3,
          polyunsaturatedFatG: 3,
          transFatG: 0,
          sodiumMg: 300,
          potassiumMg: 60,
        },
        ingredientsText: 'enriched wheat flour, sugar, palm oil, corn syrup, red 40',
      })
    );
    const codes = result.nutrientCombinations.map((f) => f.code);
    expect(codes).toContain('high_sat_fat_high_added_sugar');
    expect(codes).toContain('high_refined_carb_low_fiber');
  });
});
