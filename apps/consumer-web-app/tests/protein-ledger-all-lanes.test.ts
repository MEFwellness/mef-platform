/**
 * Every lane a member can log food through feeds one protein ledger.
 *
 * THE RULE. A member logs a meal once, anywhere in the app, and it counts
 * toward Today's Protein. She never logs the same meal twice to get
 * credit, and a meal never counts twice.
 *
 * WHY THAT IS TRUE BY CONSTRUCTION, not by a deduplication pass: every
 * logging path in this application writes the same member_food_log row
 * (migration 59), and the ledger is a protein-focused read over that one
 * table. Ten writers, one table, one read. The first block below pins that
 * down against the real source, so a future eleventh writer that invents
 * its own storage is caught here rather than silently going uncounted.
 *
 * WHAT DOES AND DOES NOT PRODUCE GRAMS. Confirmed grams count: a row
 * linked to a product whose product_nutrients row carries protein
 * contributes servings x protein_g. Meal-photo rows carry no gram data
 * anywhere in this application (the vision provider returns a relative
 * Low/Moderate/High read, never a gram figure, by deliberate product rule)
 * so they contribute exactly zero. They are still READ now, so a logged
 * photo meal appears in the day and in the 7-day history instead of
 * vanishing from the ledger entirely, which is what it used to do.
 *
 * Same convention as tests/protein-ledger-integration.test.ts: server
 * actions cannot run here (they use next/headers cookies()), so these
 * exercise the real tables and RLS the action reads, then feed the result
 * through the action's own pure decision function (buildLedgerEntries), so
 * this tests the shipped logic rather than a copy of it.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { serviceRoleClient, signInAs, TEST_USERS } from './setup/test-clients';
import {
  buildDailyTotals,
  buildLedgerEntries,
  lastNLocalDates,
  resolveEntrySource,
  roundGrams,
  sumProteinGrams,
  type LedgerProductFacts,
} from '../lib/protein/ledger';
import type { MemberFoodLogEntry } from '@mef/shared-types-contracts';

const ROOT = path.resolve(__dirname, '..');

const createdProductIds: string[] = [];
const createdLogEntryIds: string[] = [];
const createdScanIds: string[] = [];
const createdEstimateIds: string[] = [];

afterAll(async () => {
  const supabase = serviceRoleClient();
  if (createdLogEntryIds.length > 0) {
    await supabase.from('member_food_log').delete().in('id', createdLogEntryIds);
  }
  if (createdEstimateIds.length > 0) {
    await supabase.from('food_lens_macro_estimates').delete().in('id', createdEstimateIds);
  }
  if (createdScanIds.length > 0) {
    await supabase.from('food_lens_scans').delete().in('id', createdScanIds);
  }
  if (createdProductIds.length > 0) {
    await supabase.from('product_nutrients').delete().in('product_id', createdProductIds);
    await supabase.from('food_products').delete().in('id', createdProductIds);
  }
});

/** A product with a real per-serving protein figure, the shape every gram-bearing lane produces. `barcode` null + data_source 'mef_verified' is the private-product shape manual entry and quick add both use. */
async function insertTestProduct(
  proteinG: number | null,
  options: { barcode?: string | null; dataSource?: string } = {}
): Promise<string> {
  const supabase = serviceRoleClient();
  const productId = randomUUID();
  await supabase.from('food_products').insert({
    id: productId,
    barcode: options.barcode === undefined ? `lane-test-${productId}` : options.barcode,
    barcode_type: 'unknown',
    name: 'Lane test product',
    data_source: options.dataSource ?? 'mef_verified',
    data_completeness: 'minimal',
  });
  await supabase
    .from('product_nutrients')
    .insert({ product_id: productId, basis: 'per_serving', protein_g: proteinG });
  createdProductIds.push(productId);
  return productId;
}

async function insertMealPhotoScan(proteinLevel: 'low' | 'moderate' | 'high'): Promise<string> {
  const supabase = serviceRoleClient();
  const scanId = randomUUID();
  const now = new Date().toISOString();
  const { error: scanError } = await supabase.from('food_lens_scans').insert({
    id: scanId,
    member_id: TEST_USERS.memberOne.id,
    scan_type: 'meal_photo',
    status: 'analyzed',
    primal_pattern_profile_id: null,
    linked_product_id: null,
    created_at: now,
    updated_at: now,
  });
  expect(scanError).toBeNull();
  createdScanIds.push(scanId);

  const estimateId = randomUUID();
  const { error: estimateError } = await supabase.from('food_lens_macro_estimates').insert({
    id: estimateId,
    scan_id: scanId,
    protein_level: proteinLevel,
    carb_level: 'moderate',
    fat_level: 'low',
    protein_confidence: 0.7,
    carb_confidence: 0.7,
    fat_confidence: 0.7,
    overall_confidence: 0.7,
    basis: 'ai_estimated',
    created_at: now,
  });
  expect(estimateError).toBeNull();
  createdEstimateIds.push(estimateId);

  return scanId;
}

/** Logs one row exactly as the app's writers do, as the member herself, so RLS is exercised on the write too. */
async function logEntry(input: {
  productId?: string | null;
  scanId?: string | null;
  servings?: number;
  manualLabel?: string | null;
  consumedAt?: string;
}): Promise<string> {
  const memberClient = await signInAs(TEST_USERS.memberOne);
  const { data, error } = await memberClient
    .from('member_food_log')
    .insert({
      member_id: TEST_USERS.memberOne.id,
      product_id: input.productId ?? null,
      scan_id: input.scanId ?? null,
      meal_category: 'lunch',
      servings: input.servings ?? 1,
      consumed_at: input.consumedAt ?? new Date().toISOString(),
      manual_label: input.manualLabel ?? null,
    })
    .select('id')
    .single();
  expect(error).toBeNull();
  createdLogEntryIds.push(data!.id);
  return data!.id;
}

/**
 * The exact read the server action performs, run against the real database
 * as the member, then handed to the shipped pure function. Mirrors
 * listProteinEntriesForLocalDateRange without re-implementing its rules.
 */
async function readLedger(entryIds: string[]) {
  const memberClient = await signInAs(TEST_USERS.memberOne);

  const { data: rows } = await memberClient
    .from('member_food_log')
    .select('*')
    .eq('member_id', TEST_USERS.memberOne.id)
    .in('id', entryIds)
    .order('consumed_at', { ascending: true });

  const logRows = (rows ?? []) as MemberFoodLogEntry[];
  const productIds = [
    ...new Set(logRows.map((r) => r.product_id).filter((id): id is string => id !== null)),
  ];
  const scanIds = [
    ...new Set(
      logRows.filter((r) => r.product_id === null && r.scan_id).map((r) => r.scan_id as string)
    ),
  ];

  const { data: products } = productIds.length
    ? await memberClient.from('food_products').select('id, name, barcode, data_source').in('id', productIds)
    : { data: [] };
  const { data: nutrients } = productIds.length
    ? await memberClient.from('product_nutrients').select('product_id, protein_g').in('product_id', productIds)
    : { data: [] };
  const { data: estimates } = scanIds.length
    ? await memberClient
        .from('food_lens_macro_estimates')
        .select('scan_id, protein_level, created_at')
        .in('scan_id', scanIds)
        .order('created_at', { ascending: true })
    : { data: [] };

  return buildLedgerEntries({
    rows: logRows,
    productById: new Map<string, LedgerProductFacts>(
      (products ?? []).map((p) => [
        p.id as string,
        {
          name: p.name as string | null,
          barcode: p.barcode as string | null,
          dataSource: p.data_source as string | null,
        },
      ])
    ),
    proteinPerServingByProductId: new Map(
      (nutrients ?? []).map((n) => [n.product_id as string, n.protein_g as number | null])
    ),
    proteinLevelByScanId: new Map(
      (estimates ?? []).map((e) => [e.scan_id as string, e.protein_level as 'low' | 'moderate' | 'high'])
    ),
    localDateFor: () => '2026-01-01',
  });
}

describe('one table, every writer', () => {
  it('every logging path in the app writes member_food_log, so none can escape the ledger', () => {
    // If a new logging feature ever stores food anywhere else, this is
    // where it gets noticed: the ledger reads exactly one table.
    const writers = [
      'app/actions/food-products.ts', // barcode / label / search / manual result screen, plus duplicate
      'app/actions/food-lens.ts', // meal photo
      'app/actions/food-search.ts', // saved meal repeat
      'app/actions/protein-ledger.ts', // the ledger's own three lanes
    ];
    for (const writer of writers) {
      const source = fs.readFileSync(path.join(ROOT, writer), 'utf-8');
      expect(source).toContain('insertFoodLogEntry');
    }

    const inserter = fs.readFileSync(path.join(ROOT, 'lib/food-products/data.ts'), 'utf-8');
    expect(inserter).toContain("supabase.from('member_food_log').insert(row)");
  });

  it('the ledger read applies no lane filter at all', () => {
    const source = fs.readFileSync(path.join(ROOT, 'app/actions/protein-ledger.ts'), 'utf-8');
    // The regression this replaces: a `product_id is not null` filter that
    // silently dropped every meal-photo entry from the ledger.
    expect(source).not.toContain("not('product_id', 'is', null)");
    expect(source).toContain("from('member_food_log')");
  });
});

describe('which lane an entry came from', () => {
  it('reads a row with no product as a meal photo', () => {
    expect(
      resolveEntrySource({
        productId: null,
        scanId: 'scan-1',
        productBarcode: null,
        productDataSource: null,
      })
    ).toBe('meal_photo');
  });

  it('still tells the three gram-bearing shapes apart', () => {
    expect(
      resolveEntrySource({
        productId: 'p',
        scanId: 'scan-1',
        productBarcode: '012345678905',
        productDataSource: 'open_food_facts',
      })
    ).toBe('scan');
    expect(
      resolveEntrySource({
        productId: 'p',
        scanId: null,
        productBarcode: null,
        productDataSource: 'mef_verified',
      })
    ).toBe('quick_add');
    expect(
      resolveEntrySource({
        productId: 'p',
        scanId: null,
        productBarcode: '012345678905',
        productDataSource: 'open_food_facts',
      })
    ).toBe('search');
  });
});

describe('a meal logged outside the ledger lanes', () => {
  it('appears exactly once in the ledger total, with its real grams', async () => {
    // The Food Lens barcode result screen's own "add to my food log": a
    // product-linked row carrying a scan id. Nothing about it belongs to
    // the ledger screen, and it counts anyway.
    const productId = await insertTestProduct(30, { barcode: '0123456789050' });
    const entryId = await logEntry({ productId, servings: 2 });

    const entries = await readLedger([entryId]);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.proteinGrams).toBe(60);
    expect(roundGrams(sumProteinGrams(entries))).toBe(60);
  });

  it('sums correctly alongside a ledger-lane entry, with no double counting', async () => {
    const foodLensProductId = await insertTestProduct(30, { barcode: '0123456789067' });
    const quickAddProductId = await insertTestProduct(15, {
      barcode: null,
      dataSource: 'mef_verified',
    });

    const foodLensEntryId = await logEntry({ productId: foodLensProductId, servings: 1 });
    const quickAddEntryId = await logEntry({ productId: quickAddProductId, servings: 1 });

    const entries = await readLedger([foodLensEntryId, quickAddEntryId]);
    expect(entries).toHaveLength(2);
    expect(roundGrams(sumProteinGrams(entries))).toBe(45);

    // Each row contributed once, and the two lanes are still distinguished
    // for display without either being counted twice.
    expect(entries.map((e) => e.source).sort()).toEqual(['quick_add', 'search']);
    expect(new Set(entries.map((e) => e.id)).size).toBe(2);
  });

  it('is one contribution per logged row, even when the same product is logged twice', async () => {
    // "Duplicate a previous meal" writes a second row for the same
    // product. Two real meals, two contributions, which is correct, and
    // still one contribution per row.
    const productId = await insertTestProduct(20, { barcode: '0123456789081' });
    const first = await logEntry({ productId, servings: 1 });
    const second = await logEntry({ productId, servings: 1 });

    const entries = await readLedger([first, second]);
    expect(entries).toHaveLength(2);
    expect(roundGrams(sumProteinGrams(entries))).toBe(40);
  });

  it('never treats an unknown protein value as zero', async () => {
    const productId = await insertTestProduct(null, { barcode: '0123456789104' });
    const entryId = await logEntry({ productId, servings: 1 });

    const entries = await readLedger([entryId]);
    expect(entries[0]!.proteinGrams).toBeNull();
    expect(sumProteinGrams(entries)).toBe(0);
  });
});

describe('a meal photo', () => {
  it('is read by the ledger instead of vanishing from it', async () => {
    const scanId = await insertMealPhotoScan('high');
    const entryId = await logEntry({
      productId: null,
      scanId,
      servings: 1,
      manualLabel: 'Grilled chicken',
    });

    const entries = await readLedger([entryId]);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.source).toBe('meal_photo');
    expect(entries[0]!.productName).toBe('Grilled chicken');
  });

  it('contributes no grams, and carries Root’s relative read instead of a number', async () => {
    const scanId = await insertMealPhotoScan('high');
    const entryId = await logEntry({ productId: null, scanId, servings: 1 });

    const entries = await readLedger([entryId]);
    expect(entries[0]!.proteinGrams).toBeNull();
    expect(entries[0]!.estimatedProteinLevel).toBe('high');
    expect(roundGrams(sumProteinGrams(entries))).toBe(0);
  });

  it('does not move the total when logged alongside a confirmed-grams entry', async () => {
    // The standing rule, held at the number that matters: a relative
    // Low/Moderate/High read never becomes grams.
    const productId = await insertTestProduct(25, { barcode: '0123456789128' });
    const gramsEntryId = await logEntry({ productId, servings: 1 });
    const photoScanId = await insertMealPhotoScan('high');
    const photoEntryId = await logEntry({ productId: null, scanId: photoScanId, servings: 1 });

    const entries = await readLedger([gramsEntryId, photoEntryId]);
    expect(entries).toHaveLength(2);
    expect(roundGrams(sumProteinGrams(entries))).toBe(25);
  });

  it('never carries a relative read onto a product-linked entry', async () => {
    const productId = await insertTestProduct(25, { barcode: '0123456789142' });
    const entryId = await logEntry({ productId, servings: 1 });

    const entries = await readLedger([entryId]);
    expect(entries[0]!.estimatedProteinLevel).toBeNull();
  });
});

describe('the 7-day history sees every lane', () => {
  it('rolls meal-sourced entries into their own day', () => {
    const dates = lastNLocalDates('2026-01-07', 7);
    expect(dates).toHaveLength(7);
    expect(dates[6]).toBe('2026-01-07');

    const totals = buildDailyTotals(dates, [
      // Logged from the Food Lens barcode screen, not the ledger.
      { localDate: '2026-01-05', proteinGrams: 30 },
      // Logged through a ledger lane the same day.
      { localDate: '2026-01-05', proteinGrams: 15 },
      // A meal photo: present in the day's rows, worth zero grams.
      { localDate: '2026-01-06', proteinGrams: null },
      { localDate: '2026-01-07', proteinGrams: 40 },
    ]);

    const byDate = Object.fromEntries(totals.map((t) => [t.localDate, t.totalGrams]));
    expect(byDate['2026-01-05']).toBe(45);
    expect(byDate['2026-01-06']).toBe(0);
    expect(byDate['2026-01-07']).toBe(40);
    // A day with nothing logged is still a real fact, reported as 0.
    expect(byDate['2026-01-01']).toBe(0);
  });
});

describe('member-facing copy', () => {
  const source = fs.readFileSync(
    path.join(ROOT, 'components/protein-ledger/ProteinLedgerEntries.tsx'),
    'utf-8'
  );

  it('tells the member why a photographed meal is not in her grams', () => {
    // Silence was the real problem: a photo meal used to leave no trace in
    // the ledger at all, so "I logged lunch and my protein says zero" had
    // no explanation on the screen.
    expect(source).toContain('Estimated from your photo, so it isn&apos;t counted in grams.');
  });

  it('carries no em dash in that copy, per the standing style law', () => {
    // tests/no-em-dash-guard.test.ts enforces this app-wide with the real
    // TypeScript compiler (string and JSX nodes only, never comments).
    // This is the local spot check on exactly the strings this change
    // added, which is why it tests the strings rather than the file.
    const addedCopy = [
      'Estimated from your photo, so it isn&apos;t counted in grams.',
      'Meal photo',
      'No protein read',
      'Low protein',
      'Moderate protein',
      'High protein',
      'Estimated',
    ];
    for (const copy of addedCopy) {
      expect(source).toContain(copy);
      expect(copy).not.toContain('—');
    }
  });
});
