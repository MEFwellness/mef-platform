/**
 * Data access for exercise_extracted_posters (migration 118) — mid-movement
 * frames extracted from a video (either source) and stored in the
 * `exercise-media` public Supabase Storage bucket. Pure functions taking a
 * SupabaseClient, same shape as every other exercise-library data.ts file.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type { ExerciseExtractedPoster, ExerciseLibraryProvider, ExerciseVideoSource } from '@mef/shared-types-contracts';

export const EXERCISE_MEDIA_BUCKET = 'exercise-media';

export function posterStoragePath(source: ExerciseVideoSource, externalId: string): string {
  return `posters/${source}/${externalId}.jpg`;
}

export function licenseImageStoragePath(externalId: string): string {
  return `open-license/${externalId}.jpg`;
}

/**
 * Public bucket — a plain, deterministic public URL, no signed-URL round
 * trip and no Supabase client required (Supabase's own getPublicUrl is
 * pure string construction, never a network call, so this stays a pure
 * function usable from normalize.ts without threading a client through
 * it). Same rendering path ExerciseAPI.dev's own CDN image URLs already
 * use — a plain <img src>.
 */
export function toPublicMediaUrl(storagePath: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') ?? '';
  return `${base}/storage/v1/object/public/${EXERCISE_MEDIA_BUCKET}/${storagePath}`;
}

export async function getExtractedPosterMap(
  supabase: SupabaseClient,
  provider: ExerciseLibraryProvider,
  externalIds: string[]
): Promise<Map<string, ExerciseExtractedPoster>> {
  if (externalIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('exercise_extracted_posters')
    .select('*')
    .eq('provider', provider)
    .in('external_id', externalIds);
  if (error) {
    console.error('getExtractedPosterMap failed', error);
    return new Map();
  }

  const rows = (data as ExerciseExtractedPoster[]) ?? [];
  return new Map(rows.map((row) => [row.external_id, row]));
}

export async function getExtractedPoster(
  supabase: SupabaseClient,
  provider: ExerciseLibraryProvider,
  externalId: string
): Promise<ExerciseExtractedPoster | null> {
  const { data, error } = await supabase
    .from('exercise_extracted_posters')
    .select('*')
    .eq('provider', provider)
    .eq('external_id', externalId)
    .maybeSingle();
  if (error) {
    console.error('getExtractedPoster failed', error);
    return null;
  }
  return data as ExerciseExtractedPoster | null;
}

/** Written by the Phase 2 frame-extraction script (service-role client) — never by request-time application code. */
export async function upsertExtractedPoster(
  supabase: SupabaseClient,
  input: {
    provider: ExerciseLibraryProvider;
    externalId: string;
    source: ExerciseVideoSource;
    storagePath: string;
  }
): Promise<boolean> {
  const { error } = await supabase.from('exercise_extracted_posters').upsert(
    {
      id: randomUUID(),
      provider: input.provider,
      external_id: input.externalId,
      source: input.source,
      storage_path: input.storagePath,
    },
    { onConflict: 'provider,external_id' }
  );
  if (error) {
    console.error('upsertExtractedPoster failed', error);
    return false;
  }
  return true;
}

/** The your_move half of the purge manifest's poster assets — every storage path here, plus the your_move_exercise_links rows (see links.ts), is everything a Your Move cancellation must remove. */
export async function removeYourMoveExtractedPosters(
  supabase: SupabaseClient
): Promise<{ removed: number; storagePaths: string[] }> {
  const { data, error } = await supabase
    .from('exercise_extracted_posters')
    .select('id, storage_path')
    .eq('source', 'your_move');
  if (error) {
    console.error('removeYourMoveExtractedPosters: list failed', error);
    return { removed: 0, storagePaths: [] };
  }

  const rows = (data as { id: string; storage_path: string }[]) ?? [];
  const { error: deleteError } = await supabase
    .from('exercise_extracted_posters')
    .delete()
    .in(
      'id',
      rows.map((row) => row.id)
    );
  if (deleteError) {
    console.error('removeYourMoveExtractedPosters: delete failed', deleteError);
    return { removed: 0, storagePaths: [] };
  }

  return { removed: rows.length, storagePaths: rows.map((row) => row.storage_path) };
}
