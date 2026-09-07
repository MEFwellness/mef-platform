/**
 * The Weight of Yes: the gate, the draft, and the closing that holds.
 *
 * Four things are proved here, and each one is a rule that only means
 * something once the pieces are wired together.
 *
 * THE ASSIGNMENT IS THE ENTIRE GATE. That is not provable by testing four
 * tiers, because a fifth would slip through. It is proved by counting the
 * TABLES the gate reads: if it never asks a subscription or a visibility
 * table anything, no plan can change its answer. It is also not gated on
 * having finished any template beside it, which matters more on this
 * template than on any other, because this is the one that can FOLLOW one.
 * That is asserted directly, in the source and at runtime.
 *
 * FOUR TEMPLATES SHARE ONE TABLE AND MUST NOT SHARE A ROW. Every read here
 * is scoped by experience_key, so a member with all four Happiness
 * deep-dives assigned can never be shown one template's answers under
 * another template's questions. The four-way version of that proof lives in
 * its own describe block below and reads all four features at once.
 *
 * NO RENDER WRITES. This experience has a draft row AND a follow-up flag,
 * which is exactly the situation where a render-time write creeps in. The
 * write count is asserted directly against the real service, including on
 * the path where the follow-up is resolved.
 *
 * THE CLOSING HOLDS. The bug this experience must not inherit lives in the
 * shape of the files rather than in any value, so it is asserted in the
 * source: the route never redirects a completed sitting, and the
 * pending-versus-completed branch is inside the mounted client component.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildTwoyState } from '@/lib/the-weight-of-yes/service';
import { resolveTwoyAccess } from '@/lib/the-weight-of-yes/access';
import { TWOY_DEFINITION_ID, TWOY_KEY } from '@/lib/the-weight-of-yes/constants';
import { TGL_DEFINITION_ID, TGL_KEY } from '@/lib/the-giving-ledger/constants';
import { OYV_DEFINITION_ID, OYV_KEY } from '@/lib/owning-your-value/constants';
import { WYJL_DEFINITION_ID, WYJL_KEY } from '@/lib/where-your-joy-lives/constants';
import {
  TWOY_QUESTIONS,
  TWOY_CLOSING_KEY,
  TWOY_COLUMN_KEY,
  firstUnansweredIndex,
  sanitizeTwoyAnswers,
  sanitizeTwoyDraft,
  blockedReasonFor,
} from '@/lib/the-weight-of-yes/questions';

const APP_ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(APP_ROOT, rel), 'utf8');
const MIGRATIONS = path.resolve(APP_ROOT, '../../supabase/migrations');
const MIGRATION = path.join(MIGRATIONS, '00000000000214_the_weight_of_yes.sql');
const MEMBER = '55555555-5555-4555-8555-555555555555';

function fullAnswers(): Record<string, string> {
  return Object.fromEntries(
    TWOY_QUESTIONS.map((question, index) => [question.key, `answer ${index + 1}`])
  );
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
    experience_key: TWOY_KEY,
    questions_version: 1,
    answers: fullAnswers(),
    kind_no: 'answer 8',
    deposit_request: null,
    follow_up_source_experience_key: null,
    started_at: '2026-09-06T10:00:00.000Z',
    completed_at: '2026-09-06T10:20:00.000Z',
    created_at: '2026-09-06T10:00:00.000Z',
    ...overrides,
  };
}

/** A completed The Giving Ledger sitting on the same shared table. */
function givingLedgerRow(overrides: Record<string, unknown> = {}) {
  return sessionRow({
    id: 'tgl-1',
    assignment_id: 'assignment-tgl',
    experience_key: TGL_KEY,
    kind_no: null,
    deposit_request: 'an hour on Sunday morning to myself',
    completed_at: '2026-09-01T09:00:00.000Z',
    ...overrides,
  });
}

/**
 * A Supabase stand-in that honours the experience_key filter.
 *
 * That is the whole point on this template: the follow-up read and the
 * sitting read hit the SAME table with different keys, so a fake that
 * ignored the filter would let a test pass while the real code handed a
 * coach the wrong template's rows.
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
  created_at: '2026-09-06T09:00:00.000Z',
  reason: null,
  due_at: '2026-09-13T00:00:00.000Z',
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
    expect(await buildTwoyState(fakeClient(), MEMBER)).toBeNull();
  });

  it('and deciding that writes nothing', async () => {
    await buildTwoyState(fakeClient(), MEMBER);
    expect(writes).toEqual([]);
    // It really did look, so "no writes" is not "did nothing".
    expect(reads).toContain('assessment_assignments');
  });

  it('is offered nothing even with a completed earlier sitting standing', async () => {
    // The follow-up is a question's wording. It can never be a way in.
    world.sessions = [givingLedgerRow()];
    expect(await buildTwoyState(fakeClient(), MEMBER)).toBeNull();
  });
});

describe('the assignment is the entire gate', () => {
  it('an assigned member is offered it', async () => {
    world.assignment = OPEN_ASSIGNMENT;
    const state = await buildTwoyState(fakeClient(), MEMBER);
    expect(state?.status).toBe('pending');
    expect(state?.status === 'pending' && state.assignmentId).toBe('assignment-1');
  });

  it('NO TIER OR VISIBILITY TABLE IS EVER CONSULTED, so no plan can change the answer', async () => {
    world.assignment = OPEN_ASSIGNMENT;
    await buildTwoyState(fakeClient(), MEMBER);

    const assigned = [...reads];
    world.assignment = null;
    reads = [];
    await buildTwoyState(fakeClient(), MEMBER);

    for (const table of [...assigned, ...reads]) {
      expect(table).not.toBe('member_subscriptions');
      expect(table).not.toBe('member_access_facts');
      expect(table).not.toBe('profiles');
      expect(table).not.toBe('member_visibility_rules');
    }
  });

  it('is NOT gated on having finished any template beside it, including the one it can follow', () => {
    // The gate is one file, and that file has never heard of any other
    // template. The follow-up lives in ./followUp.ts and is resolved AFTER
    // the gate has already said yes.
    const source = read('lib/the-weight-of-yes/access.ts')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(source).not.toContain('TGL_');
    expect(source).not.toContain('OYV_');
    expect(source).not.toContain('WYJL_');
    expect(source).not.toContain('the-giving-ledger');
    expect(source).not.toContain('followUp');
  });

  it('an assigned member with no earlier sitting is offered it exactly the same', async () => {
    world.assignment = OPEN_ASSIGNMENT;
    world.sessions = [];
    const noEarlier = await buildTwoyState(fakeClient(), MEMBER);

    world.sessions = [givingLedgerRow()];
    const withEarlier = await buildTwoyState(fakeClient(), MEMBER);

    expect(noEarlier?.status).toBe('pending');
    expect(withEarlier?.status).toBe('pending');
    expect(noEarlier?.status === 'pending' && noEarlier.assignmentId).toBe(
      withEarlier?.status === 'pending' ? withEarlier.assignmentId : null
    );
  });

  it('offering it, with a draft already written, still writes nothing', async () => {
    world.assignment = OPEN_ASSIGNMENT;
    world.sessions = [
      sessionRow({
        completed_at: null,
        kind_no: null,
        answers: { automatic_yes: 'my sister asked me to host again' },
      }),
    ];
    const state = await buildTwoyState(fakeClient(), MEMBER);
    expect(state?.status).toBe('pending');
    expect(state?.status === 'pending' && state.draft).toEqual({
      automatic_yes: 'my sister asked me to host again',
    });
    expect(writes).toEqual([]);
  });

  it('addresses the one fixed catalog definition, and nothing else', () => {
    expect(TWOY_DEFINITION_ID).toBe('e2a8d16b-5c34-4f79-a0e5-3b7c9d248f16');
    expect(TWOY_DEFINITION_ID).not.toBe(OYV_DEFINITION_ID);
    expect(TWOY_DEFINITION_ID).not.toBe(WYJL_DEFINITION_ID);
    expect(TWOY_DEFINITION_ID).not.toBe(TGL_DEFINITION_ID);
    const migration = readFileSync(MIGRATION, 'utf8');
    expect(migration).toContain(TWOY_DEFINITION_ID);
    expect(migration).toContain("'the-weight-of-yes'");
  });
});

describe('four templates, one table, never one row', () => {
  /** The four Happiness templates, each with the file that reads the shared table. */
  const FAMILY = [
    { key: OYV_KEY, id: OYV_DEFINITION_ID, data: 'lib/owning-your-value/data.ts' },
    { key: WYJL_KEY, id: WYJL_DEFINITION_ID, data: 'lib/where-your-joy-lives/data.ts' },
    { key: TGL_KEY, id: TGL_DEFINITION_ID, data: 'lib/the-giving-ledger/data.ts' },
    { key: TWOY_KEY, id: TWOY_DEFINITION_ID, data: 'lib/the-weight-of-yes/data.ts' },
  ];

  it('the four keys and the four definition ids are all distinct', () => {
    expect(new Set(FAMILY.map((entry) => entry.key)).size).toBe(4);
    expect(new Set(FAMILY.map((entry) => entry.id)).size).toBe(4);
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
    await buildTwoyState(fakeClient(), MEMBER);

    expect(sessionFilters.length).toBeGreaterThan(0);
    expect(sessionFilters).toContainEqual(['experience_key', TWOY_KEY]);
    expect(sessionFilters).not.toContainEqual(['experience_key', OYV_KEY]);
    expect(sessionFilters).not.toContainEqual(['experience_key', WYJL_KEY]);

    // And the history read is scoped too, on the path that actually runs it.
    world.assignment = null;
    sessionFilters = [];
    world.sessions = [sessionRow()];
    await buildTwoyState(fakeClient(), MEMBER);
    expect(sessionFilters).toContainEqual(['experience_key', TWOY_KEY]);
  });

  it("the follow-up read is scoped to the OTHER template, and never mixes the two", async () => {
    // No sitting of her own yet, so the follow-up is resolved live: this is
    // the one render where both templates' rows are read in one pass.
    world.assignment = OPEN_ASSIGNMENT;
    world.sessions = [givingLedgerRow()];
    const state = await buildTwoyState(fakeClient(), MEMBER);

    // Both keys were used, each on its own read, and neither read was left
    // unscoped: a query with no experience_key would have returned rows
    // from both templates at once.
    expect(sessionFilters).toContainEqual(['experience_key', TWOY_KEY]);
    expect(sessionFilters).toContainEqual(['experience_key', TGL_KEY]);
    // And the earlier template's row never leaked in as her own draft.
    expect(state?.status === 'pending' && state.draft).toEqual({});
  });

  it('the migration pairs this key with this definition and leaves the other three standing', () => {
    const migration = readFileSync(MIGRATION, 'utf8');
    for (const entry of FAMILY) {
      expect(migration).toContain(`experience_key = '${entry.key}'`);
      expect(migration).toContain(entry.id);
      expect(migration).toContain(`when '${entry.key}' then`);
    }
  });

  it('each template stores its own question in its OWN column, never a shared one', () => {
    const migration = readFileSync(MIGRATION, 'utf8');
    expect(migration).toContain('kind_no');
    for (const file of ['lib/the-weight-of-yes/data.ts', 'app/actions/theWeightOfYes.ts']) {
      expect(read(file)).not.toContain('held_sentence');
      expect(read(file)).not.toContain('twenty_minute_joy');
    }
    // And the three templates before it never learned about this one's column.
    for (const file of [
      'lib/owning-your-value/data.ts',
      'lib/where-your-joy-lives/data.ts',
      'lib/the-giving-ledger/data.ts',
      'app/actions/owningYourValue.ts',
      'app/actions/whereYourJoyLives.ts',
      'app/actions/theGivingLedger.ts',
    ]) {
      expect(read(file)).not.toContain('kind_no');
    }
  });

  it('the four pop-up keys cannot silence each other', () => {
    const data = read('lib/root-popup-messages/data.ts');
    expect(data).toContain('`owning_your_value:${assignmentId}`');
    expect(data).toContain('`where_your_joy_lives:${assignmentId}`');
    expect(data).toContain('`the_giving_ledger:${assignmentId}`');
    expect(data).toContain('`the_weight_of_yes:${assignmentId}`');
  });

  it("a draft for this template drops the other three templates' own keys", () => {
    expect(
      sanitizeTwoyDraft({
        automatic_yes: 'mine',
        held_sentence: 'owning your value',
        twenty_minute_version: 'where your joy lives',
        deposit_to_ask_for: 'the giving ledger',
        not_a_question: 'nothing',
      })
    ).toEqual({ automatic_yes: 'mine' });
  });
});

describe('the kind version of her no has its own column', () => {
  it('question eight is stored beside the answers rather than only inside them', () => {
    const migration = readFileSync(MIGRATION, 'utf8');
    expect(migration).toContain('add column if not exists kind_no text');
    expect(read('lib/the-weight-of-yes/data.ts')).toContain('kind_no: params.kindNo');
    expect(read('app/actions/theWeightOfYes.ts')).toContain('TWOY_COLUMN_KEY');
    expect(TWOY_COLUMN_KEY).toBe('kind_version');
  });
});

describe('a finished sitting', () => {
  it('is returned rather than nothing, so a member who comes back gets an answer', async () => {
    world.sessions = [sessionRow()];
    const state = await buildTwoyState(fakeClient(), MEMBER);
    expect(state?.status).toBe('completed');
    expect(state?.status === 'completed' && state.session.kindNo).toBe('answer 8');
  });

  it('a completed row never comes back as a resumable draft', async () => {
    world.assignment = OPEN_ASSIGNMENT;
    world.sessions = [sessionRow()];
    const state = await buildTwoyState(fakeClient(), MEMBER);
    expect(state?.status === 'pending' && state.draft).toEqual({});
  });
});

describe('both reads fail shut', () => {
  it('a broken assignment read offers nothing', async () => {
    world.assignment = 'error';
    expect(await buildTwoyState(fakeClient(), MEMBER)).toBeNull();
  });

  it('a broken session read offers nothing', async () => {
    world.sessions = 'error';
    expect(await buildTwoyState(fakeClient(), MEMBER)).toBeNull();
  });

  it('the rule itself resolves both failures to "none"', () => {
    expect(
      resolveTwoyAccess({
        assignmentRead: { ok: false, assignment: null },
        sessionRead: { ok: true, records: [] },
      }).kind
    ).toBe('none');
    expect(
      resolveTwoyAccess({
        assignmentRead: { ok: true, assignment: null },
        sessionRead: { ok: false, records: [] },
      }).kind
    ).toBe('none');
  });
});

describe('one rule, three surfaces', () => {
  const SURFACES = [
    'app/the-weight-of-yes/page.tsx',
    'app/dashboard/page.tsx',
    'app/actions/rootPopupMessages.ts',
  ];

  it('the route, the Home card and the pop-up chain all read the same accessor', () => {
    for (const surface of SURFACES) {
      expect(read(surface)).toContain('getMyTheWeightOfYes');
    }
  });

  it('none of the three adds a tier or visibility check of its own around it', () => {
    expect(read('app/dashboard/page.tsx')).toContain("{theWeightOfYes?.status === 'pending' && (");
    expect(read('app/actions/rootPopupMessages.ts')).toContain(
      "if (theWeightOfYes?.status === 'pending') {"
    );
  });

  it('the route turns a typed URL away server side rather than hiding the content', () => {
    const route = read('app/the-weight-of-yes/page.tsx');
    expect(route).toContain('const state = await getMyTheWeightOfYes();');
    expect(route).toContain("if (!state) redirect('/dashboard');");
  });

  it('the route is member only, so a coach following an old link lands on their own dashboard', () => {
    expect(read('lib/auth/staffRouting.ts')).toContain("'/the-weight-of-yes',");
  });

  it('the pop-up branch checks its own due-ness before returning a candidate', () => {
    const chain = read('app/actions/rootPopupMessages.ts');
    const branch = chain.slice(chain.indexOf("if (theWeightOfYes?.status === 'pending') {"));
    expect(branch.slice(0, 400)).toContain('if (await isRecurringMessageDue(messageKey)) {');
  });

  it('its knock is protected from the one-knock delay, like every other coach assignment', () => {
    expect(read('lib/root-popup-messages/oneKnock.ts')).toContain("'the_weight_of_yes_assigned'");
  });
});

describe('no render in this feature writes', () => {
  it('nothing on the read path calls insert, upsert or a save', () => {
    const readPath = [
      'lib/the-weight-of-yes/view.ts',
      'lib/the-weight-of-yes/service.ts',
      'lib/the-weight-of-yes/access.ts',
      'lib/the-weight-of-yes/followUp.ts',
      'app/the-weight-of-yes/page.tsx',
      'components/the-weight-of-yes/TheWeightOfYesEntry.tsx',
    ];
    for (const file of readPath) {
      const source = read(file)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect(source).not.toContain('.insert(');
      expect(source).not.toContain('.upsert(');
      expect(source).not.toContain('.update(');
      expect(source).not.toContain('saveTwoyDraft');
      expect(source).not.toContain('completeTwoySession');
    }
  });

  it('resolving the follow-up on a render writes nothing either', async () => {
    // The riskiest render in this build: it reads another template's rows
    // and decides which question to show. It must still write nothing.
    world.assignment = OPEN_ASSIGNMENT;
    world.sessions = [givingLedgerRow()];
    const state = await buildTwoyState(fakeClient(), MEMBER);
    expect(state?.status === 'pending' && state.followUp).not.toBeNull();
    expect(writes).toEqual([]);
  });

  it('the only writers are the server actions, and each is reached by a button', () => {
    const action = read('app/actions/theWeightOfYes.ts');
    expect(action).toContain('saveTwoyDraft');
    expect(action).toContain('completeTwoySession');
    const experience = read('components/the-weight-of-yes/TheWeightOfYesExperience.tsx');
    expect(experience).toContain('await saveTheWeightOfYesDraftAction(draft)');
    expect(experience).toContain('await submitTheWeightOfYesAction(draft)');
  });
});

describe('the closing holds', () => {
  const route = () => read('app/the-weight-of-yes/page.tsx');
  const experience = () => read('components/the-weight-of-yes/TheWeightOfYesExperience.tsx');

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
    expect((route().match(/<TheWeightOfYesExperience/g) ?? []).length).toBe(1);
  });

  it('finishing revalidates Home only, never the route she is standing on', () => {
    const action = read('app/actions/theWeightOfYes.ts');
    expect(action).toContain("revalidatePath('/dashboard')");
    expect(action).not.toContain("revalidatePath('/the-weight-of-yes')");
  });

  it('saving a draft revalidates nothing at all', () => {
    const action = read('app/actions/theWeightOfYes.ts');
    const save = action.slice(
      action.indexOf('export async function saveTheWeightOfYesDraftAction'),
      action.indexOf('export type SubmitTwoyResult')
    );
    expect(save).not.toContain('revalidatePath');
  });

  it('the closing screen is reached by state, never by a navigation', () => {
    const source = experience();
    expect(source).toContain('setStep(CLOSING_STEP)');
    expect(source).not.toMatch(/router\.push\((?!'\/dashboard'\))/);
  });
});

describe('save and resume', () => {
  it('a partial draft is storable and a partial sheet is never a completion', () => {
    const partial = { automatic_yes: 'a', no_movie: 'b' };
    expect(sanitizeTwoyDraft(partial)).toEqual(partial);
    expect(sanitizeTwoyAnswers(partial)).toBeNull();
    expect(sanitizeTwoyAnswers(fullAnswers())).toEqual(fullAnswers());
  });

  it('whitespace is not an answer', () => {
    expect(sanitizeTwoyDraft({ automatic_yes: '   ' })).toEqual({});
    expect(blockedReasonFor('   ')).not.toBeNull();
    expect(blockedReasonFor('something')).toBeNull();
  });

  it('she comes back to the first question she has not answered', () => {
    expect(firstUnansweredIndex({})).toBe(0);
    expect(firstUnansweredIndex({ automatic_yes: 'a' })).toBe(1);
    expect(firstUnansweredIndex(fullAnswers())).toBe(TWOY_QUESTIONS.length);
  });

  it('a sheet missing the closing rewrite is never a completion', () => {
    const missing = fullAnswers();
    delete missing[TWOY_CLOSING_KEY];
    expect(sanitizeTwoyAnswers(missing)).toBeNull();
  });
});

describe('the coach side', () => {
  it('names this experience on the assignment list rather than calling it Assessment', () => {
    const names = read('lib/assignments/experienceNames.ts');
    expect(names).toContain('TWOY_DEFINITION_ID');
    expect(names).toContain('TWOY_LABEL');
    expect(read('app/coach/clients/[id]/detail/page.tsx')).toContain('assignmentNameRecord()');
  });

  it('the panel shows question seven first and then all nine answers', () => {
    const full = read('app/coach/clients/[id]/TheWeightOfYesPanel.tsx');
    const panel = full.slice(full.indexOf('export function TheWeightOfYesPanel'));
    const openerAt = panel.indexOf('TWOY_COACH_COPY.openerHeading');
    const answersAt = panel.indexOf('TWOY_COACH_COPY.answersHeading');
    expect(openerAt).toBeGreaterThan(-1);
    expect(answersAt).toBeGreaterThan(openerAt);
    expect(panel).toContain('selected.answers[TWOY_OPENER_KEY]');
    expect(panel).toContain('TWOY_QUESTIONS.filter');
  });

  it('the four cards all stand on the client screen, each with its own Assign button', () => {
    const detail = read('app/coach/clients/[id]/detail/page.tsx');
    for (const id of [
      'detail-card-owning-your-value',
      'detail-card-where-your-joy-lives',
      'detail-card-the-giving-ledger',
      'detail-card-the-weight-of-yes',
    ]) {
      expect(detail).toContain(id);
    }
    const sections = read('lib/coach-detail/sections.ts');
    expect(sections).toContain("title: 'The Weight of Yes'");
  });

  it('the assign button sends a default due date seven days out', () => {
    const action = read('app/actions/theWeightOfYes.ts');
    expect(action).toContain('TWOY_DEFAULT_DUE_IN_DAYS');
    expect(action).toContain('dueAtInDays(');
    expect(read('lib/the-weight-of-yes/constants.ts')).toContain(
      'export const TWOY_DEFAULT_DUE_IN_DAYS = 7;'
    );
  });

  it('test accounts are excluded in the data layer, not by this screen remembering', () => {
    expect(read('app/actions/theWeightOfYes.ts')).toContain('isMemberVisibleToStaff');
  });
});
