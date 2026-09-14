/**
 * THE SEVENTY TWO MEALS, checked against the rules they were written to.
 *
 * WHY THIS FILE EXISTS AT ALL. The library is content, and content is the
 * one part of a build that nothing else fails on: a meal tagged
 * dairy-free that has yogurt in it does not break a render, it just shows
 * a member something she asked us not to show her. So the rules the
 * meals were authored to are asserted here, meal by meal and set by set,
 * rather than trusted.
 *
 *   1. THE SHAPE. Three patterns by four meal types by six, unique ids,
 *      unique names.
 *   2. COVERAGE INSIDE EVERY SET OF SIX. At least two vegetarian, two
 *      dairy free, two egg free, four pork free, and fish in no more than
 *      two.
 *   3. THE RULE THAT KEEPS ROTATION HONEST. Every set of six holds at
 *      least one meal carrying all five flags, so the five dietary
 *      exclusions together can never empty a slot. The rotation engine
 *      leans on this, and without it the only ways out would be showing
 *      her something she declined or showing her nothing.
 *   4. THE FLAGS AGREE WITH THE ALLERGENS. A meal cannot be dairy free
 *      and carry a dairy allergen, and a vegetarian meal cannot contain
 *      fish or pork.
 *   5. THE COPY. No em dash, no digit, none of the eight banned words,
 *      and prep times that are honest about what a snack is.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { FPA_MEALS, fpaMealById } from '../lib/fuel-pattern/meals/library';
import {
  FPA_ALLERGENS,
  FPA_DIETARY_FLAGS,
  FPA_MEAL_PATTERNS,
  FPA_MEAL_TYPES,
  type FpaMeal,
} from '../lib/fuel-pattern/meals/types';

const ALL_FIVE = [...FPA_DIETARY_FLAGS];

function setsOfSix(): Array<{ key: string; meals: FpaMeal[] }> {
  const sets: Array<{ key: string; meals: FpaMeal[] }> = [];
  for (const pattern of FPA_MEAL_PATTERNS) {
    for (const type of FPA_MEAL_TYPES) {
      sets.push({
        key: `${pattern}/${type}`,
        meals: FPA_MEALS.filter((meal) => meal.pattern === pattern && meal.type === type),
      });
    }
  }
  return sets;
}

describe('1. the shape of the library', () => {
  it('holds three patterns by four meal types by six meals', () => {
    expect(FPA_MEALS).toHaveLength(72);
    for (const set of setsOfSix()) {
      expect(set.meals.length, set.key).toBe(6);
    }
  });

  it('gives every meal its own id and its own name', () => {
    expect(new Set(FPA_MEALS.map((meal) => meal.id)).size).toBe(72);
    expect(new Set(FPA_MEALS.map((meal) => meal.name)).size).toBe(72);
  });

  it('finds a meal by id, and answers null for one that is not there', () => {
    expect(fpaMealById('ps-breakfast-1')?.name).toBeTypeOf('string');
    expect(fpaMealById('a-meal-a-content-edit-removed')).toBeNull();
  });
});

describe('2. dietary coverage inside every set of six', () => {
  it('carries at least two vegetarian, two dairy free, two egg free and four pork free', () => {
    for (const set of setsOfSix()) {
      const count = (flag: (typeof FPA_DIETARY_FLAGS)[number]) =>
        set.meals.filter((meal) => meal.flags.includes(flag)).length;
      expect(count('vegetarian'), `${set.key} vegetarian`).toBeGreaterThanOrEqual(2);
      expect(count('dairy_free'), `${set.key} dairy free`).toBeGreaterThanOrEqual(2);
      expect(count('egg_free'), `${set.key} egg free`).toBeGreaterThanOrEqual(2);
      expect(count('pork_free'), `${set.key} pork free`).toBeGreaterThanOrEqual(4);
    }
  });

  it('puts fish in no more than two of any six', () => {
    for (const set of setsOfSix()) {
      const withFish = set.meals.filter((meal) => !meal.flags.includes('fish_free')).length;
      expect(withFish, `${set.key} fish`).toBeLessThanOrEqual(2);
    }
  });
});

describe('3. the rule the rotation engine leans on', () => {
  it('holds at least one meal carrying all five flags in every set of six', () => {
    for (const set of setsOfSix()) {
      const universal = set.meals.filter((meal) =>
        ALL_FIVE.every((flag) => meal.flags.includes(flag))
      );
      expect(universal.length, `${set.key} has no meal that satisfies every dietary preference`)
        .toBeGreaterThanOrEqual(1);
    }
  });
});

describe('4. the flags and the allergens agree', () => {
  it('never marks a meal free of something it contains', () => {
    for (const meal of FPA_MEALS) {
      if (meal.allergens.includes('dairy')) expect(meal.flags, meal.id).not.toContain('dairy_free');
      if (meal.allergens.includes('eggs')) expect(meal.flags, meal.id).not.toContain('egg_free');
      if (meal.allergens.includes('fish')) expect(meal.flags, meal.id).not.toContain('fish_free');
    }
  });

  it('never calls a meal vegetarian while it holds fish or pork', () => {
    for (const meal of FPA_MEALS) {
      if (!meal.flags.includes('vegetarian')) continue;
      expect(meal.flags, `${meal.id} vegetarian but not fish free`).toContain('fish_free');
      expect(meal.flags, `${meal.id} vegetarian but not pork free`).toContain('pork_free');
    }
  });

  it('uses only the flags and allergens the vocabulary holds', () => {
    for (const meal of FPA_MEALS) {
      for (const flag of meal.flags) expect(FPA_DIETARY_FLAGS, meal.id).toContain(flag);
      for (const allergen of meal.allergens) expect(FPA_ALLERGENS, meal.id).toContain(allergen);
    }
  });
});

describe('5. the copy, and the prep times', () => {
  const BANNED = [
    'must',
    'requires',
    'ideal',
    'perfect',
    'macros',
    'optimal',
    'burns',
    'boosts metabolism',
  ];

  function copyOf(meal: FpaMeal): string {
    return [meal.name, meal.summary, meal.whyItFits, ...meal.ingredients].join(' ');
  }

  it('holds no em dash anywhere in the seventy two meals', () => {
    for (const meal of FPA_MEALS) {
      expect(copyOf(meal), meal.id).not.toContain('—');
    }
  });

  it('holds no digit anywhere in meal copy, so the prep time is the only number', () => {
    for (const meal of FPA_MEALS) {
      expect(copyOf(meal), meal.id).not.toMatch(/[0-9]/);
    }
  });

  it('never uses a banned word', () => {
    for (const meal of FPA_MEALS) {
      const copy = copyOf(meal);
      for (const word of BANNED) {
        expect(copy.toLowerCase(), `${meal.id} uses "${word}"`).not.toMatch(
          new RegExp(`(^|[^a-z])${word}([^a-z]|$)`)
        );
      }
    }
  });

  it('says something different about every meal rather than one template repeated', () => {
    expect(new Set(FPA_MEALS.map((meal) => meal.whyItFits)).size).toBe(72);
    expect(new Set(FPA_MEALS.map((meal) => meal.summary)).size).toBe(72);
    // One or two sentences, and every one of them a real sentence.
    for (const meal of FPA_MEALS) {
      const sentences = meal.whyItFits.split('. ').filter((part) => part.trim().length > 0);
      expect(sentences.length, meal.id).toBeGreaterThanOrEqual(1);
      expect(sentences.length, meal.id).toBeLessThanOrEqual(2);
    }
  });

  it('keeps snacks at ten minutes or under and most meals at twenty five or under', () => {
    for (const meal of FPA_MEALS) {
      expect(meal.prepMinutes, meal.id).toBeGreaterThan(0);
      if (meal.type === 'snack') expect(meal.prepMinutes, meal.id).toBeLessThanOrEqual(10);
    }
    const quick = FPA_MEALS.filter((meal) => meal.prepMinutes <= 25).length;
    expect(quick / FPA_MEALS.length).toBeGreaterThan(0.5);
  });
});

describe('6. the composition really is the pattern it is filed under', () => {
  it('leads Protein-Supportive meals with protein and keeps their carbohydrate lighter', () => {
    for (const meal of FPA_MEALS.filter((m) => m.pattern === 'protein_supportive')) {
      const levels = { Higher: 3, Moderate: 2, Lighter: 1 } as const;
      expect(levels[meal.protein], `${meal.id} protein vs carbohydrate`).toBeGreaterThanOrEqual(
        levels[meal.carbohydrate]
      );
      expect(meal.carbohydrate, meal.id).not.toBe('Higher');
    }
  });

  it('never puts protein above carbohydrate in a Carb-Supportive meal', () => {
    for (const meal of FPA_MEALS.filter((m) => m.pattern === 'carb_supportive')) {
      expect(meal.carbohydrate, meal.id).toBe('Higher');
      expect(meal.protein, meal.id).not.toBe('Higher');
    }
  });

  it('keeps Balanced Fuel meals even, with nothing leading', () => {
    for (const meal of FPA_MEALS.filter((m) => m.pattern === 'balanced_fuel')) {
      expect([meal.protein, meal.carbohydrate], meal.id).not.toContain('Higher');
    }
  });
});

describe('7. the images, and the manifest that says where they came from', () => {
  /*
    THE MANIFEST IS THE ATTRIBUTION, so it has to be true. Three ways it
    could quietly stop being true, and all three fail here: a meal
    pointing at a file that was never committed, a committed file nothing
    points at, and a meal whose card draws a photograph the manifest does
    not account for.
  */
  const manifestPath = path.resolve(
    __dirname,
    '../../../docs/fuel-meal-image-manifest.json'
  );
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
    photographs: number;
    illustrations: number;
    entries: Array<{ mealId: string; image: string | null; license?: string; pageUrl?: string }>;
  };
  const imageDir = path.resolve(__dirname, '../public/images/fuel-meals');

  it('accounts for all seventy two meals, photograph or illustration', () => {
    expect(manifest.entries).toHaveLength(72);
    expect(new Set(manifest.entries.map((e) => e.mealId))).toEqual(
      new Set(FPA_MEALS.map((meal) => meal.id))
    );
    expect(manifest.photographs + manifest.illustrations).toBe(72);
  });

  it('agrees with the library about which meals have a photograph', () => {
    for (const entry of manifest.entries) {
      const meal = fpaMealById(entry.mealId)!;
      expect(meal.image, entry.mealId).toBe(entry.image);
    }
  });

  it('commits every photograph it names, and names every photograph it commits', () => {
    const onDisk = fs.readdirSync(imageDir).filter((name) => name.endsWith('.jpg'));
    const named = manifest.entries.map((entry) => entry.image).filter(Boolean) as string[];
    expect(named.sort()).toEqual(onDisk.sort());
    for (const name of named) {
      expect(fs.existsSync(path.join(imageDir, name)), name).toBe(true);
    }
  });

  it('records a licence and a source page for every photograph', () => {
    for (const entry of manifest.entries) {
      if (!entry.image) continue;
      expect(entry.license, entry.mealId).toBeTruthy();
      expect(entry.pageUrl, entry.mealId).toMatch(/^https?:\/\//);
    }
  });

  it('never points a card at a remote address', () => {
    for (const meal of FPA_MEALS) {
      if (!meal.image) continue;
      expect(meal.image, meal.id).not.toMatch(/^https?:/);
      expect(meal.image, meal.id).toBe(`${meal.id}.jpg`);
    }
  });
});
