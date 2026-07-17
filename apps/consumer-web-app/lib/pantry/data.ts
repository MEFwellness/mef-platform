/**
 * Database access for Pantry Intelligence (Part 9, migration 60's
 * pantry_items table) — same shape as lib/food-products/data.ts: pure
 * functions taking a SupabaseClient, RLS decides who may read/write what,
 * inserts generate their own `randomUUID()` id and return the constructed
 * object rather than re-`.select()`ing. Every mutation here also filters
 * explicitly by memberId (not just relying on RLS) — the same defense-in-
 * depth discipline as deleteFoodLogEntry in lib/food-products/data.ts.
 *
 * Deliberately simple per product requirement §9: no quantity units, no
 * stock thresholds, no location/shelf tracking. "Remove" is a status
 * transition (status = 'removed'), never a hard delete — this keeps the
 * same append-only/status-transition discipline the rest of this app uses
 * for member-authored rows (e.g. food_lens_scans, member_food_log never
 * hard-deletes cross-references), and means a removed item's history isn't
 * silently destroyed if a member removes something by mistake. "Used" is a
 * separate, distinct status from "removed" so the future frequently-used
 * suggestion logic can tell "the member ran out" apart from "the member
 * decided they didn't want this after all" — both simply stop counting as
 * on-hand (product requirement: "never assume the member still has an item
 * unless it remains active in the pantry").
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type { PantryItem, PantryItemStatus } from '@mef/shared-types-contracts';

export type InsertPantryItemInput = {
  memberId: string;
  name: string;
  productId?: string | null;
  quantityText?: string | null;
  category?: string | null;
  expirationDate?: string | null;
};

export async function insertPantryItem(
  supabase: SupabaseClient,
  input: InsertPantryItemInput
): Promise<PantryItem | null> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const row: PantryItem = {
    id,
    member_id: input.memberId,
    product_id: input.productId ?? null,
    name: input.name,
    quantity_text: input.quantityText ?? null,
    category: input.category ?? null,
    expiration_date: input.expirationDate ?? null,
    is_favorite: false,
    status: 'active',
    added_at: now,
    updated_at: now,
  };
  const { error } = await supabase.from('pantry_items').insert({
    id: row.id,
    member_id: row.member_id,
    product_id: row.product_id,
    name: row.name,
    quantity_text: row.quantity_text,
    category: row.category,
    expiration_date: row.expiration_date,
    is_favorite: row.is_favorite,
    status: row.status,
    added_at: row.added_at,
    updated_at: row.updated_at,
  });
  if (error) {
    console.error('insertPantryItem failed', error);
    return null;
  }
  return row;
}

export async function listActivePantryItems(
  supabase: SupabaseClient,
  memberId: string
): Promise<PantryItem[]> {
  const { data, error } = await supabase
    .from('pantry_items')
    .select('*')
    .eq('member_id', memberId)
    .eq('status', 'active')
    .order('added_at', { ascending: false });
  if (error) {
    console.error('listActivePantryItems failed', error);
    return [];
  }
  return data as PantryItem[];
}

/**
 * Active items whose expiration_date falls within `withinDays` from today
 * (inclusive), or has already passed — an already-expired item is still
 * "nearing expiration" in the sense that matters to a member deciding what
 * to use first, so it is not filtered out. Ordered soonest-first so the
 * most urgent item surfaces first.
 */
export async function listPantryItemsExpiringSoon(
  supabase: SupabaseClient,
  memberId: string,
  withinDays = 5
): Promise<PantryItem[]> {
  const cutoff = new Date();
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setUTCDate(cutoff.getUTCDate() + withinDays);
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('pantry_items')
    .select('*')
    .eq('member_id', memberId)
    .eq('status', 'active')
    .not('expiration_date', 'is', null)
    .lte('expiration_date', cutoffDate)
    .order('expiration_date', { ascending: true });
  if (error) {
    console.error('listPantryItemsExpiringSoon failed', error);
    return [];
  }
  return data as PantryItem[];
}

export async function listFavoritePantryItems(
  supabase: SupabaseClient,
  memberId: string
): Promise<PantryItem[]> {
  const { data, error } = await supabase
    .from('pantry_items')
    .select('*')
    .eq('member_id', memberId)
    .eq('status', 'active')
    .eq('is_favorite', true)
    .order('added_at', { ascending: false });
  if (error) {
    console.error('listFavoritePantryItems failed', error);
    return [];
  }
  return data as PantryItem[];
}

export async function getPantryItem(
  supabase: SupabaseClient,
  memberId: string,
  id: string
): Promise<PantryItem | null> {
  const { data, error } = await supabase
    .from('pantry_items')
    .select('*')
    .eq('id', id)
    .eq('member_id', memberId)
    .maybeSingle();
  if (error) {
    console.error('getPantryItem failed', error);
    return null;
  }
  return data as PantryItem | null;
}

export type UpdatePantryItemPatch = Partial<{
  quantityText: string | null;
  expirationDate: string | null;
  category: string | null;
  isFavorite: boolean;
}>;

export async function updatePantryItem(
  supabase: SupabaseClient,
  memberId: string,
  id: string,
  patch: UpdatePantryItemPatch
): Promise<boolean> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ('quantityText' in patch) update.quantity_text = patch.quantityText;
  if ('expirationDate' in patch) update.expiration_date = patch.expirationDate;
  if ('category' in patch) update.category = patch.category;
  if ('isFavorite' in patch) update.is_favorite = patch.isFavorite;

  const { error } = await supabase
    .from('pantry_items')
    .update(update)
    .eq('id', id)
    .eq('member_id', memberId);
  if (error) {
    console.error('updatePantryItem failed', error);
    return false;
  }
  return true;
}

async function setPantryItemStatus(
  supabase: SupabaseClient,
  memberId: string,
  id: string,
  status: PantryItemStatus
): Promise<boolean> {
  const { error } = await supabase
    .from('pantry_items')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('member_id', memberId);
  if (error) {
    console.error(`setPantryItemStatus(${status}) failed`, error);
    return false;
  }
  return true;
}

/** Member says they've used this item up — distinct from removePantryItem (see this file's header). */
export async function markPantryItemUsed(
  supabase: SupabaseClient,
  memberId: string,
  id: string
): Promise<boolean> {
  return setPantryItemStatus(supabase, memberId, id, 'used');
}

/** Status transition, not a hard delete — see this file's header. */
export async function removePantryItem(
  supabase: SupabaseClient,
  memberId: string,
  id: string
): Promise<boolean> {
  return setPantryItemStatus(supabase, memberId, id, 'removed');
}
