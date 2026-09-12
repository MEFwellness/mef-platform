/**
 * A real fixture of the MEF Whole-Body Signal Assessment's stored content,
 * read OUT OF THE MIGRATIONS rather than retyped.
 *
 * WHY IT PARSES SQL. Every question, weight, band cut off, Zone, pattern
 * rule and coaching question in this feature is a database row, so a
 * fixture typed by hand into a test file would be a second copy of the
 * content that could drift from the one production actually serves. This
 * reads migrations 226 and 227 and hands the pure modules the content that
 * is genuinely seeded, which is what makes these tests able to fail when a
 * migration is edited.
 *
 * IT READS EVERY INSERT INTO A TABLE, not the first one. The copy table is
 * seeded by two statements, one per audience, and a parser that stopped at
 * the first would have silently tested half the words.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseCoachingTrigger, parsePatternRule } from '../lib/whole-body-signal/trigger';
import { resolveSettings } from '../lib/whole-body-signal/settings';
import type {
  BranchRule,
  CoachingQuestion,
  CoachingTriggerType,
  MemberSection,
  PractitionerQuestion,
  RoutingOption,
  ScaleOption,
  SignalBand,
  SignalPattern,
  SignalZone,
} from '../lib/whole-body-signal/types';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');
export const WBS_SCHEMA_SQL_PATH = path.join(
  MIGRATIONS,
  '00000000000225_whole_body_signal_assessment.sql'
);
export const WBS_CONTENT_SQL_PATH = path.join(
  MIGRATIONS,
  '00000000000226_whole_body_signal_content.sql'
);
export const WBS_LIBRARY_SQL_PATH = path.join(
  MIGRATIONS,
  '00000000000227_whole_body_signal_library.sql'
);

/**
 * Every migration that carries this feature's words, FOUND rather than
 * listed, so a later content migration is covered by the punctuation scan
 * the day it lands instead of the day somebody remembers to add it here.
 */
export const WBS_SQL_PATHS: string[] = fs
  .readdirSync(MIGRATIONS)
  .filter((file) => file.endsWith('.sql') && file.includes('whole_body_signal'))
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

/**
 * Strip SQL line comments, quote aware.
 *
 * IT IS NOT COSMETIC. These migrations carry explanatory comments INSIDE
 * their values blocks, and a comment containing an apostrophe (a coach's
 * assignment, a section's own words) would open a string the tuple parser
 * then never closes, swallowing every row after it. Found the first time
 * this fixture ran: the whole copy table parsed as nothing.
 */
export function stripSqlComments(sql: string): string {
  let out = '';
  let inQuote = false;
  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i]!;
    if (inQuote) {
      out += char;
      if (char === "'" && sql[i + 1] === "'") {
        out += "'";
        i += 1;
        continue;
      }
      if (char === "'") inQuote = false;
      continue;
    }
    if (char === "'") {
      inQuote = true;
      out += char;
      continue;
    }
    if (char === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i += 1;
      out += '\n';
      continue;
    }
    out += char;
  }
  return out;
}

/** Every tuple of every `insert into <table>` in this SQL. */
export function tuplesFor(rawSql: string, table: string): string[][] {
  const sql = stripSqlComments(rawSql);
  const tuples: string[][] = [];
  let searchFrom = 0;

  for (;;) {
    const start = sql.indexOf(`insert into ${table}`, searchFrom);
    if (start === -1) break;
    const valuesAt = sql.indexOf('\nvalues', start);
    if (valuesAt === -1) break;
    const conflictAt = sql.indexOf('on conflict', valuesAt);
    const end = conflictAt === -1 ? sql.length : conflictAt;
    const block = sql.slice(valuesAt + '\nvalues'.length, end);
    searchFrom = end;

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
  }

  if (tuples.length === 0) throw new Error(`No insert found for ${table}`);
  return tuples;
}

const content = readSql(WBS_CONTENT_SQL_PATH);
const library = readSql(WBS_LIBRARY_SQL_PATH);

function nullable(value: string): string | null {
  return value === 'null' ? null : value;
}

export const ZONES: SignalZone[] = tuplesFor(content, 'whole_body_signal_zones').map((row) => ({
  zoneKey: row[0]!,
  position: Number(row[1]),
  displayName: row[2]!,
  spinalSegments: row[3]!,
  organGlandList: row[4]!,
  chakraLens: row[5]!,
}));

export const SECTIONS: MemberSection[] = tuplesFor(content, 'whole_body_signal_sections').map(
  (row) => ({
    sectionKey: row[0]!,
    position: Number(row[1]),
    displayName: row[2]!,
    // row[3] is the practitioner's own purpose line, which no member reads.
    memberTransitionLine: row[4]!,
    memberAreaPhrase: row[5]!,
    motionCue: row[6]!,
  })
);

/** The practitioner's own description of each section. Coach facing, kept for the content tests. */
export const SECTION_PURPOSE: Record<string, string> = Object.fromEntries(
  tuplesFor(content, 'whole_body_signal_sections').map((row) => [row[0]!, row[3]!])
);

export const QUESTIONS: PractitionerQuestion[] = tuplesFor(
  content,
  'whole_body_signal_questions'
).map((row) => ({
  questionRef: row[0]!,
  sectionKey: row[1]!,
  position: Number(row[2]),
  prompt: row[3]!,
  direction: row[4] === 'reverse' ? 'reverse' : 'direct',
  primaryZoneKey: row[5]!,
  secondaryZoneKey: nullable(row[6]!),
  organGland: row[7]!,
  coachTopic: row[8]!,
  memberTheme: row[9]!,
  feedsSectionKey: nullable(row[10]!),
  branchGroup: nullable(row[11]!),
  isUniversal: row[12] === 'true',
  allowsPnta: row[13] === 'true',
}));

export const SCALE: ScaleOption[] = tuplesFor(content, 'whole_body_signal_scale_options').map(
  (row) => ({
    valueKey: row[0]!,
    position: Number(row[1]),
    label: row[2]!,
    directPoints: Number(row[3]),
    reversePoints: Number(row[4]),
  })
);

export const BANDS: SignalBand[] = tuplesFor(content, 'whole_body_signal_bands').map((row) => ({
  bandKey: row[0]!,
  position: Number(row[1]),
  minPercent: Number(row[2]),
  maxPercent: row[3] === 'null' ? null : Number(row[3]),
  memberLabel: row[4]!,
  memberLine: row[5]!,
  memberIntensityWord: row[6]!,
  coachColor: row[7] as SignalBand['coachColor'],
}));

export const ROUTING_OPTIONS: RoutingOption[] = tuplesFor(
  content,
  'whole_body_signal_routing_options'
).map((row) => ({
  optionKey: row[0]!,
  position: Number(row[1]),
  label: row[2]!,
  isPnta: row[3] === 'true',
}));

/** `array['HPC1', 'HPC2']` and `array[]::text[]` both arrive here as text. */
function readRefArray(value: string): string[] {
  const inner = value.replace(/^array\s*\[/i, '').replace(/\]\s*(::text\[\])?$/i, '');
  if (inner.trim().length === 0) return [];
  return inner
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export const BRANCH_RULES: BranchRule[] = tuplesFor(
  content,
  'whole_body_signal_branch_rules'
).map((row) => ({
  optionKey: row[0]!,
  questionRefs: readRefArray(row[1]!),
}));

export type CopyRow = { key: string; value: string; audience: 'member' | 'coach' };

export const COPY_ROWS: CopyRow[] = tuplesFor(content, 'whole_body_signal_copy').map((row) => ({
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

export const SETTING_ROWS: Record<string, number> = Object.fromEntries(
  tuplesFor(content, 'whole_body_signal_settings').map((row) => [row[0]!, Number(row[1])])
);

export const SETTINGS = resolveSettings(SETTING_ROWS);

export const PATTERNS: SignalPattern[] = tuplesFor(library, 'whole_body_signal_patterns').map(
  (row) => {
    const rule = parsePatternRule(JSON.parse(row[3]!.replace(/::jsonb$/, '')));
    if (!rule) throw new Error(`Unreadable pattern rule for ${row[0]}`);
    return {
      patternKey: row[0]!,
      position: Number(row[1]),
      title: row[2]!,
      rule,
      coachText: row[4]!,
    };
  }
);

export const COACHING_LIBRARY: CoachingQuestion[] = tuplesFor(
  library,
  'whole_body_signal_coaching_questions'
).map((row) => {
  const trigger = parseCoachingTrigger(JSON.parse(row[3]!.replace(/::jsonb$/, '')));
  if (!trigger) throw new Error(`Unreadable coaching trigger for ${row[0]}`);
  return {
    questionKey: row[0]!,
    position: Number(row[1]),
    triggerType: row[2] as CoachingTriggerType,
    trigger,
    question: row[4]!,
    topic: row[5]!,
  };
});

export const ZONE_ORDER = ZONES.map((zone) => ({ zoneKey: zone.zoneKey, position: zone.position }));

/** Every question this routing answer opens, for a test that wants to answer them all. */
export function answerAll(routingOptionKey: string | null, valueKey: string): Record<string, string> {
  const opened = new Set(
    routingOptionKey
      ? (BRANCH_RULES.find((rule) => rule.optionKey === routingOptionKey)?.questionRefs ?? [])
      : []
  );
  const answers: Record<string, string> = {};
  for (const question of QUESTIONS) {
    if (question.branchGroup === null) {
      answers[question.questionRef] = valueKey;
      continue;
    }
    if (routingOptionKey === null) continue;
    if (question.isUniversal || opened.has(question.questionRef)) {
      answers[question.questionRef] = valueKey;
    }
  }
  return answers;
}
