/**
 * WHAT THE SEVEN MIGRATIONS OF THIS BUILD ARE ALLOWED TO TOUCH.
 *
 * WHY A SCHEMA GUARD AND NOT ONLY BEHAVIOUR TESTS. Two of the brief's hard
 * rules are about things that are invisible in an output. "Existing
 * questionnaire results and Body Systems scoring remain unchanged" is a
 * promise about tables nobody in this feature should be writing to at all,
 * and "members never see the knowledge map" is a promise about ROW LEVEL
 * SECURITY rather than about any screen. Both are properties of the SQL,
 * so the SQL is what this reads.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');

const VOCABULARY = '00000000000251_cross_system_vocabulary_expansion.sql';
const MAP_FILES = [
  '00000000000252_cross_system_map_structure.sql',
  '00000000000253_cross_system_map_systems.sql',
  '00000000000254_cross_system_map_posture.sql',
  '00000000000255_cross_system_map_signals.sql',
];
const LEXICON = '00000000000256_cross_system_lexicon_expansion.sql';
const CHECKIN = '00000000000257_daily_checkin_optional_notes.sql';
const ALL = [VOCABULARY, ...MAP_FILES, LEXICON, CHECKIN];

function read(file: string): string {
  return fs.readFileSync(path.join(MIGRATIONS, file), 'utf8');
}

describe('the fence is untouched: a member session still reads nothing', () => {
  it('no migration in this build creates a member policy of any kind', () => {
    for (const file of ALL) {
      const sql = read(file);
      for (const policy of sql.matchAll(/create policy[\s\S]*?;/gi)) {
        const text = policy[0]!;
        // The only two grants this feature has ever used.
        expect(text, file).toMatch(/has_active_role\(auth\.uid\(\),\s*'(coach|platform_administrator)'\)/);
        expect(text, file).not.toMatch(/auth\.uid\(\)\s*=\s*member_id/);
      }
    }
  });

  it('no migration in this build creates a table at all', () => {
    // Everything here is rows and columns on tables migrations 240 to 246
    // already fenced. A new table would need its own policies, and a new
    // table with none is how a leak happens.
    for (const file of ALL) {
      expect(read(file), file).not.toMatch(/create table/i);
    }
  });

  it('the two new signal columns are nullable, so no existing row becomes invalid', () => {
    const sql = read(VOCABULARY);
    expect(sql).toContain('add column complaint_surface_key text');
    expect(sql).toContain('add column complaint_surface_label text');
    expect(sql).not.toMatch(/add column complaint_surface_\w+ text not null/i);
  });

  it('the new classification column is not null and carries a default', () => {
    expect(read(VOCABULARY)).toContain('add column is_resolution boolean not null default false');
  });
});

describe('nothing in this build touches a questionnaire or a scoring table', () => {
  const FORBIDDEN = [
    'body_systems_sessions',
    'member_body_systems_sessions',
    'body_systems_responses',
    'body_systems_readings',
    'body_systems_scale_options',
    'body_systems_sections',
    'whole_body_signal_sessions',
    'whole_body_signal_responses',
    'assessment_sessions',
    'assessment_responses',
    'wellness_assessments',
    'wellness_assessment_answers',
    'wellness_assessment_category_scores',
  ];

  it.each(ALL)('%s leaves every scored instrument alone', (file) => {
    const sql = read(file);
    for (const table of FORBIDDEN) {
      expect(sql, `${file} touches ${table}`).not.toMatch(
        new RegExp(`(alter|drop|update|delete from|insert into)\\s+(table\\s+)?${table}\\b`, 'i')
      );
    }
  });

  it('only one migration touches daily_checkins, and only to add two nullable columns', () => {
    for (const file of ALL.filter((name) => name !== CHECKIN)) {
      expect(read(file), file).not.toMatch(/(alter|update|delete from)\s+(table\s+)?daily_checkins\b/i);
    }
    const sql = read(CHECKIN);
    const alters = [...sql.matchAll(/alter table daily_checkins([\s\S]*?);/gi)];
    expect(alters.length).toBe(1);
    const body = alters[0]![1]!;
    expect(body).toContain('add column concern_note text');
    expect(body).toContain('add column discomfort_note text');
    expect(body).not.toMatch(/not null/i);
    expect(body).not.toMatch(/drop column/i);
  });

  it('the check-in function keeps every parameter it had, in order, and defaults the new ones', () => {
    const sql = read(CHECKIN);
    const created = sql.slice(sql.indexOf('create or replace function public.submit_daily_checkin'));
    const params = [...created.slice(0, created.indexOf(')\nreturns uuid')).matchAll(/p_(\w+)\s+\w+/g)].map(
      (match) => match[1]!
    );
    // Migration 113's nineteen plus completion_seconds, unchanged and in
    // the same order, with the two new ones appended.
    const expected = [
      'timezone', 'local_date', 'mood_level', 'sleep_quality', 'sleep_duration', 'energy_level',
      'stress_level', 'water_cups', 'digestion_rating', 'pain_discomfort_level', 'movement_today',
      'new_or_worsening_concern', 'optional_notes', 'actual_bedtime', 'actual_wake_time',
      'night_waking_count', 'night_sweats', 'morning_soreness', 'bowel_movement_status',
      'completion_seconds', 'concern_note', 'discomfort_note',
    ];
    expect(params).toEqual(expected);
    expect(created).toContain('p_concern_note text default null');
    expect(created).toContain('p_discomfort_note text default null');
  });

  it('it recreates the view it had to drop, unchanged', () => {
    const sql = read(CHECKIN);
    expect(sql).toContain('drop view daily_checkins_current');
    expect(sql).toContain('create view daily_checkins_current');
    expect(sql).toContain('with (security_invoker = true)');
    expect(sql).toContain('select distinct on (user_id, local_date) *');
  });
});

describe('the map migrations only write relationships, and never invent one at runtime', () => {
  it.each(MAP_FILES)('%s inserts only through the seeding helper', (file) => {
    const sql = read(file);
    // No direct inserts into the relationship tables: everything goes
    // through the one function, which resolves every label from the Signal
    // Library and raises on a key that does not exist.
    expect(sql).toContain('create or replace function pg_temp.seed_map_entry');
    expect(sql).toContain('drop function pg_temp.seed_map_entry');
    const outsideHelper = sql.slice(sql.indexOf('$fn$;'));
    expect(outsideHelper).not.toMatch(/insert into cross_system_relationship/i);
  });

  it('the helper is temporary, so it can never become an API', () => {
    for (const file of MAP_FILES) {
      const sql = read(file);
      expect(sql, file).toContain('pg_temp.seed_map_entry');
      expect(sql, file).not.toMatch(/create or replace function public\./i);
    }
  });

  it('a re-run never overwrites a version the coach wrote', () => {
    for (const file of MAP_FILES) {
      const sql = read(file);
      expect(sql, file).toContain('on conflict (pattern_key) do nothing');
      expect(sql, file).toContain('if v_rel is null then');
    }
  });

  it('a key that does not exist fails the migration rather than shipping a bad label', () => {
    for (const file of MAP_FILES) {
      expect(read(file), file).toContain('raise exception');
    }
  });
});

describe('the lexicon migration widens the ways in and never the vocabulary', () => {
  it('every phrase points at a canonical name through a foreign key', () => {
    const sql = read(LEXICON);
    // The table's own foreign key is what enforces it; this asserts the
    // migration writes into that table and nowhere else.
    const inserts = [...sql.matchAll(/insert into (\w+)/g)].map((match) => match[1]!);
    expect(new Set(inserts)).toEqual(
      new Set([
        'cross_system_complaint_contexts',
        'cross_system_complaint_lexicon',
        'cross_system_complaint_modifiers',
      ])
    );
  });

  it('its only delete is the repoint, and it is scoped to one signal', () => {
    const sql = read(LEXICON);
    const deletes = [...sql.matchAll(/delete from[\s\S]*?;/gi)];
    expect(deletes.length).toBe(1);
    expect(deletes[0]![0]).toContain("signal_slug = 'joint-aching'");
  });

  it('it holds over a thousand phrase rows and hundreds of modifiers', () => {
    const sql = read(LEXICON);
    const phraseBlocks = [...sql.matchAll(/insert into cross_system_complaint_lexicon[\s\S]*?on conflict/g)];
    const rows = phraseBlocks.reduce(
      (total, block) => total + (block[0].match(/\n {2}\(/g) ?? []).length,
      0
    );
    expect(rows).toBeGreaterThan(1000);
  });
});

describe('no migration in this build can hold a conclusion', () => {
  it.each(ALL)('%s adds no column named for a cause, a score or a confidence', (file) => {
    const sql = read(file);
    const added = [...sql.matchAll(/add column\s+(\w+)/g)].map((match) => match[1]!);
    for (const column of added) {
      expect(column, `${file}: ${column}`).not.toMatch(
        /(^|_)(cause|diagnosis|condition|confidence|score|grade|risk|index)($|_)/
      );
    }
  });

  it('and no combined medical number is written anywhere', () => {
    for (const file of ALL) {
      const sql = read(file).toLowerCase();
      expect(sql, file).not.toContain('combined_score');
      expect(sql, file).not.toContain('total_health');
      expect(sql, file).not.toContain('diagnosis');
    }
  });
});
