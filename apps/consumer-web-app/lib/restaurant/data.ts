/**
 * Database access for Restaurant Intelligence (Food Lens Part 8) — same
 * shape as lib/food-products/data.ts and lib/food-lens/data.ts: pure
 * functions taking a SupabaseClient, RLS (migration 60) is the real
 * authorization boundary, the return object is constructed from the
 * insert input rather than re-selecting after insert.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type {
  RestaurantEntrySource,
  RestaurantEstimateBasis,
  RestaurantMealAnalysis,
  RestaurantMealEntry,
} from '@mef/shared-types-contracts';

export type InsertRestaurantMealEntryInput = {
  memberId: string;
  restaurantName: string;
  menuItemName?: string | null;
  source: RestaurantEntrySource;
  scanId?: string | null;
  rawMenuText?: string | null;
};

export async function insertRestaurantMealEntry(
  supabase: SupabaseClient,
  input: InsertRestaurantMealEntryInput
): Promise<RestaurantMealEntry | null> {
  const id = randomUUID();
  const now = new Date().toISOString();

  const row = {
    id,
    member_id: input.memberId,
    restaurant_name: input.restaurantName,
    menu_item_name: input.menuItemName ?? null,
    source: input.source,
    scan_id: input.scanId ?? null,
    raw_menu_text: input.rawMenuText ?? null,
    estimate_basis: 'member_entered' as RestaurantEstimateBasis,
    analysis: {},
    created_at: now,
  };

  const { error } = await supabase.from('restaurant_meal_entries').insert(row);
  if (error) {
    console.error('insertRestaurantMealEntry failed', error);
    return null;
  }
  return row as RestaurantMealEntry;
}

export async function getRestaurantMealEntry(
  supabase: SupabaseClient,
  id: string
): Promise<RestaurantMealEntry | null> {
  const { data, error } = await supabase
    .from('restaurant_meal_entries')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.error('getRestaurantMealEntry failed', error);
    return null;
  }
  return data as RestaurantMealEntry | null;
}

export async function updateRestaurantMealEntryAnalysis(
  supabase: SupabaseClient,
  id: string,
  patch: { analysis: RestaurantMealAnalysis; estimateBasis: RestaurantEstimateBasis }
): Promise<RestaurantMealEntry | null> {
  const existing = await getRestaurantMealEntry(supabase, id);
  if (!existing) return null;

  const { error } = await supabase
    .from('restaurant_meal_entries')
    .update({ analysis: patch.analysis, estimate_basis: patch.estimateBasis })
    .eq('id', id);
  if (error) {
    console.error('updateRestaurantMealEntryAnalysis failed', error);
    return null;
  }

  return {
    ...existing,
    analysis: patch.analysis,
    estimate_basis: patch.estimateBasis,
  };
}

export async function listMyRestaurantMealEntries(
  supabase: SupabaseClient,
  memberId: string,
  limit = 20
): Promise<RestaurantMealEntry[]> {
  const { data, error } = await supabase
    .from('restaurant_meal_entries')
    .select('*')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('listMyRestaurantMealEntries failed', error);
    return [];
  }
  return data as RestaurantMealEntry[];
}
