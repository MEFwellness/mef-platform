/**
 * THE FENCE, THE SEED AND THE THINGS THAT MUST NOT HAVE MOVED.
 *
 * These read the migration SQL itself, because that is the only place the
 * real boundary lives. A screen that remembers not to draw something is a
 * screen that will eventually forget; a table with no member policy cannot.
 */

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');
const ROOT = path.resolve(__dirname, '..');

const SCHEMA = fs.readFileSync(
  path.join(MIGRATIONS, '00000000000246_cross_system_complaint_understanding.sql'),
  'utf8'
);
const SEED = fs.readFileSync(
  path.join(MIGRATIONS, '00000000000248_cross_system_association_map_seed.sql'),
  'utf8'
);

/** Every table this feature creates. */
const NEW_TABLES = [
  'cross_system_complaint_reports',
  'cross_system_complaint_classifications',
  'cross_system_complaint_surfaces',
  'cross_system_complaint_contexts',
  'cross_system_complaint_lexicon',
  'cross_system_complaint_modifiers',
  'cross_system_relationship_source_types',
  'cross_system_root_findings',
  'cross_system_root_finding_areas',
  'cross_system_root_finding_signals',
];

function policies(): Array<{ name: string; table: string; body: string }> {
  const out: Array<{ name: string; table: string; body: string }> = [];
  const pattern = /create policy\s+(\w+)\s+on\s+(\w+)([\s\S]*?);/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(SCHEMA)) !== null) {
    out.push({ name: match[1]!, table: match[2]!, body: match[3]! });
  }
  return out;
}

// ---------------------------------------------------------------------
// 30 and 31. Members cannot see any of it.
// ---------------------------------------------------------------------

describe('the fence is physical', () => {
  it('every new table turns row level security on', () => {
    for (const table of NEW_TABLES) {
      expect(SCHEMA, table).toContain(`alter table ${table} enable row level security`);
    }
  });

  it('30 and 31. not one policy is granted to a member', () => {
    const all = policies();
    expect(all.length).toBeGreaterThan(10);
    for (const policy of all) {
      expect(
        /has_active_role\(auth\.uid\(\), '(coach|platform_administrator)'\)/.test(policy.body),
        `${policy.name} is not gated on a staff role`
      ).toBe(true);
    }
  });

  it('30b. no policy anywhere compares auth.uid() to member_id', () => {
    for (const policy of policies()) {
      expect(policy.body, `${policy.name} mentions member_id`).not.toMatch(/member_id/);
    }
  });

  it('31b. a member cannot write a complaint or a finding about herself', () => {
    // The report, classification and finding tables carry no insert policy
    // for anybody, coach included. The only writer is the trusted
    // connection, because classification fires inside a member's own
    // submit where no coach session exists.
    const writable = policies().filter(
      (policy) =>
        /for (insert|update|delete|all)/.test(policy.body) &&
        !policy.name.startsWith('admin_all_')
    );
    for (const policy of writable) {
      // The only coach write in the whole feature is marking a finding
      // read, plus the lexicon door a coach may add a phrase through.
      expect(
        ['cross_system_root_findings', 'cross_system_complaint_lexicon'],
        `${policy.name} writes ${policy.table}`
      ).toContain(policy.table);
    }
  });

  it('every new table is prefixed, so it can never be confused with another feature', () => {
    const created = [...SCHEMA.matchAll(/create table (\w+)/g)].map((match) => match[1]!);
    for (const table of created) {
      expect(table.startsWith('cross_system_'), table).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------
// 32 and 33. Nothing that already existed was touched.
// ---------------------------------------------------------------------

describe('what was already there is left alone', () => {
  it('32 and 33. no migration in this build alters a questionnaire or scoring table', () => {
    const FORBIDDEN = [
      'body_systems_sessions',
      'body_systems_responses',
      'body_systems_readings',
      'body_systems_scale_options',
      'body_systems_sections',
      'whole_body_signal_sessions',
      'whole_body_signal_responses',
      'daily_checkins',
      'assessment_sessions',
      'assessment_responses',
    ];
    for (const file of [
      '00000000000246_cross_system_complaint_understanding.sql',
      '00000000000247_cross_system_complaint_lexicon_seed.sql',
      '00000000000248_cross_system_association_map_seed.sql',
      '00000000000249_cross_system_complaint_lexicon_fixes.sql',
      '00000000000250_cross_system_complaint_lexicon_inflections.sql',
    ]) {
      const sql = fs.readFileSync(path.join(MIGRATIONS, file), 'utf8');
      for (const table of FORBIDDEN) {
        expect(sql, `${file} alters ${table}`).not.toMatch(
          new RegExp(`(alter|drop|update|delete from)\\s+(table\\s+)?${table}\\b`, 'i')
        );
      }
    }
  });

  it('the only existing tables it alters are this feature\'s own', () => {
    const altered = [...SCHEMA.matchAll(/alter table (\w+)\s+add column/g)].map((m) => m[1]!);
    for (const table of altered) {
      expect(table.startsWith('cross_system_relationship'), table).toBe(true);
    }
  });

  it('every added column carries a default, so no existing row becomes invalid', () => {
    const adds = [...SCHEMA.matchAll(/add column\s+(\w+)\s+([^;]+);/g)];
    expect(adds.length).toBeGreaterThan(0);
    for (const add of adds) {
      const [, name, rest] = add;
      if (/not null/i.test(rest!)) {
        expect(rest, `${name} is NOT NULL with no default`).toMatch(/default/i);
      }
    }
  });
});

// ---------------------------------------------------------------------
// 34. No combined diagnostic score exists in the schema.
// ---------------------------------------------------------------------

describe('the schema cannot hold a conclusion', () => {
  it('34. no column in this feature is named for a cause, a score or a confidence', () => {
    const columns = [...SCHEMA.matchAll(/^\s{2}(\w+)\s+(?:uuid|text|integer|boolean|date|timestamptz|numeric)/gm)]
      .map((match) => match[1]!);
    expect(columns.length).toBeGreaterThan(30);
    const forbidden = /(^|_)(cause|diagnosis|condition|confidence|score|severity|grade|risk|index)($|_)/;
    for (const column of columns) {
      expect(column, `column ${column}`).not.toMatch(forbidden);
    }
  });

  it('34b. the counts it does store are counts, and they say so in their names', () => {
    expect(SCHEMA).toContain('current_finding_count');
    expect(SCHEMA).toContain('historical_finding_count');
    expect(SCHEMA).toContain('not_observed_count');
  });
});

// ---------------------------------------------------------------------
// 35, 36 and 37. The starter map.
// ---------------------------------------------------------------------

describe('the starter Whole-Body Association Map', () => {
  const entries = [...SEED.matchAll(/'(starter-[a-z-]+)'/g)].map((match) => match[1]!);

  it('35. is seeded during the build, with broad whole-body coverage', () => {
    const unique = [...new Set(entries)];
    expect(unique.length).toBe(18);
    // Every region and system the brief names has an entry.
    for (const key of [
      'starter-hip-pelvis',
      'starter-low-back',
      'starter-shoulder',
      'starter-neck',
      'starter-knee',
      'starter-ankle-foot',
      'starter-headaches',
      'starter-skin',
      'starter-digestion',
      'starter-blood-sugar-energy',
      'starter-sleep',
      'starter-stress',
      'starter-mood',
      'starter-hormonal',
      'starter-urinary',
      'starter-breathing',
      'starter-fatigue',
      'starter-musculoskeletal-general',
    ]) {
      expect(unique, key).toContain(key);
    }
  });

  it('35b. every seeded entry is ACTIVE on deployment, so Root works on day one', () => {
    expect(SEED).toMatch(/insert into cross_system_relationships[\s\S]*?is_active[\s\S]*?values\s*\(p_key,\s*true/);
  });

  it('35c. every seeded entry is read by the complaint lookup rather than the floor matcher', () => {
    expect(SEED).toContain('surfaces_on_complaint');
  });

  it('36. every seeded entry carries a source type, and it is a real one', () => {
    const KNOWN = [
      'chek_hlc',
      'referred_pain',
      'biomechanics',
      'lifestyle',
      'mef_internal',
      'coach_added',
      'other',
    ];
    const used = [...SEED.matchAll(/^\s*'(chek_hlc|referred_pain|biomechanics|lifestyle|mef_internal|coach_added|other)',$/gm)]
      .map((match) => match[1]!);
    expect(used.length).toBe(18);
    for (const key of used) expect(KNOWN).toContain(key);
  });

  it('36b. the seven source types exist as rows before any entry references one', () => {
    const typesAt = SCHEMA.indexOf('insert into cross_system_relationship_source_types');
    const fkAt = SCHEMA.indexOf('references cross_system_relationship_source_types');
    expect(typesAt).toBeGreaterThan(-1);
    expect(fkAt).toBeGreaterThan(typesAt);
  });

  it('37. a seeded entry is an ordinary relationship, so the editor already works on it', () => {
    // Version 1, components, strength levels and considerations, written
    // into the SAME four tables the editor reads and writes. Nothing about
    // a seeded row is a special case, which is what makes it editable,
    // deactivatable and versionable with no new code.
    expect(SEED).toContain('insert into cross_system_relationship_versions');
    expect(SEED).toContain('insert into cross_system_relationship_components');
    expect(SEED).toContain('insert into cross_system_relationship_strength_levels');
    expect(SEED).toContain('insert into cross_system_relationship_considerations');
    expect(SEED).toMatch(/version_number[\s\S]*?v_rel, 1,/);
  });

  it('37b. is_seeded is separate from is_example, because a seeded entry is real', () => {
    expect(SCHEMA).toContain('add column is_seeded');
    expect(SEED).toMatch(/is_active, is_example, is_seeded[\s\S]*?true, false, true/);
  });

  it('37c. re-running the seed never overwrites an entry the coach has since edited', () => {
    expect(SEED).toContain('on conflict (pattern_key) do nothing');
    expect(SEED).toMatch(/if v_rel is null then\s*\n\s*return;/);
  });

  it('nothing is hard coded to one pairing: the helper takes lists and resolves labels', () => {
    // There is no hip column and no kidney column. The same call that seeds
    // the hip entry seeds the mood one.
    expect(SEED).toContain('p_primaries      jsonb');
    expect(SEED).toContain('p_related        jsonb');
    expect(SEED).toMatch(/select display_name from cross_system_signal_categories/);
    expect(SEED).toMatch(/select display_name from cross_system_body_areas/);
  });

  it('refuses to seed an entry naming a key the Signal Library does not hold', () => {
    // A label resolved to null is a raise, not a component labelled with
    // its own slug. A typo in the map fails the migration rather than
    // shipping a relationship pointing at nothing.
    expect(SEED).toMatch(/raise exception 'seed_association_entry/);
  });

  it('the seeding helper is dropped, so it is a build tool and never an API', () => {
    expect(SEED).toContain('drop function pg_temp.seed_association_entry');
  });
});

// ---------------------------------------------------------------------
// 28. Everything traces back.
// ---------------------------------------------------------------------

describe('a coach can trace every conclusion back to its source', () => {
  it('28. a finding names its complaint, its map entry and the exact version read', () => {
    expect(SCHEMA).toMatch(/report_id uuid not null references cross_system_complaint_reports/);
    expect(SCHEMA).toMatch(/relationship_id uuid not null references cross_system_relationships/);
    expect(SCHEMA).toMatch(/version_id uuid not null references cross_system_relationship_versions/);
  });

  it('28b. every area names the exact signal rows behind it, not a count', () => {
    expect(SCHEMA).toContain('create table cross_system_root_finding_signals');
    expect(SCHEMA).toMatch(/signal_id uuid not null references cross_system_signals/);
  });

  it('28c. a classification names the span of her own words that produced it', () => {
    expect(SCHEMA).toContain('matched_phrase text not null');
  });

  it('28d. a report stores her words verbatim and the day in her own zone', () => {
    expect(SCHEMA).toContain('raw_text text not null');
    expect(SCHEMA).toContain('reported_on date not null');
  });

  it('28e. a classification is joined to the signal row it was written into', () => {
    expect(SCHEMA).toMatch(/signal_id uuid references cross_system_signals\(id\)/);
  });
});

// ---------------------------------------------------------------------
// The import fence: no member surface may reach the coach's wording.
// ---------------------------------------------------------------------

describe('no member surface can reach a coach sentence', () => {
  function sourcesUnder(dir: string): string[] {
    const full = path.join(ROOT, dir);
    if (!fs.existsSync(full)) return [];
    const out: string[] = [];
    for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
      const next = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...sourcesUnder(next));
      else if (/\.tsx?$/.test(entry.name)) out.push(next);
    }
    return out;
  }

  it('only coach and admin surfaces import the Root finding copy', () => {
    const offenders: string[] = [];
    for (const file of [...sourcesUnder('app'), ...sourcesUnder('components')]) {
      if (file.startsWith(path.join('app', 'coach'))) continue;
      if (file.startsWith(path.join('app', 'admin'))) continue;
      if (file.startsWith(path.join('app', 'actions'))) continue;
      const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
      if (/cross-system-root\/(copy|view)/.test(source)) offenders.push(file);
    }
    expect(offenders, offenders.join('\n')).toHaveLength(0);
  });

  it('the lookup engine itself holds no coach facing sentence', () => {
    // It is reachable from a member's own submit, because classifying her
    // check-in note is what triggers it. So it reaches a STATE, and copy.ts
    // turns that into a line on the coach's side of the fence.
    const lookup = fs.readFileSync(
      path.join(ROOT, 'lib/cross-system-root/lookup.ts'),
      'utf8'
    );
    expect(lookup).not.toMatch(/from '\.\/copy'/);
    expect(lookup).not.toMatch(/worth reviewing['"`]/);
  });

  it('the classifier reaches no relationship and no coach wording at all', () => {
    const classify = fs.readFileSync(
      path.join(ROOT, 'lib/cross-system-complaints/classify.ts'),
      'utf8'
    );
    expect(classify).not.toMatch(/cross-system-relationships/);
    expect(classify).not.toMatch(/cross-system-root/);
  });
});
