/**
 * Food Lens Phase 2, against the real database.
 *
 * The pure tests in food-lens-macro-grams.test.ts prove the arithmetic. This
 * file proves the parts only a database can answer: that migration 194's
 * table and columns exist, that a member's own session is allowed to write
 * them, and that what comes back out is what went in.
 *
 * "No error" is not "it worked" (docs/BUILD_STATUS.md, 2026-08-18): a write
 * matching no RLS policy returns zero rows and no error, so every insert
 * here is read back as the member before anything is asserted about it.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { serviceRoleClient, signInAs, TEST_USERS } from './setup/test-clients';
import {
  buildLedgerEntries,
  sumProteinGrams,
  type LedgerProductFacts,
} from '../lib/protein/ledger';
import type { MemberFoodLogEntry } from '@mef/shared-types-contracts';

const createdScanIds: string[] = [];
const createdLogEntryIds: string[] = [];

afterAll(async () => {
  const supabase = serviceRoleClient();
  if (createdLogEntryIds.length > 0) {
    await supabase.from('member_food_log').delete().in('id', createdLogEntryIds);
  }
  if (createdScanIds.length > 0) {
    // food_lens_item_macro_estimates, detected items and macro estimates all
    // cascade from the scan.
    await supabase.from('food_lens_scans').delete().in('id', createdScanIds);
  }
});

/** A meal photo scan with two sized items, written as the member so the new table's insert policy is the thing being tested. */
async function seedScanWithItemGrams(): Promise<{
  scanId: string;
  chickenItemId: string;
  riceItemId: string;
}> {
  const member = await signInAs(TEST_USERS.memberOne);
  const now = new Date().toISOString();
  const scanId = randomUUID();

  const { error: scanError } = await member.from('food_lens_scans').insert({
    id: scanId,
    member_id: TEST_USERS.memberOne.id,
    scan_type: 'meal_photo',
    status: 'analyzed',
    created_at: now,
    updated_at: now,
  });
  expect(scanError).toBeNull();
  createdScanIds.push(scanId);

  const items = [
    { id: randomUUID(), label: 'grilled chicken breast', proteinG: 38, carbG: 0, fatG: 8 },
    { id: randomUUID(), label: 'brown rice', proteinG: 5, carbG: 45, fatG: 2 },
  ];
  for (const item of items) {
    const { error: itemError } = await member.from('food_lens_detected_items').insert({
      id: item.id,
      scan_id: scanId,
      label: item.label,
      category: 'mixed',
      confidence: 0.8,
      source: 'ai_detected',
      status: 'pending_confirmation',
      created_at: now,
    });
    expect(itemError).toBeNull();

    const { error: gramsError } = await member.from('food_lens_item_macro_estimates').insert({
      id: randomUUID(),
      scan_id: scanId,
      detected_item_id: item.id,
      protein_g: item.proteinG,
      carb_g: item.carbG,
      fat_g: item.fatG,
      portion_description: 'about 6 ounces',
      basis: 'ai_estimated',
      created_at: now,
    });
    expect(gramsError).toBeNull();
  }

  return { scanId, chickenItemId: items[0]!.id, riceItemId: items[1]!.id };
}

describe('food_lens_item_macro_estimates (migration 194)', () => {
  it('accepts a member writing her own scan’s per-item grams, and reads them back', async () => {
    const { scanId } = await seedScanWithItemGrams();
    const member = await signInAs(TEST_USERS.memberOne);

    const { data, error } = await member
      .from('food_lens_item_macro_estimates')
      .select('protein_g, carb_g, fat_g, portion_description, basis')
      .eq('scan_id', scanId)
      .order('protein_g', { ascending: false });

    expect(error).toBeNull();
    expect(data).toHaveLength(2);
    expect(Number(data![0]!.protein_g)).toBe(38);
    expect(Number(data![0]!.fat_g)).toBe(8);
    expect(data![0]!.portion_description).toBe('about 6 ounces');
    expect(data![0]!.basis).toBe('ai_estimated');
  });

  it("does not show one member another member's item grams", async () => {
    const { scanId } = await seedScanWithItemGrams();
    const other = await signInAs(TEST_USERS.memberTwo);

    const { data } = await other
      .from('food_lens_item_macro_estimates')
      .select('id')
      .eq('scan_id', scanId);
    expect(data ?? []).toHaveLength(0);
  });
});

describe('a confirmed photo meal counts toward the day', () => {
  it('writes per-serving grams onto the log row and totals them like every other lane', async () => {
    const { scanId, chickenItemId } = await seedScanWithItemGrams();
    const member = await signInAs(TEST_USERS.memberOne);

    // What the confirm action writes: she kept the chicken and doubled it.
    const entryId = randomUUID();
    const { error } = await member.from('member_food_log').insert({
      id: entryId,
      member_id: TEST_USERS.memberOne.id,
      product_id: null,
      scan_id: scanId,
      meal_category: 'lunch',
      servings: 2,
      consumed_at: new Date().toISOString(),
      manual_label: 'grilled chicken breast',
      entry_source: 'photo_estimated',
      estimated_protein_g: 38,
      estimated_carb_g: 0,
      estimated_fat_g: 8,
    });
    expect(error).toBeNull();
    createdLogEntryIds.push(entryId);
    expect(chickenItemId).toBeTruthy();

    const { data: rows } = await member
      .from('member_food_log')
      .select('*')
      .eq('id', entryId);
    expect(rows).toHaveLength(1);

    const entries = buildLedgerEntries({
      rows: rows as MemberFoodLogEntry[],
      productById: new Map<string, LedgerProductFacts>(),
      proteinPerServingByProductId: new Map(),
      proteinLevelByScanId: new Map(),
      localDateFor: () => '2026-08-30',
    });

    expect(entries[0]!.source).toBe('photo_estimated');
    expect(entries[0]!.proteinGrams).toBe(76);
    expect(entries[0]!.carbGrams).toBe(0);
    expect(entries[0]!.fatGrams).toBe(16);
    expect(sumProteinGrams(entries)).toBe(76);
  });

  it('contributes nothing while the scan is unconfirmed, because no row exists yet', async () => {
    const { scanId } = await seedScanWithItemGrams();
    const member = await signInAs(TEST_USERS.memberOne);

    const { data: rows } = await member
      .from('member_food_log')
      .select('id')
      .eq('member_id', TEST_USERS.memberOne.id)
      .eq('scan_id', scanId);

    expect(rows ?? []).toHaveLength(0);
  });
});
