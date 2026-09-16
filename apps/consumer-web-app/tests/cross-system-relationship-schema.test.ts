/**
 * THE RELATIONSHIP LIBRARY'S SCHEMA, ITS ONE SEEDED ROW, AND THE RULES
 * OVER A DRAFT, read out of the SQL and driven through the pure code.
 *
 * What a migration or an edit can break silently here:
 *
 *   1. THE FENCE. Not one of the five tables carries a member select
 *      policy, and not one of the four version scoped tables carries an
 *      update policy. The first is the whole coach-only property; the
 *      second is the version trail, because a version that could be
 *      rewritten is not a version.
 *   2. THE NAMING. Everything carries the cross_system prefix, and
 *      nothing in this migration touches another feature's tables.
 *   3. THE LIBRARY SHIPS EMPTY. Exactly one relationship is seeded, it is
 *      inactive, it is flagged as an example, and it says Example in its
 *      own name. Nothing else anywhere generates, infers or seeds one.
 *   4. NOTHING IS HARD CODED TO A PAIRING. There is no hip column and no
 *      kidney column, and every combination of the three vocabularies in
 *      the three roles resolves the same way.
 *   5. A DRAFT IS RESOLVED ON THE SERVER. Labels come from the live
 *      library, a key nobody has is refused, and a pattern with no primary
 *      input cannot be saved.
 *   6. THE VERSION HISTORY DESCRIBES REAL DIFFERENCES.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildPatternKey,
  normalizeLine,
  normalizeText,
  resolveRelationshipDraft,
} from '@/lib/cross-system-relationships/draft';
import { buildVersionHistory, describeChanges } from '@/lib/cross-system-relationships/history';
import {
  categoriesOf,
  EMPTY_FILTERS,
  filterRelationships,
} from '@/lib/cross-system-relationships/filters';
import { DEFAULT_STRENGTH_LEVELS } from '@/lib/cross-system-relationships/constants';
import type {
  RelationshipDraft,
  RelationshipSummary,
  RelationshipVersion,
} from '@/lib/cross-system-relationships/types';
import { TEST_LIBRARY } from './cross-system-signal-library-fixture';
import type { SignalLibrary } from '@/lib/cross-system-signals/types';

/**
 * The shared fixture plus a skin area, a skin category and a skin signal.
 *
 * The shared one is the Signal Library's own fixture and it is deliberately
 * small. This file needs a skin signal to prove that skin to digestion is
 * the same shape as joint to system, and adding one HERE rather than there
 * keeps the adapter tests reading the library they were written against.
 */
const LIBRARY: SignalLibrary = {
  ...TEST_LIBRARY,
  categories: new Map([
    ...TEST_LIBRARY.categories,
    ['skin_immune', { categoryKey: 'skin_immune', position: 10, displayName: 'Skin/Immune' }],
  ]),
  bodyAreas: new Map([
    ...TEST_LIBRARY.bodyAreas,
    ['skin', { areaKey: 'skin', position: 7, displayName: 'Skin', takesSide: false }],
  ]),
  names: new Map([
    ...TEST_LIBRARY.names,
    [
      'skin-flare-ups',
      {
        signalSlug: 'skin-flare-ups',
        displayName: 'Skin flare-ups',
        categoryKey: 'skin_immune',
        defaultBodyAreaKey: 'skin',
        defaultSymptomKey: null,
        searchTerms: 'rash eczema breakout',
        isCoachAddable: true,
      },
    ],
  ]),
};

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');

function sql(file: string): string {
  return readFileSync(path.join(MIGRATIONS, file), 'utf8');
}

const SCHEMA = sql('00000000000243_cross_system_relationship_library.sql');
const EXAMPLE = sql('00000000000244_cross_system_relationship_example.sql');

const TABLES = [
  'cross_system_relationships',
  'cross_system_relationship_versions',
  'cross_system_relationship_components',
  'cross_system_relationship_strength_levels',
  'cross_system_relationship_considerations',
];

/** The four tables that hold a version's own content, none of which may ever be updated. */
const VERSION_SCOPED = TABLES.slice(1);

// ---------------------------------------------------------------------
// 1. The fence
// ---------------------------------------------------------------------

describe('the relationship library is coach only, in the database rather than by convention', () => {
  it.each(TABLES)('%s exists and has row level security on', (table) => {
    expect(SCHEMA).toContain(`create table ${table} (`);
    expect(SCHEMA).toContain(`alter table ${table} enable row level security;`);
  });

  /**
   * The test is on every policy's own clause rather than on its name,
   * because a policy called coach_read_... that resolved to something a
   * member session satisfies would be exactly the leak this file exists to
   * prevent.
   */
  it('every policy is gated on an active staff role, so a member session passes none', () => {
    const policies = [...SCHEMA.matchAll(/create policy\s+(\w+)\s+on\s+(\w+)([\s\S]*?);/g)];
    expect(policies.length).toBeGreaterThan(10);
    for (const [, name, table, body] of policies) {
      expect(table, `${name} is on ${table}`).toMatch(/^cross_system_/);
      const clause = body!.replace(/\s+/g, ' ');
      expect(
        /has_active_role\(auth\.uid\(\), '(coach|platform_administrator)'\)/.test(clause),
        `${name} on ${table} is not gated on a staff role`
      ).toBe(true);
      expect(clause, `${name} compares auth.uid() to a member id`).not.toMatch(/member_id/);
    }
  });

  it('there is no member policy of any kind', () => {
    expect(SCHEMA).not.toMatch(/create policy member_\w+ on cross_system/);
  });

  it.each(VERSION_SCOPED)('%s carries no update policy, which is the version trail', (table) => {
    const forUpdate = new RegExp(`create policy \\w+ on ${table}\\s+for update`);
    expect(SCHEMA).not.toMatch(forUpdate);
  });

  it('a coach may only write a version signed by herself', () => {
    const policy = SCHEMA.slice(
      SCHEMA.indexOf('create policy coach_insert_cross_system_relationship_versions')
    ).split(';')[0]!;
    expect(policy).toContain('created_by = auth.uid()');
  });

  it('the head record is the only thing an update may move', () => {
    const updates = [...SCHEMA.matchAll(/create policy (\w+) on (\w+)\s+for update/g)];
    expect(updates.map(([, , table]) => table)).toEqual(['cross_system_relationships']);
  });

  it('a version can never be written without a name and a floor', () => {
    const table = SCHEMA.slice(
      SCHEMA.indexOf('create table cross_system_relationship_versions ('),
      SCHEMA.indexOf('create index cross_system_relationship_versions_head_idx')
    );
    expect(table).toContain('pattern_name text not null');
    expect(table).toContain('min_supporting_signals integer not null');
    expect(table).toContain('unique (relationship_id, version_number)');
  });
});

// ---------------------------------------------------------------------
// 2. The naming
// ---------------------------------------------------------------------

describe('nothing in this migration can be confused with another feature', () => {
  it('every table, index and policy created here carries the cross_system prefix', () => {
    for (const [, name] of SCHEMA.matchAll(/create table (\w+)/g)) {
      expect(name, `table ${name}`).toMatch(/^cross_system_/);
    }
    for (const [, name] of SCHEMA.matchAll(/create (?:unique )?index (\w+)/g)) {
      expect(name, `index ${name}`).toMatch(/^cross_system_/);
    }
    for (const [, name] of SCHEMA.matchAll(/create policy (\w+)/g)) {
      expect(name, `policy ${name}`).toMatch(/cross_system/);
    }
  });

  it('creates, alters or drops nothing belonging to another feature', () => {
    for (const [, verb, target] of SCHEMA.matchAll(/\n(alter|drop) table (?:if exists )?(\w+)/g)) {
      expect(target, `${verb} ${target}`).toMatch(/^cross_system_/);
    }
  });

  it('the example migration inserts only into this feature and alters nothing', () => {
    for (const [, table] of EXAMPLE.matchAll(/insert into (\w+)/g)) {
      expect(table).toMatch(/^cross_system_relationship/);
    }
    expect(EXAMPLE).not.toMatch(/\n(alter|drop|update|delete)\s/i);
  });

  it('says out loud that no matching engine is in this build', () => {
    expect(SCHEMA.toLowerCase()).toContain('no matching engine is in this migration');
  });
});

// ---------------------------------------------------------------------
// 3. The library ships empty
// ---------------------------------------------------------------------

describe('the library ships empty except for one inactive example', () => {
  it('seeds exactly one relationship', () => {
    const heads = [...EXAMPLE.matchAll(/insert into cross_system_relationships\b/g)];
    expect(heads).toHaveLength(1);
    const block = EXAMPLE.split('insert into cross_system_relationships (')[1]!.split(';')[0]!;
    // One values tuple, which is one row.
    expect([...block.matchAll(/\bvalues\b/g)]).toHaveLength(1);
  });

  it('that one row is inactive and flagged as an example', () => {
    const block = EXAMPLE.split('insert into cross_system_relationships (')[1]!.split(';')[0]!;
    const values = block.slice(block.indexOf('values')).replace(/\s+/g, ' ');
    // (id, pattern_key, is_active, is_example, current_version, created_by)
    expect(values).toMatch(/'example-structure-demonstration', false, true,/);
  });

  it('it says Example in the first word a coach reads', () => {
    const name = /'(Example:[^']+)'/.exec(EXAMPLE);
    expect(name, 'the seeded pattern name does not start with Example').not.toBeNull();
  });

  it('seeds exactly one version of it, and no second relationship anywhere', () => {
    const versions = [
      ...EXAMPLE.matchAll(/insert into cross_system_relationship_versions\b/g),
    ];
    expect(versions).toHaveLength(1);
    const relationshipIds = new Set(
      [...EXAMPLE.matchAll(/'(00000000-0000-4000-8000-[0-9a-f]{12})'/g)].map((m) => m[1]!)
    );
    expect(relationshipIds.size).toBe(1);
  });

  it('nothing in this feature generates a relationship on anybody behalf', () => {
    // Every write path in the feature is a coach action. If a service role
    // client ever appears in this folder, a relationship could be written
    // by something that is not her.
    const dir = path.resolve(__dirname, '../lib/cross-system-relationships');
    const files = readFileSync(path.join(dir, 'data.ts'), 'utf8');
    expect(files).not.toContain('serviceRole');
    expect(files).not.toContain('SERVICE_ROLE');
  });
});

// ---------------------------------------------------------------------
// 4. Nothing is hard coded to a pairing
// ---------------------------------------------------------------------

describe('any combination is the same shape', () => {
  it('holds no column naming a body part or a system', () => {
    const columns = [...SCHEMA.matchAll(/\n {2}(\w+) (?:text|uuid|integer|numeric|boolean)/g)].map(
      ([, name]) => name!
    );
    expect(columns.length).toBeGreaterThan(20);
    // Word by word, because "relationship_id" contains the letters of
    // "hip" and is not a column named after a joint.
    for (const forbidden of ['hip', 'kidney', 'bladder', 'skin', 'digestion', 'organ']) {
      expect(
        columns.some((column) => column.split('_').includes(forbidden)),
        `a column is named after ${forbidden}`
      ).toBe(false);
    }
  });

  const cases: { name: string; components: RelationshipDraft['components'] }[] = [
    {
      name: 'joint to system',
      components: [
        { role: 'primary', refKind: 'body_area', refKey: 'hip' },
        { role: 'related', refKind: 'category', refKey: 'kidney_bladder' },
      ],
    },
    {
      name: 'muscle to system',
      components: [
        { role: 'primary', refKind: 'signal', refKey: 'low-back-ache' },
        { role: 'related', refKind: 'category', refKey: 'digestion' },
      ],
    },
    {
      name: 'skin to digestion',
      components: [
        { role: 'primary', refKind: 'signal', refKey: 'skin-flare-ups' },
        { role: 'related', refKind: 'category', refKey: 'digestion' },
      ],
    },
    {
      name: 'stress to a physical symptom',
      components: [
        { role: 'primary', refKind: 'category', refKey: 'other' },
        { role: 'related', refKind: 'signal', refKey: 'hip-clicking' },
      ],
    },
    {
      name: 'many systems onto one symptom',
      components: [
        { role: 'primary', refKind: 'signal', refKey: 'hip-clicking' },
        { role: 'related', refKind: 'category', refKey: 'digestion' },
        { role: 'related', refKind: 'category', refKey: 'kidney_bladder' },
        { role: 'related', refKind: 'category', refKey: 'circulation' },
      ],
    },
    {
      name: 'one system onto many symptoms',
      components: [
        { role: 'primary', refKind: 'category', refKey: 'kidney_bladder' },
        { role: 'related', refKind: 'signal', refKey: 'hip-clicking' },
        { role: 'related', refKind: 'signal', refKey: 'low-back-ache' },
        { role: 'related', refKind: 'signal', refKey: 'frequent-urination' },
      ],
    },
  ];

  it.each(cases)('$name resolves with no special case', ({ components }) => {
    const result = resolveRelationshipDraft(
      {
        patternName: 'A pattern',
        minSupportingSignals: 2,
        components,
        strengthLevels: [...DEFAULT_STRENGTH_LEVELS],
        considerations: [],
      },
      LIBRARY
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.components).toHaveLength(components.length);
  });
});

// ---------------------------------------------------------------------
// 5. A draft is resolved on the server
// ---------------------------------------------------------------------

function baseDraft(overrides: Partial<RelationshipDraft> = {}): RelationshipDraft {
  return {
    patternName: 'Hip area signals observed alongside kidney and bladder signals',
    minSupportingSignals: 2,
    possibleAssociationText: 'These are observed together and may be worth exploring.',
    evidenceNotes: 'My own reading.',
    changeSummary: null,
    components: [
      { role: 'primary', refKind: 'body_area', refKey: 'hip' },
      { role: 'related', refKind: 'category', refKey: 'kidney_bladder' },
      { role: 'support', refKind: 'signal', refKey: 'hip-clicking', minValueNumeric: 3 },
    ],
    strengthLevels: [...DEFAULT_STRENGTH_LEVELS],
    considerations: ['Worth exploring hydration.', ''],
    ...overrides,
  };
}

describe('the server decides every label a version stores', () => {
  it('takes each label from the live library rather than from the client', () => {
    const result = resolveRelationshipDraft(baseDraft(), LIBRARY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.components.map((c) => c.refLabel)).toEqual([
      'Hip',
      'Kidney/Bladder',
      'Hip clicking',
    ]);
  });

  it('refuses a key the Signal Library has never held', () => {
    const result = resolveRelationshipDraft(
      baseDraft({
        components: [{ role: 'primary', refKind: 'signal', refKey: 'invented-signal' }],
      }),
      LIBRARY
    );
    expect(result.ok).toBe(false);
  });

  it('refuses a draft with no primary input', () => {
    const result = resolveRelationshipDraft(
      baseDraft({
        components: [{ role: 'related', refKind: 'category', refKey: 'digestion' }],
      }),
      LIBRARY
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('primary');
  });

  it('refuses a draft with no name', () => {
    expect(resolveRelationshipDraft(baseDraft({ patternName: '   ' }), LIBRARY).ok).toBe(
      false
    );
  });

  it('refuses a floor below one', () => {
    expect(
      resolveRelationshipDraft(baseDraft({ minSupportingSignals: 0 }), LIBRARY).ok
    ).toBe(false);
  });

  it('drops an empty coaching consideration rather than storing a blank line', () => {
    const result = resolveRelationshipDraft(baseDraft(), LIBRARY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.considerations).toEqual(['Worth exploring hydration.']);
  });

  it('drops a repeat of the same input in the same role', () => {
    const result = resolveRelationshipDraft(
      baseDraft({
        components: [
          { role: 'primary', refKind: 'body_area', refKey: 'hip' },
          { role: 'primary', refKind: 'body_area', refKey: 'hip' },
        ],
      }),
      LIBRARY
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.components).toHaveLength(1);
  });

  it('keeps the same input in two different roles, because they say different things', () => {
    const result = resolveRelationshipDraft(
      baseDraft({
        components: [
          { role: 'primary', refKind: 'body_area', refKey: 'hip' },
          { role: 'related', refKind: 'body_area', refKey: 'hip' },
        ],
      }),
      LIBRARY
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.components).toHaveLength(2);
  });

  it('positions every input from one, in the order it arrived', () => {
    const result = resolveRelationshipDraft(baseDraft(), LIBRARY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.components.map((c) => c.position)).toEqual([1, 2, 3]);
  });

  it('derives a strength level key from its own label, so a renamed level cannot collide', () => {
    const result = resolveRelationshipDraft(
      baseDraft({
        strengthLevels: [
          { levelKey: '', displayLabel: 'Worth a look', minSupportingSignals: 2 },
        ],
      }),
      LIBRARY
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.strengthLevels[0]!.levelKey).toBe('worth-a-look');
  });

  it('refuses two strength levels under one key', () => {
    const result = resolveRelationshipDraft(
      baseDraft({
        strengthLevels: [
          { levelKey: 'emerging', displayLabel: 'Emerging', minSupportingSignals: 2 },
          { levelKey: 'emerging', displayLabel: 'Emerging', minSupportingSignals: 3 },
        ],
      }),
      LIBRARY
    );
    expect(result.ok).toBe(false);
  });

  it('keeps a paragraph in the long fields and one line in the short ones', () => {
    expect(normalizeText('one\n\ntwo', 100)).toBe('one\n\ntwo');
    expect(normalizeLine('one\n\ntwo', 100)).toBe('one two');
    expect(normalizeLine('   ', 100)).toBeNull();
  });

  it('makes a distinct pattern key when two patterns start life with the same name', () => {
    const taken = new Set(['hip-and-bladder']);
    expect(buildPatternKey('Hip and bladder', taken)).toBe('hip-and-bladder-2');
    expect(buildPatternKey('Hip and bladder', new Set())).toBe('hip-and-bladder');
  });
});

// ---------------------------------------------------------------------
// 6. The version history
// ---------------------------------------------------------------------

function version(
  number: number,
  overrides: Partial<RelationshipVersion> = {}
): RelationshipVersion {
  return {
    id: `v${number}`,
    relationshipId: 'r1',
    versionNumber: number,
    patternName: 'A pattern',
    minSupportingSignals: 2,
    sourceTypeKey: 'coach_added',
    surfacesOnComplaint: false,
    possibleAssociationText: null,
    evidenceNotes: null,
    changeSummary: null,
    createdBy: 'coach',
    createdAt: `2026-09-1${number}T12:00:00.000Z`,
    components: [],
    strengthLevels: [],
    considerations: [],
    ...overrides,
  };
}

const HIP = {
  id: 'c1',
  position: 1,
  role: 'primary' as const,
  refKind: 'body_area' as const,
  refKey: 'hip',
  refLabel: 'Hip',
  side: null,
  valueKey: null,
  valueLabel: null,
  minValueNumeric: null,
  sourceKey: null,
  sourceQuestionRef: null,
  sourceQuestionPrompt: null,
  note: null,
};

describe('the version history describes real differences', () => {
  it('calls the first version a creation rather than a diff against nothing', () => {
    expect(describeChanges(version(1), null)).toEqual([
      { field: 'Created', detail: 'the first version of this pattern' },
    ]);
  });

  it('names a rename', () => {
    const changes = describeChanges(
      version(2, { patternName: 'A better name' }),
      version(1)
    );
    expect(changes).toContainEqual({
      field: 'Pattern name',
      detail: '"A pattern" to "A better name"',
    });
  });

  it('names a moved floor', () => {
    const changes = describeChanges(version(2, { minSupportingSignals: 3 }), version(1));
    expect(changes).toContainEqual({
      field: 'Minimum supporting signals',
      detail: '2 to 3',
    });
  });

  it('names an input that arrived and one that left', () => {
    const before = version(1, { components: [HIP] });
    const after = version(2, {
      components: [{ ...HIP, id: 'c2', refKey: 'knee', refLabel: 'Knee' }],
    });
    const changes = describeChanges(after, before);
    const primary = changes.find((change) => change.field === 'Primary inputs');
    expect(primary?.detail).toContain('added Knee');
    expect(primary?.detail).toContain('removed Hip');
  });

  it('names text that was added, rewritten and cleared', () => {
    expect(
      describeChanges(version(2, { possibleAssociationText: 'Something.' }), version(1))
    ).toContainEqual({ field: 'Possible Association text', detail: 'added' });
    expect(
      describeChanges(
        version(3, { possibleAssociationText: 'Another thing.' }),
        version(2, { possibleAssociationText: 'Something.' })
      )
    ).toContainEqual({ field: 'Possible Association text', detail: 'rewritten' });
    expect(
      describeChanges(version(3), version(2, { possibleAssociationText: 'Something.' }))
    ).toContainEqual({ field: 'Possible Association text', detail: 'cleared' });
  });

  it('says nothing moved rather than inventing a change', () => {
    expect(describeChanges(version(2), version(1))).toEqual([]);
  });

  it('reads the whole trail newest first, each compared with the one below it', () => {
    const entries = buildVersionHistory([
      version(1),
      version(2, { minSupportingSignals: 3 }),
      version(3, { minSupportingSignals: 4 }),
    ]);
    expect(entries.map((entry) => entry.version.versionNumber)).toEqual([3, 2, 1]);
    expect(entries[0]!.changes).toContainEqual({
      field: 'Minimum supporting signals',
      detail: '3 to 4',
    });
    expect(entries[2]!.changes[0]!.field).toBe('Created');
  });
});

// ---------------------------------------------------------------------
// The list view's own rules
// ---------------------------------------------------------------------

function summary(overrides: {
  id: string;
  isActive: boolean;
  isExample?: boolean;
  name: string;
  components: RelationshipVersion['components'];
}): RelationshipSummary {
  return {
    head: {
      id: overrides.id,
      patternKey: overrides.id,
      isActive: overrides.isActive,
      isExample: overrides.isExample ?? false,
      isSeeded: false,
      currentVersion: 1,
      createdBy: null,
      createdAt: '2026-09-15T00:00:00.000Z',
      updatedAt: '2026-09-15T00:00:00.000Z',
    },
    current: version(1, { patternName: overrides.name, components: overrides.components }),
  };
}

describe('the list view search and its two filters', () => {
  const lookup = new Map([
    ['hip-clicking', 'joint_movement'],
    ['frequent-urination', 'kidney_bladder'],
  ]);

  const rows = [
    summary({
      id: 'a',
      isActive: true,
      name: 'Hip and bladder',
      components: [
        { ...HIP, id: 'a1', refKind: 'signal', refKey: 'hip-clicking', refLabel: 'Hip clicking' },
        {
          ...HIP,
          id: 'a2',
          role: 'related',
          refKind: 'category',
          refKey: 'digestion',
          refLabel: 'Digestion',
        },
      ],
    }),
    summary({
      id: 'b',
      isActive: false,
      isExample: true,
      name: 'Example: something',
      components: [
        {
          ...HIP,
          id: 'b1',
          refKind: 'signal',
          refKey: 'frequent-urination',
          refLabel: 'Frequent urination',
        },
      ],
    }),
  ];

  it('shows everything with no filters on', () => {
    expect(filterRelationships(rows, EMPTY_FILTERS, lookup)).toHaveLength(2);
  });

  it('filters by active and by inactive', () => {
    expect(
      filterRelationships(rows, { ...EMPTY_FILTERS, status: 'active' }, lookup).map(
        (row) => row.head.id
      )
    ).toEqual(['a']);
    expect(
      filterRelationships(rows, { ...EMPTY_FILTERS, status: 'inactive' }, lookup).map(
        (row) => row.head.id
      )
    ).toEqual(['b']);
  });

  it('searches the name and every input label, partially and case insensitively', () => {
    expect(
      filterRelationships(rows, { ...EMPTY_FILTERS, query: 'URINA' }, lookup).map(
        (row) => row.head.id
      )
    ).toEqual(['b']);
    expect(
      filterRelationships(rows, { ...EMPTY_FILTERS, query: 'digest' }, lookup).map(
        (row) => row.head.id
      )
    ).toEqual(['a']);
  });

  it('derives a pattern categories from the components rather than storing them', () => {
    expect([...categoriesOf(rows[0]!, lookup)].sort()).toEqual(['digestion', 'joint_movement']);
    // A body area is a place, not a system, so it contributes none.
    expect([...categoriesOf(summary({ id: 'c', isActive: true, name: 'x', components: [HIP] }), lookup)]).toEqual(
      []
    );
  });

  it('filters by body system, in any role', () => {
    expect(
      filterRelationships(rows, { ...EMPTY_FILTERS, categoryKey: 'digestion' }, lookup).map(
        (row) => row.head.id
      )
    ).toEqual(['a']);
    expect(
      filterRelationships(rows, { ...EMPTY_FILTERS, categoryKey: 'kidney_bladder' }, lookup).map(
        (row) => row.head.id
      )
    ).toEqual(['b']);
  });
});
