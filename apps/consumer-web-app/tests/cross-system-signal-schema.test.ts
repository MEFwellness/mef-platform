/**
 * THE SCHEMA AND THE SEED, read out of the SQL itself.
 *
 * These are the claims a migration can break silently, because nothing in
 * TypeScript imports a table:
 *
 *   1. THE FENCE. Not one of the seven tables carries a member select
 *      policy, and cross_system_signals carries no update policy at all.
 *      Either of those appearing would be the whole coach-only property
 *      gone, and it would be gone quietly.
 *   2. THE NAMING. Every table, index and policy carries the cross_system
 *      prefix, and nothing in this feature is named whole_body_signal,
 *      which is a different instrument that already owns that prefix.
 *   3. THE DICTIONARY IS HONEST. Every question ref the Body Systems
 *      Survey dictionary maps really exists in that survey's own content
 *      migration, every breathing item id really exists in the frozen
 *      instrument, every posture finding type is really in the findings
 *      table's check constraint, and every section key is real. A
 *      dictionary row pointing at a question nobody asks maps nothing and
 *      says nothing about it.
 *   4. EVERY MAPPED SLUG IS A SEEDED NAME, and every seeded name's
 *      category, area and symptom really exist. A foreign key would catch
 *      this on apply; catching it here means catching it before apply.
 *   5. NO EM DASH anywhere in the seeded rows, which the source guard
 *      cannot see because they are stored content.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { BPC_ITEMS } from '@/lib/breathing-check-in/instrument';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');

function sql(file: string): string {
  return readFileSync(path.join(MIGRATIONS, file), 'utf8');
}

const SCHEMA = sql('00000000000240_cross_system_signal_library.sql');
const CONTENT = sql('00000000000241_cross_system_signal_content.sql');
const BODY_SYSTEMS_CONTENT = sql('00000000000221_body_systems_content.sql');
const WBS_CONTENT = sql('00000000000226_whole_body_signal_content.sql');
const FINDING_TYPES_SQL = sql('00000000000050_body_assessment_finding_types_screening.sql');

const TABLES = [
  'cross_system_signal_categories',
  'cross_system_body_areas',
  'cross_system_symptom_types',
  'cross_system_signal_names',
  'cross_system_signal_sources',
  'cross_system_signal_source_map',
  'cross_system_signals',
];

// ---------------------------------------------------------------------
// 1. The fence
// ---------------------------------------------------------------------

describe('the library is coach only, in the database rather than by convention', () => {
  it.each(TABLES)('%s exists and has row level security on', (table) => {
    expect(SCHEMA).toContain(`create table ${table} (`);
    expect(SCHEMA).toContain(`alter table ${table} enable row level security;`);
  });

  /**
   * The test is on the policy's USING clause, not on the word "member",
   * because a policy named coach_read_... that resolved to auth.uid() =
   * member_id would be exactly the leak this file exists to prevent.
   */
  it('no policy anywhere lets a member read her own signals', () => {
    const policies = [...SCHEMA.matchAll(/create policy\s+(\w+)\s+on\s+(\w+)([\s\S]*?);/g)];
    expect(policies.length).toBeGreaterThan(10);
    for (const [, name, table, body] of policies) {
      if (!table!.startsWith('cross_system')) continue;
      const clause = body!.replace(/\s+/g, ' ');
      // Every single policy on this feature is gated on an active staff
      // role. A member session passes none of them.
      expect(
        /has_active_role\(auth\.uid\(\), '(coach|platform_administrator)'\)/.test(clause) ||
          /profiles p where p\.id = cross_system_signals\.member_id/.test(clause),
        `${name} on ${table} is not gated on a staff role`
      ).toBe(true);
      expect(clause, `${name} compares auth.uid() to member_id`).not.toMatch(
        /member_id = auth\.uid\(\)/
      );
    }
  });

  it('cross_system_signals has no update policy, which is the append over time rule', () => {
    const onSignals = SCHEMA.slice(SCHEMA.indexOf('create table cross_system_signals ('));
    expect(onSignals).not.toMatch(/create policy \w+ on cross_system_signals\s+for update/);
  });

  it('a coach may only insert a coach entered row, signed by herself, with no fingerprint', () => {
    const policy = SCHEMA.slice(
      SCHEMA.indexOf('create policy coach_insert_assigned_cross_system_signals')
    ).split(';')[0]!;
    expect(policy).toContain("entry_mode = 'coach_entered'");
    expect(policy).toContain('entered_by = auth.uid()');
    expect(policy).toContain('ingest_fingerprint is null');
    expect(policy).toContain('is_active_coach_for(auth.uid(), member_id)');
  });

  it('there is no member insert policy, so ingestion cannot run on her own session', () => {
    expect(SCHEMA).not.toMatch(/create policy member_\w+ on cross_system/);
  });

  it('a signal can never be written without a source and a value a coach can read', () => {
    const table = SCHEMA.slice(
      SCHEMA.indexOf('create table cross_system_signals ('),
      SCHEMA.indexOf('create unique index cross_system_signals_fingerprint_idx')
    );
    for (const column of [
      'signal_slug text not null',
      'signal_name text not null',
      'category_key text not null',
      'value_kind text not null',
      'value_label text not null',
      'source_key text not null',
      'source_label text not null',
      'captured_on date not null',
      'captured_at timestamptz not null',
    ]) {
      expect(table, column).toContain(column);
    }
  });

  it('re-running ingestion cannot duplicate a row, and a coach entry is never deduplicated', () => {
    expect(SCHEMA).toContain(
      'create unique index cross_system_signals_fingerprint_idx\n  on cross_system_signals (member_id, ingest_fingerprint)\n  where ingest_fingerprint is not null;'
    );
  });
});

// ---------------------------------------------------------------------
// 2. The naming, which is the whole point of the prefix
// ---------------------------------------------------------------------

describe('nothing in this feature can be confused with the two assessments it is not', () => {
  it('every table, index and policy created here carries the cross_system prefix', () => {
    for (const [, name] of SCHEMA.matchAll(/create table (\w+)/g)) {
      expect(name, `table ${name}`).toMatch(/^cross_system_/);
    }
    for (const [, name] of SCHEMA.matchAll(/create (?:unique )?index (\w+)/g)) {
      expect(name, `index ${name}`).toMatch(/^cross_system_/);
    }
    for (const [, name] of SCHEMA.matchAll(/create policy (\w+)/g)) {
      expect(name, `policy ${name}`).toMatch(/cross_system/);
    }
  });

  it('creates, alters or drops nothing belonging to another feature', () => {
    for (const [, verb, target] of SCHEMA.matchAll(/\n(alter|drop) table (?:if exists )?(\w+)/g)) {
      expect(target, `${verb} ${target}`).toMatch(/^cross_system_/);
    }
    expect(CONTENT).not.toMatch(/\n(alter|drop|update|delete)\s/i);
  });

  it('inserts only into its own tables', () => {
    for (const [, table] of CONTENT.matchAll(/insert into (\w+)/g)) {
      expect(table).toMatch(/^cross_system_/);
    }
  });

  it('says out loud that it is not the Whole-Body Signal Assessment', () => {
    expect(SCHEMA).toContain('whole_body_signal_');
    expect(SCHEMA.toLowerCase()).toContain('not the rooted reset whole-body signal assessment');
  });
});

// ---------------------------------------------------------------------
// 3 and 4. The seed, and the dictionary over it
// ---------------------------------------------------------------------

/** Every value of the first column of each row in one `insert into X ... values` block. */
function seededFirstColumn(source: string, table: string): string[] {
  const out: string[] = [];
  const blocks = source.split(`insert into ${table}`).slice(1);
  for (const block of blocks) {
    const body = block.split('on conflict')[0]!;
    for (const [, value] of body.matchAll(/\n\s*\('([^']+)'/g)) out.push(value!);
  }
  return out;
}

/** Every mapping row, as its four meaningful columns. */
function dictionary(): { source: string; kind: string; key: string; slug: string }[] {
  const out: { source: string; kind: string; key: string; slug: string }[] = [];
  const blocks = CONTENT.split('insert into cross_system_signal_source_map').slice(1);
  for (const block of blocks) {
    const body = block.split('on conflict')[0]!;
    for (const [, source, kind, key, slug] of body.matchAll(
      /\n\s*\('([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)'/g
    )) {
      out.push({ source: source!, kind: kind!, key: key!, slug: slug! });
    }
  }
  return out;
}

const CATEGORY_KEYS = new Set(seededFirstColumn(CONTENT, 'cross_system_signal_categories'));
const AREA_KEYS = new Set(seededFirstColumn(CONTENT, 'cross_system_body_areas'));
const SYMPTOM_KEYS = new Set(seededFirstColumn(CONTENT, 'cross_system_symptom_types'));
const NAME_SLUGS = new Set(seededFirstColumn(CONTENT, 'cross_system_signal_names'));
const SOURCE_KEYS = new Set(seededFirstColumn(CONTENT, 'cross_system_signal_sources'));
const DICTIONARY = dictionary();

describe('the seed is internally whole', () => {
  it('seeded every vocabulary, and the categories the prompt named are among them', () => {
    expect(CATEGORY_KEYS.size).toBeGreaterThanOrEqual(14);
    for (const key of [
      'joint_movement',
      'musculoskeletal',
      'skin_immune',
      'kidney_bladder',
      'digestion',
      'stress',
      'sleep',
      'hormonal',
      'circulation',
      'neurological',
      'immune',
      'energy',
      'mood',
      'other',
    ]) {
      expect(CATEGORY_KEYS.has(key), key).toBe(true);
    }
  });

  it('seeded the body areas a coach taps through', () => {
    for (const key of [
      'head', 'jaw', 'neck', 'shoulder', 'elbow', 'wrist', 'hand',
      'upper_back', 'mid_back', 'low_back', 'hip', 'knee', 'ankle', 'foot',
    ]) {
      expect(AREA_KEYS.has(key), key).toBe(true);
    }
  });

  it('seeded the symptom words the coach entry tool offers', () => {
    for (const key of [
      'pain', 'stiffness', 'clicking', 'snapping', 'weakness', 'tightness',
      'tingling', 'numbness', 'swelling', 'cramping',
    ]) {
      expect(SYMPTOM_KEYS.has(key), key).toBe(true);
    }
  });

  it('seeded the six sources, one per registered adapter plus the coach', () => {
    expect([...SOURCE_KEYS].sort()).toEqual([
      'body_assessment',
      'body_systems_survey',
      'breathing_pattern_check_in',
      'coach_entered',
      'daily_check_in',
      'whole_body_signal',
    ]);
  });

  it('seeded the four standardized names the brief named by hand', () => {
    const names = CONTENT.slice(CONTENT.indexOf('insert into cross_system_signal_names'));
    for (const label of [
      "'Hip clicking'",
      "'Frequent urination'",
      "'Skin flare-ups'",
      "'Low-back tightness'",
    ]) {
      expect(names, label).toContain(label);
    }
  });

  it('every standardized name points at a real category, area and symptom', () => {
    const block = CONTENT.split('insert into cross_system_signal_names')[1]!.split('on conflict')[0]!;
    const rows = [
      ...block.matchAll(
        /\n\s*\('([^']+)',\s*'((?:[^']|'')+)',\s*'([^']+)',\s*(null|'[^']+'),\s*(null|'[^']+')/g
      ),
    ];
    expect(rows.length).toBeGreaterThan(100);
    for (const [, slug, , category, area, symptom] of rows) {
      expect(CATEGORY_KEYS.has(category!), `${slug} category ${category}`).toBe(true);
      if (area !== 'null') {
        expect(AREA_KEYS.has(area!.slice(1, -1)), `${slug} area ${area}`).toBe(true);
      }
      if (symptom !== 'null') {
        expect(SYMPTOM_KEYS.has(symptom!.slice(1, -1)), `${slug} symptom ${symptom}`).toBe(true);
      }
    }
  });

  it('every dictionary row points at a real source and a real standardized name', () => {
    expect(DICTIONARY.length).toBeGreaterThan(140);
    for (const row of DICTIONARY) {
      expect(SOURCE_KEYS.has(row.source), row.source).toBe(true);
      expect(NAME_SLUGS.has(row.slug), `${row.source}:${row.key} maps to ${row.slug}`).toBe(true);
    }
  });
});

describe('the dictionary points at questions that really exist', () => {
  const BSS_QUESTION_REFS = new Set(
    [
      ...BODY_SYSTEMS_CONTENT.split('insert into body_systems_questions')[1]!
        .split('on conflict')[0]!
        .matchAll(/\n\s*\('([A-Z]+\d+)'/g),
    ].map((match) => match[1]!)
  );
  const BSS_SECTION_KEYS = new Set(
    [
      ...BODY_SYSTEMS_CONTENT.split('insert into body_systems_sections')[1]!
        .split('on conflict')[0]!
        .matchAll(/\n\s*\('([a-z_]+)'/g),
    ].map((match) => match[1]!)
  );
  const WBS_SECTION_KEYS = new Set(
    [
      ...WBS_CONTENT.split('insert into whole_body_signal_sections')[1]!
        .split('on conflict')[0]!
        .matchAll(/\n\s*\('([a-z_]+)'/g),
    ].map((match) => match[1]!)
  );
  const BPC_ITEM_IDS = new Set(BPC_ITEMS.map((item) => item.itemId));
  const FINDING_TYPES = new Set(
    [...FINDING_TYPES_SQL.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]!)
  );

  it('is reading real lists, so a broken parse fails rather than passes empty', () => {
    expect(BSS_QUESTION_REFS.size).toBeGreaterThan(100);
    expect(BSS_SECTION_KEYS.size).toBe(11);
    expect(WBS_SECTION_KEYS.size).toBe(9);
    expect(BPC_ITEM_IDS.size).toBe(16);
  });

  it('every Body Systems Survey question it maps is a question that survey asks', () => {
    for (const row of DICTIONARY) {
      if (row.source !== 'body_systems_survey' || row.kind !== 'question') continue;
      expect(BSS_QUESTION_REFS.has(row.key), row.key).toBe(true);
    }
  });

  it('maps every one of that survey eleven sections, and nothing that is not one', () => {
    const mapped = DICTIONARY.filter(
      (row) => row.source === 'body_systems_survey' && row.kind === 'section'
    ).map((row) => row.key);
    expect(new Set(mapped)).toEqual(BSS_SECTION_KEYS);
  });

  it('maps every one of the Signal Assessment nine sections, and nothing else from it at all', () => {
    const rows = DICTIONARY.filter((row) => row.source === 'whole_body_signal');
    expect(new Set(rows.map((row) => row.key))).toEqual(WBS_SECTION_KEYS);
    // NO ZONE, no chakra, no organ, no gland, and no individual question.
    for (const row of rows) expect(row.kind).toBe('section');
  });

  it('every breathing item it maps is one of the frozen instrument sixteen, and it maps all of them', () => {
    const items = DICTIONARY.filter(
      (row) => row.source === 'breathing_pattern_check_in' && row.kind === 'item'
    ).map((row) => row.key);
    expect(new Set(items)).toEqual(BPC_ITEM_IDS);
  });

  it('every posture finding type it maps is one the findings table allows', () => {
    for (const row of DICTIONARY) {
      if (row.source !== 'body_assessment') continue;
      expect(FINDING_TYPES.has(row.key), row.key).toBe(true);
    }
  });

  it('deliberately maps no custom finding type, because that has no standardized name', () => {
    expect(DICTIONARY.some((row) => row.source === 'body_assessment' && row.key === 'custom')).toBe(
      false
    );
  });

  it('maps the Daily Check-In one body question and nothing else from it', () => {
    const rows = DICTIONARY.filter((row) => row.source === 'daily_check_in');
    expect(rows.map((row) => row.key)).toEqual(['pain_discomfort_level']);
  });

  it('maps nothing at all for the coach, who is not an adapter', () => {
    expect(DICTIONARY.some((row) => row.source === 'coach_entered')).toBe(false);
  });
});

// ---------------------------------------------------------------------
// 5. The stored words
// ---------------------------------------------------------------------

describe('the stored content obeys the house style', () => {
  it('carries no em dash in any seeded row, which the source guard cannot see', () => {
    for (const [, value] of CONTENT.matchAll(/'((?:[^']|'')*)'/g)) {
      expect(value, value).not.toContain('—');
    }
  });
});
