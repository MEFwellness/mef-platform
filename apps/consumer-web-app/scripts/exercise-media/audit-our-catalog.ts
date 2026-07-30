#!/usr/bin/env npx tsx
/**
 * Phase 1 (our side): inventories the entire ExerciseAPI.dev catalog —
 * counts with video, with (unusable) image paths, and with neither — and
 * dumps the full per-exercise list (id/name/category/muscles/equipment/
 * hasVideo) to docs/exercise-media/our-catalog-audit.json for the Phase 1
 * matching script to read against Your Move's catalog, without a second
 * full re-fetch.
 *
 * ExerciseAPI.dev has no separate "browse mode" the way Your Move does —
 * /exercises search results already include `videos`/`images` at every
 * page, so this is just plain pagination, not a quota concern (no
 * per-request-with-video cost model like Your Move's).
 *
 * Usage: EXERCISE_API_KEY=... npx tsx scripts/exercise-media/audit-our-catalog.ts
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { ExerciseApiClient, ExerciseApiError, type ExerciseApiExercise } from '../../lib/exercise-library/apiClient';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}.`);
  return value;
}

const PAGE_SIZE = 100;
const OUTPUT_PATH = path.resolve(__dirname, '../../../../docs/exercise-media/our-catalog-audit.json');

type AuditRow = {
  id: string;
  name: string;
  category: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string | null;
  force: string | null;
  mechanic: string | null;
  level: string | null;
  hasVideo: boolean;
  hasImages: boolean;
};

function toRow(exercise: ExerciseApiExercise): AuditRow {
  return {
    id: exercise.id,
    name: exercise.name,
    category: exercise.category ?? null,
    primaryMuscles: exercise.primaryMuscles ?? [],
    secondaryMuscles: exercise.secondaryMuscles ?? [],
    equipment: exercise.equipment ?? null,
    force: exercise.force ?? null,
    mechanic: exercise.mechanic ?? null,
    level: exercise.level ?? null,
    hasVideo: Boolean(exercise.videos?.length),
    hasImages: Boolean(exercise.images?.length),
  };
}

async function main() {
  const apiKey = requiredEnv('EXERCISE_API_KEY');
  const client = new ExerciseApiClient(apiKey);

  const rows: AuditRow[] = [];
  let offset = 0;
  let total: number | null = null;

  for (;;) {
    let result;
    try {
      result = await client.searchExercises({ limit: PAGE_SIZE, offset });
    } catch (err) {
      if (err instanceof ExerciseApiError && err.code === 'PAGINATION_DEPTH_EXCEEDED') {
        console.warn(
          `Stopped at offset ${offset}: vendor's PAGINATION_DEPTH_EXCEEDED. Collected ${rows.length} so far.`
        );
        break;
      }
      throw err;
    }

    if (total === null) total = result.total;
    rows.push(...result.data.map(toRow));

    console.log(`Fetched ${rows.length}${total !== null ? ` / ${total}` : ''} (offset ${offset})`);

    if (result.data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const withVideo = rows.filter((r) => r.hasVideo).length;
  const withImagesOnly = rows.filter((r) => !r.hasVideo && r.hasImages).length;
  const withNeither = rows.filter((r) => !r.hasVideo && !r.hasImages).length;

  const summary = {
    fetchedAt: new Date().toISOString(),
    vendorReportedTotal: total,
    totalFetched: rows.length,
    counts: {
      // "withImagesOnly" is the vendor's raw `images` field being
      // present — NOT usable today, since normalize.ts always nulls
      // imageUrl (that field is a dead relative path ExerciseAPI.dev
      // doesn't host). Reported for completeness; the live UI's actual
      // "before" state treats every non-video exercise as no-media,
      // i.e. liveImageCount is always 0 pre-this-build.
      withVideo,
      withImagesOnly,
      withNeither,
      liveVideoCount: withVideo,
      liveImageCount: 0,
      liveNoMediaCount: rows.length - withVideo,
    },
  };

  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify({ summary, rows }, null, 2));

  console.log('\n=== Our Catalog Audit ===');
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nFull row dump written to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
