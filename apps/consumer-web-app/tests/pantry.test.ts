/**
 * Pantry Intelligence (Part 9) tests. categorize.ts and suggestions.ts are
 * pure functions — tested directly with synthetic data, same style as
 * tests/food-products-rules-engine.test.ts. The final describe block is a
 * real integration test against local Supabase (no mocked client), same
 * philosophy as tests/food-products-integration.test.ts: it authenticates
 * as the seeded test members and exercises lib/pantry/data.ts directly
 * (server actions can't be called here — they use cookies() from
 * next/headers, which throws outside a Next.js request scope) to prove the
 * database's own RLS policies on pantry_items, not just this app's code.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { categorizePantryItemName, deriveCategoryFromProductNutrients } from '../lib/pantry/categorize';
import { generatePantrySuggestions } from '../lib/pantry/suggestions';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import {
  insertPantryItem,
  listActivePantryItems,
  listFavoritePantryItems,
  listPantryItemsExpiringSoon,
  markPantryItemUsed,
  removePantryItem,
  updatePantryItem,
} from '../lib/pantry/data';

describe('categorizePantryItemName', () => {
  it('recognizes a protein keyword', () => {
    expect(categorizePantryItemName('Free-range eggs')).toBe('protein');
    expect(categorizePantryItemName('Chicken breast')).toBe('protein');
  });

  it('recognizes a carb keyword', () => {
    expect(categorizePantryItemName('Rolled oats')).toBe('carb');
    expect(categorizePantryItemName('Sourdough bread')).toBe('carb');
  });

  it('recognizes a fat keyword', () => {
    expect(categorizePantryItemName('Extra virgin olive oil')).toBe('fat');
    expect(categorizePantryItemName('Avocado')).toBe('fat');
  });

  it('recognizes a vegetable keyword', () => {
    expect(categorizePantryItemName('Baby spinach')).toBe('vegetable');
    expect(categorizePantryItemName('Broccoli crowns')).toBe('vegetable');
  });

  it('returns mixed when more than one category keyword matches', () => {
    expect(categorizePantryItemName('Chicken and rice bowl')).toBe('mixed');
  });

  it('returns unknown when nothing matches', () => {
    expect(categorizePantryItemName('Sparkling water')).toBe('unknown');
  });

  it('is case-insensitive', () => {
    expect(categorizePantryItemName('SPINACH')).toBe('vegetable');
  });
});

describe('deriveCategoryFromProductNutrients', () => {
  it('picks protein when protein grams dominate and are a meaningful amount', () => {
    const category = deriveCategoryFromProductNutrients({
      proteinG: 25,
      totalCarbohydrateG: 2,
      totalFatG: 3,
      productName: 'Grilled Chicken Breast',
      ingredientsText: 'chicken breast, salt',
    });
    expect(category).toBe('protein');
  });

  it('picks carb when carbohydrate grams dominate', () => {
    const category = deriveCategoryFromProductNutrients({
      proteinG: 3,
      totalCarbohydrateG: 40,
      totalFatG: 1,
      productName: 'White Rice',
      ingredientsText: 'rice',
    });
    expect(category).toBe('carb');
  });

  it('picks fat when fat grams dominate', () => {
    const category = deriveCategoryFromProductNutrients({
      proteinG: 1,
      totalCarbohydrateG: 2,
      totalFatG: 14,
      productName: 'Olive Oil',
      ingredientsText: 'olive oil',
    });
    expect(category).toBe('fat');
  });

  it('does not let a trivial protein amount win against a genuinely dominant carb amount', () => {
    // Small amount of protein (below the meaningful-protein threshold),
    // large carbohydrate amount — must not resolve to 'protein' just
    // because protein happened to be one of three compared numbers.
    const category = deriveCategoryFromProductNutrients({
      proteinG: 2,
      totalCarbohydrateG: 35,
      totalFatG: 0,
      productName: 'Bread',
      ingredientsText: 'wheat flour, water, yeast',
    });
    expect(category).toBe('carb');
  });

  it('returns mixed when two macros are close in weight', () => {
    const category = deriveCategoryFromProductNutrients({
      proteinG: 20,
      totalCarbohydrateG: 18,
      totalFatG: 2,
      productName: 'Greek Yogurt',
      ingredientsText: 'milk, live cultures',
    });
    expect(category).toBe('mixed');
  });

  it('returns unknown when no nutrient data is available', () => {
    const category = deriveCategoryFromProductNutrients({
      proteinG: null,
      totalCarbohydrateG: null,
      totalFatG: null,
      productName: null,
      ingredientsText: null,
    });
    expect(category).toBe('unknown');
  });
});

describe('generatePantrySuggestions', () => {
  it('returns no suggestions for an empty pantry', () => {
    expect(generatePantrySuggestions([])).toEqual([]);
  });

  it('returns no suggestions for fewer than two distinct categories', () => {
    const suggestions = generatePantrySuggestions([
      { name: 'Eggs', category: 'protein' },
      { name: 'Chicken', category: 'protein' },
    ]);
    expect(suggestions).toEqual([]);
  });

  it('names the actual items for a protein + vegetable + fat pantry', () => {
    const suggestions = generatePantrySuggestions([
      { name: 'Eggs', category: 'protein' },
      { name: 'Spinach', category: 'vegetable' },
      { name: 'Avocado', category: 'fat' },
    ]);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0]).toContain('Eggs');
    expect(suggestions[0]).toContain('Spinach');
    expect(suggestions[0]).toContain('Avocado');
  });

  it('produces a genuinely different sentence for a protein + carb only pantry', () => {
    const proteinFatVeg = generatePantrySuggestions([
      { name: 'Eggs', category: 'protein' },
      { name: 'Spinach', category: 'vegetable' },
      { name: 'Avocado', category: 'fat' },
    ]);
    const proteinCarb = generatePantrySuggestions([
      { name: 'Chicken', category: 'protein' },
      { name: 'Rice', category: 'carb' },
    ]);
    expect(proteinCarb.length).toBeGreaterThan(0);
    expect(proteinCarb[0]).not.toEqual(proteinFatVeg[0]);
    expect(proteinCarb[0]).toContain('Chicken');
    expect(proteinCarb[0]).toContain('Rice');
  });

  it('produces a different sentence again for a carb + vegetable pantry', () => {
    const carbVeg = generatePantrySuggestions([
      { name: 'Quinoa', category: 'carb' },
      { name: 'Kale', category: 'vegetable' },
    ]);
    const proteinCarb = generatePantrySuggestions([
      { name: 'Chicken', category: 'protein' },
      { name: 'Rice', category: 'carb' },
    ]);
    expect(carbVeg.length).toBeGreaterThan(0);
    expect(carbVeg[0]).not.toEqual(proteinCarb[0]);
  });

  it('never returns more than 3 suggestions', () => {
    const suggestions = generatePantrySuggestions([
      { name: 'Eggs', category: 'protein' },
      { name: 'Rice', category: 'carb' },
      { name: 'Avocado', category: 'fat' },
      { name: 'Spinach', category: 'vegetable' },
    ]);
    expect(suggestions.length).toBeLessThanOrEqual(3);
  });

  it('ignores items with mixed or unknown category and no category at all', () => {
    const suggestions = generatePantrySuggestions([
      { name: 'Frozen dinner', category: 'mixed' },
      { name: 'Sparkling water', category: 'unknown' },
      { name: 'Mystery item', category: null },
    ]);
    expect(suggestions).toEqual([]);
  });

  it('does not repeat a pair suggestion that is a strict subset of an already-emitted richer combo', () => {
    const suggestions = generatePantrySuggestions([
      { name: 'Eggs', category: 'protein' },
      { name: 'Spinach', category: 'vegetable' },
      { name: 'Avocado', category: 'fat' },
    ]);
    // protein+vegetable+fat is emitted; protein+vegetable and protein+fat
    // and vegetable+fat are all strict subsets of it and should be skipped.
    expect(suggestions.length).toBe(1);
  });
});

describe('pantry_items CRUD + RLS (real local Supabase)', () => {
  const insertedIds: string[] = [];

  afterAll(async () => {
    if (insertedIds.length === 0) return;
    const service = serviceRoleClient();
    await service.from('pantry_items').delete().in('id', insertedIds);
  });

  it('lets a member add, list, update, favorite, mark used, and remove their own pantry item', async () => {
    const client = await signInAs(TEST_USERS.memberOne);

    const item = await insertPantryItem(client, {
      memberId: TEST_USERS.memberOne.id,
      name: 'Test Pantry Spinach',
      quantityText: '1 bag',
      category: 'vegetable',
      expirationDate: null,
    });
    expect(item).not.toBeNull();
    insertedIds.push(item!.id);
    expect(item!.status).toBe('active');
    expect(item!.is_favorite).toBe(false);

    const active = await listActivePantryItems(client, TEST_USERS.memberOne.id);
    expect(active.some((i) => i.id === item!.id)).toBe(true);

    const updated = await updatePantryItem(client, TEST_USERS.memberOne.id, item!.id, {
      quantityText: '2 bags',
      isFavorite: true,
    });
    expect(updated).toBe(true);

    const favorites = await listFavoritePantryItems(client, TEST_USERS.memberOne.id);
    expect(favorites.some((i) => i.id === item!.id)).toBe(true);

    const markedUsed = await markPantryItemUsed(client, TEST_USERS.memberOne.id, item!.id);
    expect(markedUsed).toBe(true);

    const activeAfterUse = await listActivePantryItems(client, TEST_USERS.memberOne.id);
    expect(activeAfterUse.some((i) => i.id === item!.id)).toBe(false);
  });

  it('lists an item as expiring soon only while it is active and within the window', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const soon = new Date();
    soon.setDate(soon.getDate() + 2);
    const expirationDate = soon.toISOString().slice(0, 10);

    const item = await insertPantryItem(client, {
      memberId: TEST_USERS.memberOne.id,
      name: 'Test Pantry Milk',
      category: 'protein',
      expirationDate,
    });
    expect(item).not.toBeNull();
    insertedIds.push(item!.id);

    const expiringSoon = await listPantryItemsExpiringSoon(client, TEST_USERS.memberOne.id, 5);
    expect(expiringSoon.some((i) => i.id === item!.id)).toBe(true);

    const removed = await removePantryItem(client, TEST_USERS.memberOne.id, item!.id);
    expect(removed).toBe(true);

    const expiringAfterRemoval = await listPantryItemsExpiringSoon(
      client,
      TEST_USERS.memberOne.id,
      5
    );
    expect(expiringAfterRemoval.some((i) => i.id === item!.id)).toBe(false);
  });

  it('a member cannot read, update, or remove another member\'s pantry item (unauthorized access attempt)', async () => {
    const owner = await signInAs(TEST_USERS.memberOne);
    const other = await signInAs(TEST_USERS.memberTwo);

    const item = await insertPantryItem(owner, {
      memberId: TEST_USERS.memberOne.id,
      name: 'Test Pantry Almonds',
      category: 'fat',
    });
    expect(item).not.toBeNull();
    insertedIds.push(item!.id);

    const { data: theirRead, error: readError } = await other
      .from('pantry_items')
      .select('*')
      .eq('id', item!.id);
    expect(readError).toBeNull();
    expect(theirRead).toEqual([]);

    // Update "succeeds" with no error but RLS scopes it to auth.uid(), so a
    // cross-member update affects zero rows — same pattern
    // food-products-integration.test.ts documents for deleteFoodLogEntry.
    const updatedByOther = await updatePantryItem(other, TEST_USERS.memberOne.id, item!.id, {
      isFavorite: true,
    });
    expect(updatedByOther).toBe(true);

    const stillOwnedByOwner = await listActivePantryItems(owner, TEST_USERS.memberOne.id);
    const stillThere = stillOwnedByOwner.find((i) => i.id === item!.id);
    expect(stillThere).toBeTruthy();
    expect(stillThere!.is_favorite).toBe(false);

    const removedByOther = await removePantryItem(other, TEST_USERS.memberOne.id, item!.id);
    expect(removedByOther).toBe(true);
    const stillActiveForOwner = await listActivePantryItems(owner, TEST_USERS.memberOne.id);
    expect(stillActiveForOwner.some((i) => i.id === item!.id)).toBe(true);
  });

  it('an anonymous client cannot insert a pantry item for any member', async () => {
    const { anonClient } = await import('./setup/test-clients');
    const anon = anonClient();
    const { error } = await anon.from('pantry_items').insert({
      member_id: TEST_USERS.memberOne.id,
      name: 'Anonymous Insert Attempt',
    });
    expect(error).not.toBeNull();
  });
});
