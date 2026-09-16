/**
 * THE SHIPPED WHOLE-BODY ASSOCIATION MAP, READ OUT OF THE MIGRATIONS.
 *
 * WHY THE TESTS DRIVE THE REAL MAP RATHER THAN A TOY ONE, which is the
 * same reason tests/cross-system-complaint-fixture.ts parses the real
 * lexicon. A test built on three invented entries proves the LOOKUP and
 * nothing about whether a member writing "my right knee grinds on stairs"
 * is actually sent anywhere useful by what this build deploys. The map is
 * the feature, so the map is what is under test.
 *
 * IT READS ALL FIVE SEED MIGRATIONS, the eighteen starter entries included,
 * because a coach opening the library sees one library rather than five.
 */

import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');

export const MAP_MIGRATIONS = [
  '00000000000248_cross_system_association_map_seed.sql',
  '00000000000252_cross_system_map_structure.sql',
  '00000000000253_cross_system_map_systems.sql',
  '00000000000254_cross_system_map_posture.sql',
  '00000000000255_cross_system_map_signals.sql',
];

export type MapComponent = { kind: 'signal' | 'category' | 'body_area'; key: string; min: number | null };

export type MapEntry = {
  patternKey: string;
  patternName: string;
  sourceTypeKey: string;
  association: string;
  primaries: MapComponent[];
  related: MapComponent[];
  support: MapComponent[];
  considerations: string[];
  /** Which migration it came from, so a failure can name the file. */
  file: string;
};

function parseComponents(raw: string): MapComponent[] {
  // The argument is a jsonb array literal of two or three element arrays.
  const out: MapComponent[] = [];
  for (const match of raw.matchAll(/\["(signal|category|body_area)","([a-z0-9_-]+)"(?:,(\d+))?\]/g)) {
    out.push({
      kind: match[1] as MapComponent['kind'],
      key: match[2]!,
      min: match[3] === undefined ? null : Number(match[3]),
    });
  }
  return out;
}

/** Splits one call's arguments at top level commas, respecting quotes. */
function splitArgs(body: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let inString = false;
  let current = '';
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i]!;
    if (inString) {
      if (ch === "'" && body[i + 1] === "'") {
        current += "'";
        i += 1;
        continue;
      }
      if (ch === "'") {
        inString = false;
        current += ch;
        continue;
      }
      current += ch;
      continue;
    }
    if (ch === "'") {
      inString = true;
      current += ch;
      continue;
    }
    if (ch === '[' || ch === '(') depth += 1;
    if (ch === ']' || ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  args.push(current.trim());
  return args;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("'")) return trimmed;
  return trimmed.slice(1, trimmed.lastIndexOf("'")).replace(/''/g, "'");
}

export function shippedMap(): MapEntry[] {
  const entries: MapEntry[] = [];
  for (const file of MAP_MIGRATIONS) {
    const sql = fs.readFileSync(path.join(MIGRATIONS, file), 'utf8');
    const callPattern = /select pg_temp\.(?:seed_association_entry|seed_map_entry)\(([\s\S]*?)\n\);/g;
    for (const call of sql.matchAll(callPattern)) {
      const args = splitArgs(call[1]!);
      // The starter migration's helper takes seven arguments and has no
      // support list; this one takes eight. Reading the length rather than
      // the file name is what lets both live in one fixture.
      const hasSupport = args.length === 8;
      const considerationsRaw = args[args.length - 1]!;
      const considerations = [...considerationsRaw.matchAll(/'((?:[^']|'')*)'/g)].map((m) =>
        m[1]!.replace(/''/g, "'")
      );
      entries.push({
        patternKey: unquote(args[0]!),
        patternName: unquote(args[1]!),
        sourceTypeKey: unquote(args[2]!),
        association: unquote(args[3]!),
        primaries: parseComponents(args[4]!),
        related: parseComponents(args[5]!),
        support: hasSupport ? parseComponents(args[6]!) : [],
        considerations,
        file,
      });
    }
  }
  return entries;
}

/** Every key the map names, by vocabulary, for coverage assertions. */
export function keysOf(
  entries: readonly MapEntry[],
  role: 'primaries' | 'related' | 'support',
  kind: MapComponent['kind']
): Set<string> {
  const out = new Set<string>();
  for (const entry of entries) {
    for (const component of entry[role]) {
      if (component.kind === kind) out.add(component.key);
    }
  }
  return out;
}

/**
 * THE CANONICAL VOCABULARY, also read out of the migrations.
 *
 * A map entry may only ever name a signal, a category or a body area that
 * the Signal Library really holds. The seeding function raises and fails
 * the migration on a key it cannot resolve, which is the real guard; this
 * is how a test can say so without a database.
 */
const VOCABULARY_MIGRATIONS = [
  '00000000000241_cross_system_signal_content.sql',
  '00000000000251_cross_system_vocabulary_expansion.sql',
];

function withoutLineComments(sql: string): string {
  return sql
    .split('\n')
    .map((line) => {
      const at = line.indexOf('--');
      // A line comment cannot begin inside a string in these files, and an
      // odd number of quotes before it means we are inside one.
      if (at >= 0 && (line.slice(0, at).match(/'/g) ?? []).length % 2 === 0) return line.slice(0, at);
      return line;
    })
    .join('\n');
}

/** The first quoted value of every row of an insert into one table. */
function firstColumnOf(table: string): Set<string> {
  const out = new Set<string>();
  for (const file of VOCABULARY_MIGRATIONS) {
    const sql = withoutLineComments(fs.readFileSync(path.join(MIGRATIONS, file), 'utf8'));
    const pattern = new RegExp(`insert into\\s+${table}[\\s\\S]*?values([\\s\\S]*?);`, 'gi');
    for (const block of sql.matchAll(pattern)) {
      for (const row of block[1]!.matchAll(/\(\s*'([a-z0-9_-]+)'/g)) out.add(row[1]!);
    }
  }
  return out;
}

export function canonicalVocabulary(): {
  signals: Set<string>;
  categories: Set<string>;
  bodyAreas: Set<string>;
} {
  return {
    signals: firstColumnOf('cross_system_signal_names'),
    categories: firstColumnOf('cross_system_signal_categories'),
    bodyAreas: firstColumnOf('cross_system_body_areas'),
  };
}
