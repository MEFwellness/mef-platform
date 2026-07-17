/**
 * Saved meals & favorites (Part 4) — data access for saved_meals /
 * saved_meal_items / member_food_favorites (migration 60). Same shape as
 * every other data file: pure functions taking a SupabaseClient, RLS is
 * the real authorization boundary.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type {
  FoodFavoriteType,
  FoodLensDetectedItem,
  MemberFoodFavorite,
  SavedMeal,
  SavedMealItem,
} from '@mef/shared-types-contracts';

// ---- saved_meals / saved_meal_items ----

export async function insertSavedMealFromDetectedItems(
  supabase: SupabaseClient,
  input: { memberId: string; name: string; sourceScanId: string | null; items: FoodLensDetectedItem[] }
): Promise<SavedMeal | null> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const { error } = await supabase.from('saved_meals').insert({
    id,
    member_id: input.memberId,
    name: input.name,
    source_scan_id: input.sourceScanId,
    created_at: now,
  });
  if (error) {
    console.error('insertSavedMealFromDetectedItems: saved_meals insert failed', error);
    return null;
  }

  if (input.items.length > 0) {
    const { error: itemsError } = await supabase.from('saved_meal_items').insert(
      input.items.map((item) => ({
        id: randomUUID(),
        saved_meal_id: id,
        product_id: null,
        label: item.label,
        category: item.category,
        servings: 1,
        created_at: now,
      }))
    );
    if (itemsError) {
      console.error('insertSavedMealFromDetectedItems: saved_meal_items insert failed', itemsError);
    }
  }

  return { id, member_id: input.memberId, name: input.name, source_scan_id: input.sourceScanId, created_at: now };
}

export async function insertSavedMealFromProduct(
  supabase: SupabaseClient,
  input: { memberId: string; name: string; productId: string; label: string }
): Promise<SavedMeal | null> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const { error } = await supabase.from('saved_meals').insert({
    id,
    member_id: input.memberId,
    name: input.name,
    source_scan_id: null,
    created_at: now,
  });
  if (error) {
    console.error('insertSavedMealFromProduct: saved_meals insert failed', error);
    return null;
  }
  const { error: itemError } = await supabase.from('saved_meal_items').insert({
    id: randomUUID(),
    saved_meal_id: id,
    product_id: input.productId,
    label: input.label,
    category: null,
    servings: 1,
    created_at: now,
  });
  if (itemError) console.error('insertSavedMealFromProduct: saved_meal_items insert failed', itemError);

  return { id, member_id: input.memberId, name: input.name, source_scan_id: null, created_at: now };
}

export async function listMySavedMeals(supabase: SupabaseClient, memberId: string): Promise<SavedMeal[]> {
  const { data, error } = await supabase
    .from('saved_meals')
    .select('*')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('listMySavedMeals failed', error);
    return [];
  }
  return data as SavedMeal[];
}

export async function getSavedMealWithItems(
  supabase: SupabaseClient,
  savedMealId: string
): Promise<{ meal: SavedMeal; items: SavedMealItem[] } | null> {
  const [{ data: meal, error: mealError }, { data: items, error: itemsError }] = await Promise.all([
    supabase.from('saved_meals').select('*').eq('id', savedMealId).maybeSingle(),
    supabase.from('saved_meal_items').select('*').eq('saved_meal_id', savedMealId),
  ]);
  if (mealError || !meal) {
    if (mealError) console.error('getSavedMealWithItems failed', mealError);
    return null;
  }
  if (itemsError) console.error('getSavedMealWithItems: items fetch failed', itemsError);
  return { meal: meal as SavedMeal, items: (items as SavedMealItem[]) ?? [] };
}

export async function deleteSavedMeal(supabase: SupabaseClient, memberId: string, savedMealId: string): Promise<boolean> {
  const { error } = await supabase.from('saved_meals').delete().eq('id', savedMealId).eq('member_id', memberId);
  if (error) {
    console.error('deleteSavedMeal failed', error);
    return false;
  }
  return true;
}

// ---- member_food_favorites ----

export async function listMyFavorites(supabase: SupabaseClient, memberId: string): Promise<MemberFoodFavorite[]> {
  const { data, error } = await supabase
    .from('member_food_favorites')
    .select('*')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('listMyFavorites failed', error);
    return [];
  }
  return data as MemberFoodFavorite[];
}

export async function addFavorite(
  supabase: SupabaseClient,
  input: { memberId: string; favoriteType: FoodFavoriteType; productId?: string | null; savedMealId?: string | null }
): Promise<MemberFoodFavorite | null> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const { error } = await supabase.from('member_food_favorites').insert({
    id,
    member_id: input.memberId,
    favorite_type: input.favoriteType,
    product_id: input.productId ?? null,
    saved_meal_id: input.savedMealId ?? null,
    created_at: now,
  });
  if (error) {
    console.error('addFavorite failed', error);
    return null;
  }
  return {
    id,
    member_id: input.memberId,
    favorite_type: input.favoriteType,
    product_id: input.productId ?? null,
    saved_meal_id: input.savedMealId ?? null,
    created_at: now,
  };
}

export async function removeFavoriteByProduct(supabase: SupabaseClient, memberId: string, productId: string): Promise<boolean> {
  const { error } = await supabase
    .from('member_food_favorites')
    .delete()
    .eq('member_id', memberId)
    .eq('product_id', productId);
  if (error) {
    console.error('removeFavoriteByProduct failed', error);
    return false;
  }
  return true;
}

export async function isProductFavorited(supabase: SupabaseClient, memberId: string, productId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('member_food_favorites')
    .select('id')
    .eq('member_id', memberId)
    .eq('product_id', productId)
    .maybeSingle();
  if (error) {
    console.error('isProductFavorited failed', error);
    return false;
  }
  return Boolean(data);
}
