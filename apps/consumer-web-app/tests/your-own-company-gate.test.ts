/**
 * Your Own Company: the gate, the picks, the draft, and the closing that
 * holds.
 *
 * THE ASSIGNMENT IS THE ENTIRE GATE. That is not provable by testing four
 * tiers, because a fifth would slip through. It is proved by counting the
 * TABLES the gate reads: if it never asks a subscription or a visibility
 * table anything, no plan can change its answer. It is also not gated on
 * having finished any template beside it, which is asserted directly, in
 * the source and at runtime.
 *
 * SEVEN TEMPLATES SHARE ONE TABLE AND MUST NOT SHARE A ROW. Every read here
 * is scoped by experience_key, so a member with all seven Happiness
 * deep-dives assigned can never be shown one template's answers under
 * another template's questions. The seven-way version of that proof lives
 * in its own describe block below and reads all seven features at once.
 *
 * NO RENDER WRITES. This experience has a draft row, which is exactly the
 * situation where a render-time write creeps in. The write count is
 * asserted directly against the real service.
 *
 * THE PICKS SAVE AND RESUME LIKE ANYTHING ELSE SHE WROTE. Five of the nine
 * questions open with something that leaves no prose at all, so a resume
 * that only restored writing would drop a member who had just answered a
 * whole rapid round back at the start of it.
 *
 * THE CLOSING HOLDS. The bug this experience must not inherit lives in the
 * shape of the files rather than in any value, so it is asserted in the
 * source: the route never redirects a completed sitting, and the
 * pending-versus-completed branch is inside the mounted client component.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildYocState } from '@/lib/your-own-company/service';
import { resolveYocAccess } from '@/lib/your-own-company/access';
import { YOC_DEFINITION_ID, YOC_KEY } from '@/lib/your-own-company/constants';
import { WYPD_DEFINITION_ID, WYPD_KEY } from '@/lib/what-you-put-down/constants';
import { BSN_DEFINITION_ID, BSN_KEY } from '@/lib/being-seen/constants';
import { TWOY_DEFINITION_ID, TWOY_KEY } from '@/lib/the-weight-of-yes/constants';
import { TGL_DEFINITION_ID, TGL_KEY } from '@/lib/the-giving-ledger/constants';
import { OYV_DEFINITION_ID, OYV_KEY } from '@/lib/owning-your-value/constants';
import { WYJL_DEFINITION_ID, WYJL_KEY } from '@/lib/where-your-joy-lives/constants';
import {
  YOC_QUESTIONS,
  YOC_LINES_KEY,
  YOC_CLOSING_KEY,
  YOC_COLUMN_KEY,
  YOC_RAPID_IDS,
  firstUnfinishedIndex,
  sanitizeYocAnswers,
  sanitizeYocDraft,
  sanitizeYocInstinctState,
  yocBlockedReasonFor,
  yocSittingComplete,
} from '@/lib/your-own-company/questions';
import { YOC_EMPTY_INSTINCT } from '@/lib/your-own-company/instinct';

const APP_ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(APP_ROOT, rel), 'utf8');
const MIGRATIONS = path.resolve(APP_ROOT, '../../supabase/migrations');
const MIGRATION = path.join(MIGRATIONS, '00000000000218_your_own_company.sql');
const MEMBER = '77777777-7777-4777-8777-777777777777';

const LINES = 'You should have known better\nYou are so behind\nEveryone can tell';

function fullAnswers(): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const question of YOC_QUESTIONS) {
    answers[question.key] = `answer for ${question.key}`;
  }
  answers[YOC_LINES_KEY] = LINES;
  return answers;
}

function fullInstinct() {
  const rapid: Record<string, 'a' | 'b'> = {};
  YOC_RAPID_IDS.forEach((id, index) => {
    rapid[id] = index === 0 ? 'a' : 'b';
  });
  return {
    picks: {
      first_inner_sentence: 'a' as const,
      whose_standards: 'b' as const,
      same_mistake_two_sentences: 'a' as const,
    },
    rapid,
    deepestCutLineId: 'l1',
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
    experience_key: YOC_KEY,
    questions_version: 1,
    answers: fullAnswers(),
    rewritten_line: 'answer for the_rewrite',
    instinct_state: fullInstinct(),
    started_at: '2026-09-07T10:00:00.000Z',
    completed_at: '2026-09-07T10:20:00.000Z',
    created_at: '2026-09-07T10:00:00.000Z',
    ...overrides,
  };
}

/** A completed sitting of one of the six templates that share this table. */
function otherTemplateRow(key: string) {
  return sessionRow({
    id: `other-${key}`,
    assignment_id: `assignment-${key}`,
    experience_key: key,
    rewritten_line: null,
    instinct_state: null,
    completed_at: '2026-09-01T09:00:00.000Z',
  });
}

/**
 * A Supabase stand-in that honours the experience_key filter.
 *
 * That is the whole point on a template sharing a table with six others: a
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
    expect(await buildYocState(fakeClient(), MEMBER)).toBeNull();
  });

  it('and deciding that writes nothing', async () => {
    await buildYocState(fakeClient(), MEMBER);
    expect(writes).toEqual([]);
    // It really did look, so "no writes" is not "did nothing".
    expect(reads).toContain('assessment_assignments');
  });

  it('is offered nothing even with all six earlier templates finished', async () => {
    world.sessions = [OYV_KEY, WYJL_KEY, TGL_KEY, TWOY_KEY, BSN_KEY, WYPD_KEY].map(
      otherTemplateRow
    );
    expect(await buildYocState(fakeClient(), MEMBER)).toBeNull();
  });
});

describe('the assignment is the entire gate', () => {
  it('an assigned member is offered it', async () => {
    world.assignment = OPEN_ASSIGNMENT;
    const state = await buildYocState(fakeClient(), MEMBER);
    expect(state?.status).toBe('pending');
    expect(state?.status === 'pending' && state.assignmentId).toBe('assignment-1');
  });

  it('NO TIER OR VISIBILITY TABLE IS EVER CONSULTED, so no plan can change the answer', async () => {
    world.assignment = OPEN_ASSIGNMENT;
    await buildYocState(fakeClient(), MEMBER);

    const assigned = [...reads];
    world.assignment = null;
    reads = [];
    await buildYocState(fakeClient(), MEMBER);

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
    const source = read('lib/your-own-company/access.ts')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(source).not.toContain('WYPD_');
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
    const noEarlier = await buildYocState(fakeClient(), MEMBER);

    world.sessions = [otherTemplateRow(WYPD_KEY)];
    const withEarlier = await buildYocState(fakeClient(), MEMBER);

    expect(noEarlier?.status).toBe('pending');
    expect(withEarlier?.status).toBe('pending');
  });

  it('offering it, with a draft and half a rapid round, still writes nothing', async () => {
    world.assignment = OPEN_ASSIGNMENT;
    world.sessions = [
      sessionRow({
        completed_at: null,
        rewritten_line: null,
        answers: { [YOC_LINES_KEY]: LINES },
        instinct_state: {
          picks: { whose_standards: 'a' },
          rapid: { known_better: 'b', always_do_this: 'b' },
          deepestCutLineId: null,
        },
      }),
    ];
    const state = await buildYocState(fakeClient(), MEMBER);
    expect(state?.status).toBe('pending');
    expect(state?.status === 'pending' && state.instinct.picks).toEqual({ whose_standards: 'a' });
    expect(state?.status === 'pending' && state.instinct.rapid).toEqual({
      known_better: 'b',
      always_do_this: 'b',
    });
    expect(writes).toEqual([]);
  });

  it('addresses the one fixed catalog definition, and nothing else', () => {
    expect(YOC_DEFINITION_ID).toBe('b7d2ef85-3c61-4a09-8d47-5f2b6e1c94a0');
    for (const other of [
      OYV_DEFINITION_ID,
      WYJL_DEFINITION_ID,
      TGL_DEFINITION_ID,
      TWOY_DEFINITION_ID,
      BSN_DEFINITION_ID,
      WYPD_DEFINITION_ID,
    ]) {
      expect(YOC_DEFINITION_ID).not.toBe(other);
    }
    const migration = readFileSync(MIGRATION, 'utf8');
    expect(migration).toContain(YOC_DEFINITION_ID);
    expect(migration).toContain("'your-own-company'");
  });
});

describe('seven templates, one table, never one row', () => {
  /** The seven Happiness templates, each with the file that reads the shared table. */
  const FAMILY = [
    { key: OYV_KEY, id: OYV_DEFINITION_ID, data: 'lib/owning-your-value/data.ts' },
    { key: WYJL_KEY, id: WYJL_DEFINITION_ID, data: 'lib/where-your-joy-lives/data.ts' },
    { key: TGL_KEY, id: TGL_DEFINITION_ID, data: 'lib/the-giving-ledger/data.ts' },
    { key: TWOY_KEY, id: TWOY_DEFINITION_ID, data: 'lib/the-weight-of-yes/data.ts' },
    { key: BSN_KEY, id: BSN_DEFINITION_ID, data: 'lib/being-seen/data.ts' },
    { key: WYPD_KEY, id: WYPD_DEFINITION_ID, data: 'lib/what-you-put-down/data.ts' },
    { key: YOC_KEY, id: YOC_DEFINITION_ID, data: 'lib/your-own-company/data.ts' },
  ];

  it('the seven keys and the seven definition ids are all distinct', () => {
    expect(new Set(FAMILY.map((entry) => entry.key)).size).toBe(7);
    expect(new Set(FAMILY.map((entry) => entry.id)).size).toBe(7);
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
    await buildYocState(fakeClient(), MEMBER);

    expect(sessionFilters.length).toBeGreaterThan(0);
    expect(sessionFilters).toContainEqual(['experience_key', YOC_KEY]);
    for (const other of [OYV_KEY, WYJL_KEY, TGL_KEY, TWOY_KEY, BSN_KEY, WYPD_KEY]) {
      expect(sessionFilters).not.toContainEqual(['experience_key', other]);
    }

    // And the history read is scoped too, on the path that actually runs it.
    world.assignment = null;
    sessionFilters = [];
    world.sessions = [sessionRow()];
    await buildYocState(fakeClient(), MEMBER);
    expect(sessionFilters).toContainEqual(['experience_key', YOC_KEY]);
  });

  it("another template's finished sitting never leaks in as this one's draft or picks", async () => {
    world.assignment = OPEN_ASSIGNMENT;
    world.sessions = [OYV_KEY, WYJL_KEY, TGL_KEY, TWOY_KEY, BSN_KEY, WYPD_KEY].map(
      otherTemplateRow
    );
    const state = await buildYocState(fakeClient(), MEMBER);
    expect(state?.status === 'pending' && state.draft).toEqual({});
    expect(state?.status === 'pending' && state.instinct).toEqual(YOC_EMPTY_INSTINCT);
  });

  it('the migration pairs this key with this definition and leaves the other six standing', () => {
    const migration = readFileSync(MIGRATION, 'utf8');
    for (const entry of FAMILY) {
      expect(migration).toContain(`experience_key = '${entry.key}'`);
      expect(migration).toContain(entry.id);
      expect(migration).toContain(`when '${entry.key}' then`);
    }
  });

  it('each template stores its own question in its OWN column, never a shared one', () => {
    const migration = readFileSync(MIGRATION, 'utf8');
    expect(migration).toContain('rewritten_line');
    expect(migration).toContain('instinct_state');
    for (const file of ['lib/your-own-company/data.ts', 'app/actions/yourOwnCompany.ts']) {
      expect(read(file)).not.toContain('held_sentence');
      expect(read(file)).not.toContain('twenty_minute_joy');
      expect(read(file)).not.toContain('deposit_request');
      expect(read(file)).not.toContain('kind_no');
      expect(read(file)).not.toContain('noticed_wish');
      expect(read(file)).not.toContain('shelf_state');
      expect(read(file)).not.toContain('doorway');
    }
    // And the six templates before it never learned about this one's columns.
    for (const file of [
      'lib/owning-your-value/data.ts',
      'lib/where-your-joy-lives/data.ts',
      'lib/the-giving-ledger/data.ts',
      'lib/the-weight-of-yes/data.ts',
      'lib/being-seen/data.ts',
      'lib/what-you-put-down/data.ts',
      'app/actions/owningYourValue.ts',
      'app/actions/whereYourJoyLives.ts',
      'app/actions/theGivingLedger.ts',
      'app/actions/theWeightOfYes.ts',
      'app/actions/beingSeen.ts',
      'app/actions/whatYouPutDown.ts',
    ]) {
      expect(read(file), file).not.toContain('instinct_state');
      expect(read(file), file).not.toContain('rewritten_line');
    }
  });

  it('the seven pop-up keys cannot silence each other', () => {
    const data = read('lib/root-popup-messages/data.ts');
    expect(data).toContain('`owning_your_value:${assignmentId}`');
    expect(data).toContain('`where_your_joy_lives:${assignmentId}`');
    expect(data).toContain('`the_giving_ledger:${assignmentId}`');
    expect(data).toContain('`the_weight_of_yes:${assignmentId}`');
    expect(data).toContain('`being_seen:${assignmentId}`');
    expect(data).toContain('`what_you_put_down:${assignmentId}`');
    expect(data).toContain('`your_own_company:${assignmentId}`');
  });

  it("a draft for this template drops the other six templates' own keys", () => {
    expect(
      sanitizeYocDraft({
        [YOC_LINES_KEY]: 'mine',
        held_sentence: 'owning your value',
        twenty_minute_version: 'where your joy lives',
        deposit_to_ask_for: 'the giving ledger',
        kind_version: 'the weight of yes',
        wish_noticed: 'being seen',
        used_to_be: 'what you put down',
        not_a_question: 'nothing',
      })
    ).toEqual({ [YOC_LINES_KEY]: 'mine' });
  });
});

describe('the rewrite and the picks each have their own storage', () => {
  it('question eight is stored beside the answers rather than only inside them', () => {
    const migration = readFileSync(MIGRATION, 'utf8');
    expect(migration).toContain('add column if not exists rewritten_line text');
    expect(read('lib/your-own-company/data.ts')).toContain(
      'rewritten_line: params.rewrittenLine'
    );
    expect(read('app/actions/yourOwnCompany.ts')).toContain('YOC_COLUMN_KEY');
    expect(YOC_COLUMN_KEY).toBe('the_rewrite');
  });

  it('the picks are stored structured, in a column of their own', () => {
    const migration = readFileSync(MIGRATION, 'utf8');
    expect(migration).toContain('add column if not exists instinct_state jsonb');
    expect(read('lib/your-own-company/data.ts')).toContain('instinct_state: params.instinct');
  });
});

describe('the picks can only ever point at things she chose', () => {
  it('a line that is not one of hers is refused, wherever it came from', () => {
    const state = sanitizeYocInstinctState(
      {
        lines: [{ id: 'x', text: 'a sentence Root invented' }],
        deepestCutLineId: 'x',
        picks: { whose_standards: 'a' },
      },
      LINES
    );
    expect(state.lines.map((line) => line.text)).toEqual([
      'You should have known better',
      'You are so behind',
      'Everyone can tell',
    ]);
    expect(state.deepestCutLineId).toBeNull();
  });

  it('a pick that is not one of the two sides is no pick at all', () => {
    for (const bad of ['c', 'A', 1, 0, true, null, {}, []]) {
      const state = sanitizeYocInstinctState({ picks: { whose_standards: bad } }, LINES);
      expect(state.picks, String(bad)).toEqual({});
    }
    expect(sanitizeYocInstinctState({ picks: { whose_standards: 'b' } }, LINES).picks).toEqual({
      whose_standards: 'b',
    });
  });

  it('nonsense in, empty picks out, and never a thrown error', () => {
    for (const bad of [null, undefined, 'state', 7, []]) {
      expect(() => sanitizeYocInstinctState(bad, LINES)).not.toThrow();
      expect(sanitizeYocInstinctState(bad, LINES).picks).toEqual({});
    }
  });

  it('the server rebuilds her lines rather than accepting them', () => {
    const action = read('app/actions/yourOwnCompany.ts');
    expect(action).toContain('sanitizeYocInstinctState(');
    // Both writes, not just one.
    expect((action.match(/sanitizeYocInstinctState\(/g) ?? []).length).toBe(2);
  });
});

describe('a finished sitting', () => {
  it('is returned rather than nothing, so a member who comes back gets an answer', async () => {
    world.sessions = [sessionRow()];
    const state = await buildYocState(fakeClient(), MEMBER);
    expect(state?.status).toBe('completed');
    expect(state?.status === 'completed' && state.session.rewrittenLine).toBe(
      'answer for the_rewrite'
    );
    expect(state?.status === 'completed' && state.session.instinct.deepestCutLineId).toBe('l1');
  });

  it('a completed row never comes back as a resumable draft', async () => {
    world.assignment = OPEN_ASSIGNMENT;
    world.sessions = [sessionRow()];
    const state = await buildYocState(fakeClient(), MEMBER);
    expect(state?.status === 'pending' && state.draft).toEqual({});
    expect(state?.status === 'pending' && state.instinct).toEqual(YOC_EMPTY_INSTINCT);
  });
});

describe('both reads fail shut', () => {
  it('a broken assignment read offers nothing', async () => {
    world.assignment = 'error';
    expect(await buildYocState(fakeClient(), MEMBER)).toBeNull();
  });

  it('a broken session read offers nothing', async () => {
    world.sessions = 'error';
    expect(await buildYocState(fakeClient(), MEMBER)).toBeNull();
  });

  it('the rule itself resolves both failures to "none"', () => {
    expect(
      resolveYocAccess({
        assignmentRead: { ok: false, assignment: null },
        sessionRead: { ok: true, records: [] },
      }).kind
    ).toBe('none');
    expect(
      resolveYocAccess({
        assignmentRead: { ok: true, assignment: null },
        sessionRead: { ok: false, records: [] },
      }).kind
    ).toBe('none');
  });
});

describe('one rule, three surfaces', () => {
  const SURFACES = [
    'app/your-own-company/page.tsx',
    'app/dashboard/page.tsx',
    'app/actions/rootPopupMessages.ts',
  ];

  it('the route, the Home card and the pop-up chain all read the same accessor', () => {
    for (const surface of SURFACES) {
      expect(read(surface), surface).toContain('getMyYourOwnCompany');
    }
  });

  it('none of the three adds a tier or visibility check of its own around it', () => {
    expect(read('app/dashboard/page.tsx')).toContain("{yourOwnCompany?.status === 'pending' && (");
    expect(read('app/actions/rootPopupMessages.ts')).toContain(
      "if (yourOwnCompany?.status === 'pending') {"
    );
  });

  it('the route turns a typed URL away server side rather than hiding the content', () => {
    const route = read('app/your-own-company/page.tsx');
    expect(route).toContain('const state = await getMyYourOwnCompany();');
    expect(route).toContain("if (!state) redirect('/dashboard');");
  });

  it('the route is member only, so a coach following an old link lands on their own dashboard', () => {
    expect(read('lib/auth/staffRouting.ts')).toContain("'/your-own-company',");
  });

  it('the pop-up branch checks its own due-ness before returning a candidate', () => {
    const chain = read('app/actions/rootPopupMessages.ts');
    const branch = chain.slice(chain.indexOf("if (yourOwnCompany?.status === 'pending') {"));
    expect(branch.slice(0, 400)).toContain('if (await isRecurringMessageDue(messageKey)) {');
  });

  it('its knock is protected from the one-knock delay, like every other coach assignment', () => {
    expect(read('lib/root-popup-messages/oneKnock.ts')).toContain("'your_own_company_assigned'");
  });
});

describe('no render in this feature writes', () => {
  it('nothing on the read path calls insert, upsert or a save', () => {
    const readPath = [
      'lib/your-own-company/view.ts',
      'lib/your-own-company/service.ts',
      'lib/your-own-company/access.ts',
      'lib/your-own-company/instinct.ts',
      'app/your-own-company/page.tsx',
      'components/your-own-company/YourOwnCompanyEntry.tsx',
    ];
    for (const file of readPath) {
      const source = read(file)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect(source, file).not.toContain('.insert(');
      expect(source, file).not.toContain('.upsert(');
      expect(source, file).not.toContain('.update(');
      expect(source, file).not.toContain('saveYocDraft');
      expect(source, file).not.toContain('completeYocSession');
    }
  });

  it('the only writers are the server actions, and each is reached by a button', () => {
    const action = read('app/actions/yourOwnCompany.ts');
    expect(action).toContain('saveYocDraft');
    expect(action).toContain('completeYocSession');
    const experience = read('components/your-own-company/YourOwnCompanyExperience.tsx');
    expect(experience).toContain('await saveYourOwnCompanyDraftAction(draft, instinct)');
    expect(experience).toContain('await submitYourOwnCompanyAction(draft, instinct)');
  });
});

describe('the closing holds', () => {
  const route = () => read('app/your-own-company/page.tsx');
  const experience = () => read('components/your-own-company/YourOwnCompanyExperience.tsx');

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
    expect((route().match(/<YourOwnCompanyExperience/g) ?? []).length).toBe(1);
  });

  it('finishing revalidates Home only, never the route she is standing on', () => {
    const action = read('app/actions/yourOwnCompany.ts');
    expect(action).toContain("revalidatePath('/dashboard')");
    expect(action).not.toContain("revalidatePath('/your-own-company')");
  });

  it('saving a draft revalidates nothing at all', () => {
    const action = read('app/actions/yourOwnCompany.ts');
    const save = action.slice(
      action.indexOf('export async function saveYourOwnCompanyDraftAction'),
      action.indexOf('export type SubmitYocResult')
    );
    expect(save).not.toContain('revalidatePath');
  });

  it('the closing screen is reached by state, never by a navigation', () => {
    const source = experience();
    expect(source).toContain('setStep(CLOSING_STEP)');
    expect(source).not.toMatch(/router\.push\((?!'\/dashboard'\))/);
  });
});

describe('save and resume, including the picks', () => {
  it('a partial draft is storable and a partial sheet is never a completion', () => {
    const partial = { [YOC_LINES_KEY]: LINES };
    expect(sanitizeYocDraft(partial)).toEqual(partial);
    expect(sanitizeYocAnswers(partial)).toBeNull();
    expect(sanitizeYocAnswers(fullAnswers())).toEqual(fullAnswers());
  });

  it('whitespace is not an answer', () => {
    expect(sanitizeYocDraft({ [YOC_LINES_KEY]: '   ' })).toEqual({});
    expect(
      yocBlockedReasonFor(YOC_QUESTIONS[2]!, { [YOC_LINES_KEY]: '   ' }, YOC_EMPTY_INSTINCT)
    ).not.toBeNull();
    expect(
      yocBlockedReasonFor(YOC_QUESTIONS[2]!, { [YOC_LINES_KEY]: 'x' }, YOC_EMPTY_INSTINCT)
    ).toBeNull();
  });

  it('a full sheet of writing with an unfinished round is NOT a finished sitting', () => {
    const answers = fullAnswers();
    const almost = sanitizeYocInstinctState(
      {
        ...fullInstinct(),
        // Four of the five phrases answered.
        rapid: Object.fromEntries(
          YOC_RAPID_IDS.slice(0, 4).map((id) => [id, 'b' as const])
        ),
      },
      LINES
    );
    expect(sanitizeYocAnswers(answers)).not.toBeNull();
    expect(yocSittingComplete(answers, almost)).toBe(false);

    const whole = sanitizeYocInstinctState(fullInstinct(), LINES);
    expect(yocSittingComplete(answers, whole)).toBe(true);
  });

  it('a full sheet with no pick on a this-or-that is NOT a finished sitting either', () => {
    const answers = fullAnswers();
    const missingPick = sanitizeYocInstinctState(
      { ...fullInstinct(), picks: { whose_standards: 'a' } },
      LINES
    );
    expect(yocSittingComplete(answers, missingPick)).toBe(false);
  });

  it('the server refuses that same half-finished sitting, not just the button', () => {
    const action = read('app/actions/yourOwnCompany.ts');
    expect(action).toContain('yocSittingComplete(clean, cleanInstinct)');
  });

  it('she comes back to the first question she has not finished, picks included', () => {
    expect(firstUnfinishedIndex({}, YOC_EMPTY_INSTINCT)).toBe(0);

    // Question one written but never picked: she is still on question one.
    const written = { first_inner_sentence: 'a sentence' };
    expect(firstUnfinishedIndex(written, YOC_EMPTY_INSTINCT)).toBe(0);

    // Picked and written: on to question two.
    const picked = sanitizeYocInstinctState({ picks: { first_inner_sentence: 'a' } }, '');
    expect(firstUnfinishedIndex(written, picked)).toBe(1);

    // A whole rapid round answered leaves no prose at all, and she must
    // still come back to question SIX rather than to the start of it.
    const throughFive: Record<string, string> = {};
    for (const question of YOC_QUESTIONS.slice(0, 5)) {
      throughFive[question.key] = `answer for ${question.key}`;
    }
    throughFive[YOC_LINES_KEY] = LINES;
    const roundDone = sanitizeYocInstinctState(
      {
        picks: {
          first_inner_sentence: 'a',
          whose_standards: 'b',
          same_mistake_two_sentences: 'a',
        },
        rapid: Object.fromEntries(YOC_RAPID_IDS.map((id) => [id, 'b' as const])),
      },
      LINES
    );
    expect(firstUnfinishedIndex(throughFive, roundDone)).toBe(5);

    expect(
      firstUnfinishedIndex(fullAnswers(), sanitizeYocInstinctState(fullInstinct(), LINES))
    ).toBe(YOC_QUESTIONS.length);
  });

  it('a question with two halves says which half is missing', () => {
    const pickQuestion = YOC_QUESTIONS[1]!;
    expect(yocBlockedReasonFor(pickQuestion, {}, YOC_EMPTY_INSTINCT)).toBe(
      'Tap the one that feels true first. You can change it.'
    );
    const picked = sanitizeYocInstinctState({ picks: { whose_standards: 'a' } }, '');
    expect(yocBlockedReasonFor(pickQuestion, {}, picked)).toBe(
      'Write something here first. There is no wrong answer.'
    );
    expect(yocBlockedReasonFor(pickQuestion, { whose_standards: 'because' }, picked)).toBeNull();
  });

  it('the round says how far through it she is, rather than "finish the round"', () => {
    const round = YOC_QUESTIONS[5]!;
    const three = sanitizeYocInstinctState(
      { rapid: Object.fromEntries(YOC_RAPID_IDS.slice(0, 3).map((id) => [id, 'a' as const])) },
      LINES
    );
    expect(yocBlockedReasonFor(round, {}, three)).toBe(
      'Answer all five first. You have done 3 of 5.'
    );
  });

  it('a sheet missing the closing answer is never a completion', () => {
    const missing = fullAnswers();
    delete missing[YOC_CLOSING_KEY];
    expect(sanitizeYocAnswers(missing)).toBeNull();
  });

  it('the saved draft carries the picks as well as the writing', () => {
    const data = read('lib/your-own-company/data.ts');
    const save = data.slice(data.indexOf('export async function saveYocDraft'));
    const upToComplete = save.slice(save.indexOf('export async function completeYocSession'));
    expect(save).toContain('instinct_state: params.instinct');
    // On both branches: the update of an existing draft row and the insert
    // of the first one.
    expect(
      (
        save
          .slice(0, save.length - upToComplete.length)
          .match(/instinct_state: params\.instinct/g) ?? []
      ).length
    ).toBe(2);
  });
});

describe('the coach side', () => {
  it('names this experience on the assignment list rather than calling it Assessment', () => {
    const names = read('lib/assignments/experienceNames.ts');
    expect(names).toContain('YOC_DEFINITION_ID');
    expect(names).toContain('YOC_LABEL');
    expect(read('app/coach/clients/[id]/detail/page.tsx')).toContain('assignmentNameRecord()');
  });

  it('the panel shows her lines, then the rewrite, then the picks, then the writing', () => {
    const full = read('app/coach/clients/[id]/YourOwnCompanyPanel.tsx');
    const panel = full.slice(full.indexOf('export function YourOwnCompanyPanel'));
    const linesAt = panel.indexOf('<TheLines');
    const rewriteAt = panel.indexOf('<TheRewrite');
    const picksAt = panel.indexOf('<ThePicks');
    const answersAt = panel.indexOf('YOC_COACH_COPY.answersHeading');
    expect(linesAt).toBeGreaterThan(-1);
    expect(rewriteAt).toBeGreaterThan(linesAt);
    expect(picksAt).toBeGreaterThan(rewriteAt);
    expect(answersAt).toBeGreaterThan(picksAt);
    expect(panel).toContain('deepestCutLineId');
    expect(panel).toContain('YOC_QUESTIONS.filter');
  });

  it('the seven cards all stand on the client screen, each with its own Assign button', () => {
    const detail = read('app/coach/clients/[id]/detail/page.tsx');
    for (const id of [
      'detail-card-owning-your-value',
      'detail-card-where-your-joy-lives',
      'detail-card-the-giving-ledger',
      'detail-card-the-weight-of-yes',
      'detail-card-being-seen',
      'detail-card-what-you-put-down',
      'detail-card-your-own-company',
    ]) {
      expect(detail, id).toContain(id);
    }
    const sections = read('lib/coach-detail/sections.ts');
    expect(sections).toContain("title: 'Your Own Company'");
  });

  it('the follow-up flag is null for this template, and no code path can set it', () => {
    for (const file of ['lib/your-own-company/data.ts', 'app/actions/yourOwnCompany.ts']) {
      const source = read(file)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect(source).not.toContain('follow_up_source_experience_key');
      expect(source).not.toContain('followUpSourceExperienceKey');
    }
  });

  it('the assign button sends a default due date seven days out', () => {
    const action = read('app/actions/yourOwnCompany.ts');
    expect(action).toContain('YOC_DEFAULT_DUE_IN_DAYS');
    expect(action).toContain('dueAtInDays(');
    expect(read('lib/your-own-company/constants.ts')).toContain(
      'export const YOC_DEFAULT_DUE_IN_DAYS = 7;'
    );
  });

  it('test accounts are excluded in the data layer, not by this screen remembering', () => {
    expect(read('app/actions/yourOwnCompany.ts')).toContain('isMemberVisibleToStaff');
  });
});
