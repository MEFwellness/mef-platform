/**
 * THE STANDING RULES THIS BUILD COULD MOST EASILY HAVE BROKEN.
 *
 *   1. A RENDER NEVER DECIDES ANYTHING. The two pages that draw meal
 *      cards, and the module that builds their payload, write nothing.
 *   2. THE MEAL SECTION CALLS NO SERVER ACTION. A Server Action's
 *      response is the whole re-rendered route, and this section sits
 *      inside a reveal that holds only while nothing behind it can
 *      replace it.
 *   3. THE DATABASE AND THE CODE AGREE ON THE CLOSED LISTS. The check
 *      constraints in migration 237 name exactly the exclusion keys, the
 *      rejection reasons, the meal types and the patterns the code knows
 *      about. A value one side accepts and the other rejects is a write
 *      that fails silently.
 *   4. THE ROUTE DECIDES THE STANDING EXCLUSION, NOT THE BROWSER. A hand
 *      made POST must not be able to record a preference she never chose.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { FPA_EXCLUSION_KEYS, FPA_REJECTION_REASONS } from '../lib/fuel-pattern/meals/preferences';
import { FPA_MEAL_TYPES } from '../lib/fuel-pattern/meals/types';

const APP_ROOT = path.resolve(__dirname, '..');
const MIGRATION = path.resolve(
  APP_ROOT,
  '../../supabase/migrations/00000000000237_fuel_pattern_meals.sql'
);

function read(relative: string): string {
  return fs.readFileSync(path.join(APP_ROOT, relative), 'utf8');
}

/** Everything inside a check (... in (...)) list in the migration. */
function checkedValues(sql: string, column: string): string[] {
  const match = new RegExp(`${column} in \\(([^)]*)\\)`, 'i').exec(sql);
  if (!match) return [];
  return [...match[1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
}

describe('1. a render never decides anything', () => {
  const RENDER_PATHS = [
    'app/assessments/fuel-pattern/results/[sessionId]/page.tsx',
    'app/assessments/fuel-pattern/take/page.tsx',
    'app/food-lens/my-meals/page.tsx',
    'lib/fuel-pattern/meals/memberPayload.ts',
  ];

  it('writes nothing from any page that draws a meal card', () => {
    for (const file of RENDER_PATHS) {
      const source = read(file);
      for (const write of ['.insert(', '.update(', '.upsert(', '.delete(', 'revalidatePath']) {
        expect(source, `${file} contains ${write}`).not.toContain(write);
      }
    }
  });
});

describe('2. the meal section calls no Server Action', () => {
  const SECTION = read('components/fuel-pattern/meals/FuelMealsSection.tsx');
  const SAVED = read('components/fuel-pattern/meals/SavedMealsView.tsx');

  it('imports nothing from app/actions', () => {
    for (const source of [SECTION, SAVED]) {
      expect(source).not.toMatch(/from\s+['"]@\/app\/actions/);
    }
  });

  it('sends everything to the meal route handler instead', () => {
    expect(SECTION).toContain("'/api/fuel-pattern/meals'");
    expect(SAVED).toContain("'/api/fuel-pattern/meals'");
  });

  it('sends it with keepalive, so leaving the page does not cancel the record', () => {
    for (const source of [SECTION, SAVED]) {
      expect(source).toContain('keepalive: true');
    }
  });

  it('writes nothing on mount, so opening the page and choosing nothing leaves no trace', () => {
    // Every post in this file is inside a handler named for the tap that
    // causes it. There is no effect at all.
    expect(SECTION).not.toContain('useEffect');
  });
});

describe('3. a client component never pulls the server data layer into the browser', () => {
  /*
    THE BUILD FAILURE THIS CLOSES, and it was a real one: My Meals is a
    client component and it imported fpaWhyItFits from memberPayload.ts,
    which reaches the meal data layer and, through
    lib/food-products/data.ts, node:crypto. Next refused to build it:
    "Reading from node:crypto is not handled by plugins". A type import
    would have been erased at compile time; a function is a value and
    values are bundled.

    So the pure half lives in payload.ts. These assertions are what keep
    a later edit from quietly putting it back.
  */
  const CLIENT_COMPONENTS = [
    'components/fuel-pattern/meals/FuelMealsSection.tsx',
    'components/fuel-pattern/meals/SavedMealsView.tsx',
    'components/fuel-pattern/meals/MealCard.tsx',
    'components/fuel-pattern/meals/MealImage.tsx',
    'components/fuel-pattern/meals/MealReasonSheet.tsx',
    'components/fuel-pattern/FuelPatternResultView.tsx',
  ];

  it('imports no value from the meal data layer or its builder', () => {
    for (const file of CLIENT_COMPONENTS) {
      const source = read(file);
      for (const serverOnly of ['meals/data', 'meals/memberPayload', 'supabase/server']) {
        expect(source, `${file} imports ${serverOnly}`).not.toContain(serverOnly);
      }
    }
  });

  it('keeps the pure payload module free of anything that could reach a database', () => {
    // Its own header names node:crypto to explain why it exists, so this
    // reads the import specifiers rather than the file's prose.
    const source = read('lib/fuel-pattern/meals/payload.ts');
    const imported = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!);
    for (const specifier of imported) {
      expect(specifier, `payload.ts imports ${specifier}`).not.toMatch(
        /supabase|\.\/data|^node:/
      );
    }
    expect(imported.length).toBeGreaterThan(0);
  });
});

describe('4. the database and the code agree on every closed list', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8');

  it('checks exactly the exclusion keys the code knows about', () => {
    expect(checkedValues(sql, 'exclusion_key').sort()).toEqual([...FPA_EXCLUSION_KEYS].sort());
  });

  it('checks exactly the rejection reasons the sheet offers', () => {
    expect(checkedValues(sql, 'reason').sort()).toEqual([...FPA_REJECTION_REASONS].sort());
  });

  it('checks exactly the four meal types', () => {
    expect(checkedValues(sql, 'meal_type').sort()).toEqual([...FPA_MEAL_TYPES].sort());
  });

  it('holds a unique index under every read then insert in the data layer', () => {
    for (const index of [
      'fuel_meal_exclusions_one_per_member_key',
      'fuel_meal_rejections_one_per_member_meal',
      'fuel_meal_saves_one_per_member_meal',
    ]) {
      expect(sql, index).toContain(index);
    }
  });

  it('turns row level security on for every one of the four tables', () => {
    for (const table of [
      'fuel_meal_exclusions',
      'fuel_meal_rejections',
      'fuel_meal_saves',
      'fuel_meal_slot_state',
    ]) {
      expect(sql, table).toContain(`alter table ${table} enable row level security`);
    }
  });

  it('lets a coach read her preferences and never her slot rotation', () => {
    // The three a coach panel prints carry a coach read policy. The slot
    // state is the machinery behind a card and carries none, because
    // there is nothing in it for him to read.
    for (const table of ['fuel_meal_exclusions', 'fuel_meal_rejections', 'fuel_meal_saves']) {
      expect(sql, table).toContain(`coach_read_assigned_${table}`);
    }
    expect(sql).not.toContain('coach_read_assigned_fuel_meal_slot_state');
  });
});

describe('5. the route decides the standing exclusion, not the browser', () => {
  const ROUTE = read('app/api/fuel-pattern/meals/route.ts');

  it('never reads an exclusion key off the request body', () => {
    expect(ROUTE).not.toMatch(/body\.exclusion/);
    expect(ROUTE).toContain('exclusionForReason');
  });

  it('accepts an allergen only when it is genuinely in the meal she declined', () => {
    expect(ROUTE).toContain('(meal.allergens as readonly string[]).includes(value)');
  });

  it('resolves the member from her own session rather than from the body', () => {
    expect(ROUTE).toContain('getCachedUser');
    expect(ROUTE).not.toMatch(/body\.memberId/);
  });

  it('checks every meal id against the library before it stores one', () => {
    expect(ROUTE).toContain('fpaMealById');
  });
});
