/**
 * Premium Primal Pattern results content — pure data-integrity tests.
 * No Supabase, no rendering: these guard the config layer every premium
 * results component (Prompt 2) reads through
 * (lib/primal-pattern/premium/content.ts), so a future content edit that
 * breaks a structural invariant (a missing result key, a macro split that
 * doesn't sum to 100, a mismatched plate-guide meal count) fails here
 * instead of silently rendering a broken section in production.
 */
import { describe, it, expect } from 'vitest';
import {
  DAILY_PLATE_GUIDE,
  EDUCATION_TOPICS,
  FUEL_BALANCE_BY_RESULT,
  HAND_PORTION_GUIDE,
  MEAL_EXAMPLES_BY_RESULT,
  MEAL_FREQUENCY_OPTIONS,
  NEXT_STEP_CARDS,
  defaultMealFrequencyFor,
} from '../lib/primal-pattern/premium/content';
import type { PrimalPatternResult } from '../lib/primal-pattern/types';

const RESULTS: PrimalPatternResult[] = ['polar', 'variable', 'equatorial'];

describe('FUEL_BALANCE_BY_RESULT', () => {
  it('has an entry for every result', () => {
    for (const result of RESULTS) {
      expect(FUEL_BALANCE_BY_RESULT[result]).toBeDefined();
    }
  });

  it('each result sums to exactly 100 (a readable bar chart depends on this)', () => {
    for (const result of RESULTS) {
      const { protein, fat, carbohydrate } = FUEL_BALANCE_BY_RESULT[result];
      expect(protein + fat + carbohydrate).toBe(100);
      expect(protein).toBeGreaterThan(0);
      expect(fat).toBeGreaterThan(0);
      expect(carbohydrate).toBeGreaterThan(0);
    }
  });
});

describe('DAILY_PLATE_GUIDE', () => {
  it('has an entry for every supported meal frequency, with the matching number of meals', () => {
    for (const option of MEAL_FREQUENCY_OPTIONS) {
      expect(DAILY_PLATE_GUIDE[option]).toHaveLength(option);
    }
  });

  it('every meal has non-empty portion language for all four categories', () => {
    for (const option of MEAL_FREQUENCY_OPTIONS) {
      for (const meal of DAILY_PLATE_GUIDE[option]) {
        expect(meal.label.length).toBeGreaterThan(0);
        expect(meal.proteinPortion.length).toBeGreaterThan(0);
        expect(meal.fatPortion.length).toBeGreaterThan(0);
        expect(meal.carbPortion.length).toBeGreaterThan(0);
        expect(meal.vegetablePortion.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('defaultMealFrequencyFor', () => {
  it('maps the Nutrition Intelligence Service mealFrequency guidance onto a plate-guide default', () => {
    expect(defaultMealFrequencyFor('4_to_5_smaller_meals')).toBe(5);
    expect(defaultMealFrequencyFor('3_to_4_balanced_meals')).toBe(4);
    expect(defaultMealFrequencyFor('3_structured_meals')).toBe(3);
  });

  it('falls back to 3 for not_available or any unrecognized value', () => {
    expect(defaultMealFrequencyFor('not_available')).toBe(3);
    expect(defaultMealFrequencyFor('unexpected_future_value')).toBe(3);
  });
});

describe('HAND_PORTION_GUIDE', () => {
  it('has exactly the four required shapes, each with distinct, non-empty content', () => {
    expect(HAND_PORTION_GUIDE).toHaveLength(4);
    const shapes = HAND_PORTION_GUIDE.map((entry) => entry.shape);
    expect(new Set(shapes).size).toBe(4);
    expect(shapes.sort()).toEqual(['cupped-hand', 'palm', 'thumb', 'two-fists']);

    for (const entry of HAND_PORTION_GUIDE) {
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.represents.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });
});

describe('MEAL_EXAMPLES_BY_RESULT', () => {
  it('has an entry for every result, each with three distinct meal slots', () => {
    for (const result of RESULTS) {
      const meals = MEAL_EXAMPLES_BY_RESULT[result];
      expect(meals).toHaveLength(3);
      expect(new Set(meals.map((m) => m.slot)).size).toBe(3);
      for (const meal of meals) {
        expect(meal.title.length).toBeGreaterThan(0);
        expect(meal.description.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('EDUCATION_TOPICS', () => {
  it('has exactly the five requested topics with unique ids', () => {
    expect(EDUCATION_TOPICS).toHaveLength(5);
    const ids = EDUCATION_TOPICS.map((t) => t.id);
    expect(new Set(ids).size).toBe(5);
    expect(ids.sort()).toEqual(['energy', 'food-quality', 'meal-timing', 'recovery', 'satiety']);
    for (const topic of EDUCATION_TOPICS) {
      expect(topic.title.length).toBeGreaterThan(0);
      expect(topic.summary.length).toBeGreaterThan(0);
      expect(topic.body.length).toBeGreaterThan(0);
    }
  });
});

describe('NEXT_STEP_CARDS', () => {
  it('has exactly the five requested future assessments with unique ids', () => {
    expect(NEXT_STEP_CARDS).toHaveLength(5);
    const ids = NEXT_STEP_CARDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(5);
    expect(ids.sort()).toEqual(['digestion', 'health-history', 'movement', 'sleep', 'stress']);
  });

  it('none are marked available yet, since none of these assessments exist', () => {
    for (const card of NEXT_STEP_CARDS) {
      expect(card.status).toBe('coming_soon');
    }
  });
});

describe('member-facing content contains no em dash characters', () => {
  it('checks every string field across the premium content config', () => {
    const haystacks: string[] = [
      ...Object.values(FUEL_BALANCE_BY_RESULT).flatMap((b) => [
        String(b.protein),
        String(b.fat),
        String(b.carbohydrate),
      ]),
      ...Object.values(DAILY_PLATE_GUIDE)
        .flat()
        .flatMap((m) => Object.values(m)),
      ...HAND_PORTION_GUIDE.flatMap((e) => [e.title, e.represents, e.description]),
      ...Object.values(MEAL_EXAMPLES_BY_RESULT)
        .flat()
        .flatMap((m) => [m.slot, m.title, m.description]),
      ...EDUCATION_TOPICS.flatMap((t) => [t.title, t.summary, t.body]),
      ...NEXT_STEP_CARDS.flatMap((c) => [c.title, c.description]),
    ];

    for (const value of haystacks) {
      expect(value).not.toContain('—');
    }
  });
});
