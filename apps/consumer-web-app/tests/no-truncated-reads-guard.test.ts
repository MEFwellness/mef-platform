/**
 * A READ THAT WANTS EVERY ROW HAS TO ASK FOR EVERY ROW.
 *
 * THE DEFECT THIS GUARDS, and it shipped. PostgREST caps an unbounded
 * select at `db-max-rows`, which this project's database sets to 1,000. It
 * does not error and it does not warn: it returns the first thousand rows
 * and the caller carries on as though that were all of them.
 *
 * That was harmless until the Whole-Body Association Map made three tables
 * large in one build. The component read is ordered by position, so the cut
 * fell across EVERY map entry at once and a coach was shown a finding that
 * had checked three areas when the entry named nine. The lexicon read lost
 * seven hundred phrases, so a third of what a member can say stopped being
 * understood. Both were invisible to every test in this suite, because
 * every one of them drives a fixture rather than a database, and both were
 * found by counting the areas on one real finding on production.
 *
 * SO THE TABLES THAT CAN GET BIG ARE NAMED HERE, one by one, and every
 * read of one of them has to go through lib/data/pagedSelect.ts. A new
 * table that can hold thousands of rows is a deliberate addition to this
 * list, which is the point: the list is the conversation.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PAGE_SIZE, selectAllRows } from '@/lib/data/pagedSelect';

const ROOT = path.resolve(__dirname, '..');

/**
 * Reference tables this app reads IN FULL and that can exceed a thousand
 * rows, with the count on production when this guard was written.
 */
const UNBOUNDED_TABLES: Array<[string, number]> = [
  ['cross_system_relationship_components', 2511],
  ['cross_system_complaint_lexicon', 1728],
  ['cross_system_relationship_considerations', 1435],
  ['cross_system_relationship_strength_levels', 480],
  ['cross_system_complaint_modifiers', 401],
  ['cross_system_relationship_versions', 240],
  ['cross_system_relationships', 240],
  ['cross_system_signal_names', 211],
  ['cross_system_signal_source_map', 164],
];

/** The files allowed to read one of those tables at all. */
const READERS = [
  'lib/cross-system-relationships/data.ts',
  'lib/cross-system-complaints/lexiconData.ts',
  'lib/cross-system-signals/contentData.ts',
];

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

/** Every `.from('table')` call in a file, with the text that follows it. */
function selectsIn(source: string): Array<{ table: string; chain: string }> {
  const out: Array<{ table: string; chain: string }> = [];
  for (const match of source.matchAll(/\.from\('([a-z_]+)'\)/g)) {
    // The chain runs to the end of the statement, which is the first
    // semicolon or the closing of the call it sits inside.
    const after = source.slice(match.index! + match[0].length, match.index! + match[0].length + 700);
    const end = after.search(/;\s*\n|\n\s*\)\s*;/);
    out.push({ table: match[1]!, chain: end === -1 ? after : after.slice(0, end) });
  }
  return out;
}

describe('every full read of a table that can get big is paged', () => {
  it.each(READERS)('%s exists and really reads one of them', (file) => {
    const source = read(file);
    const tables = selectsIn(source).map((entry) => entry.table);
    const named = tables.filter((table) => UNBOUNDED_TABLES.some(([name]) => name === table));
    expect(named.length, `${file} reads none of the listed tables`).toBeGreaterThan(0);
  });

  it('no reader selects one of them without going through the paged helper', () => {
    const offenders: string[] = [];
    for (const file of READERS) {
      const source = read(file);
      for (const match of source.matchAll(/\.from\('([a-z_]+)'\)/g)) {
        const table = match[1]!;
        if (!UNBOUNDED_TABLES.some(([name]) => name === table)) continue;

        const tail = source.slice(match.index! + match[0].length, match.index! + match[0].length + 700);
        const statement = tail.split(';')[0] ?? tail;
        // A write is not a read.
        if (/^\s*\.(insert|upsert|update|delete)\b/.test(tail)) continue;
        // A head count, a single row, or a read that already bounds itself.
        if (/head:\s*true|\.maybeSingle\(\)|\.single\(\)|\.range\(|\.limit\(/.test(statement)) {
          continue;
        }
        if (!/\.select\(/.test(statement)) continue;

        // What is left is a full read, and it has to sit inside a
        // selectAllRows callback. The helper opens one just above the
        // `supabase` it wraps, so the text immediately before decides.
        //
        // MATCHED WITHOUT ITS PAREN, because the call carries a type
        // argument: `selectAllRows<ComponentRow>(() =>`. Looking for
        // "selectAllRows(" found none of the real call sites and reported
        // every paged read as unpaged.
        const before = source.slice(Math.max(0, match.index! - 320), match.index!);
        const inHelper = before.lastIndexOf('selectAllRows') > before.lastIndexOf('await supabase');
        if (!inHelper) offenders.push(`${file}: ${table}`);
      }
    }
    expect([...new Set(offenders)], [...new Set(offenders)].join('\n')).toHaveLength(0);
  });

  it('is non vacuous: unwrapping one read makes it fail', () => {
    // The same rule, applied to a string that really does read one of the
    // listed tables without paging.
    const naive = "const x = await supabase.from('cross_system_complaint_lexicon').select('phrase');";
    const match = /\.from\('([a-z_]+)'\)/.exec(naive)!;
    const before = naive.slice(0, match.index);
    expect(before.lastIndexOf('selectAllRows') > before.lastIndexOf('await supabase')).toBe(false);
  });

  it('the helper pages under the cap rather than at it', () => {
    // A page equal to the cap cannot tell a full page from a truncated one.
    expect(PAGE_SIZE).toBeLessThan(1000);
    expect(PAGE_SIZE).toBeGreaterThan(50);
  });
});

describe('the paged helper itself', () => {
  /** A fake that behaves the way PostgREST does, cap and all. */
  function fakeTable(rowCount: number, cap = 1000) {
    let calls = 0;
    return {
      calls: () => calls,
      build: () => ({
        range: async (from: number, to: number) => {
          calls += 1;
          const width = Math.min(to - from + 1, cap);
          const rows = [];
          for (let index = from; index < Math.min(from + width, rowCount); index += 1) {
            rows.push({ id: index });
          }
          return { data: rows, error: null };
        },
      }),
    };
  }

  it('returns every row of a table larger than the cap', async () => {
    const table = fakeTable(2511);
    const result = await selectAllRows<{ id: number }>(table.build);
    expect(result.ok).toBe(true);
    expect(result.rows.length).toBe(2511);
    expect(result.rows[0]!.id).toBe(0);
    expect(result.rows[2510]!.id).toBe(2510);
  });

  it('is non vacuous: one unbounded read of the same table loses most of it', async () => {
    const table = fakeTable(2511);
    const once = await table.build().range(0, 1_000_000);
    expect(once.data!.length).toBe(1000);
  });

  it('stops on a short page rather than looping forever', async () => {
    const table = fakeTable(120);
    const result = await selectAllRows<{ id: number }>(table.build);
    expect(result.rows.length).toBe(120);
    expect(table.calls()).toBe(1);
  });

  it('handles an empty table and an exactly full last page', async () => {
    expect((await selectAllRows(fakeTable(0).build)).rows).toHaveLength(0);
    const exact = fakeTable(PAGE_SIZE);
    const result = await selectAllRows<{ id: number }>(exact.build);
    expect(result.rows.length).toBe(PAGE_SIZE);
    // One extra round trip, which is the correct trade for never guessing.
    expect(exact.calls()).toBe(2);
  });

  it('reports an error rather than pretending it read everything', async () => {
    const result = await selectAllRows(() => ({
      range: async () => ({ data: null, error: { message: 'nope' } }),
    }));
    expect(result.ok).toBe(false);
    expect(result.rows).toHaveLength(0);
  });
});
