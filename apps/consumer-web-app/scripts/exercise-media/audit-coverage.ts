#!/usr/bin/env npx tsx
/**
 * Guard test (a), run against the real deployed catalog: no exercise may
 * render with no video, no image, and no cues. Checks every one of our
 * ~2200 exercises against your_move_exercise_links, exercise_open_license_images,
 * and mef_exercise_metadata.coaching_cues (exactly the three sources
 * normalize.ts falls through, in that order) and reports anything left
 * with none of the three — the one state the media backfill exists to
 * eliminate.
 *
 * Usage: SEED_SUPABASE_URL=... SEED_SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx tsx scripts/exercise-media/audit-coverage.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}.`);
  return value;
}

const AUDIT_PATH = path.resolve(__dirname, '../../../../docs/exercise-media/our-catalog-audit.json');
const REPORT_PATH = path.resolve(__dirname, '../../../../docs/exercise-media/coverage-report.json');

type OurRow = { id: string; name: string; hasVideo: boolean };

async function fetchAllIds(
  supabase: SupabaseClient,
  table: string,
  column: string
): Promise<Set<string>> {
  const ids = new Set<string>();
  const PAGE_SIZE = 1000;
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select(column)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data as unknown as Record<string, string>[]) ?? [];
    rows.forEach((row) => ids.add(row[column]!));
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return ids;
}

async function main() {
  const { rows: ourRows } = JSON.parse(readFileSync(AUDIT_PATH, 'utf-8')) as { rows: OurRow[] };

  const supabase: SupabaseClient = createClient(
    requiredEnv('SEED_SUPABASE_URL'),
    requiredEnv('SEED_SUPABASE_SERVICE_ROLE_KEY')
  );

  const [yourMoveIds, openLicenseImageIds, cuedIds] = await Promise.all([
    fetchAllIds(supabase, 'your_move_exercise_links', 'external_id'),
    fetchAllIds(supabase, 'exercise_open_license_images', 'external_id'),
    (async () => {
      const cued = new Set<string>();
      const PAGE_SIZE = 1000;
      let offset = 0;
      for (;;) {
        const { data, error } = await supabase
          .from('mef_exercise_metadata')
          .select('external_id, coaching_cues')
          .range(offset, offset + PAGE_SIZE - 1);
        if (error) throw error;
        const rows = (data as { external_id: string; coaching_cues: string[] }[]) ?? [];
        rows
          .filter((r) => (r.coaching_cues?.length ?? 0) > 0)
          .forEach((r) => cued.add(r.external_id));
        if (rows.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }
      return cued;
    })(),
  ]);

  let videoCount = 0;
  let imageCount = 0;
  let cuesCount = 0;
  const uncovered: { externalId: string; name: string }[] = [];

  for (const row of ourRows) {
    const hasVideo = row.hasVideo || yourMoveIds.has(row.id);
    const hasImage = !hasVideo && openLicenseImageIds.has(row.id);
    const hasCues = !hasVideo && !hasImage && cuedIds.has(row.id);

    if (hasVideo) videoCount += 1;
    else if (hasImage) imageCount += 1;
    else if (hasCues) cuesCount += 1;
    else uncovered.push({ externalId: row.id, name: row.name });
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    totalExercises: ourRows.length,
    videoCount,
    imageCount,
    cuesCount,
    uncoveredCount: uncovered.length,
    guardTestAPasses: uncovered.length === 0,
  };

  writeFileSync(REPORT_PATH, JSON.stringify({ summary, uncovered }, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  if (uncovered.length > 0) {
    console.log(`\n${uncovered.length} exercises still have no video, image, or cues:`);
    uncovered.slice(0, 20).forEach((u) => console.log(`  ${u.name} (${u.externalId})`));
    if (uncovered.length > 20) console.log(`  ...and ${uncovered.length - 20} more`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
