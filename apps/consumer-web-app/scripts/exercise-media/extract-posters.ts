#!/usr/bin/env npx tsx
/**
 * Phase 2 (posters): for every video exercise in exercise_catalog, extracts
 * one mid-movement frame, quality-gates it
 * (lib/body-assessment/frameQuality.ts via lib/your-move/frameExtraction.ts),
 * uploads it to the `exercise-media` Supabase Storage bucket, and records
 * it in exercise_extracted_posters (source='your_move' — the only source
 * that exists now that Your Move is the sole catalog).
 *
 * The ONE legitimate place this script calls Your Move's metered
 * GET /exercises/{id} for every exercise (once, here, not on every
 * request) — that's the actual cost of getting a permanent poster asset,
 * not a violation of "browse never spends quota" (this isn't browsing,
 * it's one-time asset generation).
 *
 * Unusable frames (failed the quality gate) are reported separately and
 * NOT written — those exercises fall back to generated cues instead (see
 * generate-your-move-cues.ts).
 *
 * Usage: YMOVE_API_KEY=... SEED_SUPABASE_URL=... \
 *   SEED_SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx tsx scripts/exercise-media/extract-posters.ts
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { YourMoveApiClient, YourMoveApiError } from '../../lib/your-move/apiClient';
import { extractFrameBuffer, assessFrameQuality, pickMidpointTimestamp } from '../../lib/your-move/frameExtraction';
import { upsertExtractedPoster, getExtractedPoster, posterStoragePath, EXERCISE_MEDIA_BUCKET } from '../../lib/your-move/posters';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}.`);
  return value;
}

const UNUSABLE_REPORT_PATH = path.resolve(__dirname, '../../../../docs/exercise-media/unusable-frames.json');

async function uploadPoster(supabase: SupabaseClient, storagePath: string, buffer: Buffer): Promise<boolean> {
  const { error } = await supabase.storage
    .from(EXERCISE_MEDIA_BUCKET)
    .upload(storagePath, buffer, { contentType: 'image/jpeg', upsert: true });
  if (error) {
    console.error(`Upload failed for ${storagePath}`, error);
    return false;
  }
  return true;
}

async function main() {
  const yourMoveClient = new YourMoveApiClient(requiredEnv('YMOVE_API_KEY'));
  const supabase: SupabaseClient = createClient(
    requiredEnv('SEED_SUPABASE_URL'),
    requiredEnv('SEED_SUPABASE_SERVICE_ROLE_KEY')
  );

  const { data, error } = await supabase
    .from('exercise_catalog')
    .select('external_id, name')
    .eq('has_video', true);
  if (error) throw new Error(`exercise_catalog read failed: ${error.message}`);
  const videoExercises = (data as { external_id: string; name: string }[]) ?? [];

  const unusable: { externalId: string; name: string; reason: string }[] = [];
  const deferredQuota: { externalId: string; name: string }[] = [];
  let posterCount = 0;

  // Trial/paid plans both cap distinct exercises accessed per rolling 30
  // days (GET /usage — monthlyExerciseLimit, 'unlimited' on Scale/
  // Enterprise/yearly). Checking first means we never burn a real request
  // on an exercise we can't finish this run anyway — deferred exercises
  // are picked up automatically on a later run (already-extracted posters
  // are skipped, no code change needed once quota resets/plan upgrades).
  const usage = await yourMoveClient.getUsage();
  const remainingQuota =
    usage.monthlyExerciseLimit === 'unlimited'
      ? Infinity
      : Math.max(0, usage.monthlyExerciseLimit - usage.monthlyExercisesUsed);
  console.log(
    `Your Move quota: ${usage.monthlyExercisesUsed}/${usage.monthlyExerciseLimit} used this rolling 30 days (plan=${usage.plan}, status=${usage.status}). ${remainingQuota === Infinity ? 'Unlimited' : remainingQuota} remaining.`
  );

  let quotaSpent = 0;

  console.log(`Extracting posters for ${videoExercises.length} video exercises...`);
  for (const exercise of videoExercises) {
    try {
      const alreadyExtracted = await getExtractedPoster(supabase, exercise.external_id);
      if (alreadyExtracted) {
        posterCount += 1; // already done in a prior run — not a new quota spend
        continue;
      }

      if (quotaSpent >= remainingQuota) {
        deferredQuota.push({ externalId: exercise.external_id, name: exercise.name });
        continue;
      }
      quotaSpent += 1;

      const raw = await yourMoveClient.getExercise(exercise.external_id);
      const videoUrl = raw.videoUrl ?? raw.videos?.[0]?.url ?? null;
      if (!videoUrl) {
        unusable.push({
          externalId: exercise.external_id,
          name: exercise.name,
          reason: 'Your Move returned no playable video at extraction time',
        });
        continue;
      }

      const timestamp = pickMidpointTimestamp(raw.videoDurationSecs);
      const frame = await extractFrameBuffer(videoUrl, timestamp);
      const quality = await assessFrameQuality(frame);
      if (!quality.ok) {
        unusable.push({ externalId: exercise.external_id, name: exercise.name, reason: quality.message });
        continue;
      }

      const storagePath = posterStoragePath(exercise.external_id);
      const uploaded = await uploadPoster(supabase, storagePath, frame);
      if (!uploaded) continue;

      await upsertExtractedPoster(supabase, { externalId: exercise.external_id, storagePath });
      posterCount += 1;
      console.log(`  ${exercise.name} -> ${storagePath}`);
    } catch (err) {
      const reason = err instanceof YourMoveApiError ? err.message : String(err);
      unusable.push({ externalId: exercise.external_id, name: exercise.name, reason });
    }
  }

  writeFileSync(UNUSABLE_REPORT_PATH, JSON.stringify({ unusable, deferredQuota }, null, 2));
  console.log(
    `\nExtracted ${posterCount} posters. ${unusable.length} unusable frames + ${deferredQuota.length} deferred-for-quota written to ${UNUSABLE_REPORT_PATH}.`
  );
  if (deferredQuota.length > 0) {
    console.log(
      `${deferredQuota.length} video exercises are not yet extracted — Your Move's monthly cap is reached. Re-run this script after the cap resets or the plan upgrades; already-extracted posters are skipped automatically.`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
