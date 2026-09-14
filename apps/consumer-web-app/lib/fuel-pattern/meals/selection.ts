/**
 * Rooted Reset Fuel Pattern Assessment, Build 3 — which meal stands in
 * each slot, and which one replaces it.
 *
 * =====================================================================
 * PURE, AND THE SAME FUNCTION ON BOTH SIDES.
 * =====================================================================
 *
 * Nothing in this file reaches a database, a clock or a random number.
 * It takes the library, her exclusions, her rejections and the state of
 * one slot, and returns a meal. The server calls it to build the four
 * cards she meets, and her own browser calls the very same function when
 * she taps Show me another, so a replacement chosen without a round trip
 * cannot differ from one the server would have chosen. That also keeps
 * rotation off the Server Action path entirely, which is what stops a
 * tap on a meal card from re-rendering the result page underneath the
 * reveal she is reading.
 *
 * =====================================================================
 * THE ORDER THE RULES ARE APPLIED IN, AND WHY IT IS THAT ORDER.
 * =====================================================================
 *
 *   1. Same meal type and same pattern. Rotation never crosses either.
 *   2. Never a meal she rejected, whatever reason she gave or did not.
 *   3. Never a meal that breaks a standing exclusion.
 *   4. Prefer a meal she has not been shown in this slot yet, so all six
 *      appear before any one of them appears twice.
 *
 * When those four leave nothing, rule 4 is the only one that gives way:
 * the slot forgets what it has shown and starts the six again. Rules 2
 * and 3 never give way, because a meal she has told us she does not eat
 * is not a fallback, it is the thing she asked us not to do.
 *
 * If her exclusions empty the set even so, the slot widens to the same
 * meal type in the nearest neighbouring pattern, still under rules 2 and
 * 3, and the card says plainly which pattern that meal came from. And if
 * that is empty too, the slot returns nothing and draws its own honest
 * line rather than a meal that breaks a rule.
 *
 * The library is authored so that the five dietary exclusions together
 * can never empty a set on their own: every set of six holds a meal that
 * carries all five flags. tests/fuel-pattern-meal-library.test.ts proves
 * it, so the widening path exists for allergies and for a member who has
 * rejected a great many meals by hand.
 */

import { FPA_MEALS } from './library';
import { mealSatisfiesExclusions, type FpaExclusionKey } from './preferences';
import type { FpaMeal, FpaMealPattern, FpaMealType } from './types';
import type { FuelPattern } from '../types';

/**
 * Which authored set a reading reads. Flexible Fuel reads the balanced
 * set, which is the one place the four readings become three.
 */
export function mealPatternFor(pattern: FuelPattern): FpaMealPattern {
  return pattern === 'flexible_fuel' ? 'balanced_fuel' : pattern;
}

/**
 * The order the sets are tried in when one has to widen. Balanced sits
 * between the other two, so it is the nearest neighbour of both and each
 * of the other two is the other's last resort.
 */
const PATTERN_ORDER: Record<FpaMealPattern, FpaMealPattern[]> = {
  protein_supportive: ['protein_supportive', 'balanced_fuel', 'carb_supportive'],
  balanced_fuel: ['balanced_fuel', 'protein_supportive', 'carb_supportive'],
  carb_supportive: ['carb_supportive', 'balanced_fuel', 'protein_supportive'],
};

/** Every meal of one type in one set, in authored order. */
export function mealsForSlot(mealPattern: FpaMealPattern, type: FpaMealType): FpaMeal[] {
  return FPA_MEALS.filter((meal) => meal.pattern === mealPattern && meal.type === type);
}

export type FpaMealFilter = {
  /** Meal ids she has said she does not eat. Permanent. */
  rejectedMealIds: readonly string[];
  /** Her standing exclusions, dietary and allergen alike. Permanent. */
  exclusions: readonly FpaExclusionKey[];
};

export type FpaSlotState = {
  /** The meal on the card right now, or null before the first choice. */
  currentMealId: string | null;
  /** Every meal this slot has already put on the card, oldest first. */
  shownMealIds: string[];
};

export type FpaSlotPick = {
  meal: FpaMeal | null;
  /** The slot state to persist after this pick. */
  state: FpaSlotState;
  /**
   * True when the meal came from a set other than hers, which only
   * happens once her own set holds nothing she eats. The card says so.
   */
  widened: boolean;
};

const EMPTY_SLOT: FpaSlotState = { currentMealId: null, shownMealIds: [] };

function allowed(meal: FpaMeal, filter: FpaMealFilter): boolean {
  if (filter.rejectedMealIds.includes(meal.id)) return false;
  return mealSatisfiesExclusions(meal, filter.exclusions);
}

/**
 * A stable starting point per member, so two members with the same
 * reading do not open the same four cards, and so one member opening her
 * own result twice does.
 *
 * THE SEED NEVER LEAVES THE SERVER. The ordered pool is what the browser
 * is handed, not the thing it was ordered by, so her own identifier is
 * not sitting in the props of a page anyone can read over her shoulder.
 */
function offsetFor(seed: string, length: number): number {
  if (length <= 0) return 0;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(hash) % length;
}

/** The six of her own set, rotated to her own starting point. Server side. */
export function orderedOwnPool(
  pattern: FuelPattern,
  type: FpaMealType,
  memberSeed: string
): FpaMeal[] {
  const pool = mealsForSlot(mealPatternFor(pattern), type);
  const offset = offsetFor(`${memberSeed}:${type}`, pool.length);
  return [...pool.slice(offset), ...pool.slice(0, offset)];
}

/** Every meal of this type outside her own set, nearest neighbour first. */
export function orderedWiderPool(pattern: FuelPattern, type: FpaMealType): FpaMeal[] {
  return PATTERN_ORDER[mealPatternFor(pattern)]
    .slice(1)
    .flatMap((other) => mealsForSlot(other, type));
}

/**
 * The next meal for one slot.
 *
 * `advance` is false when the slot is simply being drawn (she opened the
 * page) and true when she asked for a different one. Drawing keeps the
 * meal that is already there as long as it is still allowed, so coming
 * back to her results is not a reshuffle; asking moves on.
 */
export function pickSlotMeal(input: {
  /** Her own set for this slot, already in her own order. */
  ownPool: readonly FpaMeal[];
  /** The same meal type in the neighbouring sets, nearest first. */
  widerPool: readonly FpaMeal[];
  filter: FpaMealFilter;
  state?: FpaSlotState | undefined;
  advance: boolean;
}): FpaMealPick {
  const state = input.state ?? EMPTY_SLOT;
  const compliant = input.ownPool.filter((meal) => allowed(meal, input.filter));

  // Drawing the page: keep what is already on the card when it still stands.
  if (!input.advance && state.currentMealId) {
    const held = compliant.find((meal) => meal.id === state.currentMealId);
    if (held) {
      return {
        meal: held,
        state: { currentMealId: held.id, shownMealIds: withShown(state.shownMealIds, held.id) },
        widened: false,
      };
    }
  }

  if (compliant.length > 0) {
    const seen = new Set(state.shownMealIds);
    if (state.currentMealId) seen.add(state.currentMealId);

    const fresh = compliant.filter((meal) => !seen.has(meal.id));
    const next = fresh[0];
    if (next) {
      return {
        meal: next,
        state: { currentMealId: next.id, shownMealIds: withShown(state.shownMealIds, next.id) },
        widened: false,
      };
    }

    // All six have been seen. This is the ONLY rule that relaxes: the
    // slot starts the six again rather than reaching for a meal she has
    // told us she does not eat.
    const restart = compliant.find((meal) => meal.id !== state.currentMealId) ?? compliant[0];
    if (!restart) return emptyPick(state);
    return {
      meal: restart,
      state: { currentMealId: restart.id, shownMealIds: [restart.id] },
      widened: false,
    };
  }

  // Her own set holds nothing she eats. Widen, still under her rules.
  const wider = input.widerPool.filter((meal) => allowed(meal, input.filter));
  const seen = new Set(state.shownMealIds);
  if (input.advance && state.currentMealId) seen.add(state.currentMealId);
  const widenedPick = wider.find((meal) => !seen.has(meal.id)) ?? wider[0];
  if (widenedPick) {
    return {
      meal: widenedPick,
      state: {
        currentMealId: widenedPick.id,
        shownMealIds: withShown(state.shownMealIds, widenedPick.id),
      },
      widened: true,
    };
  }

  return emptyPick(state);
}

/** Nothing is left that she eats. The slot draws its own honest line. */
function emptyPick(state: FpaSlotState): FpaSlotPick {
  return {
    meal: null,
    state: { currentMealId: null, shownMealIds: state.shownMealIds },
    widened: false,
  };
}

export type FpaMealPick = FpaSlotPick;

function withShown(shown: readonly string[], id: string): string[] {
  return shown.includes(id) ? [...shown] : [...shown, id];
}
