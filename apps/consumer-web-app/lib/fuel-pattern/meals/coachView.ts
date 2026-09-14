/**
 * Rooted Reset Fuel Pattern Assessment, Build 3 — the meal half of what
 * the COACH reads.
 *
 * =====================================================================
 * ITS OWN MODULE, FOR THE REASON EVERY COACH MODULE HERE HAS ONE.
 * =====================================================================
 *
 * Her taker imports the submit action, so anything on that module's
 * import graph is on her screen's import graph. The coach vocabulary for
 * this instrument therefore lives apart from the member vocabulary, and
 * tests/fuel-pattern-member-payload.test.ts walks the real graph from
 * every member surface to prove none of them can reach this file.
 *
 * =====================================================================
 * READ ONLY, AND IT INTERPRETS NOTHING.
 * =====================================================================
 *
 * An allergy is printed as an allergy and a preference as a preference,
 * because she said which, and that is the whole of the difference. There
 * is no severity here, no advice, no suggestion of what to do about any
 * of it, and nothing on this card names a condition. It is a record of
 * what she told the meal cards, in her own terms.
 */

import { fpaMealById } from './library';
import { FPA_MEAL_TYPE_LABEL } from './copy';
import { allergenForExclusion, type FpaExclusionKey } from './preferences';
import type { FpaMealExclusion, FpaMealRejection, FpaMealSave } from './data';
import type { FpaMealType } from './types';
import { FUEL_PATTERN_LABEL } from '../copy';
import type { FuelPattern } from '../types';

/** The five dietary exclusions and the seven allergen ones, in a coach's words. */
const EXCLUSION_LABEL: Record<FpaExclusionKey, string> = {
  vegetarian: 'Vegetarian',
  no_dairy: 'No dairy',
  no_fish: 'No fish',
  no_eggs: 'No eggs',
  no_pork: 'No pork',
  allergen_nuts: 'Nuts',
  allergen_dairy: 'Dairy',
  allergen_eggs: 'Eggs',
  allergen_fish: 'Fish',
  allergen_shellfish: 'Shellfish',
  allergen_gluten: 'Gluten',
  allergen_soy: 'Soy',
};

/** The reason she gave, as she was offered it. */
const REASON_LABEL: Record<string, string> = {
  dislike: 'Does not like this food',
  vegetarian: 'Vegetarian',
  no_dairy: 'No dairy',
  no_fish: 'No fish',
  no_eggs: 'No eggs',
  no_pork: 'No pork',
  allergy: 'Allergy',
  other: 'Other dietary preference',
};

/** Printed where she rejected a meal and skipped the sheet. Not a gap, an answer. */
export const FPA_NO_REASON_GIVEN = 'No reason given';

export type FpaCoachMealPreference = {
  key: FpaExclusionKey;
  label: string;
  /** True when she recorded it as an allergy rather than a preference. */
  isAllergy: boolean;
  /** How it is expressed, so a coach can see whether it reads flags or allergen tags. */
  kind: 'dietary' | 'allergen';
  /** The meal she was looking at when she recorded it, by name, when there was one. */
  sourceMealName: string | null;
  recordedAt: string;
};

export type FpaCoachMealRejection = {
  mealId: string;
  mealName: string;
  mealType: FpaMealType | null;
  mealTypeLabel: string | null;
  reasonLabel: string;
  /** Her own single line, when she left one. Only ever on "Other dietary preference". */
  note: string | null;
  rejectedAt: string;
};

export type FpaCoachSavedMeal = {
  mealId: string;
  mealName: string;
  mealTypeLabel: string | null;
  /** The reading she held when she saved it, which a retake does not change. */
  patternLabel: string;
  savedAt: string;
};

export type FpaCoachMealReading = {
  /** Every standing exclusion, allergies first so the strongest reads first. */
  preferences: FpaCoachMealPreference[];
  /** Every meal she has said she does not eat, newest first. */
  rejections: FpaCoachMealRejection[];
  /** The count is the headline and the names open underneath it. */
  savedCount: number;
  saved: FpaCoachSavedMeal[];
};

export function buildFpaCoachMealReading(input: {
  exclusions: readonly FpaMealExclusion[];
  rejections: readonly FpaMealRejection[];
  saves: readonly FpaMealSave[];
}): FpaCoachMealReading {
  const preferences: FpaCoachMealPreference[] = input.exclusions.map((entry) => {
    const source = entry.sourceMealId ? fpaMealById(entry.sourceMealId) : null;
    return {
      key: entry.key,
      label: EXCLUSION_LABEL[entry.key] ?? entry.key,
      isAllergy: entry.isAllergy,
      kind: allergenForExclusion(entry.key) ? 'allergen' : 'dietary',
      sourceMealName: source?.name ?? null,
      recordedAt: entry.createdAt,
    };
  });

  // Allergies first, then everything else, each group oldest first so the
  // order is the order she recorded them in.
  preferences.sort((a, b) => {
    if (a.isAllergy !== b.isAllergy) return a.isAllergy ? -1 : 1;
    return a.recordedAt.localeCompare(b.recordedAt);
  });

  const rejections: FpaCoachMealRejection[] = [...input.rejections]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((entry) => {
      const meal = fpaMealById(entry.mealId);
      return {
        mealId: entry.mealId,
        // An id whose meal a content edit has removed prints its own id
        // rather than disappearing, so a gap is visible instead of silent.
        mealName: meal?.name ?? entry.mealId,
        mealType: meal?.type ?? null,
        mealTypeLabel: meal ? FPA_MEAL_TYPE_LABEL[meal.type] : null,
        reasonLabel: entry.reason ? REASON_LABEL[entry.reason] ?? entry.reason : FPA_NO_REASON_GIVEN,
        note: entry.note,
        rejectedAt: entry.createdAt,
      };
    });

  const saved: FpaCoachSavedMeal[] = input.saves.map((entry) => {
    const meal = fpaMealById(entry.mealId);
    return {
      mealId: entry.mealId,
      mealName: meal?.name ?? entry.mealId,
      mealTypeLabel: meal ? FPA_MEAL_TYPE_LABEL[meal.type] : null,
      patternLabel: FUEL_PATTERN_LABEL[entry.patternAtSave as FuelPattern] ?? entry.patternAtSave,
      savedAt: entry.createdAt,
    };
  });

  return { preferences, rejections, savedCount: saved.length, saved };
}
