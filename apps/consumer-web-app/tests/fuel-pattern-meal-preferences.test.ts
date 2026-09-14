/**
 * WHAT SHE TOLD US, AND WHAT IT TAKES OFF HER CARDS.
 *
 * Two kinds of no, and the difference between them is the whole subject
 * of this file:
 *
 *   A REJECTION is one meal and it is permanent, whatever reason she gave
 *   and whether or not she gave one.
 *
 *   A STANDING EXCLUSION is a class of food, and it is the only thing on
 *   this feature that can reach across slots, across sessions, across a
 *   retake and across a change of pattern.
 *
 * Also here: the reading of her Food Lens preferences. She has already
 * told that screen whether she is vegetarian and what she is allergic to,
 * and this feature reads that rather than making her say it twice. What
 * the mapping deliberately does NOT read is as important as what it does,
 * so both halves are asserted.
 */

import { describe, it, expect } from 'vitest';
import { FPA_MEALS } from '../lib/fuel-pattern/meals/library';
import {
  FPA_EXCLUSION_KEYS,
  FPA_REJECTION_REASONS,
  allergenForExclusion,
  exclusionForAllergen,
  exclusionForReason,
  exclusionsForAllergyList,
  exclusionsForDietaryPattern,
  isFpaExclusionKey,
  isFpaRejectionReason,
  mealSatisfiesExclusion,
  mealSatisfiesExclusions,
} from '../lib/fuel-pattern/meals/preferences';
import { FPA_ALLERGENS } from '../lib/fuel-pattern/meals/types';

describe('1. an exclusion key knows exactly what it excludes', () => {
  it('lets through only meals carrying the matching flag', () => {
    const pairs = [
      ['vegetarian', 'vegetarian'],
      ['no_dairy', 'dairy_free'],
      ['no_fish', 'fish_free'],
      ['no_eggs', 'egg_free'],
      ['no_pork', 'pork_free'],
    ] as const;
    for (const [key, flag] of pairs) {
      for (const meal of FPA_MEALS) {
        expect(mealSatisfiesExclusion(meal, key), `${meal.id} under ${key}`).toBe(
          meal.flags.includes(flag)
        );
      }
    }
  });

  it('lets through only meals without the matching allergen', () => {
    for (const allergen of FPA_ALLERGENS) {
      const key = exclusionForAllergen(allergen);
      expect(allergenForExclusion(key)).toBe(allergen);
      for (const meal of FPA_MEALS) {
        expect(mealSatisfiesExclusion(meal, key), `${meal.id} under ${key}`).toBe(
          !meal.allergens.includes(allergen)
        );
      }
    }
  });

  it('applies every exclusion she holds, not just the first', () => {
    const meal = FPA_MEALS.find((m) => m.allergens.includes('dairy'))!;
    expect(mealSatisfiesExclusions(meal, ['no_pork'])).toBe(meal.flags.includes('pork_free'));
    expect(mealSatisfiesExclusions(meal, ['no_pork', 'allergen_dairy'])).toBe(false);
  });

  it('excludes nothing for a key it does not recognise, rather than everything', () => {
    // A key added to the database and not to the map must not empty her
    // library in silence. The wrong failure here is the invisible one.
    const unknown = 'no_such_key' as (typeof FPA_EXCLUSION_KEYS)[number];
    expect(isFpaExclusionKey('no_such_key')).toBe(false);
    for (const meal of FPA_MEALS.slice(0, 5)) {
      expect(mealSatisfiesExclusion(meal, unknown)).toBe(true);
    }
  });
});

describe('2. the reason she gives decides what is recorded', () => {
  it('turns exactly the five dietary reasons into a standing exclusion', () => {
    expect(exclusionForReason('vegetarian')).toBe('vegetarian');
    expect(exclusionForReason('no_dairy')).toBe('no_dairy');
    expect(exclusionForReason('no_fish')).toBe('no_fish');
    expect(exclusionForReason('no_eggs')).toBe('no_eggs');
    expect(exclusionForReason('no_pork')).toBe('no_pork');
  });

  it('turns none of the other three into one', () => {
    // Dislike is about this meal. Allergy goes through the allergen tags
    // of the meal she was looking at, which the route decides, not the
    // reason on its own. Other records the rejection and her own line.
    expect(exclusionForReason('dislike')).toBeNull();
    expect(exclusionForReason('allergy')).toBeNull();
    expect(exclusionForReason('other')).toBeNull();
  });

  it('accepts only the eight reasons the sheet offers', () => {
    expect(FPA_REJECTION_REASONS).toHaveLength(8);
    for (const reason of FPA_REJECTION_REASONS) expect(isFpaRejectionReason(reason)).toBe(true);
    expect(isFpaRejectionReason('anything_else')).toBe(false);
  });
});

describe('3. her Food Lens preferences are read, and read narrowly', () => {
  it('reads vegetarian and vegan, which say which foods are off the plate', () => {
    expect(exclusionsForDietaryPattern('vegetarian')).toEqual(['vegetarian']);
    expect(exclusionsForDietaryPattern('vegan').sort()).toEqual(
      ['no_dairy', 'no_eggs', 'vegetarian'].sort()
    );
  });

  it('reads nothing into keto, paleo, mediterranean, pescatarian or omnivore', () => {
    // Those describe how a plate is built rather than which foods are off
    // it. Taking meals away on the strength of one would be taking them
    // away from a member who never asked for that.
    for (const pattern of ['keto', 'paleo', 'mediterranean', 'pescatarian', 'omnivore', null]) {
      expect(exclusionsForDietaryPattern(pattern), String(pattern)).toEqual([]);
    }
  });

  it('matches an allergy list on whole words', () => {
    expect(exclusionsForAllergyList(['peanuts'])).toEqual(['allergen_nuts']);
    expect(exclusionsForAllergyList(['Dairy', 'shellfish']).sort()).toEqual(
      ['allergen_dairy', 'allergen_shellfish'].sort()
    );
    expect(exclusionsForAllergyList(['coeliac disease'])).toEqual(['allergen_gluten']);
  });

  it('matches nothing it does not recognise, because this is a convenience and not the record', () => {
    expect(exclusionsForAllergyList(['kiwi', 'strawberries', ''])).toEqual([]);
    // "nutmeg" contains "nut". Whole word matching is what keeps a spice
    // from taking every nut meal off her cards.
    expect(exclusionsForAllergyList(['nutmeg'])).toEqual([]);
  });
});
