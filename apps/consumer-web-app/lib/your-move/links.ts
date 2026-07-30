/**
 * Data access for your_move_exercise_links (migration 118) — the our-id ->
 * Your Move-id mapping, plus its short-lived (~10min) cached video_url.
 * Pure functions taking a SupabaseClient, same shape as every other
 * exercise-library data.ts file — RLS is the real authorization boundary.
 *
 * This table doubles as the purge manifest (see the migration header) —
 * removeYourMoveLink / removeAllYourMoveLinks are also the two functions
 * scripts/purge-your-move-media.mjs calls if the subscription ever lapses.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type { ExerciseLibraryProvider, YourMoveExerciseLink } from '@mef/shared-types-contracts';

/** Well under Your Move's 48h URL expiry — just long enough to dedupe a member replaying the same clip a few times in a row. */
export const VIDEO_URL_CACHE_TTL_MS = 10 * 60 * 1000;

export async function getYourMoveLink(
  supabase: SupabaseClient,
  provider: ExerciseLibraryProvider,
  externalId: string
): Promise<YourMoveExerciseLink | null> {
  const { data, error } = await supabase
    .from('your_move_exercise_links')
    .select('*')
    .eq('provider', provider)
    .eq('external_id', externalId)
    .maybeSingle();
  if (error) {
    console.error('getYourMoveLink failed', error);
    return null;
  }
  return data as YourMoveExerciseLink | null;
}

/** Batched lookup for a page of search results — one query instead of one-per-row, same pattern as getExerciseMetadataMap. */
export async function getYourMoveLinkMap(
  supabase: SupabaseClient,
  provider: ExerciseLibraryProvider,
  externalIds: string[]
): Promise<Map<string, YourMoveExerciseLink>> {
  if (externalIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('your_move_exercise_links')
    .select('*')
    .eq('provider', provider)
    .in('external_id', externalIds);
  if (error) {
    console.error('getYourMoveLinkMap failed', error);
    return new Map();
  }

  const rows = (data as YourMoveExerciseLink[]) ?? [];
  return new Map(rows.map((row) => [row.external_id, row]));
}

/** Written by the Phase 1 matching script (service-role client) — never by request-time application code. */
export async function upsertYourMoveLink(
  supabase: SupabaseClient,
  input: {
    provider: ExerciseLibraryProvider;
    externalId: string;
    yourMoveExerciseId: string;
    matchReasoning: string | null;
  }
): Promise<boolean> {
  const { error } = await supabase.from('your_move_exercise_links').upsert(
    {
      id: randomUUID(),
      provider: input.provider,
      external_id: input.externalId,
      your_move_exercise_id: input.yourMoveExerciseId,
      match_confidence: 'confident',
      match_reasoning: input.matchReasoning,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'provider,external_id' }
  );
  if (error) {
    console.error('upsertYourMoveLink failed', error);
    return false;
  }
  return true;
}

/** Fetch-at-play-time cache write — id here is the row's own uuid, not the external_id, since callers already have the row loaded via getYourMoveLink. */
export async function cacheVideoUrl(
  supabase: SupabaseClient,
  linkId: string,
  videoUrl: string,
  ttlMs: number = VIDEO_URL_CACHE_TTL_MS
): Promise<void> {
  const { error } = await supabase
    .from('your_move_exercise_links')
    .update({
      video_url: videoUrl,
      video_url_expires_at: new Date(Date.now() + ttlMs).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', linkId);
  if (error) console.error('cacheVideoUrl failed', error);
}

export function isVideoUrlCacheValid(link: YourMoveExerciseLink): boolean {
  if (!link.video_url || !link.video_url_expires_at) return false;
  return new Date(link.video_url_expires_at).getTime() > Date.now();
}

/** Every row is a Your Move-derived mapping — deleting all of them is the mapping half of the purge manifest. The other half (extracted poster storage objects) is exercise_extracted_posters' source='your_move' rows, see posters.ts. */
export async function removeAllYourMoveLinks(supabase: SupabaseClient): Promise<{ removed: number }> {
  const { data, error } = await supabase.from('your_move_exercise_links').select('id');
  if (error) {
    console.error('removeAllYourMoveLinks: list failed', error);
    return { removed: 0 };
  }

  const rows = (data as { id: string }[]) ?? [];
  const { error: deleteError } = await supabase
    .from('your_move_exercise_links')
    .delete()
    .in(
      'id',
      rows.map((row) => row.id)
    );
  if (deleteError) {
    console.error('removeAllYourMoveLinks: delete failed', deleteError);
    return { removed: 0 };
  }

  return { removed: rows.length };
}
