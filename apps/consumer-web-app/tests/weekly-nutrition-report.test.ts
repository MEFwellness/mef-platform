import { describe, it, expect } from 'vitest';
import {
  computeWeeklyNutritionReport,
  INSUFFICIENT_DATA_MESSAGE,
  type WeeklyReportInput,
  type WeeklyReportLogEntry,
  type WeeklyReportMealQualityRating,
  type WeeklyReportDetectedItem,
} from '../lib/food-lens/weeklyReport';

const WEEK_START = '2026-07-13'; // a Monday
const WEEK_END = '2026-07-20';

function baseInput(overrides: Partial<WeeklyReportInput> = {}): WeeklyReportInput {
  return {
    weekStart: WEEK_START,
    weekEnd: WEEK_END,
    logEntries: [],
    mealQualityRatings: [],
    detectedItems: [],
    completedWorkoutLocalDates: [],
    waterCupsByLocalDate: {},
    ...overrides,
  };
}

function rating(
  localDate: string,
  overrides: Partial<WeeklyReportMealQualityRating> = {}
): WeeklyReportMealQualityRating {
  return {
    localDate,
    rating: 'yellow',
    nutrientDensity: 'moderate',
    addedSugarLevel: 'none',
    processingLevel: 'processed',
    hasMeaningfulProtein: false,
    hasMeaningfulFiber: false,
    hasHealthyFat: false,
    isBeverage: false,
    ...overrides,
  };
}

function logEntry(
  localDate: string,
  overrides: Partial<WeeklyReportLogEntry> = {}
): WeeklyReportLogEntry {
  return {
    localDate,
    mealCategory: 'snack',
    packagedFoodSignal: null,
    ...overrides,
  };
}

function detectedItem(
  localDate: string,
  label: string,
  category: WeeklyReportDetectedItem['category'] = 'mixed'
): WeeklyReportDetectedItem {
  return { localDate, label, category };
}

const FORBIDDEN_LANGUAGE =
  /\bbad\b|unhealthy person|failure|you failed|should not eat|cheat food|deficient|diagnos|disease|you have low|you have a low/i;

describe('computeWeeklyNutritionReport — insufficient data', () => {
  it('returns insufficientData when fewer than 3 distinct days are logged, even with 5+ entries', () => {
    const result = computeWeeklyNutritionReport(
      baseInput({
        mealQualityRatings: [
          rating('2026-07-13'),
          rating('2026-07-13'),
          rating('2026-07-13'),
          rating('2026-07-13'),
          rating('2026-07-13'),
        ],
      })
    );
    expect(result).toEqual({ insufficientData: true });
  });

  it('returns insufficientData when fewer than 5 total entries are logged, even across 3+ days', () => {
    const result = computeWeeklyNutritionReport(
      baseInput({
        mealQualityRatings: [rating('2026-07-13'), rating('2026-07-14'), rating('2026-07-15')],
      })
    );
    expect(result).toEqual({ insufficientData: true });
  });

  it('returns insufficientData for a completely empty week', () => {
    const result = computeWeeklyNutritionReport(baseInput());
    expect(result).toEqual({ insufficientData: true });
  });

  it('exact fallback sentence matches the spec wording verbatim', () => {
    expect(INSUFFICIENT_DATA_MESSAGE).toBe(
      'There is not enough logged information for a reliable weekly report yet. Logging a few more meals will help Root understand your patterns.'
    );
  });

  it('meets the threshold at exactly 3 days / 5 entries (boundary, inclusive)', () => {
    const result = computeWeeklyNutritionReport(
      baseInput({
        mealQualityRatings: [
          rating('2026-07-13'),
          rating('2026-07-13'),
          rating('2026-07-14'),
          rating('2026-07-15'),
          rating('2026-07-15'),
        ],
      })
    );
    expect(result).not.toEqual({ insufficientData: true });
    if ('insufficientData' in result) throw new Error('expected a generated report');
    expect(result.daysLogged).toBe(3);
    expect(result.mealsLogged).toBe(5);
  });
});

describe('computeWeeklyNutritionReport — two different weeks diverge in wording', () => {
  it('a consistent, protein/fiber-forward week reads differently than a sparse, inconsistent week', () => {
    const strongWeek = computeWeeklyNutritionReport(
      baseInput({
        mealQualityRatings: [
          rating('2026-07-13', { hasMeaningfulProtein: true, hasMeaningfulFiber: true }),
          rating('2026-07-14', { hasMeaningfulProtein: true, hasMeaningfulFiber: true }),
          rating('2026-07-15', { hasMeaningfulProtein: true, hasMeaningfulFiber: true }),
          rating('2026-07-16', { hasMeaningfulProtein: true, hasMeaningfulFiber: true }),
          rating('2026-07-17', { hasMeaningfulProtein: true, hasMeaningfulFiber: true }),
          rating('2026-07-18', { hasMeaningfulProtein: true, hasMeaningfulFiber: true }),
        ],
      })
    );

    const weakWeek = computeWeeklyNutritionReport(
      baseInput({
        mealQualityRatings: [
          rating('2026-07-13', { hasMeaningfulProtein: false, hasMeaningfulFiber: false }),
          rating('2026-07-15', { hasMeaningfulProtein: false, hasMeaningfulFiber: false }),
          rating('2026-07-17', { hasMeaningfulProtein: false, hasMeaningfulFiber: false }),
          rating('2026-07-17', { hasMeaningfulProtein: false, hasMeaningfulFiber: false }),
          rating('2026-07-17', { hasMeaningfulProtein: false, hasMeaningfulFiber: false }),
        ],
      })
    );

    if ('insufficientData' in strongWeek || 'insufficientData' in weakWeek) {
      throw new Error('expected both weeks to generate a report');
    }

    // Not the same generic summary: counts differ, and so must the words.
    expect(strongWeek.yourWeekInFood).not.toBe(weakWeek.yourWeekInFood);
    expect(strongWeek.whatSupportedYou.join(' ')).not.toBe(weakWeek.whatSupportedYou.join(' '));
    expect(strongWeek.patternsWorthNoticing.join(' ')).not.toBe(
      weakWeek.patternsWorthNoticing.join(' ')
    );

    // The strong week should surface protein/fiber as support, not as a pattern to notice.
    expect(strongWeek.whatSupportedYou.some((s) => /protein/i.test(s))).toBe(true);
    expect(strongWeek.patternsWorthNoticing.some((s) => /protein/i.test(s))).toBe(false);

    // The weak week should surface protein/fiber as a pattern worth noticing, not as support.
    expect(weakWeek.patternsWorthNoticing.some((s) => /protein/i.test(s))).toBe(true);
    expect(weakWeek.whatSupportedYou.some((s) => /protein/i.test(s))).toBe(false);
  });

  it('varying variety data produces differently worded variety commentary', () => {
    const wideVarietyItems = [
      'chicken breast',
      'brown rice',
      'broccoli',
      'spinach',
      'salmon',
      'sweet potato',
      'blueberries',
      'almonds',
      'quinoa',
      'bell pepper',
      'avocado',
      'eggs',
    ].map((label, i) => detectedItem(`2026-07-1${(i % 6) + 3}`, label, 'mixed'));

    const narrowVarietyItems = Array.from({ length: 10 }, (_, i) =>
      detectedItem(
        `2026-07-1${(i % 6) + 3}`,
        i % 2 === 0 ? 'white rice' : 'chicken breast',
        'mixed'
      )
    );

    const withRatings = (items: WeeklyReportDetectedItem[]) =>
      baseInput({
        detectedItems: items,
        mealQualityRatings: [
          rating('2026-07-13'),
          rating('2026-07-14'),
          rating('2026-07-15'),
          rating('2026-07-16'),
          rating('2026-07-17'),
        ],
      });

    const wide = computeWeeklyNutritionReport(withRatings(wideVarietyItems));
    const narrow = computeWeeklyNutritionReport(withRatings(narrowVarietyItems));

    if ('insufficientData' in wide || 'insufficientData' in narrow) {
      throw new Error('expected both to generate a report');
    }

    expect(wide.whatSupportedYou.join(' ')).not.toBe(narrow.whatSupportedYou.join(' '));
    expect(wide.patternsWorthNoticing.join(' ')).not.toBe(narrow.patternsWorthNoticing.join(' '));
    expect(wide.whatSupportedYou.some((s) => /variety/i.test(s))).toBe(true);
    expect(narrow.patternsWorthNoticing.some((s) => /same handful|repeated/i.test(s))).toBe(true);
  });
});

describe('computeWeeklyNutritionReport — language discipline', () => {
  const scenarios: WeeklyReportInput[] = [
    // Strongly negative-leaning week (should still never shame).
    baseInput({
      mealQualityRatings: [
        rating('2026-07-13', {
          hasMeaningfulProtein: false,
          hasMeaningfulFiber: false,
          addedSugarLevel: 'high',
          processingLevel: 'ultra_processed',
        }),
        rating('2026-07-14', {
          hasMeaningfulProtein: false,
          hasMeaningfulFiber: false,
          addedSugarLevel: 'high',
          processingLevel: 'ultra_processed',
        }),
        rating('2026-07-15', {
          hasMeaningfulProtein: false,
          hasMeaningfulFiber: false,
          addedSugarLevel: 'high',
          processingLevel: 'ultra_processed',
        }),
        rating('2026-07-16', {
          hasMeaningfulProtein: false,
          hasMeaningfulFiber: false,
          addedSugarLevel: 'high',
          processingLevel: 'ultra_processed',
        }),
        rating('2026-07-17', {
          hasMeaningfulProtein: false,
          hasMeaningfulFiber: false,
          addedSugarLevel: 'high',
          processingLevel: 'ultra_processed',
        }),
      ],
      detectedItems: Array.from({ length: 10 }, () => detectedItem('2026-07-13', 'chips', 'carb')),
      waterCupsByLocalDate: { '2026-07-13': 1, '2026-07-14': 1, '2026-07-15': 1 },
    }),
    // Strongly positive week.
    baseInput({
      mealQualityRatings: [
        rating('2026-07-13', { hasMeaningfulProtein: true, hasMeaningfulFiber: true }),
        rating('2026-07-14', { hasMeaningfulProtein: true, hasMeaningfulFiber: true }),
        rating('2026-07-15', { hasMeaningfulProtein: true, hasMeaningfulFiber: true }),
        rating('2026-07-16', { hasMeaningfulProtein: true, hasMeaningfulFiber: true }),
        rating('2026-07-17', { hasMeaningfulProtein: true, hasMeaningfulFiber: true }),
        rating('2026-07-18', { hasMeaningfulProtein: true, hasMeaningfulFiber: true }),
      ],
      waterCupsByLocalDate: { '2026-07-13': 8, '2026-07-14': 8, '2026-07-15': 9 },
    }),
  ];

  it('never uses shaming or diagnostic language anywhere in the output', () => {
    for (const input of scenarios) {
      const result = computeWeeklyNutritionReport(input);
      if ('insufficientData' in result) continue;
      const allText = [
        result.yourWeekInFood,
        ...result.whatSupportedYou,
        ...result.patternsWorthNoticing,
        result.winToBuildOn ?? '',
        result.rootedFocusForNextWeek ?? '',
      ].join(' \n ');
      expect(allText).not.toMatch(FORBIDDEN_LANGUAGE);
    }
  });

  it('hedges every pattern-worth-noticing sentence rather than stating a nutrient deficiency as settled fact', () => {
    const result = computeWeeklyNutritionReport(scenarios[0]!);
    if ('insufficientData' in result) throw new Error('expected a generated report');
    for (const sentence of result.patternsWorthNoticing) {
      expect(sentence).toMatch(
        /pattern worth noticing|based on what was logged|may be incomplete|suggest/i
      );
    }
  });
});

describe('computeWeeklyNutritionReport — winToBuildOn', () => {
  it('is null when nothing clearly positive stands out, rather than fabricated', () => {
    // Right at the minimum-data threshold, with every signal squarely in
    // the neutral middle band (neither clearly positive nor clearly
    // negative, on every axis this function evaluates) — nothing here
    // should be strong enough to call a "win."
    const result = computeWeeklyNutritionReport(
      baseInput({
        mealQualityRatings: [
          rating('2026-07-13', {
            hasMeaningfulProtein: true,
            hasMeaningfulFiber: false,
            addedSugarLevel: 'high',
            processingLevel: 'ultra_processed',
          }),
          rating('2026-07-14', {
            hasMeaningfulProtein: false,
            hasMeaningfulFiber: true,
            addedSugarLevel: 'none',
            processingLevel: 'processed',
          }),
          rating('2026-07-15', {
            hasMeaningfulProtein: true,
            hasMeaningfulFiber: false,
            addedSugarLevel: 'none',
            processingLevel: 'processed',
          }),
        ],
        logEntries: [logEntry('2026-07-16'), logEntry('2026-07-17')],
      })
    );
    if ('insufficientData' in result) throw new Error('expected a generated report');
    expect(result.winToBuildOn).toBeNull();
  });

  it('is populated with a specific, non-generic sentence when a clear positive stands out', () => {
    const result = computeWeeklyNutritionReport(
      baseInput({
        mealQualityRatings: [
          rating('2026-07-13', { hasMeaningfulProtein: true }),
          rating('2026-07-14', { hasMeaningfulProtein: true }),
          rating('2026-07-15', { hasMeaningfulProtein: true }),
          rating('2026-07-16', { hasMeaningfulProtein: true }),
          rating('2026-07-17', { hasMeaningfulProtein: true }),
        ],
      })
    );
    if ('insufficientData' in result) throw new Error('expected a generated report');
    expect(result.winToBuildOn).not.toBeNull();
    expect(typeof result.winToBuildOn).toBe('string');
  });
});

describe('computeWeeklyNutritionReport — rootedFocusForNextWeek stays to at most one clear priority', () => {
  it('never encodes more than two distinct focus areas', () => {
    // A week with many simultaneous negative patterns (protein, fiber,
    // sugar, processing, variety, produce, hydration all unfavorable) —
    // rootedFocusForNextWeek must still stay a single, short string built
    // from at most the two strongest patterns, never a laundry list.
    const result = computeWeeklyNutritionReport(
      baseInput({
        mealQualityRatings: [
          rating('2026-07-13', {
            hasMeaningfulProtein: false,
            hasMeaningfulFiber: false,
            addedSugarLevel: 'high',
            processingLevel: 'ultra_processed',
          }),
          rating('2026-07-14', {
            hasMeaningfulProtein: false,
            hasMeaningfulFiber: false,
            addedSugarLevel: 'high',
            processingLevel: 'ultra_processed',
          }),
          rating('2026-07-15', {
            hasMeaningfulProtein: false,
            hasMeaningfulFiber: false,
            addedSugarLevel: 'high',
            processingLevel: 'ultra_processed',
          }),
          rating('2026-07-16', {
            hasMeaningfulProtein: false,
            hasMeaningfulFiber: false,
            addedSugarLevel: 'high',
            processingLevel: 'ultra_processed',
          }),
          rating('2026-07-17', {
            hasMeaningfulProtein: false,
            hasMeaningfulFiber: false,
            addedSugarLevel: 'high',
            processingLevel: 'ultra_processed',
          }),
        ],
        detectedItems: Array.from({ length: 10 }, () =>
          detectedItem('2026-07-13', 'chips', 'carb')
        ),
        waterCupsByLocalDate: { '2026-07-13': 1, '2026-07-14': 1, '2026-07-15': 1 },
      })
    );
    if ('insufficientData' in result) throw new Error('expected a generated report');
    expect(result.rootedFocusForNextWeek).not.toBeNull();
    // At most two focus clauses were ever assembled — approximate check:
    // the sentence should not contain 3+ occurrences of the joining split
    // pattern this function uses when combining two focus sentences.
    const sentenceCount = (result.rootedFocusForNextWeek ?? '')
      .split(/(?<=[.!?])\s+/)
      .filter(Boolean);
    // Each focus sentence is 1-2 clauses of prose; combining at most two
    // candidates yields at most ~4 sentences of text (2 sentences each).
    expect(sentenceCount.length).toBeLessThanOrEqual(4);
  });

  it('is null when there is nothing worth flagging', () => {
    const result = computeWeeklyNutritionReport(
      baseInput({
        mealQualityRatings: [
          rating('2026-07-13', { hasMeaningfulProtein: true, hasMeaningfulFiber: true }),
          rating('2026-07-14', { hasMeaningfulProtein: true, hasMeaningfulFiber: true }),
          rating('2026-07-15', { hasMeaningfulProtein: true, hasMeaningfulFiber: true }),
        ],
        logEntries: [logEntry('2026-07-16'), logEntry('2026-07-17')],
      })
    );
    if ('insufficientData' in result) throw new Error('expected a generated report');
    expect(result.rootedFocusForNextWeek).toBeNull();
  });
});

describe('computeWeeklyNutritionReport — sections are genuinely conditional, not forced', () => {
  it('produces an empty whatSupportedYou and empty patternsWorthNoticing when signals are all neutral', () => {
    const result = computeWeeklyNutritionReport(
      baseInput({
        mealQualityRatings: [
          rating('2026-07-13', {
            hasMeaningfulProtein: true,
            hasMeaningfulFiber: true,
            addedSugarLevel: 'high',
            processingLevel: 'ultra_processed',
          }),
          rating('2026-07-14', {
            hasMeaningfulProtein: false,
            hasMeaningfulFiber: true,
            addedSugarLevel: 'none',
            processingLevel: 'processed',
          }),
          rating('2026-07-15', {
            hasMeaningfulProtein: true,
            hasMeaningfulFiber: false,
            addedSugarLevel: 'none',
            processingLevel: 'processed',
          }),
        ],
        logEntries: [logEntry('2026-07-16'), logEntry('2026-07-17')],
      })
    );
    if ('insufficientData' in result) throw new Error('expected a generated report');
    expect(result.whatSupportedYou).toEqual([]);
    expect(result.patternsWorthNoticing).toEqual([]);
  });

  it('caps whatSupportedYou and patternsWorthNoticing at 4 items each', () => {
    const result = computeWeeklyNutritionReport(
      baseInput({
        mealQualityRatings: Array.from({ length: 10 }, (_, i) =>
          rating(`2026-07-1${(i % 6) + 3}`, {
            hasMeaningfulProtein: true,
            hasMeaningfulFiber: true,
            addedSugarLevel: 'none',
            processingLevel: 'whole_or_minimally_processed',
          })
        ),
        detectedItems: [
          detectedItem('2026-07-13', 'broccoli', 'vegetable'),
          detectedItem('2026-07-13', 'spinach', 'vegetable'),
          detectedItem('2026-07-14', 'carrots', 'vegetable'),
          detectedItem('2026-07-14', 'apple', 'vegetable'),
          detectedItem('2026-07-15', 'chicken', 'protein'),
          detectedItem('2026-07-15', 'rice', 'carb'),
          detectedItem('2026-07-16', 'salmon', 'protein'),
          detectedItem('2026-07-16', 'quinoa', 'carb'),
        ],
        logEntries: [
          logEntry('2026-07-13', { mealCategory: 'breakfast' }),
          logEntry('2026-07-14', { mealCategory: 'breakfast' }),
          logEntry('2026-07-15', { mealCategory: 'breakfast' }),
        ],
        waterCupsByLocalDate: { '2026-07-13': 8, '2026-07-14': 8, '2026-07-15': 9 },
      })
    );
    if ('insufficientData' in result) throw new Error('expected a generated report');
    expect(result.whatSupportedYou.length).toBeLessThanOrEqual(4);
    expect(result.patternsWorthNoticing.length).toBeLessThanOrEqual(4);
  });
});
