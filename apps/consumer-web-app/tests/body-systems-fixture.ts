/**
 * A real fixture of the MEF Body Systems Survey's stored content, read
 * OUT OF THE MIGRATIONS rather than retyped.
 *
 * WHY IT PARSES SQL. Every question, weight, band cut off, safety response
 * and association in this feature is a database row, so a fixture typed by
 * hand into a test file would be a second copy of the content that could
 * drift from the one production actually serves. This reads migrations 221
 * and 222 and hands the pure modules the content that is genuinely seeded,
 * which is what makes these tests able to fail when a migration is edited.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseTrigger } from '../lib/body-systems/trigger';
import type {
  BodySystemsAssociation,
  BodySystemsBand,
  BodySystemsQuestion,
  BodySystemsQuestionBranch,
  BodySystemsRedFlag,
  BodySystemsSafetyLevel,
  BodySystemsScaleOption,
  BodySystemsSection,
} from '../lib/body-systems/types';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');
export const SCHEMA_SQL_PATH = path.join(MIGRATIONS, '00000000000220_body_systems_survey.sql');
export const CONTENT_SQL_PATH = path.join(MIGRATIONS, '00000000000221_body_systems_content.sql');
export const LIBRARY_SQL_PATH = path.join(
  MIGRATIONS,
  '00000000000222_body_systems_association_library.sql'
);

/**
 * Every migration that carries this feature's words, found rather than
 * listed, so a later content migration is covered by the punctuation scan
 * the day it lands instead of the day somebody remembers to add it here.
 */
export const BODY_SYSTEMS_SQL_PATHS: string[] = fs
  .readdirSync(MIGRATIONS)
  .filter((file) => file.endsWith('.sql') && file.includes('body_systems'))
  .sort()
  .map((file) => path.join(MIGRATIONS, file));

export function readSql(file: string): string {
  return fs.readFileSync(file, 'utf8');
}

/**
 * Split one `values` tuple into its top level fields.
 *
 * Quote aware, so a comma inside a prompt does not split it, and it
 * understands the doubled apostrophe Postgres escapes with.
 */
function splitTuple(body: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuote = false;
  let depth = 0;
  for (let i = 0; i < body.length; i += 1) {
    const char = body[i]!;
    if (inQuote) {
      if (char === "'" && body[i + 1] === "'") {
        current += "'";
        i += 1;
        continue;
      }
      if (char === "'") {
        inQuote = false;
        continue;
      }
      current += char;
      continue;
    }
    if (char === "'") {
      inQuote = true;
      continue;
    }
    if (char === '{' || char === '[' || char === '(') depth += 1;
    if (char === '}' || char === ']' || char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      fields.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  fields.push(current.trim());
  return fields;
}

/** Every tuple of the `insert into <table> ... values (...),(...);` statement. */
export function tuplesFor(sql: string, table: string): string[][] {
  const start = sql.indexOf(`insert into ${table}`);
  if (start === -1) throw new Error(`No insert found for ${table}`);
  const valuesAt = sql.indexOf('\nvalues', start);
  const end = sql.indexOf('on conflict', valuesAt);
  const block = sql.slice(valuesAt + '\nvalues'.length, end);

  const tuples: string[][] = [];
  let depth = 0;
  let inQuote = false;
  let current = '';
  for (let i = 0; i < block.length; i += 1) {
    const char = block[i]!;
    if (inQuote) {
      current += char;
      if (char === "'" && block[i + 1] === "'") {
        current += "'";
        i += 1;
        continue;
      }
      if (char === "'") inQuote = false;
      continue;
    }
    if (char === "'") {
      inQuote = true;
      current += char;
      continue;
    }
    if (char === '(') {
      depth += 1;
      if (depth === 1) {
        current = '';
        continue;
      }
    }
    if (char === ')') {
      depth -= 1;
      if (depth === 0) {
        tuples.push(splitTuple(current));
        continue;
      }
    }
    if (depth > 0) current += char;
  }
  return tuples;
}

function branchOf(value: string): BodySystemsQuestionBranch {
  return value === 'a' || value === 'b' ? value : 'all';
}

const content = readSql(CONTENT_SQL_PATH);
const library = readSql(LIBRARY_SQL_PATH);

export const SECTIONS: BodySystemsSection[] = tuplesFor(content, 'body_systems_sections').map(
  (row) => ({
    sectionKey: row[0]!,
    position: Number(row[1]),
    displayName: row[2]!,
    memberIntroLine: row[3]!,
    topAttentionLine: row[4]!,
    registryDomain: row[5]!,
    registryCode: row[6]!,
  })
);

export const QUESTIONS: BodySystemsQuestion[] = tuplesFor(content, 'body_systems_questions').map(
  (row) => ({
    questionRef: row[0]!,
    sectionKey: row[1]!,
    position: Number(row[2]),
    prompt: row[3]!,
    branch: branchOf(row[4]!),
    allowsDna: row[5] === 'true',
    dnaLabel: row[6] === 'null' ? null : row[6]!,
  })
);

export const SCALE: BodySystemsScaleOption[] = tuplesFor(
  content,
  'body_systems_scale_options'
).map((row) => ({
  valueKey: row[0]!,
  position: Number(row[1]),
  label: row[2]!,
  points: Number(row[3]),
  isElevated: row[4] === 'true',
}));

export const BANDS: BodySystemsBand[] = tuplesFor(content, 'body_systems_bands').map((row) => ({
  bandKey: row[0]!,
  position: Number(row[1]),
  minPercent: Number(row[2]),
  maxPercent: row[3] === 'null' ? null : Number(row[3]),
  colorKey: row[4] as BodySystemsBand['colorKey'],
  memberLabel: row[5]!,
  memberStatusLine: row[6]!,
}));

export const SAFETY_LEVELS: BodySystemsSafetyLevel[] = tuplesFor(
  content,
  'body_systems_safety_levels'
).map((row) => ({
  level: Number(row[0]) === 1 ? 1 : 2,
  label: row[1]!,
  memberResponse: row[2]!,
}));

export const RED_FLAGS: BodySystemsRedFlag[] = tuplesFor(content, 'body_systems_red_flags').map(
  (row) => ({
    flagKey: row[0]!,
    position: Number(row[1]),
    prompt: row[2]!,
    level: Number(row[3]) === 1 ? 1 : 2,
  })
);

export type CopyRow = { key: string; value: string; audience: 'member' | 'coach' };

export const COPY_ROWS: CopyRow[] = tuplesFor(content, 'body_systems_copy').map((row) => ({
  key: row[0]!,
  value: row[1]!,
  audience: row[2] as 'member' | 'coach',
}));

export const MEMBER_COPY: Record<string, string> = Object.fromEntries(
  COPY_ROWS.filter((row) => row.audience === 'member').map((row) => [row.key, row.value])
);

export const COACH_COPY: Record<string, string> = Object.fromEntries(
  COPY_ROWS.filter((row) => row.audience === 'coach').map((row) => [row.key, row.value])
);

export const SETTINGS: Record<string, number> = Object.fromEntries(
  tuplesFor(content, 'body_systems_settings').map((row) => [row[0]!, Number(row[1])])
);

export const LIBRARY: BodySystemsAssociation[] = tuplesFor(
  library,
  'body_systems_associations'
).map((row) => {
  const raw = row[5]!.replace(/::jsonb$/, '');
  const trigger = parseTrigger(JSON.parse(raw));
  if (!trigger) throw new Error(`Unparseable trigger on ${row[0]}`);
  return {
    entryCode: row[0]!,
    position: Number(row[1]),
    sectionKey: row[2] === 'null' ? null : row[2]!,
    branch: branchOf(row[3]!),
    title: row[4]!,
    trigger,
    associationText: row[6]!,
    nextStep: row[7]!,
  };
});

/** Every question for one branch, answered with one scale value. */
export function answerAll(branch: 'a' | 'b', value: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const question of QUESTIONS) {
    if (question.branch !== 'all' && question.branch !== branch) continue;
    out[question.questionRef] = value;
  }
  return out;
}

/** Every red flag answered the same way. */
export function answerAllFlags(value: boolean): Record<string, boolean> {
  return Object.fromEntries(RED_FLAGS.map((flag) => [flag.flagKey, value]));
}
