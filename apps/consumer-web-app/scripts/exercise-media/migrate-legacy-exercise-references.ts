#!/usr/bin/env npx tsx
/**
 * Data migration for ExerciseAPI.dev removal (migration 119). For every
 * table that references an exercise by (provider='exercise_api_dev',
 * external_id) — mef_exercise_metadata (MEF curation, not member data) and
 * every real member-data table (favorites, completions, recent views,
 * coach program templates/assignments, prescription blocks) — this either:
 *
 *   - REMAPS the reference to the confidently-matched Your Move exercise
 *     (docs/exercise-media/match-report.json's `confident` list, already
 *     computed and reviewed), or
 *   - LEGACY-FLAGS it (is_legacy=true) when there is no confident match —
 *     the row and its exercise name are NEVER deleted; member history is
 *     preserved verbatim, just no longer resolvable in the live catalog.
 *
 * mef_exercise_metadata is the one exception with a third outcome: an
 * unmatched row that is PURELY a generated-cues artifact (every curation
 * column still at its schema default — see isPureCueArtifact below) is
 * deleted outright, per the explicit instruction to remove generated cue
 * records for exercises no longer in the catalog. An unmatched row that
 * carries real coach-authored curation (program_section, corrective_focus,
 * coach_notes, etc.) is left alone rather than destroyed — it's inert
 * (its external_id can never resolve against exercise_catalog again) but
 * not deleted, since that would be discarding real coaching work for a
 * reason ("we removed a vendor") that has nothing to do with its content.
 *
 * A small number of confident matches share the same target Your Move id
 * (two near-duplicate old exercise names both matched the same Your Move
 * exercise) — every remap here checks for that collision first and merges/
 * dedupes rather than violating a unique constraint.
 *
 * Usage: SEED_SUPABASE_URL=... SEED_SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx tsx scripts/exercise-media/migrate-legacy-exercise-references.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}.`);
  return value;
}

const MATCH_REPORT_PATH = path.resolve(__dirname, '../../../../docs/exercise-media/match-report.json');
const AUDIT_PATH = path.resolve(__dirname, '../../../../docs/exercise-media/our-catalog-audit.json');
const OUTPUT_REPORT_PATH = path.resolve(
  __dirname,
  '../../../../docs/exercise-media/exercise-api-removal-report.json'
);

type ConfidentMatch = { ourId: string; ourName: string; yourMoveId: string; yourMoveTitle: string };

const LEGACY_PROVIDER = 'exercise_api_dev';
const NEW_PROVIDER = 'your_move';

function loadMatchMap(): Map<string, ConfidentMatch> {
  const { confident } = JSON.parse(readFileSync(MATCH_REPORT_PATH, 'utf-8')) as { confident: ConfidentMatch[] };
  return new Map(confident.map((m) => [m.ourId, m]));
}

function loadNameMap(): Map<string, string> {
  const { rows } = JSON.parse(readFileSync(AUDIT_PATH, 'utf-8')) as { rows: { id: string; name: string }[] };
  return new Map(rows.map((r) => [r.id, r.name]));
}

type Counts = { remapped: number; legacyFlagged: number; deleted: number; mergedDuplicates: number };

function emptyCounts(): Counts {
  return { remapped: 0, legacyFlagged: 0, deleted: 0, mergedDuplicates: 0 };
}

// ---------------------------------------------------------------------------
// mef_exercise_metadata — MEF curation layer, not member data.
// ---------------------------------------------------------------------------

const DEFAULT_ARRAY_COLUMNS = [
  'body_region',
  'equipment',
  'corrective_focus',
  'mobility_focus',
  'strength_focus',
  'stability_focus',
  'contraindications',
  'regressions',
  'progressions',
  'goal_tags',
  'limitation_tags',
] as const;

export function isPureCueArtifact(row: Record<string, unknown>): boolean {
  if (row.program_section !== null) return false;
  if (row.movement_category !== null) return false;
  if (row.difficulty !== null) return false;
  if (row.coach_notes !== null) return false;
  for (const col of DEFAULT_ARRAY_COLUMNS) {
    const value = row[col];
    if (Array.isArray(value) && value.length > 0) return false;
  }
  return true;
}

export async function migrateMefExerciseMetadata(
  supabase: SupabaseClient,
  matchMap: Map<string, ConfidentMatch>
): Promise<Counts> {
  const counts = emptyCounts();
  const { data, error } = await supabase.from('mef_exercise_metadata').select('*').eq('provider', LEGACY_PROVIDER);
  if (error) throw new Error(`mef_exercise_metadata read failed: ${error.message}`);
  const rows = (data as Record<string, unknown>[]) ?? [];

  for (const row of rows) {
    const match = matchMap.get(row.external_id as string);
    if (!match) {
      if (isPureCueArtifact(row)) {
        const { error: deleteError } = await supabase.from('mef_exercise_metadata').delete().eq('id', row.id);
        if (deleteError) throw new Error(`mef_exercise_metadata delete failed: ${deleteError.message}`);
        counts.deleted += 1;
      }
      // else: real curation on an unmatched exercise — left as-is (inert, not destroyed).
      continue;
    }

    const { data: existingTarget } = await supabase
      .from('mef_exercise_metadata')
      .select('*')
      .eq('provider', NEW_PROVIDER)
      .eq('external_id', match.yourMoveId)
      .maybeSingle();

    if (existingTarget) {
      // Collision — merge this row's curated arrays into the existing
      // target (union, de-duplicated) rather than losing either side's
      // curation, then remove the now-redundant source row. Scalar
      // curation fields (program_section, movement_category, difficulty,
      // coach_notes) are merged too — the target's own value wins if
      // already set (the more common case is the target came from a
      // fresh cue-generation row with every scalar still at its default),
      // otherwise the source row's value is carried over rather than
      // silently dropped.
      const target = existingTarget as Record<string, unknown>;
      const merged: Record<string, unknown> = {};
      for (const col of DEFAULT_ARRAY_COLUMNS) {
        const a = target[col] as string[];
        const b = row[col] as string[];
        merged[col] = Array.from(new Set([...(a ?? []), ...(b ?? [])]));
      }
      for (const col of ['program_section', 'movement_category', 'difficulty', 'coach_notes'] as const) {
        merged[col] = target[col] ?? row[col] ?? null;
      }
      const { error: updateError } = await supabase
        .from('mef_exercise_metadata')
        .update(merged)
        .eq('id', (existingTarget as Record<string, unknown>).id);
      if (updateError) throw new Error(`mef_exercise_metadata merge failed: ${updateError.message}`);
      const { error: deleteError } = await supabase.from('mef_exercise_metadata').delete().eq('id', row.id);
      if (deleteError) throw new Error(`mef_exercise_metadata dedupe-delete failed: ${deleteError.message}`);
      counts.mergedDuplicates += 1;
    } else {
      const { error: updateError } = await supabase
        .from('mef_exercise_metadata')
        .update({ provider: NEW_PROVIDER, external_id: match.yourMoveId, updated_at: new Date().toISOString() })
        .eq('id', row.id);
      if (updateError) throw new Error(`mef_exercise_metadata remap failed: ${updateError.message}`);
      counts.remapped += 1;
    }
  }

  return counts;
}

// ---------------------------------------------------------------------------
// member_exercise_favorites — has no exercise_name column; needs
// legacy_exercise_name populated from the audit snapshot for unmatched rows.
// ---------------------------------------------------------------------------

export async function migrateFavorites(
  supabase: SupabaseClient,
  matchMap: Map<string, ConfidentMatch>,
  nameMap: Map<string, string>
): Promise<Counts> {
  const counts = emptyCounts();
  const { data, error } = await supabase.from('member_exercise_favorites').select('*').eq('provider', LEGACY_PROVIDER);
  if (error) throw new Error(`member_exercise_favorites read failed: ${error.message}`);
  const rows = (data as Record<string, unknown>[]) ?? [];

  for (const row of rows) {
    const match = matchMap.get(row.external_id as string);
    if (!match) {
      const { error: updateError } = await supabase
        .from('member_exercise_favorites')
        .update({ is_legacy: true, legacy_exercise_name: nameMap.get(row.external_id as string) ?? (row.external_id as string) })
        .eq('id', row.id);
      if (updateError) throw new Error(`member_exercise_favorites legacy-flag failed: ${updateError.message}`);
      counts.legacyFlagged += 1;
      continue;
    }

    const { data: existingTarget } = await supabase
      .from('member_exercise_favorites')
      .select('id')
      .eq('member_id', row.member_id)
      .eq('provider', NEW_PROVIDER)
      .eq('external_id', match.yourMoveId)
      .maybeSingle();

    if (existingTarget) {
      // Member already favorited the same Your Move exercise under its
      // other legacy id — drop this now-redundant favorite row.
      const { error: deleteError } = await supabase.from('member_exercise_favorites').delete().eq('id', row.id);
      if (deleteError) throw new Error(`member_exercise_favorites dedupe-delete failed: ${deleteError.message}`);
      counts.mergedDuplicates += 1;
    } else {
      const { error: updateError } = await supabase
        .from('member_exercise_favorites')
        .update({ provider: NEW_PROVIDER, external_id: match.yourMoveId })
        .eq('id', row.id);
      if (updateError) throw new Error(`member_exercise_favorites remap failed: ${updateError.message}`);
      counts.remapped += 1;
    }
  }

  return counts;
}

// ---------------------------------------------------------------------------
// Generic remap for tables with an exercise_name column already, no unique
// constraint blocking a remap collision (completions, coach program
// template/assigned-workout exercises, prescription block exercises).
// ---------------------------------------------------------------------------

export async function migrateSimpleReferenceTable(
  supabase: SupabaseClient,
  table: string,
  matchMap: Map<string, ConfidentMatch>
): Promise<Counts> {
  const counts = emptyCounts();
  const { data, error } = await supabase.from(table).select('id, external_id').eq('provider', LEGACY_PROVIDER);
  if (error) throw new Error(`${table} read failed: ${error.message}`);
  const rows = (data as { id: string; external_id: string }[]) ?? [];

  for (const row of rows) {
    const match = matchMap.get(row.external_id);
    if (!match) {
      const { error: updateError } = await supabase.from(table).update({ is_legacy: true }).eq('id', row.id);
      if (updateError) throw new Error(`${table} legacy-flag failed: ${updateError.message}`);
      counts.legacyFlagged += 1;
    } else {
      const { error: updateError } = await supabase
        .from(table)
        .update({ provider: NEW_PROVIDER, external_id: match.yourMoveId })
        .eq('id', row.id);
      if (updateError) throw new Error(`${table} remap failed: ${updateError.message}`);
      counts.remapped += 1;
    }
  }

  return counts;
}

// ---------------------------------------------------------------------------
// member_exercise_recent_views — has a unique (member_id, provider,
// external_id) index, same collision shape as favorites.
// ---------------------------------------------------------------------------

export async function migrateRecentViews(supabase: SupabaseClient, matchMap: Map<string, ConfidentMatch>): Promise<Counts> {
  const counts = emptyCounts();
  const { data, error } = await supabase
    .from('member_exercise_recent_views')
    .select('*')
    .eq('provider', LEGACY_PROVIDER);
  if (error) throw new Error(`member_exercise_recent_views read failed: ${error.message}`);
  const rows = (data as Record<string, unknown>[]) ?? [];

  for (const row of rows) {
    const match = matchMap.get(row.external_id as string);
    if (!match) {
      const { error: updateError } = await supabase
        .from('member_exercise_recent_views')
        .update({ is_legacy: true })
        .eq('id', row.id);
      if (updateError) throw new Error(`member_exercise_recent_views legacy-flag failed: ${updateError.message}`);
      counts.legacyFlagged += 1;
      continue;
    }

    const { data: existingTarget } = await supabase
      .from('member_exercise_recent_views')
      .select('id, viewed_at')
      .eq('member_id', row.member_id)
      .eq('provider', NEW_PROVIDER)
      .eq('external_id', match.yourMoveId)
      .maybeSingle();

    if (existingTarget) {
      // Keep whichever row is more recent, drop the other — this is a
      // recency pointer, not history, so a duplicate is safe to collapse.
      const keepExisting = new Date((existingTarget as { viewed_at: string }).viewed_at) >= new Date(row.viewed_at as string);
      const { error: deleteError } = await supabase
        .from('member_exercise_recent_views')
        .delete()
        .eq('id', keepExisting ? row.id : (existingTarget as { id: string }).id);
      if (deleteError) throw new Error(`member_exercise_recent_views dedupe-delete failed: ${deleteError.message}`);
      if (!keepExisting) {
        const { error: updateError } = await supabase
          .from('member_exercise_recent_views')
          .update({ provider: NEW_PROVIDER, external_id: match.yourMoveId })
          .eq('id', row.id);
        if (updateError) throw new Error(`member_exercise_recent_views remap failed: ${updateError.message}`);
      }
      counts.mergedDuplicates += 1;
    } else {
      const { error: updateError } = await supabase
        .from('member_exercise_recent_views')
        .update({ provider: NEW_PROVIDER, external_id: match.yourMoveId })
        .eq('id', row.id);
      if (updateError) throw new Error(`member_exercise_recent_views remap failed: ${updateError.message}`);
      counts.remapped += 1;
    }
  }

  return counts;
}

async function main() {
  const supabase = createClient(requiredEnv('SEED_SUPABASE_URL'), requiredEnv('SEED_SUPABASE_SERVICE_ROLE_KEY'));
  const matchMap = loadMatchMap();
  const nameMap = loadNameMap();

  console.log(`Loaded ${matchMap.size} confident Your Move matches.`);

  const results: Record<string, Counts> = {};

  results.mef_exercise_metadata = await migrateMefExerciseMetadata(supabase, matchMap);
  console.log('mef_exercise_metadata:', results.mef_exercise_metadata);

  results.member_exercise_favorites = await migrateFavorites(supabase, matchMap, nameMap);
  console.log('member_exercise_favorites:', results.member_exercise_favorites);

  results.member_exercise_completions = await migrateSimpleReferenceTable(
    supabase,
    'member_exercise_completions',
    matchMap
  );
  console.log('member_exercise_completions:', results.member_exercise_completions);

  results.member_exercise_recent_views = await migrateRecentViews(supabase, matchMap);
  console.log('member_exercise_recent_views:', results.member_exercise_recent_views);

  results.coach_program_template_exercises = await migrateSimpleReferenceTable(
    supabase,
    'coach_program_template_exercises',
    matchMap
  );
  console.log('coach_program_template_exercises:', results.coach_program_template_exercises);

  results.coach_assigned_workout_exercises = await migrateSimpleReferenceTable(
    supabase,
    'coach_assigned_workout_exercises',
    matchMap
  );
  console.log('coach_assigned_workout_exercises:', results.coach_assigned_workout_exercises);

  results.prescription_block_exercises = await migrateSimpleReferenceTable(
    supabase,
    'prescription_block_exercises',
    matchMap
  );
  console.log('prescription_block_exercises:', results.prescription_block_exercises);

  const totals = Object.values(results).reduce(
    (acc, c) => ({
      remapped: acc.remapped + c.remapped,
      legacyFlagged: acc.legacyFlagged + c.legacyFlagged,
      deleted: acc.deleted + c.deleted,
      mergedDuplicates: acc.mergedDuplicates + c.mergedDuplicates,
    }),
    emptyCounts()
  );

  const report = { migratedAt: new Date().toISOString(), totals, byTable: results };
  writeFileSync(OUTPUT_REPORT_PATH, JSON.stringify(report, null, 2));
  console.log('\nTotals:', totals);
  console.log('Report written to', OUTPUT_REPORT_PATH);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
