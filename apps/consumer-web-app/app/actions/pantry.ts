'use server';

/**
 * Pantry Intelligence (Part 9) — server actions. Same conventions as
 * app/actions/food-products.ts: a session-scoped Supabase client, RLS
 * (migration 60) as the real authorization boundary, every mutation also
 * filters explicitly by the authenticated member's id (defense in depth,
 * matching deleteFoodLogEntry's `.eq('member_id', memberId)`), `{ error }`-
 * shaped ActionResult for mutations, null/empty for unauthenticated reads.
 *
 * Category precedence (see lib/pantry/categorize.ts's header for the full
 * rationale): addPantryItemFromProductAction derives category from the
 * linked product's nutrient signals when the caller doesn't supply one;
 * addPantryItemManualAction derives it from the item's name. Either path
 * lets the caller pass an explicit category to skip inference entirely
 * (e.g. a member picking a category from a dropdown), which always wins.
 */

import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from './auth';
import type { FoodLensFoodCategory, FoodProduct, PantryItem } from '@mef/shared-types-contracts';
import {
  getPantryItem,
  insertPantryItem,
  listActivePantryItems,
  listFavoritePantryItems,
  listPantryItemsExpiringSoon,
  markPantryItemUsed,
  removePantryItem,
  updatePantryItem,
  type UpdatePantryItemPatch,
} from '@/lib/pantry/data';
import {
  categorizePantryItemName,
  deriveCategoryFromProductNutrients,
} from '@/lib/pantry/categorize';
import { generatePantrySuggestions } from '@/lib/pantry/suggestions';

async function requireMember(): Promise<{
  supabase: ReturnType<typeof createClient>;
  userId: string;
} | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { supabase, userId: user.id };
}

export type PantryItemWithProduct = PantryItem & {
  product: Pick<FoodProduct, 'id' | 'name' | 'image_url'> | null;
};

async function attachProducts(
  supabase: ReturnType<typeof createClient>,
  items: PantryItem[]
): Promise<PantryItemWithProduct[]> {
  const productIds = [
    ...new Set(items.map((i) => i.product_id).filter((id): id is string => Boolean(id))),
  ];
  if (productIds.length === 0) return items.map((i) => ({ ...i, product: null }));

  const { data: products } = await supabase
    .from('food_products')
    .select('id, name, image_url')
    .in('id', productIds);
  const byId = new Map((products ?? []).map((p) => [p.id as string, p]));

  return items.map((i) => ({
    ...i,
    product: i.product_id
      ? ((byId.get(i.product_id) as PantryItemWithProduct['product']) ?? null)
      : null,
  }));
}

// ---- Add ----

export type AddPantryItemFromProductInput = {
  productId: string;
  quantityText?: string | null;
  expirationDate?: string | null;
  category?: string | null;
};

/** For barcode/label-scan/search-originated adds — the product's own name (never a member-typed name) becomes the pantry item's name. */
export async function addPantryItemFromProductAction(
  input: AddPantryItemFromProductInput
): Promise<ActionResult & { item?: PantryItem }> {
  const ctx = await requireMember();
  if (!ctx) return { error: 'Not signed in.' };
  const { supabase, userId } = ctx;

  const { data: product, error } = await supabase
    .from('food_products')
    .select('id, name')
    .eq('id', input.productId)
    .maybeSingle();
  if (error) return { error: 'Could not look up this product.' };
  if (!product || !product.name) return { error: 'Could not find this product.' };

  let category = input.category ?? null;
  if (!category) {
    const [{ data: nutrients }, { data: ingredients }] = await Promise.all([
      supabase
        .from('product_nutrients')
        .select('protein_g, total_carbohydrate_g, total_fat_g')
        .eq('product_id', input.productId)
        .maybeSingle(),
      supabase
        .from('product_ingredients')
        .select('ingredients_text')
        .eq('product_id', input.productId)
        .maybeSingle(),
    ]);
    category = deriveCategoryFromProductNutrients({
      proteinG: nutrients?.protein_g ?? null,
      totalCarbohydrateG: nutrients?.total_carbohydrate_g ?? null,
      totalFatG: nutrients?.total_fat_g ?? null,
      productName: product.name,
      ingredientsText: ingredients?.ingredients_text ?? null,
    });
  }

  const item = await insertPantryItem(supabase, {
    memberId: userId,
    productId: product.id,
    name: product.name,
    quantityText: input.quantityText ?? null,
    category,
    expirationDate: input.expirationDate ?? null,
  });
  if (!item) return { error: 'Could not add this to your pantry.' };
  return { item };
}

export type AddPantryItemManualInput = {
  name: string;
  quantityText?: string | null;
  category?: string | null;
  expirationDate?: string | null;
};

/** For a member typing in a food that wasn't scanned or found by search. */
export async function addPantryItemManualAction(
  input: AddPantryItemManualInput
): Promise<ActionResult & { item?: PantryItem }> {
  const ctx = await requireMember();
  if (!ctx) return { error: 'Not signed in.' };

  const name = input.name.trim();
  if (!name) return { error: 'Enter a food name.' };

  const category = input.category ?? categorizePantryItemName(name);
  const item = await insertPantryItem(ctx.supabase, {
    memberId: ctx.userId,
    name,
    quantityText: input.quantityText?.trim() || null,
    category,
    expirationDate: input.expirationDate ?? null,
  });
  if (!item) return { error: 'Could not add this to your pantry.' };
  return { item };
}

// ---- Read ----

export type PantryOverview = {
  active: PantryItemWithProduct[];
  expiringSoon: PantryItemWithProduct[];
  favorites: PantryItemWithProduct[];
  /** 0–3 deterministic coaching suggestions — see lib/pantry/suggestions.ts. */
  suggestions: string[];
};

const EMPTY_OVERVIEW: PantryOverview = {
  active: [],
  expiringSoon: [],
  favorites: [],
  suggestions: [],
};

export async function listMyPantryAction(): Promise<PantryOverview> {
  const ctx = await requireMember();
  if (!ctx) return EMPTY_OVERVIEW;
  const { supabase, userId } = ctx;

  const [active, expiringSoon, favorites] = await Promise.all([
    listActivePantryItems(supabase, userId),
    listPantryItemsExpiringSoon(supabase, userId),
    listFavoritePantryItems(supabase, userId),
  ]);

  // Suggestions are generated from every active item, not just the ones
  // that happen to also be favorites/expiring — "what could I make from
  // everything I currently have."
  const suggestions = generatePantrySuggestions(
    active.map((i) => ({ name: i.name, category: (i.category as FoodLensFoodCategory) ?? null }))
  );

  const [activeWithProduct, expiringWithProduct, favoritesWithProduct] = await Promise.all([
    attachProducts(supabase, active),
    attachProducts(supabase, expiringSoon),
    attachProducts(supabase, favorites),
  ]);

  return {
    active: activeWithProduct,
    expiringSoon: expiringWithProduct,
    favorites: favoritesWithProduct,
    suggestions,
  };
}

// ---- Update / status transitions ----

export type UpdatePantryItemInput = UpdatePantryItemPatch;

export async function updatePantryItemAction(
  id: string,
  patch: UpdatePantryItemInput
): Promise<ActionResult> {
  const ctx = await requireMember();
  if (!ctx) return { error: 'Not signed in.' };
  const ok = await updatePantryItem(ctx.supabase, ctx.userId, id, patch);
  if (!ok) return { error: 'Could not update this pantry item.' };
  return {};
}

export async function markPantryItemUsedAction(id: string): Promise<ActionResult> {
  const ctx = await requireMember();
  if (!ctx) return { error: 'Not signed in.' };
  const ok = await markPantryItemUsed(ctx.supabase, ctx.userId, id);
  if (!ok) return { error: 'Could not update this item.' };
  return {};
}

export async function removePantryItemAction(id: string): Promise<ActionResult> {
  const ctx = await requireMember();
  if (!ctx) return { error: 'Not signed in.' };
  const ok = await removePantryItem(ctx.supabase, ctx.userId, id);
  if (!ok) return { error: 'Could not remove this item.' };
  return {};
}

export async function toggleFavoritePantryItemAction(
  id: string
): Promise<ActionResult & { isFavorite?: boolean }> {
  const ctx = await requireMember();
  if (!ctx) return { error: 'Not signed in.' };
  const current = await getPantryItem(ctx.supabase, ctx.userId, id);
  if (!current) return { error: 'Pantry item not found.' };

  const nextFavorite = !current.is_favorite;
  const ok = await updatePantryItem(ctx.supabase, ctx.userId, id, { isFavorite: nextFavorite });
  if (!ok) return { error: 'Could not update favorite status.' };
  return { isFavorite: nextFavorite };
}
