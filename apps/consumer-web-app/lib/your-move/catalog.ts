/**
 * Data access for exercise_catalog (migration 119) — the sole Exercise
 * Library catalog, populated from Your Move's browse endpoint by
 * scripts/exercise-media/fetch-your-move-catalog.ts. Pure functions taking
 * a SupabaseClient, same shape as every other exercise-library data.ts
 * file — RLS is the real authorization boundary (authenticated read,
 * coach/admin write).
 *
 * search() reads and filters entirely from our own database — Your
 * Move's own /exercises endpoint is never called on a browse/search
 * request (that would spend the monthly exercise quota on every page
 * view); browse mode is used only by the offline catalog-fetch script.
 *
 * The video_url/video_url_expires_at cache lives directly on each
 * exercise_catalog row (folded in from the old your_move_exercise_links
 * table, migration 118) — no separate mapping is needed since the
 * catalog row already IS the Your Move exercise.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExerciseCatalogRow } from '@mef/shared-types-contracts';

/** Well under Your Move's 48h URL expiry — just long enough to dedupe a member replaying the same clip a few times in a row. */
export const VIDEO_URL_CACHE_TTL_MS = 10 * 60 * 1000;

export function isVideoUrlCacheValid(row: Pick<ExerciseCatalogRow, 'video_url' | 'video_url_expires_at'>): boolean {
  if (!row.video_url || !row.video_url_expires_at) return false;
  return new Date(row.video_url_expires_at).getTime() > Date.now();
}

export async function cacheVideoUrl(
  supabase: SupabaseClient,
  id: string,
  videoUrl: string,
  ttlMs: number = VIDEO_URL_CACHE_TTL_MS
): Promise<void> {
  const { error } = await supabase
    .from('exercise_catalog')
    .update({
      video_url: videoUrl,
      video_url_expires_at: new Date(Date.now() + ttlMs).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) console.error('cacheVideoUrl failed', error);
}

export async function getExerciseByExternalId(
  supabase: SupabaseClient,
  externalId: string
): Promise<ExerciseCatalogRow | null> {
  const { data, error } = await supabase
    .from('exercise_catalog')
    .select('*')
    .eq('external_id', externalId)
    .maybeSingle();
  if (error) {
    console.error('getExerciseByExternalId failed', error);
    return null;
  }
  return data as ExerciseCatalogRow | null;
}

export async function getExercisesByExternalIds(
  supabase: SupabaseClient,
  externalIds: string[]
): Promise<Map<string, ExerciseCatalogRow>> {
  if (externalIds.length === 0) return new Map();
  const { data, error } = await supabase.from('exercise_catalog').select('*').in('external_id', externalIds);
  if (error) {
    console.error('getExercisesByExternalIds failed', error);
    return new Map();
  }
  const rows = (data as ExerciseCatalogRow[]) ?? [];
  return new Map(rows.map((row) => [row.external_id, row]));
}

export type ExerciseCatalogSearchParams = {
  q?: string | undefined;
  category?: string | undefined;
  muscle?: string | undefined;
  equipment?: string | undefined;
  difficulty?: string | undefined;
  bodyRegion?: import('../exercise-library/bodyRegions').BodyRegion | null | undefined;
  random?: boolean | undefined;
  excludeExternalId?: string | undefined;
  limit?: number;
  offset?: number;
};

export type ExerciseCatalogSearchResult = {
  data: ExerciseCatalogRow[];
  total: number | null;
};

/** Every browse/search request in the app goes through this — a plain DB query, never a live Your Move HTTP call. */
export async function searchExerciseCatalog(
  supabase: SupabaseClient,
  params: ExerciseCatalogSearchParams
): Promise<ExerciseCatalogSearchResult> {
  const limit = params.limit ?? 30;
  const offset = params.offset ?? 0;

  let query = supabase.from('exercise_catalog').select('*', { count: 'exact' });

  if (params.q) {
    query = query.ilike('name', `%${params.q}%`);
  }
  if (params.category) {
    query = query.eq('category', params.category);
  }
  if (params.muscle) {
    query = query.or(`primary_muscle.eq.${params.muscle},secondary_muscles.cs.{${params.muscle}}`);
  }
  if (params.equipment) {
    query = query.eq('equipment', params.equipment);
  }
  if (params.difficulty) {
    query = query.eq('difficulty', params.difficulty);
  }
  if (params.excludeExternalId) {
    query = query.neq('external_id', params.excludeExternalId);
  }

  if (params.random) {
    // No native random-sort in a plain Supabase query builder — over-fetch
    // a bounded window and shuffle client-of-DB, same "small, bounded,
    // never an unbounded scan" discipline as every other over-fetch in
    // this codebase (see getSuggestedNextExercise's own caller).
    query = query.limit(50);
    const { data, error } = await query;
    if (error) {
      console.error('searchExerciseCatalog (random) failed', error);
      return { data: [], total: null };
    }
    const rows = (data as ExerciseCatalogRow[]) ?? [];
    const shuffled = [...rows].sort(() => Math.random() - 0.5);
    return { data: shuffled.slice(0, limit), total: null };
  }

  query = query.order('name', { ascending: true }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) {
    console.error('searchExerciseCatalog failed', error);
    return { data: [], total: null };
  }
  return { data: (data as ExerciseCatalogRow[]) ?? [], total: count ?? null };
}

/** Distinct, non-empty values for a filter column — powers the dynamic Category/Muscle/Equipment/Difficulty dropdowns, sourced from our own stored catalog rather than a hardcoded vendor vocabulary. */
export async function listDistinctCatalogValues(
  supabase: SupabaseClient,
  column: 'category' | 'primary_muscle' | 'equipment' | 'difficulty'
): Promise<string[]> {
  const { data, error } = await supabase.from('exercise_catalog').select(column).not(column, 'is', null);
  if (error) {
    console.error('listDistinctCatalogValues failed', error);
    return [];
  }
  const values = new Set<string>();
  for (const row of (data as Record<string, string | null>[]) ?? []) {
    const value = row[column];
    if (value && value.trim()) values.add(value.trim());
  }
  return Array.from(values).sort((a, b) => a.localeCompare(b));
}
