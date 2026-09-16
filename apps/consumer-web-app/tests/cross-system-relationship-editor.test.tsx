// @vitest-environment jsdom

/**
 * THE EDITOR: the four levels on the screen, and the create, read, edit,
 * duplicate, activate and delete behind them.
 *
 * What is worth proving about a tool whose whole job is to let one person
 * write down what she knows without a deploy:
 *
 *   1. AN EDIT NEVER REWRITES A VERSION. Saving writes the NEXT version
 *      and moves the head record's pointer, the previous one is still
 *      readable in full, and the number comes from the stored head rather
 *      than from whatever the client thought it was.
 *   2. THE POINTER MOVES LAST. A version whose children fail to write
 *      leaves the head pointing at the last whole version.
 *   3. A DUPLICATE IS ITS OWN PATTERN. It copies the current composition
 *      and starts at version 1, and it does not inherit the original's
 *      trail.
 *   4. ACTIVE IS A TOGGLE ON THE HEAD, and a new pattern is inactive.
 *   5. THE FORM SEPARATES THE FOUR LEVELS and its pickers are driven by
 *      the Signal Library's own vocabularies, not by a second list.
 *   6. THE LIST SHOWS THE EXAMPLE AS AN EXAMPLE, and an empty library
 *      says it is empty rather than offering to fill itself.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';

// Both client components ask for the router so they can refresh after a
// write. A static render has no app router mounted.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

import {
  createRelationship,
  deleteRelationship,
  getRelationship,
  listPatternKeys,
  listRelationships,
  saveNewVersion,
  setRelationshipActive,
} from '@/lib/cross-system-relationships/data';
import { resolveRelationshipDraft } from '@/lib/cross-system-relationships/draft';
import { DEFAULT_STRENGTH_LEVELS } from '@/lib/cross-system-relationships/constants';
import type { RelationshipDraft } from '@/lib/cross-system-relationships/types';
import { RelationshipLibraryPanel } from '@/components/coach-relationships/RelationshipLibraryPanel';
import { RelationshipEditor } from '@/components/coach-relationships/RelationshipEditor';
import { RelationshipVersionHistory } from '@/components/coach-relationships/RelationshipVersionHistory';
import { TEST_BODY_AREAS, TEST_CATEGORIES, TEST_LIBRARY, TEST_NAMES } from './cross-system-signal-library-fixture';

// ---------------------------------------------------------------------
// A tiny in-memory stand-in for the one client this feature uses.
// ---------------------------------------------------------------------

/**
 * ENOUGH POSTGREST TO DRIVE data.ts, and nothing more.
 *
 * It is a fake rather than a mock of each call because the point of these
 * cases is the ORDER of the writes and what is left behind when one of
 * them fails, which a per-call mock cannot show. `failOn` makes one table
 * refuse every insert, which is how "the pointer moves last" is proved.
 */
type Row = Record<string, unknown>;

class FakeDb {
  tables: {
    cross_system_relationships: Row[];
    cross_system_relationship_versions: Row[];
    cross_system_relationship_components: Row[];
    cross_system_relationship_strength_levels: Row[];
    cross_system_relationship_considerations: Row[];
  } = {
    cross_system_relationships: [],
    cross_system_relationship_versions: [],
    cross_system_relationship_components: [],
    cross_system_relationship_strength_levels: [],
    cross_system_relationship_considerations: [],
  };
  failOn: string | null = null;
  private nextId = 1;

  id(): string {
    this.nextId += 1;
    return `id-${this.nextId}`;
  }

  /** A table read by name, so a typo in a data.ts query fails loudly here. */
  rows(table: string): Row[] {
    const held = (this.tables as Record<string, Row[] | undefined>)[table];
    if (!held) throw new Error(`no such table in the fake: ${table}`);
    return held;
  }

  replace(table: string, rows: Row[]): void {
    (this.tables as Record<string, Row[]>)[table] = rows;
  }

  from(table: string) {
    return new FakeQuery(this, table);
  }
}

class FakeQuery {
  private filters: { column: string; value: unknown }[] = [];
  private inFilter: { column: string; values: unknown[] } | null = null;
  private orders: { column: string; ascending: boolean }[] = [];
  private mode: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private payload: Row[] = [];
  private patch: Row = {};
  private wantsSelect = false;

  constructor(
    private db: FakeDb,
    private table: string
  ) {}

  select(_columns?: string) {
    if (this.mode === 'select') this.mode = 'select';
    this.wantsSelect = true;
    return this;
  }

  insert(rows: Row | Row[]) {
    this.mode = 'insert';
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  update(patch: Row) {
    this.mode = 'update';
    this.patch = patch;
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

  order(column: string, options?: { ascending?: boolean }) {
    this.orders.push({ column, ascending: options?.ascending !== false });
    return this;
  }

  limit(_count: number) {
    return this;
  }

  private matching(): Row[] {
    let rows = this.db.rows(this.table);
    for (const filter of this.filters) {
      rows = rows.filter((row) => row[filter.column] === filter.value);
    }
    if (this.inFilter) {
      rows = rows.filter((row) => this.inFilter!.values.includes(row[this.inFilter!.column]));
    }
    for (const sort of [...this.orders].reverse()) {
      rows = [...rows].sort((a, b) => {
        const left = a[sort.column] as string | number;
        const right = b[sort.column] as string | number;
        if (left === right) return 0;
        const direction = left > right ? 1 : -1;
        return sort.ascending ? direction : -direction;
      });
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
    if (this.mode === 'update') {
      for (const row of this.matching()) Object.assign(row, this.patch);
      return { data: [], error: null };
    }
    if (this.mode === 'delete') {
      const doomed = new Set(this.matching());
      this.db.replace(
        this.table,
        this.db.rows(this.table).filter((row) => !doomed.has(row))
      );
      // The cascade migration 243 declares, kept honest here so a delete
      // test is testing what production does.
      if (this.table === 'cross_system_relationships') {
        const ids = new Set([...doomed].map((row) => row.id));
        this.db.tables.cross_system_relationship_versions =
          this.db.tables.cross_system_relationship_versions.filter(
            (row) => !ids.has(row.relationship_id)
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

  then(resolve: (value: { data: Row[] | null; error: { message: string } | null }) => unknown) {
    return Promise.resolve(this.run()).then(resolve);
  }
}

function client(db: FakeDb) {
  return db as unknown as Parameters<typeof listRelationships>[0];
}

function draft(overrides: Partial<RelationshipDraft> = {}): RelationshipDraft {
  return {
    patternName: 'Hip area signals observed alongside kidney and bladder signals',
    minSupportingSignals: 2,
    possibleAssociationText: 'Observed together, and worth exploring.',
    evidenceNotes: 'My own reading.',
    changeSummary: null,
    components: [
      { role: 'primary', refKind: 'body_area', refKey: 'hip' },
      { role: 'related', refKind: 'category', refKey: 'kidney_bladder' },
      { role: 'support', refKind: 'signal', refKey: 'hip-clicking', minValueNumeric: 3 },
    ],
    strengthLevels: [...DEFAULT_STRENGTH_LEVELS],
    considerations: ['Ask what else she has noticed.'],
    ...overrides,
  };
}

function resolved(overrides: Partial<RelationshipDraft> = {}) {
  const result = resolveRelationshipDraft(draft(overrides), TEST_LIBRARY);
  if (!result.ok) throw new Error(result.error);
  return result.draft;
}

let db: FakeDb;
beforeEach(() => {
  db = new FakeDb();
});

// ---------------------------------------------------------------------
// 1 to 4. The CRUD
// ---------------------------------------------------------------------

describe('creating a relationship', () => {
  it('writes one head, one version and its three child lists', async () => {
    const result = await createRelationship(client(db), {
      patternKey: 'hip-and-bladder',
      coachId: 'coach-1',
      draft: resolved(),
    });
    expect(result).toEqual({ ok: true, relationshipId: expect.any(String), versionNumber: 1 });
    expect(db.tables.cross_system_relationships).toHaveLength(1);
    expect(db.tables.cross_system_relationship_versions).toHaveLength(1);
    expect(db.tables.cross_system_relationship_components).toHaveLength(3);
    expect(db.tables.cross_system_relationship_strength_levels).toHaveLength(2);
    expect(db.tables.cross_system_relationship_considerations).toHaveLength(1);
  });

  it('saves it inactive, whatever the form thought', async () => {
    await createRelationship(client(db), {
      patternKey: 'hip-and-bladder',
      coachId: 'coach-1',
      draft: resolved(),
    });
    expect(db.tables.cross_system_relationships[0]!.is_active).toBe(false);
    expect(db.tables.cross_system_relationships[0]!.is_example).toBe(false);
  });

  it('signs the version with the coach who wrote it', async () => {
    await createRelationship(client(db), {
      patternKey: 'k',
      coachId: 'coach-1',
      draft: resolved(),
    });
    expect(db.tables.cross_system_relationship_versions[0]!.created_by).toBe('coach-1');
  });

  it('stores no change summary on version one, because it changed nothing', async () => {
    await createRelationship(client(db), {
      patternKey: 'k',
      coachId: 'coach-1',
      draft: resolved({ changeSummary: 'ignored' }),
    });
    expect(db.tables.cross_system_relationship_versions[0]!.change_summary).toBeNull();
  });
});

describe('editing a relationship writes the next version', () => {
  it('appends version two and moves the head pointer', async () => {
    const created = await createRelationship(client(db), {
      patternKey: 'k',
      coachId: 'coach-1',
      draft: resolved(),
    });
    if (!created.ok) throw new Error('setup failed');

    const edited = await saveNewVersion(client(db), {
      relationshipId: created.relationshipId,
      coachId: 'coach-1',
      draft: resolved({
        patternName: 'A better name',
        minSupportingSignals: 3,
        changeSummary: 'Raised the floor.',
      }),
    });
    expect(edited).toEqual({
      ok: true,
      relationshipId: created.relationshipId,
      versionNumber: 2,
    });
    expect(db.tables.cross_system_relationships[0]!.current_version).toBe(2);
  });

  it('leaves version one exactly as it was, which is the whole point of a version', async () => {
    const created = await createRelationship(client(db), {
      patternKey: 'k',
      coachId: 'coach-1',
      draft: resolved(),
    });
    if (!created.ok) throw new Error('setup failed');
    const before = { ...db.tables.cross_system_relationship_versions[0]! };

    await saveNewVersion(client(db), {
      relationshipId: created.relationshipId,
      coachId: 'coach-1',
      draft: resolved({ patternName: 'A better name' }),
    });

    expect(db.tables.cross_system_relationship_versions).toHaveLength(2);
    expect(db.tables.cross_system_relationship_versions[0]).toEqual(before);
  });

  it('takes the next number from the stored head, not from the client', async () => {
    const created = await createRelationship(client(db), {
      patternKey: 'k',
      coachId: 'coach-1',
      draft: resolved(),
    });
    if (!created.ok) throw new Error('setup failed');
    // Somebody else already saved version 2 while this tab was open.
    db.tables.cross_system_relationships[0]!.current_version = 2;

    const edited = await saveNewVersion(client(db), {
      relationshipId: created.relationshipId,
      coachId: 'coach-1',
      draft: resolved(),
    });
    expect(edited.ok && edited.versionNumber).toBe(3);
  });

  it('leaves the pointer on the last whole version when a child write fails', async () => {
    const created = await createRelationship(client(db), {
      patternKey: 'k',
      coachId: 'coach-1',
      draft: resolved(),
    });
    if (!created.ok) throw new Error('setup failed');

    db.failOn = 'cross_system_relationship_components';
    const edited = await saveNewVersion(client(db), {
      relationshipId: created.relationshipId,
      coachId: 'coach-1',
      draft: resolved({ patternName: 'Half written' }),
    });
    expect(edited.ok).toBe(false);
    expect(db.tables.cross_system_relationships[0]!.current_version).toBe(1);
  });
});

describe('reading a relationship back', () => {
  it('returns the current version and the whole trail, newest first', async () => {
    const created = await createRelationship(client(db), {
      patternKey: 'k',
      coachId: 'coach-1',
      draft: resolved(),
    });
    if (!created.ok) throw new Error('setup failed');
    await saveNewVersion(client(db), {
      relationshipId: created.relationshipId,
      coachId: 'coach-1',
      draft: resolved({ patternName: 'A better name' }),
    });

    const detail = await getRelationship(client(db), created.relationshipId);
    expect(detail).not.toBeNull();
    expect(detail!.current.versionNumber).toBe(2);
    expect(detail!.current.patternName).toBe('A better name');
    expect(detail!.history.map((version) => version.versionNumber)).toEqual([2, 1]);
    // Each version carries its OWN children, not the current one's.
    expect(detail!.history[1]!.patternName).toBe(
      'Hip area signals observed alongside kidney and bladder signals'
    );
  });

  it('lists every pattern with the version that is current', async () => {
    await createRelationship(client(db), {
      patternKey: 'a',
      coachId: 'coach-1',
      draft: resolved({ patternName: 'One' }),
    });
    await createRelationship(client(db), {
      patternKey: 'b',
      coachId: 'coach-1',
      draft: resolved({ patternName: 'Two' }),
    });
    const listed = await listRelationships(client(db));
    expect(listed.ok).toBe(true);
    expect(listed.summaries.map((summary) => summary.current.patternName).sort()).toEqual([
      'One',
      'Two',
    ]);
  });

  it('reports every pattern key in use, so a new one can be made distinct', async () => {
    await createRelationship(client(db), {
      patternKey: 'a',
      coachId: 'coach-1',
      draft: resolved(),
    });
    expect([...(await listPatternKeys(client(db)))]).toEqual(['a']);
  });
});

describe('the active toggle and the delete', () => {
  it('turns a pattern on and off without writing a version', async () => {
    const created = await createRelationship(client(db), {
      patternKey: 'k',
      coachId: 'coach-1',
      draft: resolved(),
    });
    if (!created.ok) throw new Error('setup failed');

    expect(await setRelationshipActive(client(db), created.relationshipId, true)).toBe(true);
    expect(db.tables.cross_system_relationships[0]!.is_active).toBe(true);
    expect(db.tables.cross_system_relationship_versions).toHaveLength(1);

    await setRelationshipActive(client(db), created.relationshipId, false);
    expect(db.tables.cross_system_relationships[0]!.is_active).toBe(false);
  });

  it('removes the head and every version under it', async () => {
    const created = await createRelationship(client(db), {
      patternKey: 'k',
      coachId: 'coach-1',
      draft: resolved(),
    });
    if (!created.ok) throw new Error('setup failed');
    await saveNewVersion(client(db), {
      relationshipId: created.relationshipId,
      coachId: 'coach-1',
      draft: resolved(),
    });

    expect(await deleteRelationship(client(db), created.relationshipId)).toBe(true);
    expect(db.tables.cross_system_relationships).toHaveLength(0);
    expect(db.tables.cross_system_relationship_versions).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------
// 5 and 6. The screen
// ---------------------------------------------------------------------

const PICKER_PROPS = {
  categories: TEST_CATEGORIES,
  bodyAreas: TEST_BODY_AREAS,
  signalNames: TEST_NAMES,
};

describe('the form separates the four levels and its pickers are the library own lists', () => {
  const html = renderToStaticMarkup(
    <RelationshipEditor
      relationshipId={null}
      source={null}
      {...PICKER_PROPS}
      onSaved={() => {}}
      onCancel={() => {}}
    />
  );

  it.each([
    'Observed inputs',
    'Pattern composition',
    'Possible Association text',
    'Coaching Considerations',
  ])('draws the %s section', (heading) => {
    expect(html).toContain(heading);
  });

  it('keeps the evidence notes clearly marked private', () => {
    expect(html).toContain('Evidence and methodology notes');
    expect(html).toContain('Private to you');
  });

  it('offers the three roles and all three vocabularies at once', () => {
    for (const label of [
      'Primary',
      'Related',
      'Supporting',
      'Search the signal names',
      'Or a whole body system',
      'Or a body area',
    ]) {
      expect(html, label).toContain(label);
    }
  });

  it('fills the body area picker from the Signal Library rows, not from a literal', () => {
    for (const area of TEST_BODY_AREAS) {
      expect(html, area.displayName).toContain(area.displayName);
    }
  });

  it('fills the body system picker from the Signal Library categories', () => {
    for (const category of TEST_CATEGORIES) {
      expect(html, category.displayName).toContain(category.displayName);
    }
  });

  it('starts a new pattern with the two default strength levels', () => {
    expect(html).toContain('Emerging');
    expect(html).toContain('Stronger');
  });

  it('says a new pattern is saved inactive', () => {
    expect(html).toContain('saved inactive');
  });

  it('says nothing about a member, a match or a score, because none exists yet', () => {
    for (const word of ['member', 'match', 'score', 'Correlation']) {
      expect(html.toLowerCase(), word).not.toContain(word.toLowerCase());
    }
  });
});

describe('the editor opened on an existing pattern', () => {
  it('says the next version number it will save as', () => {
    const html = renderToStaticMarkup(
      <RelationshipEditor
        relationshipId="r1"
        source={{
          id: 'v3',
          relationshipId: 'r1',
          versionNumber: 3,
          patternName: 'A pattern',
          minSupportingSignals: 2,
          sourceTypeKey: 'coach_added',
          surfacesOnComplaint: false,
          possibleAssociationText: null,
          evidenceNotes: null,
          changeSummary: null,
          createdBy: null,
          createdAt: '2026-09-15T00:00:00.000Z',
          components: [],
          strengthLevels: [],
          considerations: [],
        }}
        {...PICKER_PROPS}
        onSaved={() => {}}
        onCancel={() => {}}
      />
    );
    expect(html).toContain('saves as version 4');
    expect(html).toContain('Save as a new version');
  });
});

describe('the list view', () => {
  it('says the library is empty rather than offering to fill it', () => {
    const html = renderToStaticMarkup(
      <RelationshipLibraryPanel summaries={[]} {...PICKER_PROPS} />
    );
    expect(html).toContain('The library is empty');
    expect(html).toContain('Nothing in this app writes one for you');
    expect(html.toLowerCase()).not.toContain('generate');
    expect(html.toLowerCase()).not.toContain('suggest');
  });

  it('marks the example record as an example and as inactive', async () => {
    await createRelationship(client(db), {
      patternKey: 'example-structure-demonstration',
      coachId: 'coach-1',
      draft: resolved({ patternName: 'Example: hip signals and kidney signals' }),
    });
    db.tables.cross_system_relationships[0]!.is_example = true;
    const listed = await listRelationships(client(db));

    const html = renderToStaticMarkup(
      <RelationshipLibraryPanel summaries={listed.summaries} {...PICKER_PROPS} />
    );
    expect(html).toContain('Example');
    expect(html).toContain('Inactive');
    expect(html).toContain('Activate');
  });

  it('offers every action the brief asked for, on every row', async () => {
    await createRelationship(client(db), {
      patternKey: 'k',
      coachId: 'coach-1',
      draft: resolved(),
    });
    const listed = await listRelationships(client(db));
    const html = renderToStaticMarkup(
      <RelationshipLibraryPanel summaries={listed.summaries} {...PICKER_PROPS} />
    );
    for (const action of ['Edit', 'Version history', 'Duplicate', 'Activate', 'Delete']) {
      expect(html, action).toContain(action);
    }
    // And the list controls.
    expect(html).toContain('Search patterns');
    expect(html).toContain('Body system');
    expect(html).toContain('New pattern');
  });
});

describe('the version history view', () => {
  it('shows every version, what changed, and the coach own reason', async () => {
    const created = await createRelationship(client(db), {
      patternKey: 'k',
      coachId: 'coach-1',
      draft: resolved(),
    });
    if (!created.ok) throw new Error('setup failed');
    await saveNewVersion(client(db), {
      relationshipId: created.relationshipId,
      coachId: 'coach-1',
      draft: resolved({
        patternName: 'A better name',
        minSupportingSignals: 3,
        changeSummary: 'Raised the floor after three conversations.',
      }),
    });
    const detail = await getRelationship(client(db), created.relationshipId);

    const html = renderToStaticMarkup(
      <RelationshipVersionHistory history={detail!.history} />
    );
    expect(html).toContain('Version 2');
    expect(html).toContain('Version 1');
    expect(html).toContain('Raised the floor after three conversations.');
    expect(html).toContain('2 to 3');
    expect(html).toContain('the first version of this pattern');
  });
});

// ---------------------------------------------------------------------
// The structural claims a render cannot make
// ---------------------------------------------------------------------

describe('this whole feature is coach only, structurally', () => {
  const ACTIONS = readFileSync(
    path.join(path.resolve(__dirname, '..'), 'app/actions/crossSystemRelationships.ts'),
    'utf8'
  );

  it('every exported action establishes a coach or an administrator before it does anything', () => {
    const exported = [...ACTIONS.matchAll(/export async function (\w+)\(/g)].map(([, name]) => name!);
    expect(exported.length).toBeGreaterThanOrEqual(7);
    for (const name of exported) {
      const start = ACTIONS.indexOf(`export async function ${name}(`);
      const body = ACTIONS.slice(start, ACTIONS.indexOf('\nexport ', start + 1));
      expect(body, `${name} does not establish a coach`).toContain('coachOrAdmin()');
    }
  });

  it('the role check accepts a coach or an administrator and nobody else', () => {
    const start = ACTIONS.indexOf('async function coachOrAdmin(');
    const body = ACTIONS.slice(start, ACTIONS.indexOf('\n}', start));
    expect(body).toContain("hasActiveRole(supabase, user.id, 'coach')");
    expect(body).toContain("hasActiveRole(supabase, user.id, 'platform_administrator')");
  });

  it('nothing in this feature reads a member signal, scores anything or matches', () => {
    // Prompt 2 defines patterns. It still does not run them. Prompt 3
    // added the matching engine, and the ONLY thing this file learned
    // about it is a single call saying "a definition moved": which
    // members that touches, what their rows say and what it costs all
    // live behind that one name, in lib/cross-system-patterns/. If any of
    // the strings below appear here, the engine has leaked back into the
    // library that is supposed to know nothing about members.
    for (const forbidden of [
      'cross_system_signals',
      'listSignalsForMember',
      'buildCoachSignalsView',
      'matchMemberSignals',
      'member_id',
    ]) {
      expect(ACTIONS, forbidden).not.toContain(forbidden);
    }
  });

  it('the engine is reached through exactly one named call, and never inline', () => {
    // The hand off, stated as a test rather than as a comment: one import
    // of one function, and every write path that can change what an active
    // definition means calls it.
    const imports = [...ACTIONS.matchAll(/from '@\/lib\/cross-system-patterns\/([\w/]+)'/g)].map(
      ([, module]) => module!
    );
    expect(imports).toEqual(['evaluate']);
    expect([...ACTIONS.matchAll(/evaluateRelationshipChange\(/g)]).toHaveLength(3);

    for (const fn of [
      'createRelationshipAction',
      'saveRelationshipVersionAction',
      'setRelationshipActiveAction',
    ]) {
      const start = ACTIONS.indexOf(`export async function ${fn}(`);
      const body = ACTIONS.slice(start, ACTIONS.indexOf('\nexport ', start + 1));
      expect(body, `${fn} does not tell the engine its definition moved`).toContain(
        'evaluateRelationshipChange({'
      );
    }
  });

  it('no service role connection exists anywhere in the feature, so every row has an author', () => {
    for (const file of [
      'lib/cross-system-relationships/data.ts',
      'app/actions/crossSystemRelationships.ts',
    ]) {
      const source = readFileSync(path.join(path.resolve(__dirname, '..'), file), 'utf8');
      expect(source.toLowerCase(), file).not.toContain('servicerole');
    }
  });
});
