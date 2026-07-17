/**
 * Food search & product memory (Part 4). Priority order per product
 * requirement §4: 1) member's recent foods, 2) member's frequently logged
 * foods, 3) verified cached products (food_products, any data_source),
 * 4) external search results. Every result carries its source so the UI
 * can label it plainly — never presenting an external/unverified hit as
 * equivalent to the member's own history.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { FoodProduct } from '@mef/shared-types-contracts';

export type FoodSearchResultSource = 'recent' | 'frequent' | 'cached' | 'external';

export type FoodSearchResult = {
  source: FoodSearchResultSource;
  /** Null only for an 'external' hit that hasn't been looked up/cached yet. */
  productId: string | null;
  barcode: string | null;
  name: string | null;
  brand: string | null;
  imageUrl: string | null;
  servingSizeText: string | null;
};

function toResult(product: Pick<FoodProduct, 'id' | 'barcode' | 'name' | 'brand' | 'image_url' | 'serving_size_text'>, source: FoodSearchResultSource): FoodSearchResult {
  return {
    source,
    productId: product.id,
    barcode: product.barcode,
    name: product.name,
    brand: product.brand,
    imageUrl: product.image_url,
    servingSizeText: product.serving_size_text,
  };
}

/** This member's most recently logged distinct products, newest first. */
export async function listRecentProductsForMember(
  supabase: SupabaseClient,
  memberId: string,
  limit = 8
): Promise<FoodSearchResult[]> {
  const { data, error } = await supabase
    .from('member_food_log')
    .select('product_id, consumed_at, food_products(id, barcode, name, brand, image_url, serving_size_text)')
    .eq('member_id', memberId)
    .not('product_id', 'is', null)
    .order('consumed_at', { ascending: false })
    .limit(limit * 3); // over-fetch, then dedupe by product — a member may log the same product several times in a row

  if (error) {
    console.error('listRecentProductsForMember failed', error);
    return [];
  }

  const seen = new Set<string>();
  const results: FoodSearchResult[] = [];
  for (const row of (data ?? []) as unknown as Array<{ product_id: string; food_products: FoodProduct | null }>) {
    const product = row.food_products;
    if (!product || seen.has(product.id)) continue;
    seen.add(product.id);
    results.push(toResult(product, 'recent'));
    if (results.length >= limit) break;
  }
  return results;
}

/** This member's most frequently logged products (all-time count), excluding any already surfaced as "recent". */
export async function listFrequentProductsForMember(
  supabase: SupabaseClient,
  memberId: string,
  excludeProductIds: string[],
  limit = 8
): Promise<FoodSearchResult[]> {
  const { data, error } = await supabase
    .from('member_food_log')
    .select('product_id')
    .eq('member_id', memberId)
    .not('product_id', 'is', null);

  if (error) {
    console.error('listFrequentProductsForMember failed', error);
    return [];
  }

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ product_id: string }>) {
    counts.set(row.product_id, (counts.get(row.product_id) ?? 0) + 1);
  }
  const exclude = new Set(excludeProductIds);
  const ranked = [...counts.entries()]
    .filter(([id, count]) => count >= 2 && !exclude.has(id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);

  if (ranked.length === 0) return [];

  const { data: products, error: productsError } = await supabase
    .from('food_products')
    .select('id, barcode, name, brand, image_url, serving_size_text')
    .in('id', ranked);
  if (productsError) {
    console.error('listFrequentProductsForMember: product fetch failed', productsError);
    return [];
  }

  const byId = new Map((products ?? []).map((p) => [p.id as string, p as FoodProduct]));
  return ranked
    .map((id) => byId.get(id))
    .filter((p): p is FoodProduct => Boolean(p))
    .map((p) => toResult(p, 'frequent'));
}

/** Cached food_products matching a free-text query via full-text search, excluding anything already shown. */
export async function searchCachedFoodProducts(
  supabase: SupabaseClient,
  query: string,
  excludeProductIds: string[],
  limit = 10
): Promise<FoodSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const { data, error } = await supabase
    .from('food_products')
    .select('id, barcode, name, brand, image_url, serving_size_text')
    .textSearch('search_vector', trimmed, { type: 'websearch' })
    .limit(limit + excludeProductIds.length);

  if (error) {
    console.error('searchCachedFoodProducts failed', error);
    return [];
  }

  const exclude = new Set(excludeProductIds);
  return (data ?? [])
    .filter((p) => !exclude.has(p.id as string))
    .slice(0, limit)
    .map((p) => toResult(p as FoodProduct, 'cached'));
}
