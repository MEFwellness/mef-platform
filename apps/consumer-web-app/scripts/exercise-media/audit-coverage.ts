#!/usr/bin/env npx tsx
/**
 * Guard test (a), run against the real deployed catalog: no exercise may
 * render with no video and no cues. Checks every exercise_catalog row's
 * own has_video flag plus mef_exercise_metadata.coaching_cues (exactly
 * the two sources normalize.ts falls through, in that order) and reports
 * anything left with neither — the one state the media backfill exists to
 * eliminate.
 *
 * Usage: SEED_SUPABASE_URL=... SEED_SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx tsx scripts/exercise-media/audit-coverage.ts
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}.`);
  return value;
}

const REPORT_PATH = path.resolve(__dirname, '../../../../docs/exercise-media/coverage-report.json');

async function fetchAll<T>(supabase: SupabaseClient, table: string, columns: string): Promise<T[]> {
  const all: T[] = [];
  const PAGE_SIZE = 1000;
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase.from(table).select(columns).range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data as T[]) ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

async function main() {
  const supabase: SupabaseClient = createClient(
    requiredEnv('SEED_SUPABASE_URL'),
    requiredEnv('SEED_SUPABASE_SERVICE_ROLE_KEY')
  );

  const [catalogRows, metadataRows] = await Promise.all([
    fetchAll<{ external_id: string; name: string; has_video: boolean }>(
      supabase,
      'exercise_catalog',
      'external_id, name, has_video'
    ),
    fetchAll<{ external_id: string; coaching_cues: string[] }>(
      supabase,
      'mef_exercise_metadata',
      'external_id, coaching_cues'
    ),
  ]);

  const cuedIds = new Set(
    metadataRows.filter((r) => (r.coaching_cues?.length ?? 0) > 0).map((r) => r.external_id)
  );

  let videoCount = 0;
  let cuesCount = 0;
  const uncovered: { externalId: string; name: string }[] = [];

  for (const row of catalogRows) {
    if (row.has_video) videoCount += 1;
    else if (cuedIds.has(row.external_id)) cuesCount += 1;
    else uncovered.push({ externalId: row.external_id, name: row.name });
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    totalExercises: catalogRows.length,
    videoCount,
    cuesCount,
    uncoveredCount: uncovered.length,
    guardTestAPasses: uncovered.length === 0,
  };

  writeFileSync(REPORT_PATH, JSON.stringify({ summary, uncovered }, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  if (uncovered.length > 0) {
    console.log(`\n${uncovered.length} exercises still have no video and no cues:`);
    uncovered.slice(0, 20).forEach((u) => console.log(`  ${u.name} (${u.externalId})`));
    if (uncovered.length > 20) console.log(`  ...and ${uncovered.length - 20} more`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
