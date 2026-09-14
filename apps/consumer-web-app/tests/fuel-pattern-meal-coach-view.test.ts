/**
 * WHAT THE COACH READS ABOUT HER MEALS.
 *
 * Three things, and the difference between the first two is the point of
 * the block:
 *
 *   A STANDING PREFERENCE is a fact about her. An allergy is one too, and
 *   it is marked as one, because she said which. Nothing else separates
 *   them: they exclude exactly as hard.
 *   A REJECTION is one meal, with the reason she gave or a plain
 *   statement that she gave none. "No reason given" is an answer she
 *   really gave and is printed as one rather than left blank.
 *   THE SAVES are a count, with the names behind it.
 *
 * IT INTERPRETS NOTHING. There is no severity, no advice and no condition
 * named anywhere in what this builder produces, and the last test in this
 * file is what keeps it that way.
 */

import { describe, it, expect } from 'vitest';
import {
  FPA_NO_REASON_GIVEN,
  buildFpaCoachMealReading,
} from '../lib/fuel-pattern/meals/coachView';
import { fpaMealById } from '../lib/fuel-pattern/meals/library';

const EXCLUSIONS = [
  { key: 'no_dairy' as const, isAllergy: false, sourceMealId: 'bf-snack-2', createdAt: '2026-09-10T09:00:00.000Z' },
  { key: 'allergen_nuts' as const, isAllergy: true, sourceMealId: 'bf-snack-1', createdAt: '2026-09-11T09:00:00.000Z' },
];

const REJECTIONS = [
  { mealId: 'bf-lunch-2', reason: 'dislike' as const, note: null, createdAt: '2026-09-09T09:00:00.000Z' },
  { mealId: 'bf-dinner-3', reason: null, note: null, createdAt: '2026-09-12T09:00:00.000Z' },
  { mealId: 'bf-dinner-6', reason: 'other' as const, note: 'Not on a weeknight', createdAt: '2026-09-08T09:00:00.000Z' },
];

const SAVES = [
  { mealId: 'bf-breakfast-1', patternAtSave: 'balanced_fuel' as const, createdAt: '2026-09-12T10:00:00.000Z' },
  { mealId: 'ps-dinner-2', patternAtSave: 'protein_supportive' as const, createdAt: '2026-08-20T10:00:00.000Z' },
];

const reading = buildFpaCoachMealReading({
  exclusions: EXCLUSIONS,
  rejections: REJECTIONS,
  saves: SAVES,
});

describe('1. standing preferences', () => {
  it('names each one in plain language and marks the allergy as an allergy', () => {
    const nuts = reading.preferences.find((p) => p.key === 'allergen_nuts')!;
    const dairy = reading.preferences.find((p) => p.key === 'no_dairy')!;
    expect(nuts.label).toBe('Nuts');
    expect(nuts.isAllergy).toBe(true);
    expect(nuts.kind).toBe('allergen');
    expect(dairy.label).toBe('No dairy');
    expect(dairy.isAllergy).toBe(false);
    expect(dairy.kind).toBe('dietary');
  });

  it('puts allergies first, so the strongest reads first', () => {
    expect(reading.preferences[0]!.isAllergy).toBe(true);
  });

  it('says which meal she was looking at when she recorded it', () => {
    const dairy = reading.preferences.find((p) => p.key === 'no_dairy')!;
    expect(dairy.sourceMealName).toBe(fpaMealById('bf-snack-2')!.name);
  });
});

describe('2. the meals she declined', () => {
  it('lists them newest first, by name and by part of the day', () => {
    expect(reading.rejections.map((r) => r.mealId)).toEqual([
      'bf-dinner-3',
      'bf-lunch-2',
      'bf-dinner-6',
    ]);
    expect(reading.rejections[1]!.mealName).toBe(fpaMealById('bf-lunch-2')!.name);
    expect(reading.rejections[1]!.mealTypeLabel).toBe('LUNCH');
  });

  it('says plainly that she gave no reason rather than leaving it blank', () => {
    const skipped = reading.rejections.find((r) => r.mealId === 'bf-dinner-3')!;
    expect(skipped.reasonLabel).toBe(FPA_NO_REASON_GIVEN);
    expect(skipped.note).toBeNull();
  });

  it('carries her own line through when she left one', () => {
    const other = reading.rejections.find((r) => r.mealId === 'bf-dinner-6')!;
    expect(other.reasonLabel).toBe('Other dietary preference');
    expect(other.note).toBe('Not on a weeknight');
  });

  it('prints an id whose meal a content edit removed, rather than dropping the row', () => {
    const gone = buildFpaCoachMealReading({
      exclusions: [],
      rejections: [
        { mealId: 'a-meal-that-no-longer-exists', reason: 'dislike', note: null, createdAt: '2026-09-09T09:00:00.000Z' },
      ],
      saves: [],
    });
    expect(gone.rejections).toHaveLength(1);
    expect(gone.rejections[0]!.mealName).toBe('a-meal-that-no-longer-exists');
    expect(gone.rejections[0]!.mealTypeLabel).toBeNull();
  });
});

describe('3. the saves', () => {
  it('counts them and names them, each under the reading she held when she saved it', () => {
    expect(reading.savedCount).toBe(2);
    const older = reading.saved.find((s) => s.mealId === 'ps-dinner-2')!;
    expect(older.mealName).toBe(fpaMealById('ps-dinner-2')!.name);
    expect(older.patternLabel).toBe('Protein-Supportive');
  });

  it('is empty and countable when she has saved nothing', () => {
    const none = buildFpaCoachMealReading({ exclusions: [], rejections: [], saves: [] });
    expect(none.savedCount).toBe(0);
    expect(none.saved).toEqual([]);
  });
});

describe('4. it interprets nothing', () => {
  it('names no condition, no severity and no advice anywhere in what it produces', () => {
    const serialized = JSON.stringify(reading).toLowerCase();
    for (const word of [
      'severe',
      'mild',
      'intolerance',
      'diagnos',
      'anaphyla',
      'consult',
      'medical',
      'symptom',
      'risk',
      'should',
    ]) {
      expect(serialized, word).not.toContain(word);
    }
  });
});
