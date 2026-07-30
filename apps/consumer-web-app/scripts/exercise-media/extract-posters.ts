#!/usr/bin/env npx tsx
/**
 * Phase 2 (posters): for every exercise with a video — Your Move-matched
 * (docs/exercise-media/match-report.json's confident list) or
 * ExerciseAPI.dev-only (docs/exercise-media/our-catalog-audit.json rows
 * with hasVideo=true that AREN'T in the confident list, since the
 * dominance rule means Your Move's video wins and gets the poster
 * instead) — extracts one mid-movement frame, quality-gates it
 * (lib/body-assessment/frameQuality.ts via lib/your-move/frameExtraction.ts),
 * uploads it to the `exercise-media` Supabase Storage bucket, and records
 * it in exercise_extracted_posters.
 *
 * The ONE legitimate place this script calls Your Move's metered
 * GET /exercises/{id} for every matched exercise (once, here, not on
 * every request) — that's the actual cost of getting a permanent poster
 * asset, not a violation of "browse never spends quota" (this isn't
 * browsing, it's one-time asset generation).
 *
 * Unusable frames (failed the quality gate) are reported separately and
 * NOT written — those exercise ids fall through to Phase 3 image sourcing.
 *
 * Usage: EXERCISE_API_KEY=... YMOVE_API_KEY=... \
 *   SEED_SUPABASE_URL=... SEED_SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx tsx scripts/exercise-media/extract-posters.ts
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ExerciseApiClient, type ExerciseApiExercise } from '../../lib/exercise-library/apiClient';
import { YourMoveApiClient, YourMoveApiError } from '../../lib/your-move/apiClient';
import { extractFrameBuffer, assessFrameQuality, pickMidpointTimestamp } from '../../lib/your-move/frameExtraction';
import {
  upsertExtractedPoster,
  getExtractedPoster,
  posterStoragePath,
  EXERCISE_MEDIA_BUCKET,
} from '../../lib/your-move/posters';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}.`);
  return value;
}

const AUDIT_PATH = path.resolve(__dirname, '../../../../docs/exercise-media/our-catalog-audit.json');
const MATCH_REPORT_PATH = path.resolve(__dirname, '../../../../docs/exercise-media/match-report.json');
const UNUSABLE_REPORT_PATH = path.resolve(
  __dirname,
  '../../../../docs/exercise-media/unusable-frames.json'
);

type OurRow = { id: string; name: string; hasVideo: boolean };
type ConfidentMatch = { ourId: string; ourName: string; yourMoveId: string };

async function uploadPoster(
  supabase: SupabaseClient,
  storagePath: string,
  buffer: Buffer
): Promise<boolean> {
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
  if (!existsSync(AUDIT_PATH) || !existsSync(MATCH_REPORT_PATH)) {
    throw new Error('Run audit-our-catalog.ts and match-your-move.ts first.');
  }

  const { rows: ourRows } = JSON.parse(readFileSync(AUDIT_PATH, 'utf-8')) as { rows: OurRow[] };
  const { confident } = JSON.parse(readFileSync(MATCH_REPORT_PATH, 'utf-8')) as {
    confident: ConfidentMatch[];
  };

  const exerciseApiClient = new ExerciseApiClient(requiredEnv('EXERCISE_API_KEY'));
  const yourMoveClient = new YourMoveApiClient(requiredEnv('YMOVE_API_KEY'));
  const supabase: SupabaseClient = createClient(
    requiredEnv('SEED_SUPABASE_URL'),
    requiredEnv('SEED_SUPABASE_SERVICE_ROLE_KEY')
  );

  const matchedIds = new Set(confident.map((m) => m.ourId));
  const unusable: { externalId: string; name: string; source: string; reason: string }[] = [];
  const deferredQuota: { externalId: string; name: string; yourMoveId: string }[] = [];

  let posterCount = 0;

  // Trial/paid plans both cap distinct exercises accessed per rolling 30
  // days (GET /usage — monthlyExerciseLimit, 'unlimited' on Scale/
  // Enterprise/yearly). Checking first means we never burn a real request
  // on an exercise the vendor is just going to strip video from anyway —
  // we defer it instead, cleanly, and pick it up automatically on a later
  // run once quota resets or the plan is upgraded (no code change needed:
  // upsertExtractedPoster/getExtractedPoster below already make this
  // script resumable — an exercise with a poster row already is skipped).
  const usage = await yourMoveClient.getUsage();
  const remainingQuota =
    usage.monthlyExerciseLimit === 'unlimited'
      ? Infinity
      : Math.max(0, usage.monthlyExerciseLimit - usage.monthlyExercisesUsed);
  console.log(
    `Your Move quota: ${usage.monthlyExercisesUsed}/${usage.monthlyExerciseLimit} used this rolling 30 days (plan=${usage.plan}, status=${usage.status}). ${remainingQuota === Infinity ? 'Unlimited' : remainingQuota} remaining.`
  );

  let quotaSpent = 0;

  console.log(`Extracting posters for ${confident.length} Your Move matches...`);
  for (const match of confident) {
    try {
      const alreadyExtracted = await getExtractedPoster(supabase, 'exercise_api_dev', match.ourId);
      if (alreadyExtracted) {
        posterCount += 1; // already done in a prior run — not a new quota spend
        continue;
      }

      if (quotaSpent >= remainingQuota) {
        deferredQuota.push({ externalId: match.ourId, name: match.ourName, yourMoveId: match.yourMoveId });
        continue;
      }
      quotaSpent += 1;

      const exercise = await yourMoveClient.getExercise(match.yourMoveId);
      const videoUrl = exercise.videoUrl ?? exercise.videos?.[0]?.url ?? null;
      if (!videoUrl) {
        unusable.push({
          externalId: match.ourId,
          name: match.ourName,
          source: 'your_move',
          reason: 'Your Move returned no playable video at extraction time',
        });
        continue;
      }

      const timestamp = pickMidpointTimestamp(exercise.videoDurationSecs);
      const frame = await extractFrameBuffer(videoUrl, timestamp);
      const quality = await assessFrameQuality(frame);
      if (!quality.ok) {
        unusable.push({ externalId: match.ourId, name: match.ourName, source: 'your_move', reason: quality.message });
        continue;
      }

      const storagePath = posterStoragePath('your_move', match.ourId);
      const uploaded = await uploadPoster(supabase, storagePath, frame);
      if (!uploaded) continue;

      await upsertExtractedPoster(supabase, {
        provider: 'exercise_api_dev',
        externalId: match.ourId,
        source: 'your_move',
        storagePath,
      });
      posterCount += 1;
      console.log(`  [your_move] ${match.ourName} -> ${storagePath}`);
    } catch (err) {
      const reason = err instanceof YourMoveApiError ? err.message : String(err);
      unusable.push({ externalId: match.ourId, name: match.ourName, source: 'your_move', reason });
    }
  }

  const exerciseApiOnlyRows = ourRows.filter((r) => r.hasVideo && !matchedIds.has(r.id));
  console.log(`\nExtracting posters for ${exerciseApiOnlyRows.length} ExerciseAPI.dev-only videos...`);
  for (const row of exerciseApiOnlyRows) {
    try {
      const exercise: ExerciseApiExercise = await exerciseApiClient.getExercise(row.id);
      const video = exercise.videos?.[0];
      if (!video) {
        unusable.push({
          externalId: row.id,
          name: row.name,
          source: 'exercise_api_dev',
          reason: 'No video at extraction time (was present at audit time)',
        });
        continue;
      }

      const timestamp = pickMidpointTimestamp(video.durationSeconds);
      const frame = await extractFrameBuffer(video.url, timestamp);
      const quality = await assessFrameQuality(frame);
      if (!quality.ok) {
        unusable.push({ externalId: row.id, name: row.name, source: 'exercise_api_dev', reason: quality.message });
        continue;
      }

      const storagePath = posterStoragePath('exercise_api_dev', row.id);
      const uploaded = await uploadPoster(supabase, storagePath, frame);
      if (!uploaded) continue;

      await upsertExtractedPoster(supabase, {
        provider: 'exercise_api_dev',
        externalId: row.id,
        source: 'exercise_api_dev',
        storagePath,
      });
      posterCount += 1;
      console.log(`  [exercise_api_dev] ${row.name} -> ${storagePath}`);
    } catch (err) {
      unusable.push({ externalId: row.id, name: row.name, source: 'exercise_api_dev', reason: String(err) });
    }
  }

  writeFileSync(
    UNUSABLE_REPORT_PATH,
    JSON.stringify({ unusable, deferredQuota }, null, 2)
  );
  console.log(
    `\nExtracted ${posterCount} posters. ${unusable.length} unusable frames + ${deferredQuota.length} deferred-for-quota written to ${UNUSABLE_REPORT_PATH}.`
  );
  if (deferredQuota.length > 0) {
    console.log(
      `${deferredQuota.length} confident Your Move matches are mapped but not yet extracted — Your Move's monthly cap is reached. Re-run this script after the cap resets or the plan upgrades; already-extracted posters are skipped automatically.`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
