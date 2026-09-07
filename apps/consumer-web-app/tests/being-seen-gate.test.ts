/**
 * Being Seen: the gate, the draft, and the closing that holds.
 *
 * Four things are proved here, and each one is a rule that only means
 * something once the pieces are wired together.
 *
 * THE ASSIGNMENT IS THE ENTIRE GATE. That is not provable by testing four
 * tiers, because a fifth would slip through. It is proved by counting the
 * TABLES the gate reads: if it never asks a subscription or a visibility
 * table anything, no plan can change its answer. It is also not gated on
 * having finished any template beside it, which is asserted directly, in
 * the source and at runtime.
 *
 * FIVE TEMPLATES SHARE ONE TABLE AND MUST NOT SHARE A ROW. Every read here
 * is scoped by experience_key, so a member with all five Happiness
 * deep-dives assigned can never be shown one template's answers under
 * another template's questions. The five-way version of that proof lives in
 * its own describe block below and reads all five features at once.
 *
 * NO RENDER WRITES. This experience has a draft row, which is exactly the
 * situation where a render-time write creeps in. The write count is
 * asserted directly against the real service.
 *
 * THE CLOSING HOLDS. The bug this experience must not inherit lives in the
 * shape of the files rather than in any value, so it is asserted in the
 * source: the route never redirects a completed sitting, and the
 * pending-versus-completed branch is inside the mounted client component.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildBsnState } from '@/lib/being-seen/service';
import { resolveBsnAccess } from '@/lib/being-seen/access';
import { BSN_DEFINITION_ID, BSN_KEY } from '@/lib/being-seen/constants';
import { TWOY_DEFINITION_ID, TWOY_KEY } from '@/lib/the-weight-of-yes/constants';
import { TGL_DEFINITION_ID, TGL_KEY } from '@/lib/the-giving-ledger/constants';
import { OYV_DEFINITION_ID, OYV_KEY } from '@/lib/owning-your-value/constants';
import { WYJL_DEFINITION_ID, WYJL_KEY } from '@/lib/where-your-joy-lives/constants';
import {
  BSN_QUESTIONS,
  BSN_CLOSING_KEY,
  BSN_COLUMN_KEY,
  firstUnansweredIndex,
  sanitizeBsnAnswers,
  sanitizeBsnDraft,
  blockedReasonFor,
} from '@/lib/being-seen/questions';

const APP_ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(APP_ROOT, rel), 'utf8');
const MIGRATIONS = path.resolve(APP_ROOT, '../../supabase/migrations');
const MIGRATION = path.join(MIGRATIONS, '00000000000215_being_seen.sql');
const MEMBER = '55555555-5555-4555-8555-555555555555';

function fullAnswers(): Record<string, string> {
  return Object.fromEntries(
    BSN_QUESTIONS.map((question, index) => [question.key, `answer ${index + 1}`])
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
    experience_key: BSN_KEY,
    questions_version: 1,
    answers: fullAnswers(),
    noticed_wish: 'answer 9',
    started_at: '2026-09-07T10:00:00.000Z',
    completed_at: '2026-09-07T10:20:00.000Z',
    created_at: '2026-09-07T10:00:00.000Z',
    ...overrides,
  };
}

/** A completed sitting of one of the four templates that share this table. */
function otherTemplateRow(key: string) {
  return sessionRow({
    id: `other-${key}`,
    assignment_id: `assignment-${key}`,
    experience_key: key,
    noticed_wish: null,
    completed_at: '2026-09-01T09:00:00.000Z',
  });
}

/**
 * A Supabase stand-in that honours the experience_key filter.
 *
 * That is the whole point on a template sharing a table with four others: a
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
    expect(await buildBsnState(fakeClient(), MEMBER)).toBeNull();
  });

  it('and deciding that writes nothing', async () => {
    await buildBsnState(fakeClient(), MEMBER);
    expect(writes).toEqual([]);
    // It really did look, so "no writes" is not "did nothing".
    expect(reads).toContain('assessment_assignments');
  });

  it('is offered nothing even with all four earlier templates finished', async () => {
    world.sessions = [OYV_KEY, WYJL_KEY, TGL_KEY, TWOY_KEY].map(otherTemplateRow);
    expect(await buildBsnState(fakeClient(), MEMBER)).toBeNull();
  });
});

describe('the assignment is the entire gate', () => {
  it('an assigned member is offered it', async () => {
    world.assignment = OPEN_ASSIGNMENT;
    const state = await buildBsnState(fakeClient(), MEMBER);
    expect(state?.status).toBe('pending');
    expect(state?.status === 'pending' && state.assignmentId).toBe('assignment-1');
  });

  it('NO TIER OR VISIBILITY TABLE IS EVER CONSULTED, so no plan can change the answer', async () => {
    world.assignment = OPEN_ASSIGNMENT;
    await buildBsnState(fakeClient(), MEMBER);

    const assigned = [...reads];
    world.assignment = null;
    reads = [];
    await buildBsnState(fakeClient(), MEMBER);

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
    const source = read('lib/being-seen/access.ts')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(source).not.toContain('TWOY_');
    expect(source).not.toContain('TGL_');
    expect(source).not.toContain('OYV_');
    expect(source).not.toContain('WYJL_');
    expect(source).not.toContain('followUp');
  });

  it('an assigned member with no earlier sitting is offered it exactly the same', async () => {
    world.assignment = OPEN_ASSIGNMENT;
    world.sessions = [];
    const noEarlier = await buildBsnState(fakeClient(), MEMBER);

    world.sessions = [otherTemplateRow(TWOY_KEY)];
    const withEarlier = await buildBsnState(fakeClient(), MEMBER);

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
        noticed_wish: null,
        answers: { unnoticed_until_it_stops: 'the school run' },
      }),
    ];
    const state = await buildBsnState(fakeClient(), MEMBER);
    expect(state?.status).toBe('pending');
    expect(state?.status === 'pending' && state.draft).toEqual({
      unnoticed_until_it_stops: 'the school run',
    });
    expect(writes).toEqual([]);
  });

  it('addresses the one fixed catalog definition, and nothing else', () => {
    expect(BSN_DEFINITION_ID).toBe('f5c3b921-6d47-4a8e-9b12-7e0a4c85d3f6');
    expect(BSN_DEFINITION_ID).not.toBe(OYV_DEFINITION_ID);
    expect(BSN_DEFINITION_ID).not.toBe(WYJL_DEFINITION_ID);
    expect(BSN_DEFINITION_ID).not.toBe(TGL_DEFINITION_ID);
    expect(BSN_DEFINITION_ID).not.toBe(TWOY_DEFINITION_ID);
    const migration = readFileSync(MIGRATION, 'utf8');
    expect(migration).toContain(BSN_DEFINITION_ID);
    expect(migration).toContain("'being-seen'");
  });
});

describe('five templates, one table, never one row', () => {
  /** The five Happiness templates, each with the file that reads the shared table. */
  const FAMILY = [
    { key: OYV_KEY, id: OYV_DEFINITION_ID, data: 'lib/owning-your-value/data.ts' },
    { key: WYJL_KEY, id: WYJL_DEFINITION_ID, data: 'lib/where-your-joy-lives/data.ts' },
    { key: TGL_KEY, id: TGL_DEFINITION_ID, data: 'lib/the-giving-ledger/data.ts' },
    { key: TWOY_KEY, id: TWOY_DEFINITION_ID, data: 'lib/the-weight-of-yes/data.ts' },
    { key: BSN_KEY, id: BSN_DEFINITION_ID, data: 'lib/being-seen/data.ts' },
  ];

  it('the five keys and the five definition ids are all distinct', () => {
    expect(new Set(FAMILY.map((entry) => entry.key)).size).toBe(5);
    expect(new Set(FAMILY.map((entry) => entry.id)).size).toBe(5);
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
    await buildBsnState(fakeClient(), MEMBER);

    expect(sessionFilters.length).toBeGreaterThan(0);
    expect(sessionFilters).toContainEqual(['experience_key', BSN_KEY]);
    for (const other of [OYV_KEY, WYJL_KEY, TGL_KEY, TWOY_KEY]) {
      expect(sessionFilters).not.toContainEqual(['experience_key', other]);
    }

    // And the history read is scoped too, on the path that actually runs it.
    world.assignment = null;
    sessionFilters = [];
    world.sessions = [sessionRow()];
    await buildBsnState(fakeClient(), MEMBER);
    expect(sessionFilters).toContainEqual(['experience_key', BSN_KEY]);
  });

  it("another template's finished sitting never leaks in as this one's draft", async () => {
    world.assignment = OPEN_ASSIGNMENT;
    world.sessions = [OYV_KEY, WYJL_KEY, TGL_KEY, TWOY_KEY].map(otherTemplateRow);
    const state = await buildBsnState(fakeClient(), MEMBER);
    expect(state?.status === 'pending' && state.draft).toEqual({});
  });

  it('the migration pairs this key with this definition and leaves the other four standing', () => {
    const migration = readFileSync(MIGRATION, 'utf8');
    for (const entry of FAMILY) {
      expect(migration).toContain(`experience_key = '${entry.key}'`);
      expect(migration).toContain(entry.id);
      expect(migration).toContain(`when '${entry.key}' then`);
    }
  });

  it('each template stores its own question in its OWN column, never a shared one', () => {
    const migration = readFileSync(MIGRATION, 'utf8');
    expect(migration).toContain('noticed_wish');
    for (const file of ['lib/being-seen/data.ts', 'app/actions/beingSeen.ts']) {
      expect(read(file)).not.toContain('held_sentence');
      expect(read(file)).not.toContain('twenty_minute_joy');
      expect(read(file)).not.toContain('deposit_request');
      expect(read(file)).not.toContain('kind_no');
    }
    // And the four templates before it never learned about this one's column.
    for (const file of [
      'lib/owning-your-value/data.ts',
      'lib/where-your-joy-lives/data.ts',
      'lib/the-giving-ledger/data.ts',
      'lib/the-weight-of-yes/data.ts',
      'app/actions/owningYourValue.ts',
      'app/actions/whereYourJoyLives.ts',
      'app/actions/theGivingLedger.ts',
      'app/actions/theWeightOfYes.ts',
    ]) {
      expect(read(file)).not.toContain('noticed_wish');
    }
  });

  it('the five pop-up keys cannot silence each other', () => {
    const data = read('lib/root-popup-messages/data.ts');
    expect(data).toContain('`owning_your_value:${assignmentId}`');
    expect(data).toContain('`where_your_joy_lives:${assignmentId}`');
    expect(data).toContain('`the_giving_ledger:${assignmentId}`');
    expect(data).toContain('`the_weight_of_yes:${assignmentId}`');
    expect(data).toContain('`being_seen:${assignmentId}`');
  });

  it("a draft for this template drops the other four templates' own keys", () => {
    expect(
      sanitizeBsnDraft({
        unnoticed_until_it_stops: 'mine',
        held_sentence: 'owning your value',
        twenty_minute_version: 'where your joy lives',
        deposit_to_ask_for: 'the giving ledger',
        kind_version: 'the weight of yes',
        not_a_question: 'nothing',
      })
    ).toEqual({ unnoticed_until_it_stops: 'mine' });
  });
});

describe('the thing she wishes someone would notice has its own column', () => {
  it('question nine is stored beside the answers rather than only inside them', () => {
    const migration = readFileSync(MIGRATION, 'utf8');
    expect(migration).toContain('add column if not exists noticed_wish text');
    expect(read('lib/being-seen/data.ts')).toContain('noticed_wish: params.noticedWish');
    expect(read('app/actions/beingSeen.ts')).toContain('BSN_COLUMN_KEY');
    expect(BSN_COLUMN_KEY).toBe('wish_noticed');
  });
});

describe('a finished sitting', () => {
  it('is returned rather than nothing, so a member who comes back gets an answer', async () => {
    world.sessions = [sessionRow()];
    const state = await buildBsnState(fakeClient(), MEMBER);
    expect(state?.status).toBe('completed');
    expect(state?.status === 'completed' && state.session.noticedWish).toBe('answer 9');
  });

  it('a completed row never comes back as a resumable draft', async () => {
    world.assignment = OPEN_ASSIGNMENT;
    world.sessions = [sessionRow()];
    const state = await buildBsnState(fakeClient(), MEMBER);
    expect(state?.status === 'pending' && state.draft).toEqual({});
  });
});

describe('both reads fail shut', () => {
  it('a broken assignment read offers nothing', async () => {
    world.assignment = 'error';
    expect(await buildBsnState(fakeClient(), MEMBER)).toBeNull();
  });

  it('a broken session read offers nothing', async () => {
    world.sessions = 'error';
    expect(await buildBsnState(fakeClient(), MEMBER)).toBeNull();
  });

  it('the rule itself resolves both failures to "none"', () => {
    expect(
      resolveBsnAccess({
        assignmentRead: { ok: false, assignment: null },
        sessionRead: { ok: true, records: [] },
      }).kind
    ).toBe('none');
    expect(
      resolveBsnAccess({
        assignmentRead: { ok: true, assignment: null },
        sessionRead: { ok: false, records: [] },
      }).kind
    ).toBe('none');
  });
});

describe('one rule, three surfaces', () => {
  const SURFACES = [
    'app/being-seen/page.tsx',
    'app/dashboard/page.tsx',
    'app/actions/rootPopupMessages.ts',
  ];

  it('the route, the Home card and the pop-up chain all read the same accessor', () => {
    for (const surface of SURFACES) {
      expect(read(surface)).toContain('getMyBeingSeen');
    }
  });

  it('none of the three adds a tier or visibility check of its own around it', () => {
    expect(read('app/dashboard/page.tsx')).toContain("{beingSeen?.status === 'pending' && (");
    expect(read('app/actions/rootPopupMessages.ts')).toContain(
      "if (beingSeen?.status === 'pending') {"
    );
  });

  it('the route turns a typed URL away server side rather than hiding the content', () => {
    const route = read('app/being-seen/page.tsx');
    expect(route).toContain('const state = await getMyBeingSeen();');
    expect(route).toContain("if (!state) redirect('/dashboard');");
  });

  it('the route is member only, so a coach following an old link lands on their own dashboard', () => {
    expect(read('lib/auth/staffRouting.ts')).toContain("'/being-seen',");
  });

  it('the pop-up branch checks its own due-ness before returning a candidate', () => {
    const chain = read('app/actions/rootPopupMessages.ts');
    const branch = chain.slice(chain.indexOf("if (beingSeen?.status === 'pending') {"));
    expect(branch.slice(0, 400)).toContain('if (await isRecurringMessageDue(messageKey)) {');
  });

  it('its knock is protected from the one-knock delay, like every other coach assignment', () => {
    expect(read('lib/root-popup-messages/oneKnock.ts')).toContain("'being_seen_assigned'");
  });
});

describe('no render in this feature writes', () => {
  it('nothing on the read path calls insert, upsert or a save', () => {
    const readPath = [
      'lib/being-seen/view.ts',
      'lib/being-seen/service.ts',
      'lib/being-seen/access.ts',
      'app/being-seen/page.tsx',
      'components/being-seen/BeingSeenEntry.tsx',
    ];
    for (const file of readPath) {
      const source = read(file)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect(source).not.toContain('.insert(');
      expect(source).not.toContain('.upsert(');
      expect(source).not.toContain('.update(');
      expect(source).not.toContain('saveBsnDraft');
      expect(source).not.toContain('completeBsnSession');
    }
  });

  it('the only writers are the server actions, and each is reached by a button', () => {
    const action = read('app/actions/beingSeen.ts');
    expect(action).toContain('saveBsnDraft');
    expect(action).toContain('completeBsnSession');
    const experience = read('components/being-seen/BeingSeenExperience.tsx');
    expect(experience).toContain('await saveBeingSeenDraftAction(draft)');
    expect(experience).toContain('await submitBeingSeenAction(draft)');
  });
});

describe('the closing holds', () => {
  const route = () => read('app/being-seen/page.tsx');
  const experience = () => read('components/being-seen/BeingSeenExperience.tsx');

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
    expect((route().match(/<BeingSeenExperience/g) ?? []).length).toBe(1);
  });

  it('finishing revalidates Home only, never the route she is standing on', () => {
    const action = read('app/actions/beingSeen.ts');
    expect(action).toContain("revalidatePath('/dashboard')");
    expect(action).not.toContain("revalidatePath('/being-seen')");
  });

  it('saving a draft revalidates nothing at all', () => {
    const action = read('app/actions/beingSeen.ts');
    const save = action.slice(
      action.indexOf('export async function saveBeingSeenDraftAction'),
      action.indexOf('export type SubmitBsnResult')
    );
    expect(save).not.toContain('revalidatePath');
  });

  it('the closing screen is reached by state, never by a navigation', () => {
    const source = experience();
    expect(source).toContain('setStep(CLOSING_STEP)');
    expect(source).not.toMatch(/router\.push\((?!'\/dashboard'\))/);
  });

  it('the staged arrival is a reveal inside that screen, never a step that advances past it', () => {
    // The treatment must not become a second way off the closing. It
    // mounts content and nothing else: no navigation, no step change and no
    // auto-advance anywhere in the shared centerpiece.
    const centerpiece = read('components/happiness-deep-dive/ClosingCenterpiece.tsx')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(centerpiece).not.toContain('router');
    expect(centerpiece).not.toContain('setStep');
    expect(centerpiece).not.toContain('redirect');
    expect(centerpiece).not.toContain('onDone');
  });
});

describe('save and resume', () => {
  it('a partial draft is storable and a partial sheet is never a completion', () => {
    const partial = { unnoticed_until_it_stops: 'a', never_asked_about: 'b' };
    expect(sanitizeBsnDraft(partial)).toEqual(partial);
    expect(sanitizeBsnAnswers(partial)).toBeNull();
    expect(sanitizeBsnAnswers(fullAnswers())).toEqual(fullAnswers());
  });

  it('whitespace is not an answer', () => {
    expect(sanitizeBsnDraft({ unnoticed_until_it_stops: '   ' })).toEqual({});
    expect(blockedReasonFor('   ')).not.toBeNull();
    expect(blockedReasonFor('something')).toBeNull();
  });

  it('she comes back to the first question she has not answered', () => {
    expect(firstUnansweredIndex({})).toBe(0);
    expect(firstUnansweredIndex({ unnoticed_until_it_stops: 'a' })).toBe(1);
    expect(firstUnansweredIndex(fullAnswers())).toBe(BSN_QUESTIONS.length);
  });

  it('a sheet missing the closing answer is never a completion', () => {
    const missing = fullAnswers();
    delete missing[BSN_CLOSING_KEY];
    expect(sanitizeBsnAnswers(missing)).toBeNull();
  });
});

describe('the coach side', () => {
  it('names this experience on the assignment list rather than calling it Assessment', () => {
    const names = read('lib/assignments/experienceNames.ts');
    expect(names).toContain('BSN_DEFINITION_ID');
    expect(names).toContain('BSN_LABEL');
    expect(read('app/coach/clients/[id]/detail/page.tsx')).toContain('assignmentNameRecord()');
  });

  it('the panel shows question nine first and then all nine answers', () => {
    const full = read('app/coach/clients/[id]/BeingSeenPanel.tsx');
    const panel = full.slice(full.indexOf('export function BeingSeenPanel'));
    const openerAt = panel.indexOf('BSN_COACH_COPY.openerHeading');
    const answersAt = panel.indexOf('BSN_COACH_COPY.answersHeading');
    expect(openerAt).toBeGreaterThan(-1);
    expect(answersAt).toBeGreaterThan(openerAt);
    expect(panel).toContain('selected.answers[BSN_OPENER_KEY]');
    expect(panel).toContain('BSN_QUESTIONS.filter');
  });

  it('the five cards all stand on the client screen, each with its own Assign button', () => {
    const detail = read('app/coach/clients/[id]/detail/page.tsx');
    for (const id of [
      'detail-card-owning-your-value',
      'detail-card-where-your-joy-lives',
      'detail-card-the-giving-ledger',
      'detail-card-the-weight-of-yes',
      'detail-card-being-seen',
    ]) {
      expect(detail).toContain(id);
    }
    const sections = read('lib/coach-detail/sections.ts');
    expect(sections).toContain("title: 'Being Seen'");
  });

  it('the follow-up flag is null for this template, and no code path can set it', () => {
    // The brief asks for null here, and the way to guarantee it is for
    // this feature never to write the column at all. Asserted on the code
    // with the prose stripped out, because data.ts's own header explains
    // the rule using the column's name.
    for (const file of ['lib/being-seen/data.ts', 'app/actions/beingSeen.ts']) {
      const source = read(file)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect(source).not.toContain('follow_up_source_experience_key');
      expect(source).not.toContain('followUpSourceExperienceKey');
    }
  });

  it('the assign button sends a default due date seven days out', () => {
    const action = read('app/actions/beingSeen.ts');
    expect(action).toContain('BSN_DEFAULT_DUE_IN_DAYS');
    expect(action).toContain('dueAtInDays(');
    expect(read('lib/being-seen/constants.ts')).toContain(
      'export const BSN_DEFAULT_DUE_IN_DAYS = 7;'
    );
  });

  it('test accounts are excluded in the data layer, not by this screen remembering', () => {
    expect(read('app/actions/beingSeen.ts')).toContain('isMemberVisibleToStaff');
  });
});
