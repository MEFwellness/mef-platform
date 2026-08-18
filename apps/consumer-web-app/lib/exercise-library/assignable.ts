/**
 * Reading the catalog for anything that will end up in front of a member.
 *
 * THE RULE IS NOT HERE. `exercise_catalog.is_client_assignable` (migration
 * 170) is a generated column, and it is the only statement of what may be
 * assigned to a member. Everything below reads it. Nothing below re-derives
 * it from has_video, from provider, or from anything else, which is what
 * makes "give the 28 MEF exercises videos and they become assignable" true
 * with no code change rather than true in a comment.
 *
 * WHY PAGING, EVERY TIME. Two selection paths used to read the exercise
 * tables with a flat `.limit(500)` against a table of 853 rows, so 41% of
 * the catalog was invisible to them and nothing said so. PostgREST also
 * caps a request at its own configured maximum, so a single large `.limit()`
 * is not a fix either. Every read here pages until a short page comes back.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { MefExerciseMetadata } from '@mef/shared-types-contracts';

/** PostgREST's default max-rows ceiling is 1000; staying under it means a full page is always a real full page and never a silently truncated one. */
const PAGE_SIZE = 500;

async function pageThrough<T>(
  label: string,
  fetchPage: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>
): Promise<T[]> {
  const all: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await fetchPage(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`${label} failed: ${error.message}`);
    const rows = (data ?? []) as T[];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return all;
}

/**
 * Every client-assignable exercise's display name, keyed by external id.
 *
 * A caller that joins its own rows against this map gets the assignability
 * filter for free: an exercise that is not assignable simply has no name
 * to join to, so it cannot be named, offered or selected.
 */
export async function listAssignableCatalogNames(
  supabase: SupabaseClient
): Promise<Map<string, string>> {
  const rows = await pageThrough<{ external_id: string; name: string }>(
    'listAssignableCatalogNames',
    (from, to) =>
      supabase
        .from('exercise_catalog')
        .select('external_id, name')
        .eq('is_client_assignable', true)
        .range(from, to)
  );
  return new Map(rows.map((row) => [row.external_id, row.name]));
}

/** The same set as above, without the names, for callers that only need to test membership. */
export async function listAssignableExternalIds(supabase: SupabaseClient): Promise<Set<string>> {
  const rows = await pageThrough<{ external_id: string }>('listAssignableExternalIds', (from, to) =>
    supabase
      .from('exercise_catalog')
      .select('external_id')
      .eq('is_client_assignable', true)
      .range(from, to)
  );
  return new Set(rows.map((row) => row.external_id));
}

/**
 * The whole MEF curation layer, paged in full, reduced to the exercises
 * that may actually be given to a member.
 *
 * Both callers scan this table in application code for tag overlap rather
 * than querying per tag, which is fine at this size but only honest if the
 * scan sees the whole table. Returns [] rather than throwing when the read
 * fails, matching both callers' existing behaviour on error.
 */
export async function loadAssignableExerciseMetadata(
  supabase: SupabaseClient,
  label: string
): Promise<MefExerciseMetadata[]> {
  try {
    const [rows, assignableIds] = await Promise.all([
      pageThrough<MefExerciseMetadata>(label, (from, to) =>
        supabase.from('mef_exercise_metadata').select('*').range(from, to)
      ),
      listAssignableExternalIds(supabase),
    ]);
    return rows.filter((row) => assignableIds.has(row.external_id));
  } catch (err) {
    console.error(`${label} failed`, err);
    return [];
  }
}
