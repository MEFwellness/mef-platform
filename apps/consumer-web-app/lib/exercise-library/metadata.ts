/**
 * Data access for mef_exercise_metadata (migration 80). Pure functions
 * taking a SupabaseClient, same shape as every other feature's data.ts file
 * in this app — RLS is the real authorization boundary (authenticated read,
 * coach/admin write; see the migration).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type { ExerciseLibraryProvider, MefExerciseMetadata } from '@mef/shared-types-contracts';

/**
 * Reads are external_id-only, not (provider, external_id) — external_id is
 * already unique across the whole catalog in practice (Your Move's own
 * UUIDs vs. MEF's own `mef-custom-*` slugs can never collide), and this
 * keeps a single search/browse page from having to split its metadata
 * lookup by provider when results mix Your Move and MEF-custom exercises
 * (see migration 129's mef_custom provider value). The unique DB
 * constraint remains (provider, external_id) — writes still need the
 * provider (see upsertExerciseMetadataCues below).
 */
export async function getExerciseMetadata(
  supabase: SupabaseClient,
  externalId: string
): Promise<MefExerciseMetadata | null> {
  const { data, error } = await supabase
    .from('mef_exercise_metadata')
    .select('*')
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
  externalIds: string[]
): Promise<Map<string, MefExerciseMetadata>> {
  if (externalIds.length === 0) return new Map();

  const { data, error } = await supabase.from('mef_exercise_metadata').select('*').in('external_id', externalIds);
  if (error) {
    console.error('getExerciseMetadataMap failed', error);
    return new Map();
  }

  const rows = (data as MefExerciseMetadata[]) ?? [];
  return new Map(rows.map((row) => [row.external_id, row]));
}

/**
 * Written by the Phase 4 cue-generation script (scripts/exercise-media/
 * write-cues.ts, service-role client) — never by request-time application
 * code. Only touches coaching_cues; an existing row's other curated
 * fields (program_section, contraindications, etc.) are left exactly as
 * they are, and a brand-new row for a previously-uncurated exercise gets
 * every other column's schema default.
 */
export async function upsertExerciseMetadataCues(
  supabase: SupabaseClient,
  provider: ExerciseLibraryProvider,
  externalId: string,
  coachingCues: string[]
): Promise<boolean> {
  const existing = await getExerciseMetadata(supabase, externalId);
  const { error } = await supabase.from('mef_exercise_metadata').upsert(
    {
      id: existing?.id ?? randomUUID(),
      provider,
      external_id: externalId,
      coaching_cues: coachingCues,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'provider,external_id' }
  );
  if (error) {
    console.error('upsertExerciseMetadataCues failed', error);
    return false;
  }
  return true;
}
