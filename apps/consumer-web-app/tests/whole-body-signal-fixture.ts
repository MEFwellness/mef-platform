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

/**
 * Every `insert into <table>` in this SQL, WITH ITS OWN COLUMN LIST.
 *
 * WHY THE COLUMN LIST MATTERS. A later migration adds a column and
 * restates the rows it changes, so two statements for one table can carry
 * different columns in a different order. Reading each block's own header
 * is what lets the rows below be merged by NAME rather than by position,
 * which is the only way a positional parser stops silently reading the
 * wrong field the first time a content migration lands.
 */
export function insertBlocksFor(
  rawSql: string,
  table: string
): { columns: string[]; rows: string[][] }[] {
  const sql = stripSqlComments(rawSql);
  const blocks: { columns: string[]; rows: string[][] }[] = [];
  let searchFrom = 0;

  for (;;) {
    const start = sql.indexOf(`insert into ${table}`, searchFrom);
    if (start === -1) break;
    const valuesAt = sql.indexOf('\nvalues', start);
    if (valuesAt === -1) break;

    // The bracketed column list between the table name and `values`.
    const header = sql.slice(start + `insert into ${table}`.length, valuesAt);
    const open = header.indexOf('(');
    const close = header.lastIndexOf(')');
    const columns =
      open === -1 || close === -1
        ? []
        : header
            .slice(open + 1, close)
            .split(',')
            .map((column) => column.trim());

    const conflictAt = sql.indexOf('on conflict', valuesAt);
    const end = conflictAt === -1 ? sql.length : conflictAt;
    const block = sql.slice(valuesAt + '\nvalues'.length, end);
    searchFrom = end;

    const rows: string[][] = [];
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
          rows.push(splitTuple(current));
          continue;
        }
      }
      if (depth > 0) current += char;
    }
    blocks.push({ columns, rows });
  }
  return blocks;
}

/**
 * One table's rows as production ends up holding them, read across EVERY
 * migration this feature has, keyed by the column that identifies a row.
 *
 * A later statement about a row it has already seen overrides field by
 * field, which is exactly what an upsert does, so a question moved to a
 * new answer scale in migration 228 is read here as a question on the new
 * scale rather than as two disagreeing copies.
 */
export function mergedRowsFor(table: string, keyColumn: string): Record<string, string>[] {
  const byKey = new Map<string, Record<string, string>>();
  const order: string[] = [];
  for (const file of WBS_SQL_PATHS) {
    for (const block of insertBlocksFor(readSql(file), table)) {
      if (block.columns.length === 0) continue;
      for (const row of block.rows) {
        const fields: Record<string, string> = {};
        block.columns.forEach((column, index) => {
          fields[column] = row[index] ?? 'null';
        });
        const key = fields[keyColumn];
        if (key === undefined) continue;
        const held = byKey.get(key);
        if (held) {
          Object.assign(held, fields);
          continue;
        }
        byKey.set(key, fields);
        order.push(key);
      }
    }
  }
  if (order.length === 0) throw new Error(`No insert found for ${table}`);
  return order.map((key) => byKey.get(key)!);
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

/**
 * The ninety six questions AS PRODUCTION HOLDS THEM, which is the seed in
 * migration 226 with migration 228's changes applied over it.
 */
export const QUESTIONS: PractitionerQuestion[] = mergedRowsFor(
  'whole_body_signal_questions',
  'question_ref'
).map((row) => ({
  questionRef: row.question_ref!,
  sectionKey: row.section_key!,
  position: Number(row.position),
  prompt: row.prompt!,
  // A row seeded before the column existed is on the scale its default names.
  scaleKey: row.scale_key ?? 'frequency',
  direction: row.direction === 'reverse' ? 'reverse' : 'direct',
  primaryZoneKey: row.primary_zone_key!,
  secondaryZoneKey: nullable(row.secondary_zone_key!),
  organGland: row.organ_gland!,
  coachTopic: row.coach_topic!,
  memberTheme: row.member_theme!,
  feedsSectionKey: nullable(row.feeds_section_key!),
  branchGroup: nullable(row.branch_group!),
  isUniversal: row.is_universal === 'true',
  allowsPnta: row.allows_pnta === 'true',
}));

/** Every option of every scale, which is what the app is handed in one list. */
export const SCALE: ScaleOption[] = mergedRowsFor(
  'whole_body_signal_scale_options',
  'value_key'
).map((row) => ({
  scaleKey: row.scale_key ?? 'frequency',
  valueKey: row.value_key!,
  position: Number(row.position),
  label: row.label!,
  directPoints: Number(row.direct_points),
  reversePoints: Number(row.reverse_points),
}));

/** The frequency scale on its own, which is what most of these tests mean by "the scale". */
export const FREQUENCY_SCALE: ScaleOption[] = SCALE.filter(
  (option) => option.scaleKey === 'frequency'
).sort((a, b) => a.position - b.position);

/** The Yes / No / Not sure scale on its own. */
export const BINARY_SCALE: ScaleOption[] = SCALE.filter(
  (option) => option.scaleKey === 'binary'
).sort((a, b) => a.position - b.position);

/** The scale rows themselves. */
export const SCALES: { scaleKey: string; position: number; displayName: string }[] = mergedRowsFor(
  'whole_body_signal_scales',
  'scale_key'
).map((row) => ({
  scaleKey: row.scale_key!,
  position: Number(row.position),
  displayName: row.display_name!,
}));

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

/**
 * The answer that means the same thing on a question's OWN scale.
 *
 * Two scales, and a test that says "answer everything Often" has to mean
 * something on a question answered Yes / No / Not sure. The frequency
 * option's own direct points decide it, read off the stored rows rather
 * than hard coded: a loud frequency answer maps to the loud binary one, a
 * quiet one to the quiet one, and the middle to Not sure. That keeps every
 * test honest about what it is asserting instead of quietly leaving four
 * questions unanswered.
 */
export function valueOnScale(
  question: { scaleKey: string },
  frequencyValueKey: string
): string {
  if (question.scaleKey === 'frequency') return frequencyValueKey;
  const frequency = FREQUENCY_SCALE.find((option) => option.valueKey === frequencyValueKey);
  const points = frequency?.directPoints ?? 0;
  const top = Math.max(...FREQUENCY_SCALE.map((option) => option.directPoints));
  const share = top > 0 ? points / top : 0;
  const ordered = BINARY_SCALE.slice().sort((a, b) => a.directPoints - b.directPoints);
  if (share >= 0.75) return ordered[ordered.length - 1]!.valueKey;
  if (share <= 0.25) return ordered[0]!.valueKey;
  // The middle of the frequency scale is the binary scale's "Not sure":
  // the option that is neither its loudest nor its quietest.
  return (ordered[1] ?? ordered[0]!).valueKey;
}

/** The answer that scores this question at the top of its own scale, whichever way it runs. */
export function loudestValueFor(question: { scaleKey: string; direction: 'direct' | 'reverse' }): string {
  const options = SCALE.filter((option) => option.scaleKey === question.scaleKey);
  const points = (option: ScaleOption) =>
    question.direction === 'reverse' ? option.reversePoints : option.directPoints;
  return options.slice().sort((a, b) => points(b) - points(a))[0]!.valueKey;
}

/** The answer that scores this question at nought on its own scale. */
export function quietestValueFor(question: { scaleKey: string; direction: 'direct' | 'reverse' }): string {
  const options = SCALE.filter((option) => option.scaleKey === question.scaleKey);
  const points = (option: ScaleOption) =>
    question.direction === 'reverse' ? option.reversePoints : option.directPoints;
  return options.slice().sort((a, b) => points(a) - points(b))[0]!.valueKey;
}

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
      answers[question.questionRef] = valueOnScale(question, valueKey);
      continue;
    }
    if (routingOptionKey === null) continue;
    if (question.isUniversal || opened.has(question.questionRef)) {
      answers[question.questionRef] = valueOnScale(question, valueKey);
    }
  }
  return answers;
}

/** Every shown question answered at the top of its own scale, whichever way it runs. */
export function answerAllLoud(routingOptionKey: string | null): Record<string, string> {
  const opened = new Set(
    routingOptionKey
      ? (BRANCH_RULES.find((rule) => rule.optionKey === routingOptionKey)?.questionRefs ?? [])
      : []
  );
  const answers: Record<string, string> = {};
  for (const question of QUESTIONS) {
    if (question.branchGroup !== null) {
      if (routingOptionKey === null) continue;
      if (!question.isUniversal && !opened.has(question.questionRef)) continue;
    }
    answers[question.questionRef] = loudestValueFor(question);
  }
  return answers;
}
