/**
 * Supabase Storage helpers for Food Lens media — same shape as
 * lib/body-assessment/storage.ts. Meal photo bytes are uploaded directly
 * from the browser to a private bucket; the server only ever handles
 * storage paths and short-lived signed URLs (for the vision provider call,
 * or for rendering a capture back to the member).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const FOOD_LENS_BUCKET = 'food-lens-media';

/**
 * {member_id}/{scan_id}/{capture_id}.{ext} — storage.objects' RLS policy
 * (migration 55) checks `(storage.foldername(name))[1] = auth.uid()`, so
 * the member id MUST be the first path segment.
 */
export function buildFoodLensCaptureStoragePath(
  memberId: string,
  scanId: string,
  captureId: string,
  extension: string
): string {
  return `${memberId}/${scanId}/${captureId}.${extension}`;
}

export async function createSignedFoodLensCaptureUrl(
  supabase: SupabaseClient,
  storagePath: string,
  expiresInSeconds = 300
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(FOOD_LENS_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error || !data) {
    console.error('createSignedFoodLensCaptureUrl failed', error);
    return null;
  }
  return data.signedUrl;
}
