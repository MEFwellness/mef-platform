/**
 * Food Lens Phase 2 — gram estimates from a meal photo.
 *
 * Everything asserted here is pure logic or source text, so the two rules
 * the whole feature rests on are provable without a browser, a database or
 * a vision call:
 *
 *   1. Nothing counts until she confirms.
 *   2. A photo number is an estimate, a barcode number is exact, and the
 *      product never blurs the two.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  formatGrams,
  hasAnyGrams,
  mealMacroGrams,
  roundMacroGrams,
  scaleMacroGrams,
  sumMacroGrams,
} from '../lib/food-lens/macroGrams';
import {
  buildLedgerEntries,
  entryProteinGrams,
  resolveEntrySource,
  sumProteinGrams,
  type LedgerProductFacts,
} from '../lib/protein/ledger';
import type { MemberFoodLogEntry } from '@mef/shared-types-contracts';

const ROOT = path.resolve(__dirname, '..');
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

// ---------------------------------------------------------------------------
// Scaling: one physical amount of food, three numbers that move together
// ---------------------------------------------------------------------------

describe('scaleMacroGrams', () => {
  it('scales protein, carbohydrate and fat by the same multiplier', () => {
    expect(scaleMacroGrams({ proteinG: 38, carbG: 12, fatG: 8 }, 0.5)).toEqual({
      proteinG: 19,
      carbG: 6,
      fatG: 4,
    });
  });

  it('leaves a dimension that was never estimated as null, never as zero', () => {
    // 0g reads to a member as "this food has none of that macro". "We could
    // not estimate it" is a different claim and has to stay a different value.
    expect(scaleMacroGrams({ proteinG: 30, carbG: null, fatG: null }, 2)).toEqual({
      proteinG: 60,
      carbG: null,
      fatG: null,
    });
  });

  it('refuses to invent a figure for a nonsense multiplier', () => {
    expect(scaleMacroGrams({ proteinG: 30, carbG: 10, fatG: 5 }, 0)).toEqual({
      proteinG: null,
      carbG: null,
      fatG: null,
    });
    expect(scaleMacroGrams({ proteinG: 30, carbG: 10, fatG: 5 }, Number.NaN).proteinG).toBeNull();
  });
});

describe('sumMacroGrams', () => {
  it('adds the items that carry a figure', () => {
    expect(
      sumMacroGrams([
        { proteinG: 38, carbG: 0, fatG: 8 },
        { proteinG: 6, carbG: 45, fatG: 2 },
      ])
    ).toEqual({ proteinG: 44, carbG: 45, fatG: 10 });
  });

  it('stays null for a dimension no item estimated at all', () => {
    expect(
      sumMacroGrams([
        { proteinG: 38, carbG: null, fatG: null },
        { proteinG: 6, carbG: null, fatG: null },
      ])
    ).toEqual({ proteinG: 44, carbG: null, fatG: null });
  });

  it('sums an empty meal to nothing rather than to zeros', () => {
    expect(sumMacroGrams([])).toEqual({ proteinG: null, carbG: null, fatG: null });
  });
});

describe('mealMacroGrams', () => {
  const CHICKEN = { itemId: 'a', base: { proteinG: 38, carbG: 0, fatG: 8 }, servings: 1, included: true };
  const RICE = { itemId: 'b', base: { proteinG: 4, carbG: 45, fatG: 1 }, servings: 1, included: true };

  it('is the sum of the items on screen, so a total can never disagree with its breakdown', () => {
    expect(mealMacroGrams([CHICKEN, RICE])).toEqual({ proteinG: 42, carbG: 45, fatG: 9 });
  });

  it('moves when she halves a serving', () => {
    expect(mealMacroGrams([{ ...CHICKEN, servings: 0.5 }, RICE])).toEqual({
      proteinG: 23,
      carbG: 45,
      fatG: 5,
    });
  });

  it('drops an item she removed out of every dimension at once', () => {
    expect(mealMacroGrams([CHICKEN, { ...RICE, included: false }])).toEqual({
      proteinG: 38,
      carbG: 0,
      fatG: 8,
    });
  });
});

describe('display helpers', () => {
  it('rounds for display without ever printing a floating-point artifact', () => {
    expect(roundMacroGrams({ proteinG: 37.99999999999999, carbG: 0.4, fatG: null })).toEqual({
      proteinG: 38,
      carbG: 0,
      fatG: null,
    });
  });

  it('says a missing figure in words instead of borrowing zero', () => {
    expect(formatGrams(38)).toBe('38g');
    expect(formatGrams(0)).toBe('0g');
    expect(formatGrams(null)).toBe('not estimated');
  });

  it('knows when a meal has nothing estimated at all, so the section can be omitted', () => {
    expect(hasAnyGrams({ proteinG: null, carbG: null, fatG: null })).toBe(false);
    expect(hasAnyGrams({ proteinG: null, carbG: 0, fatG: null })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The ledger: a confirmed photo entry counts, an old photo entry still does not
// ---------------------------------------------------------------------------

function logRow(overrides: Partial<MemberFoodLogEntry>): MemberFoodLogEntry {
  return {
    id: 'row',
    member_id: 'member',
    product_id: null,
    scan_id: null,
    meal_category: 'lunch',
    servings: 1,
    consumed_at: '2026-08-30T17:00:00.000Z',
    created_at: '2026-08-30T17:00:00.000Z',
    notes: null,
    photo_storage_path: null,
    member_adjusted: false,
    manual_label: null,
    entry_source: null,
    estimated_protein_g: null,
    estimated_carb_g: null,
    estimated_fat_g: null,
    ...overrides,
  };
}

describe('entryProteinGrams', () => {
  it('treats a confirmed photo estimate as per-serving grams, exactly like a product', () => {
    expect(entryProteinGrams({ servings: 2, estimated_protein_g: 19 }, null)).toBe(38);
  });

  it('still prefers the product when there is one, so a real label never loses to an estimate', () => {
    expect(entryProteinGrams({ servings: 1, estimated_protein_g: 19 }, { proteinG: 25 })).toBe(25);
  });

  it('is null when neither source has a value', () => {
    expect(entryProteinGrams({ servings: 1, estimated_protein_g: null }, null)).toBeNull();
  });
});

describe('resolveEntrySource', () => {
  it('reads the explicit column first for a confirmed photo entry', () => {
    expect(
      resolveEntrySource({
        productId: null,
        scanId: 'scan-1',
        productBarcode: null,
        productDataSource: null,
        entrySource: 'photo_estimated',
      })
    ).toBe('photo_estimated');
  });

  it('falls back to the old inference for a row written before the column existed', () => {
    expect(
      resolveEntrySource({
        productId: null,
        scanId: 'scan-1',
        productBarcode: null,
        productDataSource: null,
      })
    ).toBe('meal_photo');
  });
});

describe('buildLedgerEntries with photo estimates', () => {
  const build = (rows: MemberFoodLogEntry[]) =>
    buildLedgerEntries({
      rows,
      productById: new Map<string, LedgerProductFacts>(),
      proteinPerServingByProductId: new Map(),
      proteinLevelByScanId: new Map([['old-scan', 'high' as const]]),
      localDateFor: () => '2026-08-30',
    });

  it('counts a confirmed photo meal toward the day, and scales carbs and fat with it', () => {
    const [entry] = build([
      logRow({
        id: 'confirmed',
        scan_id: 'new-scan',
        entry_source: 'photo_estimated',
        servings: 2,
        estimated_protein_g: 19,
        estimated_carb_g: 22.5,
        estimated_fat_g: 4,
        manual_label: 'grilled chicken breast',
      }),
    ]);
    expect(entry!.source).toBe('photo_estimated');
    expect(entry!.proteinGrams).toBe(38);
    expect(entry!.carbGrams).toBe(45);
    expect(entry!.fatGrams).toBe(8);
    // A confirmed entry has real grams, so it never also shows a relative level.
    expect(entry!.estimatedProteinLevel).toBeNull();
  });

  it('leaves a photo meal logged before Phase 2 contributing nothing, with its relative read intact', () => {
    const [entry] = build([logRow({ id: 'legacy', scan_id: 'old-scan' })]);
    expect(entry!.source).toBe('meal_photo');
    expect(entry!.proteinGrams).toBeNull();
    expect(entry!.carbGrams).toBeNull();
    expect(entry!.estimatedProteinLevel).toBe('high');
  });

  it("adds a confirmed photo meal into the day's total alongside every other lane", () => {
    const entries = build([
      logRow({ id: 'photo', scan_id: 's', entry_source: 'photo_estimated', estimated_protein_g: 38 }),
      logRow({ id: 'legacy', scan_id: 'old-scan' }),
    ]);
    expect(sumProteinGrams(entries)).toBe(38);
  });
});

// ---------------------------------------------------------------------------
// Source guards: the two promises this feature makes about itself
// ---------------------------------------------------------------------------

describe('the vision provider asks for grams, and never for calories', () => {
  const provider = read('lib/food-lens/providers/anthropicVision.ts');

  it('requests per-item protein, carbohydrate and fat grams', () => {
    expect(provider).toContain('protein_g, carb_g, fat_g');
    expect(provider).toContain("protein_g: { type: 'number', minimum: 0, nullable: true }");
  });

  it('tells the model that null, not zero, is the answer when it cannot size an item', () => {
    expect(provider).toContain('Never write 0');
  });

  it('never asks for a calorie figure, in this build or any part of it', () => {
    expect(provider).toContain('Never estimate calories');
    expect(provider).not.toContain('calories_kcal');
  });

  it('refuses a plate total from the model, because the app sums the items itself', () => {
    expect(provider).toContain('Do not report a total for the plate');
  });
});

describe('confirm to count', () => {
  const action = read('app/actions/food-lens.ts');

  it('writes photo grams only through the one action a member confirm reaches', () => {
    expect(action).toContain("entrySource:");
    expect(action).toContain("'photo_estimated'");
    // The confirm path is the only writer of estimated grams anywhere.
    const writers = read('app/actions/protein-ledger.ts') + read('app/actions/food-products.ts');
    expect(writers).not.toContain("entrySource: 'photo_estimated'");
  });

  it('stores the estimate per item, so the full macro picture survives beyond this screen', () => {
    expect(action).toContain('insertFoodLensItemMacroEstimate');
  });
});

describe('member-facing copy tells the truth about where a number came from', () => {
  it('says a photo number is an estimate that needs confirming', () => {
    expect(read('components/food-lens/EstimatedMacrosPanel.tsx')).toContain(
      'Estimated from your photo. Confirm or adjust before it counts toward your day.'
    );
  });

  it('no longer claims a photo never produces a gram figure', () => {
    const capture = read('components/food-lens/FoodLensCaptureFlow.tsx');
    expect(capture).not.toContain('never see calorie');
    expect(capture).not.toContain('gram weights');
    expect(read('components/food-lens/MacroBalanceMeter.tsx')).not.toContain('gram weight');
  });

  it('offers no daily target, bar or verdict for carbohydrate or fat', () => {
    const panel = read('components/food-lens/EstimatedMacrosPanel.tsx');
    expect(panel).toContain('there is no daily target for either');
    expect(panel).not.toContain('GrowBar');
  });

  it('shows no calorie figure to a member anywhere in the new screens', () => {
    const panel = read('components/food-lens/EstimatedMacrosPanel.tsx');
    expect(panel.toLowerCase()).not.toContain('calorie');
  });
});
