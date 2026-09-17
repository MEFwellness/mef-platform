/**
 * THE EVALUATION LEDGER AND THE THREE RE-EVALUATION TRIGGERS.
 *
 *   1. A MATCH IS RECORDED with the version it read, the exact signal rows
 *      that contributed and when it was evaluated.
 *   2. A RE-EVALUATION REPLACES. A pattern that no longer meets its floor
 *      leaves nothing behind, and a deactivated definition takes its rows
 *      with it.
 *   3. THE THREE TRIGGERS REALLY FIRE, proved against the source of the
 *      three files that own them, because the events themselves live in
 *      server actions and an ingestion engine.
 *   4. THE LEDGER IS NEVER WRITTEN ON A RENDER, and the coach's read
 *      computes rather than reading it back.
 *
 * A TINY POSTGREST STAND-IN drives the real data layer, so the ORDER of
 * the writes and what is left behind by a failed one are what is tested
 * rather than described.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { replaceMatches, listMatchesForMember, membersHoldingAny } from '@/lib/cross-system-patterns/data';
import { matchMemberSignals } from '@/lib/cross-system-patterns/match';
import { component, resetFixtureIds, signal, summary } from './cross-system-pattern-fixture';

const ROOT = path.resolve(__dirname, '..');
const EVALUATED_AT = '2026-09-15T12:00:00.000Z';

type Row = Record<string, unknown>;

/** Enough PostgREST to drive lib/cross-system-patterns/data.ts, and no more. */
class FakeDb {
  tables: Record<string, Row[]> = {
    cross_system_pattern_matches: [],
    cross_system_pattern_match_signals: [],
    cross_system_signals: [],
  };
  failOn: string | null = null;
  private nextId = 0;

  id(): string {
    this.nextId += 1;
    return `row-${this.nextId}`;
  }

  rows(table: string): Row[] {
    const held = this.tables[table];
    if (!held) throw new Error(`no such table in the fake: ${table}`);
    return held;
  }

  from(table: string) {
    return new FakeQuery(this, table);
  }
}

class FakeQuery {
  private filters: { column: string; value: unknown }[] = [];
  private inFilter: { column: string; values: unknown[] } | null = null;
  private orFilter: string | null = null;
  private mode: 'select' | 'insert' | 'delete' = 'select';
  private payload: Row[] = [];

  constructor(
    private db: FakeDb,
    private table: string
  ) {}

  select(_columns?: string) {
    return this;
  }
  insert(rows: Row | Row[]) {
    this.mode = 'insert';
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  delete() {
    this.mode = 'delete';
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push({ column, value });
    return this;
  }
  in(column: string, values: unknown[]) {
    this.inFilter = { column, values };
    return this;
  }
  or(clause: string) {
    this.orFilter = clause;
    return this;
  }
  order(_column: string, _options?: { ascending?: boolean }) {
    return this;
  }
  limit(_count: number) {
    return this;
  }

  private matching(): Row[] {
    let rows = this.db.rows(this.table);
    for (const filter of this.filters) rows = rows.filter((row) => row[filter.column] === filter.value);
    if (this.inFilter) {
      rows = rows.filter((row) => this.inFilter!.values.includes(row[this.inFilter!.column]));
    }
    if (this.orFilter) {
      // `column.in.("a","b"),other.in.("c")`, which is what data.ts builds.
      const clauses = [...this.orFilter.matchAll(/(\w+)\.in\.\(([^)]*)\)/g)].map(([, column, list]) => ({
        column: column!,
        values: list!.split(',').map((value) => value.replace(/"/g, '')),
      }));
      rows = rows.filter((row) =>
        clauses.some((clause) => clause.values.includes(row[clause.column] as string))
      );
    }
    return rows;
  }

  private run(): { data: Row[] | null; error: { message: string } | null } {
    if (this.mode === 'insert') {
      if (this.db.failOn === this.table) {
        return { data: null, error: { message: `refused ${this.table}` } };
      }
      const written = this.payload.map((row) => ({ id: this.db.id(), ...row }));
      this.db.rows(this.table).push(...written);
      return { data: written, error: null };
    }
    if (this.mode === 'delete') {
      const doomed = new Set(this.matching());
      const kept = this.db.rows(this.table).filter((row) => !doomed.has(row));
      this.db.tables[this.table] = kept;
      // The cascade migration 245 declares, kept honest here.
      if (this.table === 'cross_system_pattern_matches') {
        const ids = new Set([...doomed].map((row) => row.id));
        this.db.tables.cross_system_pattern_match_signals =
          this.db.tables.cross_system_pattern_match_signals!.filter(
            (row) => !ids.has(row.match_id)
          );
      }
      return { data: [], error: null };
    }
    return { data: this.matching(), error: null };
  }

  maybeSingle() {
    const result = this.run();
    return Promise.resolve({ data: result.data?.[0] ?? null, error: result.error });
  }

  range(from: number, to: number) {
    const result = this.run();
    return Promise.resolve(result.data ? { ...result, data: result.data.slice(from, to + 1) } : result);
  }

  then(resolve: (value: { data: Row[] | null; error: { message: string } | null }) => unknown) {
    return Promise.resolve(this.run()).then(resolve);
  }
}

function client(db: FakeDb) {
  return db as unknown as Parameters<typeof replaceMatches>[0];
}

function hip(overrides = {}) {
  return signal({ signalSlug: 'hip-clicking', ...overrides });
}
function kidney(overrides = {}) {
  return signal({
    signalSlug: 'frequent-urination',
    signalName: 'Frequent urination',
    categoryKey: 'kidney_bladder',
    bodyAreaKey: null,
    ...overrides,
  });
}
function lowBack(overrides = {}) {
  return signal({
    signalSlug: 'low-back-ache',
    signalName: 'Low-back ache',
    categoryKey: 'musculoskeletal',
    bodyAreaKey: 'low_back',
    ...overrides,
  });
}

let db: FakeDb;
beforeEach(() => {
  resetFixtureIds();
  db = new FakeDb();
});

// ---------------------------------------------------------------------
// 1. What a match records
// ---------------------------------------------------------------------

describe('a stored evaluation names the version, the rows and the day', () => {
  async function write(reason: 'sitting_ingested' | 'coach_signal_added' = 'sitting_ingested') {
    const rows = [hip(), kidney(), lowBack()];
    const matches = matchMemberSignals([summary({ current: { id: 'ver-4', versionNumber: 4 } })], rows);
    const result = await replaceMatches(client(db), {
      memberId: 'member-1',
      consideredRelationshipIds: ['rel-1'],
      matches,
      reason,
      evaluatedAt: EVALUATED_AT,
    });
    return { rows, matches, result };
  }

  it('records which relationship version it matched', async () => {
    await write();
    const stored = db.rows('cross_system_pattern_matches')[0]!;
    expect(stored.relationship_id).toBe('rel-1');
    expect(stored.version_id).toBe('ver-4');
    expect(stored.version_number).toBe(4);
  });

  it('records exactly which signal rows contributed, and in which role', async () => {
    const { rows } = await write();
    const contributions = db.rows('cross_system_pattern_match_signals');
    expect(contributions).toHaveLength(3);
    expect(contributions.map((row) => row.signal_id).sort()).toEqual(
      rows.map((row) => row.id).sort()
    );
    expect(contributions.map((row) => row.role).sort()).toEqual(['primary', 'related', 'support']);
    // And the input each row answered, by its position in that version.
    expect(contributions.every((row) => typeof row.component_position === 'number')).toBe(true);
  });

  it('records when it was evaluated, and what triggered it', async () => {
    await write('coach_signal_added');
    const stored = db.rows('cross_system_pattern_matches')[0]!;
    expect(stored.evaluated_at).toBe(EVALUATED_AT);
    expect(stored.evaluated_reason).toBe('coach_signal_added');
  });

  it('records the level and the strength the counts reached', async () => {
    await write();
    const stored = db.rows('cross_system_pattern_matches')[0]!;
    expect(stored.level_key).toBe('emerging');
    expect(stored.level_label).toBe('Emerging');
    expect(stored.strength).toBe('emerging');
    expect(stored.supporting_count).toBe(2);
    expect(stored.related_count).toBe(1);
    expect(stored.distinct_category_count).toBe(2);
  });

  it('reads back with the contributing rows attached', async () => {
    const { rows } = await write();
    const read = await listMatchesForMember(client(db), 'member-1');
    expect(read.ok).toBe(true);
    expect(read.records).toHaveLength(1);
    expect(read.records[0]!.versionNumber).toBe(4);
    expect(read.records[0]!.contributingSignalIds.sort()).toEqual(rows.map((row) => row.id).sort());
  });

  it('writes NOTHING for a member below the floor', async () => {
    const rows = [hip(), kidney()];
    const matches = matchMemberSignals([summary()], rows);
    expect(matches).toEqual([]);
    await replaceMatches(client(db), {
      memberId: 'member-1',
      consideredRelationshipIds: ['rel-1'],
      matches,
      reason: 'sitting_ingested',
      evaluatedAt: EVALUATED_AT,
    });
    expect(db.rows('cross_system_pattern_matches')).toHaveLength(0);
    expect(db.rows('cross_system_pattern_match_signals')).toHaveLength(0);
  });

  it('writes nothing at all when nothing was considered', async () => {
    const result = await replaceMatches(client(db), {
      memberId: 'member-1',
      consideredRelationshipIds: [],
      matches: [],
      reason: 'backfill',
      evaluatedAt: EVALUATED_AT,
    });
    expect(result).toEqual({ ok: true, written: 0 });
  });
});

// ---------------------------------------------------------------------
// 2. A re-evaluation replaces
// ---------------------------------------------------------------------

describe('a re-evaluation replaces rather than accumulating', () => {
  async function evaluate(rows: ReturnType<typeof signal>[], active = true) {
    const matches = matchMemberSignals([summary({ head: { isActive: active } })], rows);
    return replaceMatches(client(db), {
      memberId: 'member-1',
      consideredRelationshipIds: ['rel-1'],
      matches,
      reason: 'sitting_ingested',
      evaluatedAt: EVALUATED_AT,
    });
  }

  it('leaves one row per member and relationship, however many times it runs', async () => {
    const rows = [hip(), kidney(), lowBack()];
    await evaluate(rows);
    await evaluate(rows);
    await evaluate(rows);
    expect(db.rows('cross_system_pattern_matches')).toHaveLength(1);
    expect(db.rows('cross_system_pattern_match_signals')).toHaveLength(3);
  });

  it('a pattern that stops meeting its floor leaves nothing behind', async () => {
    await evaluate([hip(), kidney(), lowBack()]);
    expect(db.rows('cross_system_pattern_matches')).toHaveLength(1);
    // The supporting signals have settled.
    await evaluate([hip()]);
    expect(db.rows('cross_system_pattern_matches')).toHaveLength(0);
    expect(db.rows('cross_system_pattern_match_signals')).toHaveLength(0);
  });

  it('a DEACTIVATED definition takes its rows with it', async () => {
    await evaluate([hip(), kidney(), lowBack()]);
    expect(db.rows('cross_system_pattern_matches')).toHaveLength(1);
    await evaluate([hip(), kidney(), lowBack()], false);
    expect(db.rows('cross_system_pattern_matches')).toHaveLength(0);
  });

  it('leaves another relationship row alone, because it was not considered', async () => {
    db.rows('cross_system_pattern_matches').push({
      id: 'other',
      member_id: 'member-1',
      relationship_id: 'rel-2',
    });
    await evaluate([hip()]);
    expect(db.rows('cross_system_pattern_matches').map((row) => row.relationship_id)).toEqual([
      'rel-2',
    ]);
  });

  it('leaves another member row alone', async () => {
    db.rows('cross_system_pattern_matches').push({
      id: 'other',
      member_id: 'member-2',
      relationship_id: 'rel-1',
    });
    await evaluate([hip()]);
    expect(db.rows('cross_system_pattern_matches').map((row) => row.member_id)).toEqual([
      'member-2',
    ]);
  });

  it('reports a refused write rather than reporting a success', async () => {
    db.failOn = 'cross_system_pattern_matches';
    const result = await evaluate([hip(), kidney(), lowBack()]);
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------
// The bounded fan out on a relationship change
// ---------------------------------------------------------------------

describe('a relationship change asks only the members who could match it', () => {
  beforeEach(() => {
    db.tables.cross_system_signals = [
      { member_id: 'm1', signal_slug: 'hip-clicking', category_key: 'joint_movement', body_area_key: 'hip' },
      { member_id: 'm1', signal_slug: 'low-back-ache', category_key: 'musculoskeletal', body_area_key: 'low_back' },
      { member_id: 'm2', signal_slug: 'frequent-urination', category_key: 'kidney_bladder', body_area_key: null },
      { member_id: 'm3', signal_slug: 'cold-hands-or-feet', category_key: 'circulation', body_area_key: 'hand' },
    ];
  });

  it('finds the members holding a named signal, a named system or a named area', async () => {
    const found = await membersHoldingAny(
      client(db),
      { signalSlugs: [], categoryKeys: ['kidney_bladder'], bodyAreaKeys: ['hip'] },
      100
    );
    expect(found.sort()).toEqual(['m1', 'm2']);
  });

  it('leaves out a member who holds none of them', async () => {
    const found = await membersHoldingAny(
      client(db),
      { signalSlugs: ['hip-clicking'], categoryKeys: [], bodyAreaKeys: [] },
      100
    );
    expect(found).toEqual(['m1']);
  });

  it('returns nothing for a definition naming nothing', async () => {
    expect(
      await membersHoldingAny(client(db), { signalSlugs: [], categoryKeys: [], bodyAreaKeys: [] }, 100)
    ).toEqual([]);
  });

  it('is bounded, so one saved edit cannot become an unbounded sweep', async () => {
    const found = await membersHoldingAny(
      client(db),
      { signalSlugs: [], categoryKeys: ['joint_movement', 'kidney_bladder', 'circulation'], bodyAreaKeys: [] },
      2
    );
    expect(found).toHaveLength(2);
  });

  it('refuses a key that is not a plain slug, so a filter cannot be reshaped', async () => {
    const found = await membersHoldingAny(
      client(db),
      { signalSlugs: ['hip-clicking'], categoryKeys: ['bad),other.in.(anything'], bodyAreaKeys: [] },
      100
    );
    expect(found).toEqual(['m1']);
  });
});

// ---------------------------------------------------------------------
// 3 and 4. The triggers, and the render that writes nothing
// ---------------------------------------------------------------------

describe('the three re-evaluation triggers', () => {
  function source(relative: string): string {
    return readFileSync(path.join(ROOT, relative), 'utf8');
  }

  it('a newly ingested sitting re-evaluates, and only when a row was written', () => {
    const service = source('lib/cross-system-signals/service.ts');
    expect(service).toContain("reason: 'sitting_ingested'");
    const block = service.slice(service.indexOf('if (write.written > 0)'));
    expect(block.slice(0, 200)).toContain('evaluateMember({');
  });

  it('a coach entered signal re-evaluates', () => {
    const actions = source('app/actions/crossSystemSignals.ts');
    expect(actions).toContain("evaluateMember({ memberId: clientId, reason: 'coach_signal_added' })");
    // After the write, never before it, so a failed insert cannot file an
    // evaluation of a row that does not exist.
    expect(actions.indexOf('insertCoachSignal')).toBeLessThan(actions.indexOf('evaluateMember('));
  });

  it('a saved, activated or deactivated definition re-evaluates', () => {
    const actions = source('app/actions/crossSystemRelationships.ts');
    for (const fn of [
      'createRelationshipAction',
      'saveRelationshipVersionAction',
      'setRelationshipActiveAction',
    ]) {
      const start = actions.indexOf(`export async function ${fn}(`);
      const body = actions.slice(start, actions.indexOf('\nexport ', start + 1));
      expect(body, fn).toContain('evaluateRelationshipChange({');
    }
  });

  it('the four named reasons are the only ones the ledger accepts', () => {
    const migration = readFileSync(
      path.resolve(__dirname, '../../../supabase/migrations/00000000000245_cross_system_pattern_matches.sql'),
      'utf8'
    );
    for (const reason of [
      'sitting_ingested',
      'coach_signal_added',
      'relationship_changed',
      'backfill',
    ]) {
      expect(migration, reason).toContain(`'${reason}'`);
    }
  });

  it('the coach read COMPUTES rather than reading the ledger back, so one source of truth stands', () => {
    const action = source('app/actions/crossSystemPatterns.ts');
    expect(action).toContain('matchMemberSignals');
    expect(action).not.toContain('listMatchesForMember');
  });

  it('nothing in the coach read writes anything, so a render decides nothing', () => {
    const action = source('app/actions/crossSystemPatterns.ts');
    for (const forbidden of [
      '.insert(',
      '.update(',
      '.upsert(',
      '.delete(',
      'replaceMatches',
      'evaluateMember',
      'evaluateRelationshipChange',
    ]) {
      expect(action, forbidden).not.toContain(forbidden);
    }
  });

  it('the coach read establishes a coach and applies the test account rule', () => {
    const action = source('app/actions/crossSystemPatterns.ts');
    const start = action.indexOf('export async function getClientWholeBodyPatternsAction(');
    expect(start).toBeGreaterThan(-1);
    const body = action.slice(start);
    expect(body).toContain('isCoachOrAdmin');
    expect(body).toContain('isMemberVisibleToStaff');
    // Both before the first read of anything.
    expect(body.indexOf('isMemberVisibleToStaff')).toBeLessThan(body.indexOf('listSignalsForMember'));
  });

  it('the definition library still has no service role of its own, so every definition has an author', () => {
    for (const file of [
      'lib/cross-system-relationships/data.ts',
      'app/actions/crossSystemRelationships.ts',
    ]) {
      expect(source(file).toLowerCase(), file).not.toContain('servicerole');
    }
  });

  it('the engine never writes a definition, only an evaluation', () => {
    for (const file of [
      'lib/cross-system-patterns/evaluate.ts',
      'lib/cross-system-patterns/data.ts',
    ]) {
      const text = source(file);
      for (const forbidden of [
        'createRelationship',
        'saveNewVersion',
        'setRelationshipActive',
        'deleteRelationship',
        'cross_system_relationship_versions',
        'cross_system_relationship_components',
      ]) {
        expect(text, `${file} writes ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('the engine writes an evaluation through the trusted connection and nothing else', () => {
    const evaluate = source('lib/cross-system-patterns/evaluate.ts');
    expect(evaluate).toContain('patternEngineServiceRoleClient');
    // And it degrades rather than throwing when the credential is absent,
    // because a missing key must never cost a member her assessment.
    expect(evaluate).toContain("skipped: 'no_service_role'");
  });

  it('a component unused by any case above still resolves, so the fixture is honest', () => {
    expect(component({ role: 'support', refKind: 'signal', refKey: 'x' }).refLabel).toBe('x');
  });
});
