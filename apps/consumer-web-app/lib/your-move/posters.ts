/**
 * Data access for exercise_extracted_posters (migration 118) — mid-movement
 * frames extracted from a Your Move video and stored in the
 * `exercise-media` public Supabase Storage bucket. Every row is Your
 * Move-sourced now that Your Move is the sole catalog (migration 119) —
 * this whole table is the poster half of the Your Move purge manifest
 * (see removeYourMoveExtractedPosters below); the mapping half lives
 * directly on exercise_catalog (its video_url/video_url_expires_at cache
 * — see catalog.ts).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type { ExerciseExtractedPoster } from '@mef/shared-types-contracts';

export const EXERCISE_MEDIA_BUCKET = 'exercise-media';

export function posterStoragePath(externalId: string): string {
  return `posters/your_move/${externalId}.jpg`;
}

/**
 * Public bucket — a plain, deterministic public URL, no signed-URL round
 * trip and no Supabase client required (Supabase's own getPublicUrl is
 * pure string construction, never a network call, so this stays a pure
 * function usable from normalize.ts without threading a client through
 * it).
 */
export function toPublicMediaUrl(storagePath: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') ?? '';
  return `${base}/storage/v1/object/public/${EXERCISE_MEDIA_BUCKET}/${storagePath}`;
}

export async function getExtractedPosterMap(
  supabase: SupabaseClient,
  externalIds: string[]
): Promise<Map<string, ExerciseExtractedPoster>> {
  if (externalIds.length === 0) return new Map();

  const { data, error } = await supabase.from('exercise_extracted_posters').select('*').in('external_id', externalIds);
  if (error) {
    console.error('getExtractedPosterMap failed', error);
    return new Map();
  }

  const rows = (data as ExerciseExtractedPoster[]) ?? [];
  return new Map(rows.map((row) => [row.external_id, row]));
}

export async function getExtractedPoster(
  supabase: SupabaseClient,
  externalId: string
): Promise<ExerciseExtractedPoster | null> {
  const { data, error } = await supabase
    .from('exercise_extracted_posters')
    .select('*')
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
  input: { externalId: string; storagePath: string }
): Promise<boolean> {
  const { error } = await supabase.from('exercise_extracted_posters').upsert(
    {
      id: randomUUID(),
      provider: 'your_move',
      external_id: input.externalId,
      source: 'your_move',
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

/** Every row is a Your Move-derived poster asset — this is the whole purge manifest's poster half, callable by scripts/exercise-media/purge-your-move-media.ts if the subscription ever lapses. Returns storage paths so the caller can also delete the underlying storage objects. */
export async function removeYourMoveExtractedPosters(
  supabase: SupabaseClient
): Promise<{ removed: number; storagePaths: string[] }> {
  const { data, error } = await supabase.from('exercise_extracted_posters').select('id, storage_path');
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
