/**
 * Rooted Reset Fuel Pattern Assessment, Build 3 — the meal payload her
 * screen is handed, and the fence around it.
 *
 * =====================================================================
 * THE SAME FENCE BUILD 2 BUILT, EXTENDED RATHER THAN REOPENED.
 * =====================================================================
 *
 * lib/fuel-pattern/memberResult.ts hands her screen a two field object so
 * a component cannot print a score it was never given. The meal layer
 * needs rows of its own, so it gets a second object built here, under the
 * same rule: everything in it is something a member may read. There is no
 * score here, no confidence, no tendency, and nothing from
 * lib/fuel-pattern/coachCopy.ts or any meal coach module is reachable
 * from this file. tests/fuel-pattern-member-payload.test.ts walks the
 * real import graph and proves it.
 *
 * =====================================================================
 * THE WHOLE THING IS BUILT BEFORE THE COMPONENT MOUNTS.
 * =====================================================================
 *
 * Build 2's result screen holds because everything it draws is already in
 * its props: no fetch, no Server Action, no router call. The meal section
 * joins that screen, so it obeys the same rule. Her four cards AND every
 * candidate that could replace them are computed here, on the server, and
 * handed down together. Tapping Show me another then runs the same pure
 * picker in her browser over props it already has, and tells the server
 * afterwards through a route handler, which returns a few bytes of JSON
 * rather than a re-rendered route.
 *
 * READS ONLY. Building this payload writes nothing. The slot rows it
 * reads were written by taps, and nothing is written on a first draw at
 * all: the four cards are chosen deterministically from rows that
 * already exist. A render never decides anything.
 *
 * THE SHAPES IT BUILDS LIVE NEXT DOOR, in ./payload.ts, and that split is
 * load bearing rather than tidy: this file reaches a database and her
 * meal cards are client components. See the header of that file.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { fpaMealById } from './library';
import {
  listFpaMealExclusions,
  listFpaMealRejections,
  listFpaMealSaves,
  listFpaSlotStates,
  resolveFpaExclusionKeys,
} from './data';
import {
  orderedOwnPool,
  orderedWiderPool,
  pickSlotMeal,
  type FpaMealFilter,
  type FpaSlotState,
} from './selection';
import { FPA_MEAL_TYPES } from './types';
import type { FuelPattern } from '../types';
import type { FpaMealsPayload, FpaSavedMealEntry } from './payload';

export type {
  FpaMealSlotPayload,
  FpaMealsPayload,
  FpaSavedMealEntry,
} from './payload';
export { fpaWhyItFits } from './payload';

export async function buildFpaMealsPayload(
  supabase: SupabaseClient,
  memberId: string,
  pattern: FuelPattern
): Promise<FpaMealsPayload> {
  const [ownExclusions, rejections, saves, slotRows] = await Promise.all([
    listFpaMealExclusions(supabase, memberId),
    listFpaMealRejections(supabase, memberId),
    listFpaMealSaves(supabase, memberId),
    listFpaSlotStates(supabase, memberId),
  ]);

  const exclusions = await resolveFpaExclusionKeys(supabase, memberId, ownExclusions);
  const rejectedMealIds = rejections.map((row) => row.mealId);
  const filter: FpaMealFilter = { rejectedMealIds, exclusions };

  const slots = FPA_MEAL_TYPES.map((type) => {
    const ownPool = orderedOwnPool(pattern, type, memberId);
    const widerPool = orderedWiderPool(pattern, type);

    // A stored slot belonging to a reading she no longer has starts again.
    // Her saves and her exclusions survive a retake; a half rotated slot
    // through a set she is no longer being offered does not.
    const stored = slotRows.find((row) => row.mealType === type);
    const state: FpaSlotState | undefined =
      stored && stored.pattern === pattern
        ? { currentMealId: stored.currentMealId, shownMealIds: stored.shownMealIds }
        : undefined;

    const pick = pickSlotMeal({ ownPool, widerPool, filter, state, advance: false });

    return {
      type,
      ownPool,
      widerPool,
      state: pick.state,
      mealId: pick.meal?.id ?? null,
      widened: pick.widened,
    };
  });

  return {
    pattern,
    slots,
    rejectedMealIds,
    exclusions,
    savedMealIds: saves.map((row) => row.mealId),
  };
}


/**
 * Her saved meals, in the order she saved them, newest first.
 *
 * SHE KEEPS THEM THROUGH A RETAKE, AND THROUGH A CHANGE OF READING. A
 * meal saved under a pattern she no longer holds is still hers, so it
 * stays in the collection and carries a quiet label saying where it came
 * from. Dropping it would be deciding on her behalf that a retake
 * invalidates something she deliberately kept.
 *
 * A saved id that no longer names a meal, which can only happen after a
 * content edit removed one, is skipped rather than drawn as a blank card.
 */
export async function buildFpaSavedMeals(
  supabase: SupabaseClient,
  memberId: string,
  currentPattern: FuelPattern | null
): Promise<FpaSavedMealEntry[]> {
  const saves = await listFpaMealSaves(supabase, memberId);
  const entries: FpaSavedMealEntry[] = [];
  for (const save of saves) {
    const meal = fpaMealById(save.mealId);
    if (!meal) continue;
    entries.push({
      meal,
      patternAtSave: save.patternAtSave,
      fromAnotherPattern: currentPattern !== null && save.patternAtSave !== currentPattern,
    });
  }
  return entries;
}
