/**
 * Data access for mef_exercise_metadata (migration 80). Pure functions
 * taking a SupabaseClient, same shape as every other feature's data.ts file
 * in this app — RLS is the real authorization boundary (authenticated read,
 * coach/admin write; see the migration).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExerciseLibraryProvider, MefExerciseMetadata } from '@mef/shared-types-contracts';

export async function getExerciseMetadata(
  supabase: SupabaseClient,
  provider: ExerciseLibraryProvider,
  externalId: string
): Promise<MefExerciseMetadata | null> {
  const { data, error } = await supabase
    .from('mef_exercise_metadata')
    .select('*')
    .eq('provider', provider)
    .eq('external_id', externalId)
    .maybeSingle();
  if (error) {
    console.error('getExerciseMetadata failed', error);
    return null;
  }
  return data as MefExerciseMetadata | null;
}

/** Batched lookup for a page of search results — one query instead of one-per-row. */
export async function getExerciseMetadataMap(
  supabase: SupabaseClient,
  provider: ExerciseLibraryProvider,
  externalIds: string[]
): Promise<Map<string, MefExerciseMetadata>> {
  if (externalIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('mef_exercise_metadata')
    .select('*')
    .eq('provider', provider)
    .in('external_id', externalIds);
  if (error) {
    console.error('getExerciseMetadataMap failed', error);
    return new Map();
  }

  const rows = (data as MefExerciseMetadata[]) ?? [];
  return new Map(rows.map((row) => [row.external_id, row]));
}
