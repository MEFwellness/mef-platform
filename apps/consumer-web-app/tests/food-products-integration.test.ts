/**
 * End-to-end integration test for the MEF Food Intelligence Engine
 * (migration 59, lib/food-products/*) against real local Supabase — real
 * RLS, no mocked Supabase client, same philosophy as
 * tests/body-assessment-integration.test.ts. Server actions in
 * app/actions/food-products.ts can't be called directly here (they use
 * cookies() from next/headers) — these tests call the same
 * lib/food-products/data.ts functions the actions call, which is what
 * actually proves the database's own RLS policies.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { signInAs, anonClient, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import {
  findCachedFoodProduct,
  upsertFoodProductFromProvider,
  getFoodProductWithDetails,
  insertFoodLensBarcodeScan,
  updateFoodLensBarcodeScan,
  getFoodLensBarcodeScanByScanId,
  insertFoodAnalysisResult,
  getLatestFoodAnalysisResult,
  listNutritionRuleThresholds,
  insertFoodLogEntry,
  listFoodLogForDateRange,
  deleteFoodLogEntry,
  getMemberFoodPreferences,
  upsertMemberFoodPreferences,
} from '../lib/food-products/data';
import { insertFoodLensScan } from '../lib/food-lens/data';
import { runFoodRulesEngine } from '../lib/food-products/rulesEngine';
import type { NormalizedFoodProduct } from '@mef/shared-types-contracts';

const TEST_BARCODE = '099999912345';

function normalizedProduct(overrides: Partial<NormalizedFoodProduct> = {}): NormalizedFoodProduct {
  return {
    barcode: TEST_BARCODE,
    barcodeType: 'upc_a',
    dataSource: 'open_food_facts',
    sourceProductId: TEST_BARCODE,
    name: 'Integration Test Granola Bar',
    brand: 'MEF Test Brand',
    imageUrl: null,
    servingSizeText: '35 g',
    servingSizeGrams: 35,
    nutritionGrade: 'b',
    dataCompleteness: 'complete',
    rawSourceData: { test: true },
    nutrients: {
      basis: 'per_serving',
      calories: 150,
      proteinG: 4,
      totalCarbohydrateG: 20,
      fiberG: 3,
      totalSugarG: 8,
      addedSugarG: 6,
      totalFatG: 6,
      saturatedFatG: 1,
      monounsaturatedFatG: 3,
      polyunsaturatedFatG: 2,
      transFatG: 0,
      sodiumMg: 120,
      potassiumMg: 80,
    },
    ingredientsText: 'oats, honey, almonds, sea salt',
    ingredientsList: ['oats', 'honey', 'almonds', 'sea salt'],
    additives: [],
    allergens: [{ allergen: 'nuts', kind: 'contains' }],
    ...overrides,
  };
}

const memberIds = [TEST_USERS.memberOne.id, TEST_USERS.memberTwo.id];

afterAll(async () => {
  const service = serviceRoleClient();
  // food_analysis_results and food_lens_barcode_scans don't carry
  // member_id directly — deleting the owning food_lens_scans row cascades
  // to both, so only the member_id-scoped tables need an explicit delete.
  for (const table of ['member_food_log', 'member_food_preferences']) {
    await service.from(table).delete().in('member_id', memberIds);
  }
  await service.from('food_lens_scans').delete().in('member_id', memberIds);
  await service.from('product_allergens').delete().eq('allergen', 'nuts');
  const { data: products } = await service.from('food_products').select('id').eq('barcode', TEST_BARCODE);
  const productIds = (products ?? []).map((p) => p.id as string);
  if (productIds.length > 0) {
    await service.from('product_nutrients').delete().in('product_id', productIds);
    await service.from('product_ingredients').delete().in('product_id', productIds);
    await service.from('product_allergens').delete().in('product_id', productIds);
    await service.from('food_products').delete().in('id', productIds);
  }
});

describe('food_products cache — miss then hit', () => {
  it('reports a cache miss before any product with this barcode has been fetched', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const cached = await findCachedFoodProduct(client, TEST_BARCODE);
    expect(cached).toBeNull();
  });

  it('caches a product from a normalized provider result and hits the cache on the next lookup', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const saved = await upsertFoodProductFromProvider(client, normalizedProduct());
    expect(saved).not.toBeNull();
    expect(saved!.product.name).toBe('Integration Test Granola Bar');
    expect(saved!.nutrients?.saturated_fat_g).toBe(1);
    expect(saved!.ingredients?.ingredients_text).toContain('almonds');
    expect(saved!.allergens.map((a) => a.allergen)).toContain('nuts');

    const cached = await findCachedFoodProduct(client, TEST_BARCODE);
    expect(cached).not.toBeNull();
    expect(cached!.product.id).toBe(saved!.product.id);
  });

  it('any authenticated member can read the shared product cache, even one who did not scan it', async () => {
    const other = await signInAs(TEST_USERS.memberTwo);
    const cached = await findCachedFoodProduct(other, TEST_BARCODE);
    expect(cached).not.toBeNull();
  });

  it('an unauthenticated request cannot read the product cache', async () => {
    const anon = anonClient();
    const { data, error } = await anon.from('food_products').select('*').eq('barcode', TEST_BARCODE);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});

describe('barcode scan lifecycle + analysis, scoped to the owning member', () => {
  it('runs a full scan -> lookup -> analysis -> read flow for the owning member', async () => {
    const client = await signInAs(TEST_USERS.memberOne);

    const scan = await insertFoodLensScan(client, TEST_USERS.memberOne.id, 'barcode', null);
    expect(scan).not.toBeNull();

    const barcodeScan = await insertFoodLensBarcodeScan(client, {
      scanId: scan!.id,
      barcode: TEST_BARCODE,
      barcodeType: 'upc_a',
    });
    expect(barcodeScan).not.toBeNull();

    const product = await findCachedFoodProduct(client, TEST_BARCODE);
    expect(product).not.toBeNull();

    const updated = await updateFoodLensBarcodeScan(client, barcodeScan!.id, {
      productId: product!.product.id,
      lookupStatus: 'found',
    });
    expect(updated).toBe(true);

    const readBack = await getFoodLensBarcodeScanByScanId(client, scan!.id);
    expect(readBack?.lookup_status).toBe('found');
    expect(readBack?.product_id).toBe(product!.product.id);

    const thresholds = await listNutritionRuleThresholds(client);
    expect(thresholds.high_sodium_mg).toBe(600);

    const rulesResult = runFoodRulesEngine({
      productName: product!.product.name,
      dataCompleteness: product!.product.data_completeness,
      nutrients: {
        calories: product!.nutrients!.calories,
        proteinG: product!.nutrients!.protein_g,
        totalCarbohydrateG: product!.nutrients!.total_carbohydrate_g,
        fiberG: product!.nutrients!.fiber_g,
        totalSugarG: product!.nutrients!.total_sugar_g,
        addedSugarG: product!.nutrients!.added_sugar_g,
        totalFatG: product!.nutrients!.total_fat_g,
        saturatedFatG: product!.nutrients!.saturated_fat_g,
        monounsaturatedFatG: product!.nutrients!.monounsaturated_fat_g,
        polyunsaturatedFatG: product!.nutrients!.polyunsaturated_fat_g,
        transFatG: product!.nutrients!.trans_fat_g,
        sodiumMg: product!.nutrients!.sodium_mg,
        potassiumMg: product!.nutrients!.potassium_mg,
      },
      ingredientsText: product!.ingredients!.ingredients_text,
      ingredientsList: product!.ingredients!.ingredients_list,
      additives: product!.ingredients!.additives,
    });

    const analysis = await insertFoodAnalysisResult(client, {
      scanId: scan!.id,
      productId: product!.product.id,
      dataCompleteness: rulesResult.dataCompleteness,
      overallConfidence: rulesResult.overallConfidence,
      rulesResult,
      coachingResult: {
        supportsYou: 'Provides a meaningful amount of protein.',
        mindfulOf: 'Contains added sugar.',
        bestFit: 'Works well as an occasional snack.',
        recommendation: 'Pair with a protein source.',
        missingInformation: null,
      },
      coachingPromptVersion: null,
      memberAllergenMatches: [{ allergen: 'nuts', kind: 'contains' }],
    });
    expect(analysis).not.toBeNull();

    const latest = await getLatestFoodAnalysisResult(client, scan!.id);
    expect(latest?.id).toBe(analysis!.id);
    expect(latest?.member_allergen_matches).toEqual([{ allergen: 'nuts', kind: 'contains' }]);
  });

  it('a different member cannot read another member\'s barcode scan or analysis (unauthorized access attempt)', async () => {
    const owner = await signInAs(TEST_USERS.memberOne);
    const other = await signInAs(TEST_USERS.memberTwo);

    const scan = await insertFoodLensScan(owner, TEST_USERS.memberOne.id, 'barcode', null);
    const barcodeScan = await insertFoodLensBarcodeScan(owner, {
      scanId: scan!.id,
      barcode: TEST_BARCODE,
      barcodeType: 'upc_a',
    });
    expect(barcodeScan).not.toBeNull();

    const { data: theirScan, error: scanError } = await other
      .from('food_lens_scans')
      .select('*')
      .eq('id', scan!.id);
    expect(scanError).toBeNull();
    expect(theirScan).toEqual([]);

    const { data: theirBarcodeScan, error: bcError } = await other
      .from('food_lens_barcode_scans')
      .select('*')
      .eq('scan_id', scan!.id);
    expect(bcError).toBeNull();
    expect(theirBarcodeScan).toEqual([]);
  });

  it('an anonymous client cannot insert a barcode scan for any member', async () => {
    const owner = await signInAs(TEST_USERS.memberOne);
    const scan = await insertFoodLensScan(owner, TEST_USERS.memberOne.id, 'barcode', null);

    const anon = anonClient();
    const { error } = await anon.from('food_lens_barcode_scans').insert({
      scan_id: scan!.id,
      barcode: TEST_BARCODE,
      barcode_type: 'upc_a',
    });
    expect(error).not.toBeNull();
  });
});

describe('member_food_log', () => {
  it('lets a member add, list, and remove their own food log entries', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const product = await findCachedFoodProduct(client, TEST_BARCODE);
    expect(product).not.toBeNull();

    const consumedAt = new Date().toISOString();
    const entry = await insertFoodLogEntry(client, {
      memberId: TEST_USERS.memberOne.id,
      productId: product!.product.id,
      mealCategory: 'snack',
      servings: 1.5,
      consumedAt,
    });
    expect(entry).not.toBeNull();
    expect(entry!.servings).toBe(1.5);

    const start = new Date(consumedAt);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const listed = await listFoodLogForDateRange(
      client,
      TEST_USERS.memberOne.id,
      start.toISOString(),
      end.toISOString()
    );
    expect(listed.some((e) => e.id === entry!.id)).toBe(true);

    // Original per-serving product data must never be overwritten by a
    // member's serving-quantity adjustment.
    const productAfter = await getFoodProductWithDetails(client, product!.product.id);
    expect(productAfter?.nutrients?.calories).toBe(150);

    const removed = await deleteFoodLogEntry(client, TEST_USERS.memberOne.id, entry!.id);
    expect(removed).toBe(true);

    const afterDelete = await listFoodLogForDateRange(
      client,
      TEST_USERS.memberOne.id,
      start.toISOString(),
      end.toISOString()
    );
    expect(afterDelete.some((e) => e.id === entry!.id)).toBe(false);
  });

  it('a member cannot delete another member\'s food log entry', async () => {
    const owner = await signInAs(TEST_USERS.memberOne);
    const other = await signInAs(TEST_USERS.memberTwo);
    const product = await findCachedFoodProduct(owner, TEST_BARCODE);

    const entry = await insertFoodLogEntry(owner, {
      memberId: TEST_USERS.memberOne.id,
      productId: product!.product.id,
      mealCategory: 'lunch',
      servings: 1,
      consumedAt: new Date().toISOString(),
    });
    expect(entry).not.toBeNull();

    const removedByOther = await deleteFoodLogEntry(other, TEST_USERS.memberOne.id, entry!.id);
    // The delete call "succeeds" (no error) but RLS scopes it to rows
    // matching auth.uid(), so a cross-member delete affects zero rows.
    expect(removedByOther).toBe(true);

    const stillThere = await listFoodLogForDateRange(
      owner,
      TEST_USERS.memberOne.id,
      new Date(0).toISOString(),
      new Date(Date.now() + 86_400_000).toISOString()
    );
    expect(stillThere.some((e) => e.id === entry!.id)).toBe(true);

    await deleteFoodLogEntry(owner, TEST_USERS.memberOne.id, entry!.id);
  });
});

describe('member_food_preferences', () => {
  it('lets a member set and read back their own allergies/dietary pattern', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const saved = await upsertMemberFoodPreferences(client, TEST_USERS.memberOne.id, {
      allergies: ['peanuts', 'shellfish'],
      intolerances: ['lactose'],
      avoidIngredients: [],
      dietaryPattern: 'mediterranean',
    });
    expect(saved?.allergies).toEqual(['peanuts', 'shellfish']);

    const read = await getMemberFoodPreferences(client, TEST_USERS.memberOne.id);
    expect(read?.dietary_pattern).toBe('mediterranean');
  });

  it('a member cannot read another member\'s food preferences', async () => {
    const owner = await signInAs(TEST_USERS.memberOne);
    await upsertMemberFoodPreferences(owner, TEST_USERS.memberOne.id, {
      allergies: ['tree nuts'],
      intolerances: [],
      avoidIngredients: [],
      dietaryPattern: null,
    });

    const other = await signInAs(TEST_USERS.memberTwo);
    const { data, error } = await other
      .from('member_food_preferences')
      .select('*')
      .eq('member_id', TEST_USERS.memberOne.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
