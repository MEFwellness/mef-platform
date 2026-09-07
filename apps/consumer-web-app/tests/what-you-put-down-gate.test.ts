/**
 * What You Put Down: the gate, the shelf, the draft, and the closing that
 * holds.
 *
 * THE ASSIGNMENT IS THE ENTIRE GATE. That is not provable by testing four
 * tiers, because a fifth would slip through. It is proved by counting the
 * TABLES the gate reads: if it never asks a subscription or a visibility
 * table anything, no plan can change its answer. It is also not gated on
 * having finished any template beside it, which is asserted directly, in
 * the source and at runtime.
 *
 * SIX TEMPLATES SHARE ONE TABLE AND MUST NOT SHARE A ROW. Every read here
 * is scoped by experience_key, so a member with all six Happiness
 * deep-dives assigned can never be shown one template's answers under
 * another template's questions. The six-way version of that proof lives in
 * its own describe block below and reads all six features at once.
 *
 * NO RENDER WRITES. This experience has a draft row, which is exactly the
 * situation where a render-time write creeps in. The write count is
 * asserted directly against the real service.
 *
 * THE SHELF SAVES AND RESUMES LIKE ANYTHING ELSE SHE WROTE. Two of the nine
 * questions leave no prose at all, so a resume that only restored writing
 * would drop a member who filled her whole shelf back at question two.
 *
 * THE CLOSING HOLDS. The bug this experience must not inherit lives in the
 * shape of the files rather than in any value, so it is asserted in the
 * source: the route never redirects a completed sitting, and the
 * pending-versus-completed branch is inside the mounted client component.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildWypdState } from '@/lib/what-you-put-down/service';
import { resolveWypdAccess } from '@/lib/what-you-put-down/access';
import { WYPD_DEFINITION_ID, WYPD_KEY } from '@/lib/what-you-put-down/constants';
import { BSN_DEFINITION_ID, BSN_KEY } from '@/lib/being-seen/constants';
import { TWOY_DEFINITION_ID, TWOY_KEY } from '@/lib/the-weight-of-yes/constants';
import { TGL_DEFINITION_ID, TGL_KEY } from '@/lib/the-giving-ledger/constants';
import { OYV_DEFINITION_ID, OYV_KEY } from '@/lib/owning-your-value/constants';
import { WYJL_DEFINITION_ID, WYJL_KEY } from '@/lib/where-your-joy-lives/constants';
import {
  WYPD_QUESTIONS,
  WYPD_CARDS_KEY,
  WYPD_CLOSING_KEY,
  WYPD_COLUMN_KEY,
  firstUnfinishedIndex,
  sanitizeWypdAnswers,
  sanitizeWypdDraft,
  wypdBlockedReasonFor,
  wypdSittingComplete,
  wypdWritesProse,
} from '@/lib/what-you-put-down/questions';
import { sanitizeWypdShelf, WYPD_EMPTY_SHELF } from '@/lib/what-you-put-down/shelf';

const APP_ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(APP_ROOT, rel), 'utf8');
const MIGRATIONS = path.resolve(APP_ROOT, '../../supabase/migrations');
const MIGRATION = path.join(MIGRATIONS, '00000000000217_what_you_put_down.sql');
const MEMBER = '66666666-6666-4666-8666-666666666666';

const CARD_LINES = 'danced on Sundays\nread two books a week\nsaid what I thought';

function fullAnswers(): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const question of WYPD_QUESTIONS) {
    if (!wypdWritesProse(question)) continue;
    answers[question.key] = `answer for ${question.key}`;
  }
  answers[WYPD_CARDS_KEY] = CARD_LINES;
  return answers;
}

function fullShelf() {
  return {
    placed: ['c0', 'c1', 'c2'],
    stingCardId: 'c1',
    distance: 72,
    liftedCardId: 'c2',
  };
}

type World = {
  /** null means "no pending assignment", 'error' means the read itself failed. */
  assignment: Record<string, unknown> | null | 'error';
  /** Rows on the shared Happiness table, for EVERY template. 'error' means the read failed. */
  sessions: Array<Record<string, unknown>> | 'error';
};

const world: World = { assignment: null, sessions: [] };

let reads: string[] = [];
let writes: string[] = [];
/** Every column filter applied to the shared Happiness table, so scoping is provable. */
let sessionFilters: Array<[string, unknown]> = [];

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    assignment_id: 'assignment-1',
    experience_key: WYPD_KEY,
    questions_version: 1,
    answers: fullAnswers(),
    doorway: 'answer for doorway',
    shelf_state: fullShelf(),
    started_at: '2026-09-07T10:00:00.000Z',
    completed_at: '2026-09-07T10:20:00.000Z',
    created_at: '2026-09-07T10:00:00.000Z',
    ...overrides,
  };
}

/** A completed sitting of one of the five templates that share this table. */
function otherTemplateRow(key: string) {
  return sessionRow({
    id: `other-${key}`,
    assignment_id: `assignment-${key}`,
    experience_key: key,
    doorway: null,
    shelf_state: null,
    completed_at: '2026-09-01T09:00:00.000Z',
  });
}

/**
 * A Supabase stand-in that honours the experience_key filter.
 *
 * That is the whole point on a template sharing a table with five others: a
 * fake that ignored the filter would let a test pass while the real code
 * handed a coach the wrong template's rows.
 */
function fakeClient() {
  const builder = (table: string): Record<string, unknown> => {
    const failed =
      (table === 'assessment_assignments' && world.assignment === 'error') ||
      (table === 'member_happiness_deep_dive_sessions' && world.sessions === 'error');

    let rows: Array<Record<string, unknown>> =
      table === 'assessment_assignments'
        ? world.assignment && world.assignment !== 'error'
          ? [world.assignment]
          : []
        : table === 'member_happiness_deep_dive_sessions'
          ? world.sessions === 'error'
            ? []
            : world.sessions
          : [];

    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'in', 'is', 'neq', 'gte', 'lte', 'order', 'limit', 'not']) {
      chain[method] = () => chain;
    }
    chain.eq = (column: string, value: unknown) => {
      if (table === 'member_happiness_deep_dive_sessions') {
        sessionFilters.push([column, value]);
        rows = rows.filter((row) => row[column] === undefined || row[column] === value);
      }
      return chain;
    };
    const result = () =>
      failed
        ? { data: null, error: { message: 'boom' }, count: 0 }
        : { data: rows, error: null, count: rows.length };
    chain.maybeSingle = async () =>
      failed ? { data: null, error: { message: 'boom' } } : { data: rows[0] ?? null, error: null };
    chain.single = chain.maybeSingle;
    chain.then = (resolve: (value: ReturnType<typeof result>) => unknown) =>
      Promise.resolve(result()).then(resolve);
    return chain;
  };

  return {
    from(table: string) {
      reads.push(table);
      return {
        ...builder(table),
        insert: () => {
          writes.push(`insert:${table}`);
          return builder(table);
        },
        upsert: async () => {
          writes.push(`upsert:${table}`);
          return { error: null };
        },
        update: () => {
          writes.push(`update:${table}`);
          return builder(table);
        },
        delete: () => {
          writes.push(`delete:${table}`);
          return builder(table);
        },
      };
    },
    async rpc(name: string) {
      reads.push(`rpc:${name}`);
      return { data: null, error: null };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const OPEN_ASSIGNMENT = {
  id: 'assignment-1',
  created_at: '2026-09-07T09:00:00.000Z',
  reason: null,
  due_at: '2026-09-14T00:00:00.000Z',
};

beforeEach(() => {
  world.assignment = null;
  world.sessions = [];
  reads = [];
  writes = [];
  sessionFilters = [];
});

describe('an unassigned member', () => {
  it('is offered nothing at all', async () => {
    expect(await buildWypdState(fakeClient(), MEMBER)).toBeNull();
  });

  it('and deciding that writes nothing', async () => {
    await buildWypdState(fakeClient(), MEMBER);
    expect(writes).toEqual([]);
    // It really did look, so "no writes" is not "did nothing".
    expect(reads).toContain('assessment_assignments');
  });

  it('is offered nothing even with all five earlier templates finished', async () => {
    world.sessions = [OYV_KEY, WYJL_KEY, TGL_KEY, TWOY_KEY, BSN_KEY].map(otherTemplateRow);
    expect(await buildWypdState(fakeClient(), MEMBER)).toBeNull();
  });
});

describe('the assignment is the entire gate', () => {
  it('an assigned member is offered it', async () => {
    world.assignment = OPEN_ASSIGNMENT;
    const state = await buildWypdState(fakeClient(), MEMBER);
    expect(state?.status).toBe('pending');
    expect(state?.status === 'pending' && state.assignmentId).toBe('assignment-1');
  });

  it('NO TIER OR VISIBILITY TABLE IS EVER CONSULTED, so no plan can change the answer', async () => {
    world.assignment = OPEN_ASSIGNMENT;
    await buildWypdState(fakeClient(), MEMBER);

    const assigned = [...reads];
    world.assignment = null;
    reads = [];
    await buildWypdState(fakeClient(), MEMBER);

    for (const table of [...assigned, ...reads]) {
      expect(table).not.toBe('member_subscriptions');
      expect(table).not.toBe('member_access_facts');
      expect(table).not.toBe('profiles');
      expect(table).not.toBe('member_visibility_rules');
    }
  });

  it('is NOT gated on having finished any template beside it', () => {
    // The gate is one file, and that file has never heard of any other
    // template.
    const source = read('lib/what-you-put-down/access.ts')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(source).not.toContain('BSN_');
    expect(source).not.toContain('TWOY_');
    expect(source).not.toContain('TGL_');
    expect(source).not.toContain('OYV_');
    expect(source).not.toContain('WYJL_');
    expect(source).not.toContain('followUp');
  });

  it('an assigned member with no earlier sitting is offered it exactly the same', async () => {
    world.assignment = OPEN_ASSIGNMENT;
    world.sessions = [];
    const noEarlier = await buildWypdState(fakeClient(), MEMBER);

    world.sessions = [otherTemplateRow(BSN_KEY)];
    const withEarlier = await buildWypdState(fakeClient(), MEMBER);

    expect(noEarlier?.status).toBe('pending');
    expect(withEarlier?.status).toBe('pending');
  });

  it('offering it, with a draft and a half-built shelf, still writes nothing', async () => {
    world.assignment = OPEN_ASSIGNMENT;
    world.sessions = [
      sessionRow({
        completed_at: null,
        doorway: null,
        answers: { [WYPD_CARDS_KEY]: CARD_LINES },
        shelf_state: { placed: ['c0'], stingCardId: null, distance: null, liftedCardId: null },
      }),
    ];
    const state = await buildWypdState(fakeClient(), MEMBER);
    expect(state?.status).toBe('pending');
    expect(state?.status === 'pending' && state.shelf.placed).toEqual(['c0']);
    expect(writes).toEqual([]);
  });

  it('addresses the one fixed catalog definition, and nothing else', () => {
    expect(WYPD_DEFINITION_ID).toBe('a8e6d403-2f19-4c57-b8d2-6e4a1f97c503');
    for (const other of [
      OYV_DEFINITION_ID,
      WYJL_DEFINITION_ID,
      TGL_DEFINITION_ID,
      TWOY_DEFINITION_ID,
      BSN_DEFINITION_ID,
    ]) {
      expect(WYPD_DEFINITION_ID).not.toBe(other);
    }
    const migration = readFileSync(MIGRATION, 'utf8');
    expect(migration).toContain(WYPD_DEFINITION_ID);
    expect(migration).toContain("'what-you-put-down'");
  });
});

describe('six templates, one table, never one row', () => {
  /** The six Happiness templates, each with the file that reads the shared table. */
  const FAMILY = [
    { key: OYV_KEY, id: OYV_DEFINITION_ID, data: 'lib/owning-your-value/data.ts' },
    { key: WYJL_KEY, id: WYJL_DEFINITION_ID, data: 'lib/where-your-joy-lives/data.ts' },
    { key: TGL_KEY, id: TGL_DEFINITION_ID, data: 'lib/the-giving-ledger/data.ts' },
    { key: TWOY_KEY, id: TWOY_DEFINITION_ID, data: 'lib/the-weight-of-yes/data.ts' },
    { key: BSN_KEY, id: BSN_DEFINITION_ID, data: 'lib/being-seen/data.ts' },
    { key: WYPD_KEY, id: WYPD_DEFINITION_ID, data: 'lib/what-you-put-down/data.ts' },
  ];

  it('the six keys and the six definition ids are all distinct', () => {
    expect(new Set(FAMILY.map((entry) => entry.key)).size).toBe(6);
    expect(new Set(FAMILY.map((entry) => entry.id)).size).toBe(6);
  });

  it('EVERY read of the shared table in EVERY template is scoped by experience_key', () => {
    for (const entry of FAMILY) {
      const source = read(entry.data)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      const statements = source.split('.from(HAPPINESS_DEEP_DIVE_TABLE)').slice(1);
      expect(statements.length).toBeGreaterThan(0);
      for (const statement of statements) {
        const head = statement.slice(0, statement.indexOf(';'));
        const scoped =
          /experience_key/.test(head) ||
          // An update or a delete addressed by primary key is scoped by the
          // row id itself, which was resolved by a scoped read above it.
          /\.eq\('id',/.test(head);
        expect(scoped, `${entry.data} has an unscoped read of the shared table`).toBe(true);
      }
    }
  });

  it('this template scopes its own reads at runtime, on both paths', async () => {
    world.assignment = OPEN_ASSIGNMENT;
    world.sessions = [sessionRow({ completed_at: null })];
    await buildWypdState(fakeClient(), MEMBER);

    expect(sessionFilters.length).toBeGreaterThan(0);
    expect(sessionFilters).toContainEqual(['experience_key', WYPD_KEY]);
    for (const other of [OYV_KEY, WYJL_KEY, TGL_KEY, TWOY_KEY, BSN_KEY]) {
      expect(sessionFilters).not.toContainEqual(['experience_key', other]);
    }

    // And the history read is scoped too, on the path that actually runs it.
    world.assignment = null;
    sessionFilters = [];
    world.sessions = [sessionRow()];
    await buildWypdState(fakeClient(), MEMBER);
    expect(sessionFilters).toContainEqual(['experience_key', WYPD_KEY]);
  });

  it("another template's finished sitting never leaks in as this one's draft or shelf", async () => {
    world.assignment = OPEN_ASSIGNMENT;
    world.sessions = [OYV_KEY, WYJL_KEY, TGL_KEY, TWOY_KEY, BSN_KEY].map(otherTemplateRow);
    const state = await buildWypdState(fakeClient(), MEMBER);
    expect(state?.status === 'pending' && state.draft).toEqual({});
    expect(state?.status === 'pending' && state.shelf).toEqual(WYPD_EMPTY_SHELF);
  });

  it('the migration pairs this key with this definition and leaves the other five standing', () => {
    const migration = readFileSync(MIGRATION, 'utf8');
    for (const entry of FAMILY) {
      expect(migration).toContain(`experience_key = '${entry.key}'`);
      expect(migration).toContain(entry.id);
      expect(migration).toContain(`when '${entry.key}' then`);
    }
  });

  it('each template stores its own question in its OWN column, never a shared one', () => {
    const migration = readFileSync(MIGRATION, 'utf8');
    expect(migration).toContain('doorway');
    expect(migration).toContain('shelf_state');
    for (const file of ['lib/what-you-put-down/data.ts', 'app/actions/whatYouPutDown.ts']) {
      expect(read(file)).not.toContain('held_sentence');
      expect(read(file)).not.toContain('twenty_minute_joy');
      expect(read(file)).not.toContain('deposit_request');
      expect(read(file)).not.toContain('kind_no');
      expect(read(file)).not.toContain('noticed_wish');
    }
    // And the five templates before it never learned about this one's columns.
    for (const file of [
      'lib/owning-your-value/data.ts',
      'lib/where-your-joy-lives/data.ts',
      'lib/the-giving-ledger/data.ts',
      'lib/the-weight-of-yes/data.ts',
      'lib/being-seen/data.ts',
      'app/actions/owningYourValue.ts',
      'app/actions/whereYourJoyLives.ts',
      'app/actions/theGivingLedger.ts',
      'app/actions/theWeightOfYes.ts',
      'app/actions/beingSeen.ts',
    ]) {
      expect(read(file), file).not.toContain('shelf_state');
      expect(read(file), file).not.toContain('doorway');
    }
  });

  it('the six pop-up keys cannot silence each other', () => {
    const data = read('lib/root-popup-messages/data.ts');
    expect(data).toContain('`owning_your_value:${assignmentId}`');
    expect(data).toContain('`where_your_joy_lives:${assignmentId}`');
    expect(data).toContain('`the_giving_ledger:${assignmentId}`');
    expect(data).toContain('`the_weight_of_yes:${assignmentId}`');
    expect(data).toContain('`being_seen:${assignmentId}`');
    expect(data).toContain('`what_you_put_down:${assignmentId}`');
  });

  it("a draft for this template drops the other five templates' own keys", () => {
    expect(
      sanitizeWypdDraft({
        [WYPD_CARDS_KEY]: 'mine',
        held_sentence: 'owning your value',
        twenty_minute_version: 'where your joy lives',
        deposit_to_ask_for: 'the giving ledger',
        kind_version: 'the weight of yes',
        wish_noticed: 'being seen',
        not_a_question: 'nothing',
      })
    ).toEqual({ [WYPD_CARDS_KEY]: 'mine' });
  });

  it('a draft never carries this template’s own two shelf questions as prose', () => {
    expect(
      sanitizeWypdDraft({ [WYPD_CARDS_KEY]: 'mine', the_shelf: 'x', still_has_a_pulse: 'y' })
    ).toEqual({ [WYPD_CARDS_KEY]: 'mine' });
  });
});

describe('the doorway and the shelf each have their own storage', () => {
  it('question eight is stored beside the answers rather than only inside them', () => {
    const migration = readFileSync(MIGRATION, 'utf8');
    expect(migration).toContain('add column if not exists doorway text');
    expect(read('lib/what-you-put-down/data.ts')).toContain('doorway: params.doorway');
    expect(read('app/actions/whatYouPutDown.ts')).toContain('WYPD_COLUMN_KEY');
    expect(WYPD_COLUMN_KEY).toBe('doorway');
  });

  it('the shelf is stored structured, in a column of its own', () => {
    const migration = readFileSync(MIGRATION, 'utf8');
    expect(migration).toContain('add column if not exists shelf_state jsonb');
    expect(read('lib/what-you-put-down/data.ts')).toContain('shelf_state: params.shelf');
  });
});

describe('the shelf can only ever hold words she wrote', () => {
  it('a card that is not one of her lines is refused, wherever it came from', () => {
    const shelf = sanitizeWypdShelf(
      {
        cards: [{ id: 'x', text: 'a sentence Root invented' }],
        placed: ['x', 'c0'],
        stingCardId: 'x',
        liftedCardId: 'x',
        distance: 40,
      },
      CARD_LINES
    );
    expect(shelf.cards.map((card) => card.text)).toEqual([
      'danced on Sundays',
      'read two books a week',
      'said what I thought',
    ]);
    expect(shelf.placed).toEqual(['c0']);
    expect(shelf.stingCardId).toBeNull();
    expect(shelf.liftedCardId).toBeNull();
  });

  it('a position off the line, or one that is not a number, is no position at all', () => {
    for (const bad of [-1, 101, Number.NaN, '50', null, undefined, {}]) {
      expect(sanitizeWypdShelf({ distance: bad }, CARD_LINES).distance, String(bad)).toBeNull();
    }
    expect(sanitizeWypdShelf({ distance: 0 }, CARD_LINES).distance).toBe(0);
    expect(sanitizeWypdShelf({ distance: 100 }, CARD_LINES).distance).toBe(100);
    expect(sanitizeWypdShelf({ distance: 61.4 }, CARD_LINES).distance).toBe(61);
  });

  it('a card cannot be shelved twice, however many times it is posted', () => {
    expect(sanitizeWypdShelf({ placed: ['c0', 'c0', 'c1'] }, CARD_LINES).placed).toEqual([
      'c0',
      'c1',
    ]);
  });

  it('the card that stings has to be one she actually shelved', () => {
    expect(
      sanitizeWypdShelf({ placed: ['c0'], stingCardId: 'c1' }, CARD_LINES).stingCardId
    ).toBeNull();
    expect(
      sanitizeWypdShelf({ placed: ['c0', 'c1'], stingCardId: 'c1' }, CARD_LINES).stingCardId
    ).toBe('c1');
  });

  it('nonsense in, empty shelf out, and never a thrown error', () => {
    for (const bad of [null, undefined, 'shelf', 7, []]) {
      expect(() => sanitizeWypdShelf(bad, CARD_LINES)).not.toThrow();
      expect(sanitizeWypdShelf(bad, CARD_LINES).placed).toEqual([]);
    }
  });

  it('the server rebuilds the cards rather than accepting them', () => {
    const action = read('app/actions/whatYouPutDown.ts');
    expect(action).toContain('sanitizeWypdShelf(shelf, clean[WYPD_CARDS_KEY]');
    // Both writes, not just one.
    expect((action.match(/sanitizeWypdShelf\(/g) ?? []).length).toBe(2);
  });
});

describe('a finished sitting', () => {
  it('is returned rather than nothing, so a member who comes back gets an answer', async () => {
    world.sessions = [sessionRow()];
    const state = await buildWypdState(fakeClient(), MEMBER);
    expect(state?.status).toBe('completed');
    expect(state?.status === 'completed' && state.session.doorway).toBe('answer for doorway');
    expect(state?.status === 'completed' && state.session.shelf.liftedCardId).toBe('c2');
  });

  it('a completed row never comes back as a resumable draft', async () => {
    world.assignment = OPEN_ASSIGNMENT;
    world.sessions = [sessionRow()];
    const state = await buildWypdState(fakeClient(), MEMBER);
    expect(state?.status === 'pending' && state.draft).toEqual({});
    expect(state?.status === 'pending' && state.shelf).toEqual(WYPD_EMPTY_SHELF);
  });
});

describe('both reads fail shut', () => {
  it('a broken assignment read offers nothing', async () => {
    world.assignment = 'error';
    expect(await buildWypdState(fakeClient(), MEMBER)).toBeNull();
  });

  it('a broken session read offers nothing', async () => {
    world.sessions = 'error';
    expect(await buildWypdState(fakeClient(), MEMBER)).toBeNull();
  });

  it('the rule itself resolves both failures to "none"', () => {
    expect(
      resolveWypdAccess({
        assignmentRead: { ok: false, assignment: null },
        sessionRead: { ok: true, records: [] },
      }).kind
    ).toBe('none');
    expect(
      resolveWypdAccess({
        assignmentRead: { ok: true, assignment: null },
        sessionRead: { ok: false, records: [] },
      }).kind
    ).toBe('none');
  });
});

describe('one rule, three surfaces', () => {
  const SURFACES = [
    'app/what-you-put-down/page.tsx',
    'app/dashboard/page.tsx',
    'app/actions/rootPopupMessages.ts',
  ];

  it('the route, the Home card and the pop-up chain all read the same accessor', () => {
    for (const surface of SURFACES) {
      expect(read(surface), surface).toContain('getMyWhatYouPutDown');
    }
  });

  it('none of the three adds a tier or visibility check of its own around it', () => {
    expect(read('app/dashboard/page.tsx')).toContain("{whatYouPutDown?.status === 'pending' && (");
    expect(read('app/actions/rootPopupMessages.ts')).toContain(
      "if (whatYouPutDown?.status === 'pending') {"
    );
  });

  it('the route turns a typed URL away server side rather than hiding the content', () => {
    const route = read('app/what-you-put-down/page.tsx');
    expect(route).toContain('const state = await getMyWhatYouPutDown();');
    expect(route).toContain("if (!state) redirect('/dashboard');");
  });

  it('the route is member only, so a coach following an old link lands on their own dashboard', () => {
    expect(read('lib/auth/staffRouting.ts')).toContain("'/what-you-put-down',");
  });

  it('the pop-up branch checks its own due-ness before returning a candidate', () => {
    const chain = read('app/actions/rootPopupMessages.ts');
    const branch = chain.slice(chain.indexOf("if (whatYouPutDown?.status === 'pending') {"));
    expect(branch.slice(0, 400)).toContain('if (await isRecurringMessageDue(messageKey)) {');
  });

  it('its knock is protected from the one-knock delay, like every other coach assignment', () => {
    expect(read('lib/root-popup-messages/oneKnock.ts')).toContain("'what_you_put_down_assigned'");
  });
});

describe('no render in this feature writes', () => {
  it('nothing on the read path calls insert, upsert or a save', () => {
    const readPath = [
      'lib/what-you-put-down/view.ts',
      'lib/what-you-put-down/service.ts',
      'lib/what-you-put-down/access.ts',
      'lib/what-you-put-down/shelf.ts',
      'app/what-you-put-down/page.tsx',
      'components/what-you-put-down/WhatYouPutDownEntry.tsx',
    ];
    for (const file of readPath) {
      const source = read(file)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect(source, file).not.toContain('.insert(');
      expect(source, file).not.toContain('.upsert(');
      expect(source, file).not.toContain('.update(');
      expect(source, file).not.toContain('saveWypdDraft');
      expect(source, file).not.toContain('completeWypdSession');
    }
  });

  it('the only writers are the server actions, and each is reached by a button', () => {
    const action = read('app/actions/whatYouPutDown.ts');
    expect(action).toContain('saveWypdDraft');
    expect(action).toContain('completeWypdSession');
    const experience = read('components/what-you-put-down/WhatYouPutDownExperience.tsx');
    expect(experience).toContain('await saveWhatYouPutDownDraftAction(draft, shelf)');
    expect(experience).toContain('await submitWhatYouPutDownAction(draft, shelf)');
  });
});

describe('the closing holds', () => {
  const route = () => read('app/what-you-put-down/page.tsx');
  const experience = () => read('components/what-you-put-down/WhatYouPutDownExperience.tsx');

  it('the route never sends a completed sitting anywhere else', () => {
    const source = route()
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(source.match(/redirect\(/g) ?? []).toHaveLength(2);
    expect(source).toContain("if (!state) redirect('/dashboard');");
    expect(source).not.toMatch(/completed[^\n]*redirect/);
  });

  it('the pending versus completed branch lives inside the mounted client component', () => {
    expect(experience()).toContain("if (status === 'completed' && !finished) {");
    expect(route()).toContain('status={state.status}');
    expect((route().match(/<WhatYouPutDownExperience/g) ?? []).length).toBe(1);
  });

  it('finishing revalidates Home only, never the route she is standing on', () => {
    const action = read('app/actions/whatYouPutDown.ts');
    expect(action).toContain("revalidatePath('/dashboard')");
    expect(action).not.toContain("revalidatePath('/what-you-put-down')");
  });

  it('saving a draft revalidates nothing at all', () => {
    const action = read('app/actions/whatYouPutDown.ts');
    const save = action.slice(
      action.indexOf('export async function saveWhatYouPutDownDraftAction'),
      action.indexOf('export type SubmitWypdResult')
    );
    expect(save).not.toContain('revalidatePath');
  });

  it('the closing screen is reached by state, never by a navigation', () => {
    const source = experience();
    expect(source).toContain('setStep(CLOSING_STEP)');
    expect(source).not.toMatch(/router\.push\((?!'\/dashboard'\))/);
  });
});

describe('save and resume, including the shelf', () => {
  it('a partial draft is storable and a partial sheet is never a completion', () => {
    const partial = { [WYPD_CARDS_KEY]: CARD_LINES };
    expect(sanitizeWypdDraft(partial)).toEqual(partial);
    expect(sanitizeWypdAnswers(partial)).toBeNull();
    expect(sanitizeWypdAnswers(fullAnswers())).toEqual(fullAnswers());
  });

  it('whitespace is not an answer', () => {
    expect(sanitizeWypdDraft({ [WYPD_CARDS_KEY]: '   ' })).toEqual({});
    expect(
      wypdBlockedReasonFor(WYPD_QUESTIONS[0]!, { [WYPD_CARDS_KEY]: '   ' }, WYPD_EMPTY_SHELF)
    ).not.toBeNull();
    expect(
      wypdBlockedReasonFor(WYPD_QUESTIONS[0]!, { [WYPD_CARDS_KEY]: 'x' }, WYPD_EMPTY_SHELF)
    ).toBeNull();
  });

  it('a full sheet of writing with an unfinished shelf is NOT a finished sitting', () => {
    const answers = fullAnswers();
    // Every card placed, the sting named, a position set, but nothing lifted.
    const shelf = sanitizeWypdShelf(
      { placed: ['c0', 'c1', 'c2'], stingCardId: 'c0', distance: 30, liftedCardId: null },
      CARD_LINES
    );
    expect(sanitizeWypdAnswers(answers)).not.toBeNull();
    expect(wypdSittingComplete(answers, shelf)).toBe(false);

    const whole = sanitizeWypdShelf(fullShelf(), CARD_LINES);
    expect(wypdSittingComplete(answers, whole)).toBe(true);
  });

  it('the server refuses that same half-finished sitting, not just the button', () => {
    const action = read('app/actions/whatYouPutDown.ts');
    expect(action).toContain('wypdSittingComplete(clean, cleanShelf)');
  });

  it('she comes back to the first question she has not finished, shelf included', () => {
    expect(firstUnfinishedIndex({}, WYPD_EMPTY_SHELF)).toBe(0);

    // Question one written, nothing shelved: back to question two.
    const afterOne = { [WYPD_CARDS_KEY]: CARD_LINES };
    expect(firstUnfinishedIndex(afterOne, sanitizeWypdShelf({}, CARD_LINES))).toBe(1);

    // The whole shelf filled and the sting named leaves no prose at all, and
    // she must still come back to question THREE rather than to question two.
    const shelved = sanitizeWypdShelf(
      { placed: ['c0', 'c1', 'c2'], stingCardId: 'c1' },
      CARD_LINES
    );
    expect(firstUnfinishedIndex(afterOne, shelved)).toBe(2);

    expect(firstUnfinishedIndex(fullAnswers(), sanitizeWypdShelf(fullShelf(), CARD_LINES))).toBe(
      WYPD_QUESTIONS.length
    );
  });

  it("question five needs both halves, and says which one is missing", () => {
    const slider = WYPD_QUESTIONS[4]!;
    const noMark = sanitizeWypdShelf({}, CARD_LINES);
    const marked = sanitizeWypdShelf({ distance: 80 }, CARD_LINES);
    expect(wypdBlockedReasonFor(slider, {}, noMark)).toBe('Place her on the line first.');
    expect(wypdBlockedReasonFor(slider, {}, marked)).toBe(
      'Write something here first. There is no wrong answer.'
    );
    expect(wypdBlockedReasonFor(slider, { why_there: 'because' }, marked)).toBeNull();
  });

  it('a sheet missing the closing answer is never a completion', () => {
    const missing = fullAnswers();
    delete missing[WYPD_CLOSING_KEY];
    expect(sanitizeWypdAnswers(missing)).toBeNull();
  });

  it('the saved draft carries the shelf as well as the writing', () => {
    const data = read('lib/what-you-put-down/data.ts');
    const save = data.slice(data.indexOf('export async function saveWypdDraft'));
    expect(save).toContain('shelf_state: params.shelf');
    // On both branches: the update of an existing draft row and the insert
    // of the first one.
    expect((save.slice(0, save.indexOf('export async function completeWypdSession')).match(/shelf_state: params\.shelf/g) ?? []).length).toBe(2);
  });
});

describe('the coach side', () => {
  it('names this experience on the assignment list rather than calling it Assessment', () => {
    const names = read('lib/assignments/experienceNames.ts');
    expect(names).toContain('WYPD_DEFINITION_ID');
    expect(names).toContain('WYPD_LABEL');
    expect(read('app/coach/clients/[id]/detail/page.tsx')).toContain('assignmentNameRecord()');
  });

  it('the panel shows the shelf, then question seven, then the written answers', () => {
    const full = read('app/coach/clients/[id]/WhatYouPutDownPanel.tsx');
    const panel = full.slice(full.indexOf('export function WhatYouPutDownPanel'));
    const shelfAt = panel.indexOf('<TheShelf');
    const openerAt = panel.indexOf('WYPD_COACH_COPY.openerHeading');
    const answersAt = panel.indexOf('WYPD_COACH_COPY.answersHeading');
    expect(shelfAt).toBeGreaterThan(-1);
    expect(openerAt).toBeGreaterThan(shelfAt);
    expect(answersAt).toBeGreaterThan(openerAt);
    expect(panel).toContain('liftedCardId');
    expect(panel).toContain('WYPD_QUESTIONS.filter');
  });

  it('the six cards all stand on the client screen, each with its own Assign button', () => {
    const detail = read('app/coach/clients/[id]/detail/page.tsx');
    for (const id of [
      'detail-card-owning-your-value',
      'detail-card-where-your-joy-lives',
      'detail-card-the-giving-ledger',
      'detail-card-the-weight-of-yes',
      'detail-card-being-seen',
      'detail-card-what-you-put-down',
    ]) {
      expect(detail, id).toContain(id);
    }
    const sections = read('lib/coach-detail/sections.ts');
    expect(sections).toContain("title: 'What You Put Down'");
  });

  it('the follow-up flag is null for this template, and no code path can set it', () => {
    for (const file of ['lib/what-you-put-down/data.ts', 'app/actions/whatYouPutDown.ts']) {
      const source = read(file)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect(source).not.toContain('follow_up_source_experience_key');
      expect(source).not.toContain('followUpSourceExperienceKey');
    }
  });

  it('the assign button sends a default due date seven days out', () => {
    const action = read('app/actions/whatYouPutDown.ts');
    expect(action).toContain('WYPD_DEFAULT_DUE_IN_DAYS');
    expect(action).toContain('dueAtInDays(');
    expect(read('lib/what-you-put-down/constants.ts')).toContain(
      'export const WYPD_DEFAULT_DUE_IN_DAYS = 7;'
    );
  });

  it('test accounts are excluded in the data layer, not by this screen remembering', () => {
    expect(read('app/actions/whatYouPutDown.ts')).toContain('isMemberVisibleToStaff');
  });
});
