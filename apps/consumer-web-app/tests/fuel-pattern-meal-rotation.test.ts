/**
 * SHOW ME ANOTHER, and the four rules it obeys in the order it obeys
 * them.
 *
 *   1. Same meal type, same pattern. Rotation never crosses either.
 *   2. Never a meal she rejected.
 *   3. Never a meal a standing exclusion covers.
 *   4. All six before any repeat.
 *
 * And the one that matters most when they conflict: WHEN THE FOUR LEAVE
 * NOTHING, ONLY THE FOURTH GIVES WAY. A slot that has shown everything
 * starts the six again. A slot whose preferences have emptied it widens
 * to a neighbouring set, still under rules two and three. A slot with
 * nothing left anywhere returns nothing rather than a meal she declined.
 *
 * The engine is pure, so every one of those is a property of a return
 * value and is asserted directly rather than through a screen.
 */

import { describe, it, expect } from 'vitest';
import { FPA_MEALS } from '../lib/fuel-pattern/meals/library';
import {
  mealPatternFor,
  mealsForSlot,
  orderedOwnPool,
  orderedWiderPool,
  pickSlotMeal,
  type FpaMealFilter,
  type FpaSlotState,
} from '../lib/fuel-pattern/meals/selection';
import { FPA_MEAL_TYPES, type FpaMealType } from '../lib/fuel-pattern/meals/types';
import type { FuelPattern } from '../lib/fuel-pattern/types';

const PATTERNS: FuelPattern[] = [
  'protein_supportive',
  'balanced_fuel',
  'carb_supportive',
  'flexible_fuel',
];

const NO_FILTER: FpaMealFilter = { rejectedMealIds: [], exclusions: [] };

/** Tap Show me another `times` times and return every meal it produced, in order. */
function rotate(
  pattern: FuelPattern,
  type: FpaMealType,
  times: number,
  filter: FpaMealFilter = NO_FILTER,
  seed = 'member-under-test'
): string[] {
  const ownPool = orderedOwnPool(pattern, type, seed);
  const widerPool = orderedWiderPool(pattern, type);
  let state: FpaSlotState | undefined;
  const seen: string[] = [];

  const first = pickSlotMeal({ ownPool, widerPool, filter, state, advance: false });
  if (first.meal) seen.push(first.meal.id);
  state = first.state;

  for (let i = 0; i < times; i += 1) {
    const next = pickSlotMeal({ ownPool, widerPool, filter, state, advance: true });
    if (next.meal) seen.push(next.meal.id);
    state = next.state;
  }
  return seen;
}

describe('1. it never crosses a meal type or a pattern', () => {
  it('answers only with meals of the slot it was asked about', () => {
    for (const pattern of PATTERNS) {
      for (const type of FPA_MEAL_TYPES) {
        const mealPattern = mealPatternFor(pattern);
        for (const id of rotate(pattern, type, 10)) {
          const meal = FPA_MEALS.find((m) => m.id === id)!;
          expect(meal.type, `${pattern}/${type}`).toBe(type);
          expect(meal.pattern, `${pattern}/${type}`).toBe(mealPattern);
        }
      }
    }
  });

  it('reads the Balanced Fuel set for a Flexible Fuel member', () => {
    expect(mealPatternFor('flexible_fuel')).toBe('balanced_fuel');
    for (const id of rotate('flexible_fuel', 'dinner', 8)) {
      expect(FPA_MEALS.find((m) => m.id === id)!.pattern).toBe('balanced_fuel');
    }
  });
});

describe('2. all six before any repeat', () => {
  it('cycles through the whole set of six and only then starts again', () => {
    for (const pattern of PATTERNS) {
      for (const type of FPA_MEAL_TYPES) {
        const order = rotate(pattern, type, 5);
        expect(order, `${pattern}/${type}`).toHaveLength(6);
        expect(new Set(order).size, `${pattern}/${type} repeated inside six`).toBe(6);
        expect(new Set(order), `${pattern}/${type}`).toEqual(
          new Set(mealsForSlot(mealPatternFor(pattern), type).map((meal) => meal.id))
        );
      }
    }
  });

  it('starts the six again on the seventh tap rather than stopping', () => {
    const order = rotate('balanced_fuel', 'lunch', 8);
    expect(order).toHaveLength(9);
    // The seventh is one of the six, and it is not the one before it.
    expect(order[6]).not.toBe(order[5]);
    expect(new Set(order.slice(0, 6)).has(order[6]!)).toBe(true);
  });

  it('comes back to the same meal rather than reshuffling when the page is simply redrawn', () => {
    const ownPool = orderedOwnPool('balanced_fuel', 'dinner', 'member-under-test');
    const widerPool = orderedWiderPool('balanced_fuel', 'dinner');
    const first = pickSlotMeal({ ownPool, widerPool, filter: NO_FILTER, advance: false });
    const second = pickSlotMeal({
      ownPool,
      widerPool,
      filter: NO_FILTER,
      state: first.state,
      advance: false,
    });
    expect(second.meal?.id).toBe(first.meal?.id);
  });

  it('gives two members with the same reading different starting cards', () => {
    const starts = new Set(
      ['member-a', 'member-b', 'member-c', 'member-d', 'member-e', 'member-f'].map(
        (seed) => rotate('balanced_fuel', 'breakfast', 0, NO_FILTER, seed)[0]
      )
    );
    expect(starts.size).toBeGreaterThan(1);
  });
});

describe('3. a rejected meal never comes back', () => {
  it('leaves out every rejected id, however many taps it takes', () => {
    const rejected = mealsForSlot('balanced_fuel', 'lunch')
      .slice(0, 3)
      .map((meal) => meal.id);
    const order = rotate('balanced_fuel', 'lunch', 12, { rejectedMealIds: rejected, exclusions: [] });
    expect(order.length).toBeGreaterThan(0);
    for (const id of order) expect(rejected, id).not.toContain(id);
  });
});

describe('4. a standing exclusion is never relaxed', () => {
  it('stops showing dairy once No dairy is recorded, in every slot of every pattern', () => {
    for (const pattern of PATTERNS) {
      for (const type of FPA_MEAL_TYPES) {
        const order = rotate(pattern, type, 12, {
          rejectedMealIds: [],
          exclusions: ['no_dairy'],
        });
        expect(order.length, `${pattern}/${type}`).toBeGreaterThan(0);
        for (const id of order) {
          const meal = FPA_MEALS.find((m) => m.id === id)!;
          expect(meal.flags, `${meal.id} surfaced under No dairy`).toContain('dairy_free');
        }
      }
    }
  });

  it('honours all five dietary exclusions at once and still finds a meal for every slot', () => {
    for (const pattern of PATTERNS) {
      for (const type of FPA_MEAL_TYPES) {
        const order = rotate(pattern, type, 8, {
          rejectedMealIds: [],
          exclusions: ['vegetarian', 'no_dairy', 'no_eggs', 'no_fish', 'no_pork'],
        });
        expect(order.length, `${pattern}/${type} emptied by preferences`).toBeGreaterThan(0);
        for (const id of order) {
          const meal = FPA_MEALS.find((m) => m.id === id)!;
          for (const flag of ['vegetarian', 'dairy_free', 'egg_free', 'fish_free', 'pork_free']) {
            expect(meal.flags, `${meal.id} broke ${flag}`).toContain(flag);
          }
        }
      }
    }
  });

  it('keeps an allergen off every card once it is recorded', () => {
    const order = rotate('protein_supportive', 'snack', 12, {
      rejectedMealIds: [],
      exclusions: ['allergen_nuts', 'allergen_dairy'],
    });
    for (const id of order) {
      const meal = FPA_MEALS.find((m) => m.id === id)!;
      expect(meal.allergens, meal.id).not.toContain('nuts');
      expect(meal.allergens, meal.id).not.toContain('dairy');
    }
  });
});

describe('5. when the rules leave nothing', () => {
  it('widens to a neighbouring set rather than breaking a preference', () => {
    const type: FpaMealType = 'dinner';
    const ownPool = orderedOwnPool('protein_supportive', type, 'member-under-test');
    const widerPool = orderedWiderPool('protein_supportive', type);
    // Every meal in her own set declined by hand. Her preferences are empty,
    // so the neighbouring sets still hold things she eats.
    const filter: FpaMealFilter = {
      rejectedMealIds: ownPool.map((meal) => meal.id),
      exclusions: [],
    };
    const pick = pickSlotMeal({ ownPool, widerPool, filter, advance: false });
    expect(pick.meal).not.toBeNull();
    expect(pick.widened).toBe(true);
    expect(pick.meal!.type).toBe(type);
    expect(pick.meal!.pattern).not.toBe('protein_supportive');
  });

  it('answers with nothing at all rather than a meal she declined', () => {
    const type: FpaMealType = 'snack';
    const ownPool = orderedOwnPool('carb_supportive', type, 'member-under-test');
    const widerPool = orderedWiderPool('carb_supportive', type);
    const filter: FpaMealFilter = {
      rejectedMealIds: FPA_MEALS.filter((meal) => meal.type === type).map((meal) => meal.id),
      exclusions: [],
    };
    const pick = pickSlotMeal({ ownPool, widerPool, filter, advance: false });
    expect(pick.meal).toBeNull();
    expect(pick.widened).toBe(false);
  });

  it('drops a held meal that a new preference now excludes', () => {
    const ownPool = orderedOwnPool('balanced_fuel', 'snack', 'member-under-test');
    const widerPool = orderedWiderPool('balanced_fuel', 'snack');
    const dairy = ownPool.find((meal) => meal.allergens.includes('dairy'))!;
    const pick = pickSlotMeal({
      ownPool,
      widerPool,
      filter: { rejectedMealIds: [], exclusions: ['allergen_dairy'] },
      state: { currentMealId: dairy.id, shownMealIds: [dairy.id] },
      advance: false,
    });
    expect(pick.meal!.id).not.toBe(dairy.id);
    expect(pick.meal!.allergens).not.toContain('dairy');
  });
});
