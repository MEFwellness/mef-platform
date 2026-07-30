#!/usr/bin/env npx tsx
/**
 * Computes the exercise_catalog name-deduplication plan and writes it out
 * as a versioned SQL migration (never writes to the database itself —
 * same "generate a pure-SQL data migration, apply it via `supabase db
 * push`/`migration up`" convention as migration 120's data insert, chosen
 * there because a script holding an open connection to production isn't
 * available in this environment; see that migration's header).
 *
 * Your Move's own vendor catalog (fetch-your-move-catalog.ts) contains
 * real duplicate rows under different external_ids — the exact same
 * exercise name inserted twice, or with only spacing/casing/punctuation
 * differences (including a "(1)"/"(2)" vendor-export collision-marker
 * suffix seen on a couple of names). fetch-your-move-catalog.ts upserts
 * strictly on (provider, external_id) and never checks name, so nothing
 * in the ingestion path catches this — see lib/exercise-library/
 * catalogDedupe.ts for the normalization + keeper-selection + field-merge
 * logic this script drives.
 *
 * For every duplicate-name group: picks one canonical keeper (best data:
 * has video > more complete instructions > more complete metadata, see
 * catalogCompletenessScore), merges anything unique from the discarded
 * rows into the keeper (instructions/tips only borrowed wholesale if the
 * keeper has none at all — never spliced together, see mergeCatalogFields
 * for why), repoints every table that references an exercise by
 * (provider, external_id) from the discarded id to the keeper's, then
 * removes the discarded exercise_catalog + mef_exercise_metadata rows.
 * Collision-safe for member_exercise_favorites/member_exercise_recent_views
 * (both have a UNIQUE(member_id, provider, external_id) index) even
 * though today's real data has nothing to collide on — this SQL is
 * generated once but applied at whatever point production actually runs
 * it, so it has to be correct for whatever rows exist then, not just now.
 *
 * One exception, hand-verified rather than auto-merged: "Kettlebell
 * Turkish Get-Up (Lunge style)" / "...(Lunge style)(1)" share a name only
 * because of the same "(1)" collision-marker pattern seen elsewhere, but
 * their instructions describe two different movements (a standing
 * overhead reverse lunge vs. the real ground-to-standing Turkish get-up)
 * — auto-merging would silently destroy one of the two real exercises.
 * This pair is left alone except for a name correction on the mislabeled
 * "(1)" row (its content is a real Turkish Get-Up, not a lunge variant),
 * so it no longer collides under the guard test's normalization and
 * both real exercises survive under distinct, accurate names.
 *
 * Safe to re-run at any time against a refreshed catalog: re-running this
 * script after the migration it previously generated has already been
 * applied will find zero duplicate groups (nothing left to dedupe) and
 * emit an empty migration.
 *
 * Usage: SEED_SUPABASE_URL=... SEED_SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx tsx scripts/exercise-media/dedupe-exercise-catalog.ts [--migration-number=121]
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import type { ExerciseCatalogRow } from '@mef/shared-types-contracts';
import {
  findDuplicateGroups,
  chooseKeeper,
  mergeCatalogFields,
  mergeMetadataFields,
  normalizeCatalogName,
} from '../../lib/exercise-library/catalogDedupe';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}.`);
  return value;
}

const REPORT_PATH = path.resolve(__dirname, '../../../../docs/exercise-media/dedupe-report.json');

// Hand-verified exception — see this file's header. Excluded from
// automatic merging; only a name correction is applied.
const TURKISH_GETUP_MISLABELED_EXTERNAL_ID = '948e5256-8830-43b3-a28a-ddcb050373ed';
const TURKISH_GETUP_CORRECTED_NAME = 'Kettlebell Turkish Get-Up';
const TURKISH_GETUP_CORRECTED_SLUG = 'kettlebell-turkish-get-up-real-tgu';

const REFERENCE_TABLES_SIMPLE = [
  'member_exercise_completions',
  'coach_program_template_exercises',
  'coach_assigned_workout_exercises',
  'prescription_block_exercises',
] as const;

function sqlStr(value: string | null | undefined): string {
  if (value === null || value === undefined) return 'null';
  return `'${value.replace(/'/g, "''")}'`;
}
function sqlBool(value: boolean): string {
  return value ? 'true' : 'false';
}
function sqlTextArray(values: string[]): string {
  if (values.length === 0) return "'{}'::text[]";
  return `ARRAY[${values.map(sqlStr).join(',')}]::text[]`;
}
function sqlIdList(ids: string[]): string {
  return `ARRAY[${ids.map(sqlStr).join(',')}]`;
}

const METADATA_ARRAY_COLUMNS = [
  'body_region',
  'equipment',
  'corrective_focus',
  'mobility_focus',
  'strength_focus',
  'stability_focus',
  'contraindications',
  'coaching_cues',
  'regressions',
  'progressions',
  'goal_tags',
  'limitation_tags',
] as const;
const METADATA_SCALAR_COLUMNS = ['program_section', 'movement_category', 'difficulty', 'coach_notes'] as const;

type Plan = {
  turkishGetUpFix: { externalId: string; name: string; slug: string } | null;
  groups: Array<{
    normalizedName: string;
    keeper: ExerciseCatalogRow;
    discards: ExerciseCatalogRow[];
    merged: Partial<ExerciseCatalogRow>;
    mergedMetadata: Record<string, unknown> | null;
  }>;
};

function buildPlan(rows: ExerciseCatalogRow[], metadataRows: Record<string, unknown>[]): Plan {
  const metadataByExternalId = new Map(metadataRows.map((m) => [m.external_id as string, m]));
  const duplicateGroups = findDuplicateGroups(rows);
  const groups: Plan['groups'] = [];
  let turkishGetUpFix: Plan['turkishGetUpFix'] = null;

  for (const group of duplicateGroups) {
    const hasMislabeledTurkishGetUp = group.some((r) => r.external_id === TURKISH_GETUP_MISLABELED_EXTERNAL_ID);
    if (hasMislabeledTurkishGetUp) {
      turkishGetUpFix = {
        externalId: TURKISH_GETUP_MISLABELED_EXTERNAL_ID,
        name: TURKISH_GETUP_CORRECTED_NAME,
        slug: TURKISH_GETUP_CORRECTED_SLUG,
      };
      continue;
    }
    const { keeper, discards } = chooseKeeper(group);
    const merged = mergeCatalogFields(keeper, discards);

    const keeperMeta = metadataByExternalId.get(keeper.external_id);
    const discardMetas = discards
      .map((d) => metadataByExternalId.get(d.external_id))
      .filter((m): m is Record<string, unknown> => m !== undefined);
    const mergedMetadata = keeperMeta ? mergeMetadataFields(keeperMeta, discardMetas) : null;

    groups.push({ normalizedName: normalizeCatalogName(keeper.name), keeper, discards, merged, mergedMetadata });
  }

  return { turkishGetUpFix, groups };
}

function renderMigrationSql(plan: Plan): string {
  const lines: string[] = [];
  lines.push(
    '-- Dedupe exercise_catalog: Your Move\'s own vendor catalog contained real',
    '-- duplicate rows under different external_ids for the same exercise name',
    '-- (exact matches, plus case/punctuation-only near-matches and a couple of',
    '-- vendor "(1)"-suffix export-collision artifacts) — e.g. "Barbell Sumo',
    '-- Squat" appeared twice, which is what caused a member search for',
    '-- "squat" to show it twice. Generated by',
    '-- scripts/exercise-media/dedupe-exercise-catalog.ts — see that file\'s',
    '-- header for the full keeper-selection and merge rules.',
    '--',
    '-- One name-collision pair was hand-verified NOT to be a true duplicate',
    '-- (see the header) and is fixed by a name correction instead of a merge.',
    '',
    'begin;',
    ''
  );

  if (plan.turkishGetUpFix) {
    const fix = plan.turkishGetUpFix;
    lines.push(
      '-- "Kettlebell Turkish Get-Up (Lunge style)(1)" is a vendor mislabel, not a',
      '-- duplicate: its instructions are the real ground-to-standing Turkish',
      '-- get-up, not a lunge variant. Renamed (not merged/deleted) so both real',
      '-- exercises survive and the name no longer collides with the genuine',
      '-- "(Lunge style)" / "(Lunge style) v2" pair.',
      `update exercise_catalog set name = ${sqlStr(fix.name)}, slug = ${sqlStr(fix.slug)}, updated_at = now() where provider = 'your_move' and external_id = ${sqlStr(fix.externalId)};`,
      ''
    );
  }

  for (const group of plan.groups) {
    const { keeper, discards, merged, normalizedName } = group;
    const discardIds = discards.map((d) => d.external_id);

    lines.push(`-- Group "${normalizedName}": keeper ${keeper.external_id} (${keeper.name}), discarding ${discardIds.length} duplicate row(s).`);
    lines.push(
      `update exercise_catalog set` +
        ` description = ${sqlStr(merged.description as string | null)},` +
        ` primary_muscle = ${sqlStr(merged.primary_muscle as string | null)},` +
        ` equipment = ${sqlStr(merged.equipment as string | null)},` +
        ` category = ${sqlStr(merged.category as string | null)},` +
        ` difficulty = ${sqlStr(merged.difficulty as string | null)},` +
        ` instructions = ${sqlTextArray(merged.instructions as string[])},` +
        ` exercise_tips = ${sqlTextArray(merged.exercise_tips as string[])},` +
        ` secondary_muscles = ${sqlTextArray(merged.secondary_muscles as string[])},` +
        ` exercise_type = ${sqlTextArray(merged.exercise_type as string[])},` +
        ` has_video = ${sqlBool(merged.has_video as boolean)},` +
        ` has_video_white = ${sqlBool(merged.has_video_white as boolean)},` +
        ` has_video_gym = ${sqlBool(merged.has_video_gym as boolean)},` +
        ` updated_at = now()` +
        ` where provider = 'your_move' and external_id = ${sqlStr(keeper.external_id)};`
    );

    // mef_exercise_metadata: union coaching_cues (and every other curation
    // array/scalar column — see mergeMetadataFields, unit-tested in
    // tests/exercise-library-catalog-dedupe.test.ts) into the keeper's
    // row, then drop the discards' rows below. All 857 rows currently
    // have every curation column at its schema default except
    // coaching_cues (verified against real data), so this is effectively
    // a coaching_cues union today, computed generically in case that ever
    // changes.
    if (group.mergedMetadata) {
      const m = group.mergedMetadata;
      const setClauses = [
        ...METADATA_ARRAY_COLUMNS.map((col) => `${col} = ${sqlTextArray((m[col] as string[]) ?? [])}`),
        ...METADATA_SCALAR_COLUMNS.map((col) => `${col} = ${sqlStr(m[col] as string | null)}`),
        'updated_at = now()',
      ];
      lines.push(
        `update mef_exercise_metadata set ${setClauses.join(', ')} where provider = 'your_move' and external_id = ${sqlStr(keeper.external_id)};`
      );
    }
    lines.push(
      `delete from mef_exercise_metadata where provider = 'your_move' and external_id = any(${sqlIdList(discardIds)});`
    );

    // member_exercise_favorites — UNIQUE(member_id, provider, external_id).
    // Drop a discard-referencing favorite where the same member already
    // favorited the keeper, then repoint whatever's left.
    lines.push(
      `delete from member_exercise_favorites f using member_exercise_favorites k` +
        ` where f.provider = 'your_move' and f.external_id = any(${sqlIdList(discardIds)})` +
        ` and k.provider = 'your_move' and k.external_id = ${sqlStr(keeper.external_id)} and k.member_id = f.member_id;`
    );
    lines.push(
      `update member_exercise_favorites set external_id = ${sqlStr(keeper.external_id)}` +
        ` where provider = 'your_move' and external_id = any(${sqlIdList(discardIds)});`
    );

    // member_exercise_recent_views — same unique index, plus "keep the
    // more recent view" semantics (a recency pointer, not history).
    lines.push(
      `delete from member_exercise_recent_views v using member_exercise_recent_views k` +
        ` where v.provider = 'your_move' and v.external_id = any(${sqlIdList(discardIds)})` +
        ` and k.provider = 'your_move' and k.external_id = ${sqlStr(keeper.external_id)}` +
        ` and k.member_id = v.member_id and k.viewed_at >= v.viewed_at;`
    );
    lines.push(
      `delete from member_exercise_recent_views k using member_exercise_recent_views v` +
        ` where k.provider = 'your_move' and k.external_id = ${sqlStr(keeper.external_id)}` +
        ` and v.provider = 'your_move' and v.external_id = any(${sqlIdList(discardIds)})` +
        ` and v.member_id = k.member_id and v.viewed_at > k.viewed_at;`
    );
    lines.push(
      `update member_exercise_recent_views set external_id = ${sqlStr(keeper.external_id)}, exercise_name = ${sqlStr(keeper.name)}` +
        ` where provider = 'your_move' and external_id = any(${sqlIdList(discardIds)});`
    );

    // No unique constraint on these — plain repoint, keeping exercise_name in sync.
    for (const table of REFERENCE_TABLES_SIMPLE) {
      lines.push(
        `update ${table} set external_id = ${sqlStr(keeper.external_id)}, exercise_name = ${sqlStr(keeper.name)}` +
          ` where provider = 'your_move' and external_id = any(${sqlIdList(discardIds)});`
      );
    }

    lines.push(
      `delete from exercise_catalog where provider = 'your_move' and external_id = any(${sqlIdList(discardIds)});`,
      ''
    );
  }

  lines.push('commit;', '');
  return lines.join('\n');
}

async function main() {
  const supabase = createClient(requiredEnv('SEED_SUPABASE_URL'), requiredEnv('SEED_SUPABASE_SERVICE_ROLE_KEY'));
  const migrationNumberArg = process.argv.find((a) => a.startsWith('--migration-number='));
  const migrationNumber = migrationNumberArg ? (migrationNumberArg.split('=')[1] ?? '121') : '121';

  const { data, error } = await supabase.from('exercise_catalog').select('*');
  if (error) throw new Error(`exercise_catalog read failed: ${error.message}`);
  const rows = (data ?? []) as ExerciseCatalogRow[];

  const { data: metadataData, error: metadataError } = await supabase.from('mef_exercise_metadata').select('*');
  if (metadataError) throw new Error(`mef_exercise_metadata read failed: ${metadataError.message}`);
  const metadataRows = (metadataData ?? []) as Record<string, unknown>[];

  const plan = buildPlan(rows, metadataRows);
  const sql = renderMigrationSql(plan);

  const migrationPath = path.resolve(
    __dirname,
    `../../../../supabase/migrations/000000000${migrationNumber.padStart(5, '0')}_dedupe_exercise_catalog.sql`
  );
  writeFileSync(migrationPath, sql);

  const report = {
    generatedAt: new Date().toISOString(),
    catalogRowsScanned: rows.length,
    duplicateGroupsFound: plan.groups.length + (plan.turkishGetUpFix ? 1 : 0),
    groupsMerged: plan.groups.length,
    discardedCatalogRows: plan.groups.reduce((sum, g) => sum + g.discards.length, 0),
    flaggedForManualReview: plan.turkishGetUpFix
      ? [
          {
            reason:
              'Same "(1)" vendor collision-marker pattern as every other group, but instructions describe two different movements — not auto-merged, name corrected instead.',
            externalId: plan.turkishGetUpFix.externalId,
            correctedName: plan.turkishGetUpFix.name,
          },
        ]
      : [],
    groups: plan.groups.map((g) => ({
      normalizedName: g.normalizedName,
      keeperExternalId: g.keeper.external_id,
      keeperName: g.keeper.name,
      discardExternalIds: g.discards.map((d) => d.external_id),
    })),
  };
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  console.log(`Catalog rows scanned: ${rows.length}`);
  console.log(`Duplicate groups found: ${report.duplicateGroupsFound}`);
  console.log(`Groups merged: ${report.groupsMerged} (${report.discardedCatalogRows} rows discarded)`);
  console.log(`Flagged for manual review: ${report.flaggedForManualReview.length}`);
  console.log(`Migration written to ${migrationPath}`);
  console.log(`Report written to ${REPORT_PATH}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
