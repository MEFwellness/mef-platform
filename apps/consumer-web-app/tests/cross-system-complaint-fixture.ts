/**
 * THE SHIPPED LEXICON, READ OUT OF THE MIGRATIONS.
 *
 * WHY THE TESTS DRIVE THE REAL VOCABULARY RATHER THAN A TOY ONE. A
 * classifier test built on six invented phrases proves the ALGORITHM and
 * nothing about whether a member writing "my right hip has been clicking"
 * is actually understood by what this build deploys. The vocabulary is the
 * feature here, so the vocabulary is what is under test: this file parses
 * migrations 247 and 249 and hands the matcher exactly the rows production
 * holds.
 *
 * IT APPLIES THE DELETES TOO. Migration 249 removes five negation words and
 * four generic pain phrases, and a fixture that ignored a delete would test
 * a lexicon that has never existed anywhere.
 */

import fs from 'node:fs';
import path from 'node:path';
import { orderPhrases } from '@/lib/cross-system-complaints/classify';
import type {
  ComplaintLexicon,
  ComplaintModifier,
  ComplaintPhrase,
} from '@/lib/cross-system-complaints/types';
import type { SignalSide } from '@/lib/cross-system-signals/types';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');

const LEXICON_MIGRATIONS = [
  '00000000000247_cross_system_complaint_lexicon_seed.sql',
  '00000000000249_cross_system_complaint_lexicon_fixes.sql',
  '00000000000250_cross_system_complaint_lexicon_inflections.sql',
];

type Insert = { table: string; columns: string[]; rows: string[][] };

/** Every `insert into ... (cols) values (...), (...)` in one file. */
function parseInserts(sql: string): Insert[] {
  const out: Insert[] = [];
  const header = /insert into\s+(\w+)\s*\(([^)]*)\)\s*values/gi;
  let match: RegExpExecArray | null;
  while ((match = header.exec(sql)) !== null) {
    const table = match[1]!;
    const columns = match[2]!.split(',').map((column) => column.trim());
    // The statement runs to the next semicolon at depth zero.
    const body = sql.slice(match.index + match[0].length);
    // The statement ends at its semicolon, and its VALUES end sooner than
    // that: `on conflict (phrase, signal_slug) do nothing` is a paren group
    // too, and reading it as data filed fourteen rows whose phrase was the
    // literal word "phrase". Whichever terminator comes first wins.
    const semicolon = body.indexOf(';');
    const conflict = body.search(/on conflict/i);
    const ends = [semicolon, conflict].filter((index) => index >= 0);
    const end = ends.length > 0 ? Math.min(...ends) : body.length;
    out.push({ table, columns, rows: parseTuples(body.slice(0, end)) });
  }
  return out;
}

/** The values of one `( ... )` group, respecting quoted commas. */
function parseTuples(text: string): string[][] {
  const rows: string[][] = [];
  let depth = 0;
  let current = '';
  let inString = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (inString) {
      // '' is an escaped quote inside a SQL string.
      if (ch === "'" && text[i + 1] === "'") {
        current += "''";
        i += 1;
        continue;
      }
      if (ch === "'") inString = false;
      current += ch;
      continue;
    }
    if (ch === "'") {
      inString = true;
      current += ch;
      continue;
    }
    if (ch === '(') {
      depth += 1;
      if (depth === 1) {
        current = '';
        continue;
      }
    }
    if (ch === ')') {
      depth -= 1;
      if (depth === 0) {
        rows.push(splitValues(current));
        current = '';
        continue;
      }
    }
    if (depth > 0) current += ch;
  }
  return rows;
}

function splitValues(text: string): string[] {
  const values: string[] = [];
  let current = '';
  let inString = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (inString) {
      if (ch === "'" && text[i + 1] === "'") {
        current += "'";
        i += 1;
        continue;
      }
      if (ch === "'") {
        inString = false;
        continue;
      }
      current += ch;
      continue;
    }
    if (ch === "'") {
      inString = true;
      continue;
    }
    if (ch === ',') {
      values.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  values.push(current.trim());
  return values;
}

function value(row: string[], columns: string[], name: string): string | null {
  const index = columns.indexOf(name);
  if (index === -1) return null;
  const raw = row[index];
  if (raw === undefined) return null;
  if (raw.toLowerCase() === 'null' || raw === '') return null;
  return raw;
}

/** The phrases a delete statement removes, by the column it keys on. */
function deletedPhrases(sql: string, table: string): Set<string> {
  const out = new Set<string>();
  const pattern = new RegExp(`delete from ${table}[\\s\\S]*?phrase in \\(([^)]*)\\)`, 'gi');
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(sql)) !== null) {
    for (const piece of match[1]!.split(',')) {
      const cleaned = piece.trim().replace(/^'|'$/g, '');
      if (cleaned) out.add(cleaned);
    }
  }
  return out;
}

export function shippedLexicon(): ComplaintLexicon {
  const phrases: ComplaintPhrase[] = [];
  const modifiers: ComplaintModifier[] = [];
  const deletedLexicon = new Set<string>();
  const deletedModifiers = new Set<string>();

  for (const file of LEXICON_MIGRATIONS) {
    const sql = fs.readFileSync(path.join(MIGRATIONS, file), 'utf8');
    for (const phrase of deletedPhrases(sql, 'cross_system_complaint_lexicon')) {
      deletedLexicon.add(phrase);
    }
    for (const phrase of deletedPhrases(sql, 'cross_system_complaint_modifiers')) {
      deletedModifiers.add(phrase);
    }

    for (const insert of parseInserts(sql)) {
      if (insert.table === 'cross_system_complaint_lexicon') {
        for (const row of insert.rows) {
          const phrase = value(row, insert.columns, 'phrase');
          const slug = value(row, insert.columns, 'signal_slug');
          if (!phrase || !slug) continue;
          phrases.push({
            phrase,
            signalSlug: slug,
            bodyAreaKey: value(row, insert.columns, 'body_area_key'),
            specificity: Number(value(row, insert.columns, 'specificity') ?? '0'),
          });
        }
      }
      if (insert.table === 'cross_system_complaint_modifiers') {
        for (const row of insert.rows) {
          const phrase = value(row, insert.columns, 'phrase');
          const kind = value(row, insert.columns, 'kind');
          if (!phrase || !kind) continue;
          const numeric = value(row, insert.columns, 'frequency_numeric');
          modifiers.push({
            phrase,
            kind: kind as ComplaintModifier['kind'],
            side: (value(row, insert.columns, 'side') as SignalSide | null) ?? null,
            bodyAreaKey: value(row, insert.columns, 'body_area_key'),
            contextKey: value(row, insert.columns, 'context_key'),
            frequencyKey: value(row, insert.columns, 'frequency_key'),
            frequencyLabel: value(row, insert.columns, 'frequency_label'),
            frequencyNumeric: numeric === null ? null : Number(numeric),
          });
        }
      }
    }
  }

  // The deletes in migration 249. A negation word removed from the
  // backward list and re-added as 'negation_after' must not survive as
  // both, or "my headaches have stopped" would be negated for the wrong
  // reason and the trailing rule would never be under test at all.
  const liveModifiers = modifiers.filter(
    (modifier) => !(modifier.kind === 'negation' && deletedModifiers.has(modifier.phrase))
  );
  const livePhrases = phrases.filter(
    (phrase) =>
      !(phrase.signalSlug === 'daily-pain-or-discomfort' && deletedLexicon.has(phrase.phrase))
  );

  return {
    phrases: orderPhrases(livePhrases),
    modifiers: liveModifiers,
    surfaces: new Map(),
    contexts: new Map(),
  };
}
