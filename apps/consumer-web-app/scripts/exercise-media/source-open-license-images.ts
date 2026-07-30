#!/usr/bin/env npx tsx
/**
 * Phase 3: for every exercise with no video from either source (our
 * catalog audit says hasVideo=false AND it's not in the Your Move
 * confident-match list), searches Wikimedia Commons for a clearly-matching,
 * commercially-licensed photo (lib/exercise-library/wikimediaCommons.ts —
 * conservative token-matching + license check, no API key required),
 * downloads it, uploads to our own `exercise-media` storage, and records
 * it in exercise_open_license_images (which doubles as the license
 * manifest).
 *
 * Pexels/Unsplash are NOT wired up this pass — both require an API key
 * (PEXELS_API_KEY/UNSPLASH_ACCESS_KEY) that isn't configured in this
 * environment; see the build report for what that means for coverage.
 *
 * Anything with no qualifying Commons candidate is left for Phase 4
 * (cues) — reported here, not silently dropped.
 *
 * Usage: EXERCISE_API_KEY=... SEED_SUPABASE_URL=... \
 *   SEED_SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx tsx scripts/exercise-media/source-open-license-images.ts
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { findCommonsImage, downloadImage } from '../../lib/exercise-library/wikimediaCommons';
import { assessFrameQuality } from '../../lib/your-move/frameExtraction';
import { upsertOpenLicenseImage, getOpenLicenseImage } from '../../lib/exercise-library/openLicenseImages';
import { licenseImageStoragePath, EXERCISE_MEDIA_BUCKET } from '../../lib/your-move/posters';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}.`);
  return value;
}

const AUDIT_PATH = path.resolve(__dirname, '../../../../docs/exercise-media/our-catalog-audit.json');
const MATCH_REPORT_PATH = path.resolve(__dirname, '../../../../docs/exercise-media/match-report.json');
const REPORT_PATH = path.resolve(__dirname, '../../../../docs/exercise-media/license-sourcing-report.json');

type OurRow = { id: string; name: string; hasVideo: boolean };
type ConfidentMatch = { ourId: string };

const REQUEST_DELAY_MS = 400;
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (!existsSync(AUDIT_PATH) || !existsSync(MATCH_REPORT_PATH)) {
    throw new Error('Run audit-our-catalog.ts and match-your-move.ts first.');
  }

  const { rows: ourRows } = JSON.parse(readFileSync(AUDIT_PATH, 'utf-8')) as { rows: OurRow[] };
  const { confident } = JSON.parse(readFileSync(MATCH_REPORT_PATH, 'utf-8')) as {
    confident: ConfidentMatch[];
  };
  const matchedIds = new Set(confident.map((m) => m.ourId));

  const allTargets = ourRows.filter((r) => !r.hasVideo && !matchedIds.has(r.id));
  const limit = process.env.LIMIT ? Number(process.env.LIMIT) : undefined;
  const targets = limit ? allTargets.slice(0, limit) : allTargets;
  console.log(
    `${targets.length}${limit ? ` (of ${allTargets.length}, LIMIT set)` : ''} exercises have no video from either source — searching Commons for each...`
  );

  const supabase: SupabaseClient = createClient(
    requiredEnv('SEED_SUPABASE_URL'),
    requiredEnv('SEED_SUPABASE_SERVICE_ROLE_KEY')
  );

  const sourced: { externalId: string; name: string; sourceUrl: string; license: string }[] = [];
  const noQualifyingImage: { externalId: string; name: string; reason: string }[] = [];

  let skipped = 0;
  let processed = 0;
  const startedAt = Date.now();

  for (const row of targets) {
    processed += 1;
    if (processed % 25 === 0) {
      const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
      console.log(
        `  ...progress: ${processed}/${targets.length} processed (${sourced.length} sourced, ${skipped} skipped, ${elapsedSec}s elapsed)`
      );
    }
    try {
      const existing = await getOpenLicenseImage(supabase, 'exercise_api_dev', row.id);
      if (existing) {
        skipped += 1;
        continue;
      }

      await sleep(REQUEST_DELAY_MS);
      const candidate = await findCommonsImage(row.name);
      if (!candidate) {
        noQualifyingImage.push({ externalId: row.id, name: row.name, reason: 'No commercially-licensed Commons match found' });
        continue;
      }

      const buffer = await downloadImage(candidate.imageUrl);
      const quality = await assessFrameQuality(buffer);
      if (!quality.ok) {
        noQualifyingImage.push({ externalId: row.id, name: row.name, reason: `Downloaded image failed quality check: ${quality.message}` });
        continue;
      }

      const storagePath = licenseImageStoragePath(row.id);
      const { error: uploadError } = await supabase.storage
        .from(EXERCISE_MEDIA_BUCKET)
        .upload(storagePath, buffer, { contentType: 'image/jpeg', upsert: true });
      if (uploadError) {
        noQualifyingImage.push({ externalId: row.id, name: row.name, reason: `Upload failed: ${uploadError.message}` });
        continue;
      }

      await upsertOpenLicenseImage(supabase, {
        provider: 'exercise_api_dev',
        externalId: row.id,
        storagePath,
        sourceUrl: candidate.descriptionUrl,
        sourceProvider: 'wikimedia_commons',
        licenseType: candidate.licenseShortName,
        attribution: candidate.attribution,
      });

      sourced.push({ externalId: row.id, name: row.name, sourceUrl: candidate.descriptionUrl, license: candidate.licenseShortName });
      console.log(`  [sourced] ${row.name} <- ${candidate.title} (${candidate.licenseShortName})`);
    } catch (err) {
      noQualifyingImage.push({ externalId: row.id, name: row.name, reason: String(err) });
    }
  }

  writeFileSync(
    REPORT_PATH,
    JSON.stringify({ generatedAt: new Date().toISOString(), sourced, noQualifyingImage }, null, 2)
  );
  console.log(
    `\nSourced ${sourced.length} images (${skipped} already done in a prior run), ${noQualifyingImage.length} exercises still uncovered (routed to Phase 4). Report: ${REPORT_PATH}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
