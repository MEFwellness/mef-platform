/**
 * Supabase Storage helpers for body assessment media — the first feature
 * in this codebase to use Storage (see migration 37's docblock). Media
 * bytes are uploaded directly from the browser (components/body-assessment
 * /CameraCapture.tsx) using the same authenticated session the rest of the
 * app already relies on for RLS; this module only builds the path
 * convention storage.objects' RLS policies key off of, and creates
 * short-lived signed URLs for server-side reads (e.g. a future analysis
 * provider fetching a capture).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const BODY_ASSESSMENT_BUCKET = 'body-assessment-media';

/**
 * {member_id}/{assessment_id}/{capture_id}.{ext} — storage.objects' RLS
 * policies (migration 37) check `(storage.foldername(name))[1] = auth.uid()`,
 * so the member id MUST be the first path segment for every capture.
 */
export function buildCaptureStoragePath(
  memberId: string,
  assessmentId: string,
  captureId: string,
  extension: string
): string {
  return `${memberId}/${assessmentId}/${captureId}.${extension}`;
}

/** A short-lived signed URL for server-side (or future provider) access to a private capture — never returns a public URL, since the bucket is private. */
export async function createSignedCaptureUrl(
  supabase: SupabaseClient,
  storagePath: string,
  expiresInSeconds = 300
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BODY_ASSESSMENT_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error || !data) {
    console.error('createSignedCaptureUrl failed', error);
    return null;
  }
  return data.signedUrl;
}

export async function deleteCaptureMedia(
  supabase: SupabaseClient,
  storagePaths: string[]
): Promise<boolean> {
  if (storagePaths.length === 0) return true;
  const { error } = await supabase.storage.from(BODY_ASSESSMENT_BUCKET).remove(storagePaths);
  if (error) {
    console.error('deleteCaptureMedia failed', error);
    return false;
  }
  return true;
}
