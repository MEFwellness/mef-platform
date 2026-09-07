/**
 * The Giving Ledger: the gate, the draft, and the closing that holds.
 *
 * Four things are proved here, and each one is a rule that only means
 * something once the pieces are wired together.
 *
 * THE ASSIGNMENT IS THE ENTIRE GATE. That is not provable by testing four
 * tiers, because a fifth would slip through. It is proved by counting the
 * TABLES the gate reads: if it never asks a subscription or a visibility
 * table anything, no plan can change its answer. It is also not gated on
 * having finished either template beside it, which is asserted directly.
 *
 * THREE TEMPLATES SHARE ONE TABLE AND MUST NOT SHARE A ROW. Every read here
 * is scoped by experience_key, so a member with all three Happiness
 * deep-dives assigned can never be shown one template's answers under
 * another template's questions. The three-way version of that proof lives
 * in its own describe block below and reads all three features at once.
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
import { buildTglState } from '@/lib/the-giving-ledger/service';
import { resolveTglAccess } from '@/lib/the-giving-ledger/access';
import { TGL_DEFINITION_ID, TGL_KEY } from '@/lib/the-giving-ledger/constants';
import { OYV_DEFINITION_ID, OYV_KEY } from '@/lib/owning-your-value/constants';
import { WYJL_DEFINITION_ID, WYJL_KEY } from '@/lib/where-your-joy-lives/constants';
import {
  TGL_QUESTIONS,
  TGL_CLOSING_KEY,
  TGL_DEPOSIT_KEY,
  firstUnansweredIndex,
  sanitizeTglAnswers,
  sanitizeTglDraft,
  blockedReasonFor,
} from '@/lib/the-giving-ledger/questions';

const APP_ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(APP_ROOT, rel), 'utf8');
const MIGRATIONS = path.resolve(APP_ROOT, '../../supabase/migrations');
const MIGRATION = path.join(MIGRATIONS, '00000000000213_the_giving_ledger.sql');
const MEMBER = '44444444-4444-4444-8444-444444444444';

function fullAnswers(): Record<string, string> {
  return Object.fromEntries(
    TGL_QUESTIONS.map((question, index) => [question.key, `answer ${index + 1}`])
  );
}

type World = {
  /** null means "no pending assignment", 'error' means the read itself failed. */
  assignment: Record<string, unknown> | null | 'error';
  /** [] means "never finished one", 'error' means the read itself failed. */
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
    experience_key: TGL_KEY,
    questions_version: 1,
    answers: fullAnswers(),
    deposit_request: 'answer 8',
    follow_up_source_experience_key: null,
    started_at: '2026-09-06T10:00:00.000Z',
    completed_at: '2026-09-06T10:20:00.000Z',
    created_at: '2026-09-06T10:00:00.000Z',
    ...overrides,
  };
}

function fakeClient() {
  const builder = (table: string): Record<string, unknown> => {
    const failed =
      (table === 'assessment_assignments' && world.assignment === 'error') ||
      (table === 'member_happiness_deep_dive_sessions' && world.sessions === 'error');

    const rows =
      table === 'assessment_assignments'
        ? world.assignment && world.assignment !== 'error'
          ? [world.assignment]
          : []
        : table === 'member_happiness_deep_dive_sessions'
          ? world.sessions === 'error'
            ? []
            : world.sessions
          : [];

    const result = failed
      ? { data: null, error: { message: 'boom' }, count: 0 }
      : { data: rows, error: null, count: rows.length };

    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'in', 'is', 'neq', 'gte', 'lte', 'order', 'limit', 'not']) {
      chain[method] = () => chain;
    }
    chain.eq = (column: string, value: unknown) => {
      if (table === 'member_happiness_deep_dive_sessions') sessionFilters.push([column, value]);
      return chain;
    };
    chain.maybeSingle = async () =>
      failed ? { data: null, error: { message: 'boom' } } : { data: rows[0] ?? null, error: null };
    chain.single = chain.maybeSingle;
    chain.then = (resolve: (value: typeof result) => unknown) =>
      Promise.resolve(result).then(resolve);
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

beforeEach(() => {
  world.assignment = null;
  world.sessions = [];
  reads = [];
  writes = [];
  sessionFilters = [];
});

describe('an unassigned member', () => {
  it('is offered nothing at all', async () => {
    expect(await buildTglState(fakeClient(), MEMBER)).toBeNull();
  });

  it('and deciding that writes nothing', async () => {
    await buildTglState(fakeClient(), MEMBER);
    expect(writes).toEqual([]);
    // It really did look, so "no writes" is not "did nothing".
    expect(reads).toContain('assessment_assignments');
  });
});

describe('the assignment is the entire gate', () => {
  it('an assigned member is offered it', async () => {
    world.assignment = {
      id: 'assignment-1',
      created_at: '2026-09-06T09:00:00.000Z',
      reason: null,
      due_at: '2026-09-13T00:00:00.000Z',
    };
    const state = await buildTglState(fakeClient(), MEMBER);
    expect(state?.status).toBe('pending');
    expect(state?.status === 'pending' && state.assignmentId).toBe('assignment-1');
  });

  it('NO TIER OR VISIBILITY TABLE IS EVER CONSULTED, so no plan can change the answer', async () => {
    world.assignment = { id: 'assignment-1', created_at: '2026-09-06T09:00:00.000Z', reason: null, due_at: null };
    await buildTglState(fakeClient(), MEMBER);

    const assigned = [...reads];
    world.assignment = null;
    reads = [];
    await buildTglState(fakeClient(), MEMBER);

    for (const table of [...assigned, ...reads]) {
      expect(table).not.toBe('member_subscriptions');
      expect(table).not.toBe('member_access_facts');
      expect(table).not.toBe('profiles');
      expect(table).not.toBe('member_visibility_rules');
    }
  });

  it('is NOT gated on having finished either template beside it', () => {
    // A coach may start any member here. A prerequisite would be the second
    // invisible lock the standing rules forbid, and it would take this
    // experience away from a member her coach deliberately began with.
    const gate = [
      'lib/the-giving-ledger/access.ts',
      'lib/the-giving-ledger/service.ts',
      'lib/the-giving-ledger/data.ts',
    ];
    for (const file of gate) {
      const source = read(file)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect(source).not.toContain('OYV_');
      expect(source).not.toContain('WYJL_');
      expect(source).not.toContain('owning-your-value');
      expect(source).not.toContain('where-your-joy-lives');
    }
  });

  it('offering it, with a draft already written, still writes nothing', async () => {
    world.assignment = { id: 'assignment-1', created_at: '2026-09-06T09:00:00.000Z', reason: null, due_at: null };
    world.sessions = [
      sessionRow({
        completed_at: null,
        deposit_request: null,
        answers: { energy_out_list: 'work, the kids, my mother, the group chat' },
      }),
    ];
    const state = await buildTglState(fakeClient(), MEMBER);
    expect(state?.status).toBe('pending');
    expect(state?.status === 'pending' && state.draft).toEqual({
      energy_out_list: 'work, the kids, my mother, the group chat',
    });
    expect(writes).toEqual([]);
  });

  it('addresses the one fixed catalog definition, and nothing else', () => {
    expect(TGL_DEFINITION_ID).toBe('d4b0f7c3-9a25-4e18-b6d3-8c1f5a2e70b9');
    expect(TGL_DEFINITION_ID).not.toBe(OYV_DEFINITION_ID);
    expect(TGL_DEFINITION_ID).not.toBe(WYJL_DEFINITION_ID);
    const migration = readFileSync(MIGRATION, 'utf8');
    expect(migration).toContain(TGL_DEFINITION_ID);
    expect(migration).toContain("'the-giving-ledger'");
  });
});

describe('three templates, one table, never one row', () => {
  /** The three Happiness templates, each with the files that read the shared table. */
  const FAMILY = [
    { key: OYV_KEY, id: OYV_DEFINITION_ID, data: 'lib/owning-your-value/data.ts' },
    { key: WYJL_KEY, id: WYJL_DEFINITION_ID, data: 'lib/where-your-joy-lives/data.ts' },
    { key: TGL_KEY, id: TGL_DEFINITION_ID, data: 'lib/the-giving-ledger/data.ts' },
  ];

  it('the three keys and the three definition ids are all distinct', () => {
    expect(new Set(FAMILY.map((entry) => entry.key)).size).toBe(3);
    expect(new Set(FAMILY.map((entry) => entry.id)).size).toBe(3);
  });

  it('EVERY read of the shared table in EVERY template is scoped by experience_key', () => {
    // The proof that matters for three templates is not "this one scopes
    // its reads", it is "no template anywhere selects from the shared table
    // without saying which template it is". Counted per file: every
    // `.from(HAPPINESS_DEEP_DIVE_TABLE)` is followed, inside the same
    // statement, by an experience_key filter.
    for (const entry of FAMILY) {
      const source = read(entry.data)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      const statements = source.split('.from(HAPPINESS_DEEP_DIVE_TABLE)').slice(1);
      expect(statements.length).toBeGreaterThan(0);
      for (const statement of statements) {
        // The statement ends at the next semicolon that closes the builder.
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
    world.assignment = { id: 'assignment-1', created_at: '2026-09-06T09:00:00.000Z', reason: null, due_at: null };
    world.sessions = [sessionRow({ completed_at: null })];
    await buildTglState(fakeClient(), MEMBER);

    expect(sessionFilters.length).toBeGreaterThan(0);
    expect(sessionFilters).toContainEqual(['experience_key', TGL_KEY]);
    expect(sessionFilters).not.toContainEqual(['experience_key', OYV_KEY]);
    expect(sessionFilters).not.toContainEqual(['experience_key', WYJL_KEY]);

    // And the history read is scoped too, on the path that actually runs it.
    world.assignment = null;
    sessionFilters = [];
    world.sessions = [sessionRow()];
    await buildTglState(fakeClient(), MEMBER);
    expect(sessionFilters).toContainEqual(['experience_key', TGL_KEY]);
  });

  it('the migration pairs this key with this definition and leaves the other two standing', () => {
    const migration = readFileSync(MIGRATION, 'utf8');
    // The insert policy carries all three templates, each bound to its own id.
    for (const entry of FAMILY) {
      expect(migration).toContain(`experience_key = '${entry.key}'`);
      expect(migration).toContain(entry.id);
      // The trigger knows all three, so finishing any one of them closes
      // its own assignment out.
      expect(migration).toContain(`when '${entry.key}' then`);
    }
  });

  it('each template stores its own question in its OWN column, never a shared one', () => {
    // held_sentence, twenty_minute_joy and deposit_request answer three
    // different questions. Writing a different meaning into an existing one
    // would leave a later reader of the family unable to tell them apart.
    const migration = readFileSync(MIGRATION, 'utf8');
    expect(migration).toContain('deposit_request');
    for (const file of ['lib/the-giving-ledger/data.ts', 'app/actions/theGivingLedger.ts']) {
      expect(read(file)).not.toContain('held_sentence');
      expect(read(file)).not.toContain('twenty_minute_joy');
    }
    // And the two templates before it never learned about this one's column.
    for (const file of [
      'lib/owning-your-value/data.ts',
      'lib/where-your-joy-lives/data.ts',
      'app/actions/owningYourValue.ts',
      'app/actions/whereYourJoyLives.ts',
    ]) {
      expect(read(file)).not.toContain('deposit_request');
    }
  });

  it('the three pop-up keys cannot silence each other', () => {
    const data = read('lib/root-popup-messages/data.ts');
    expect(data).toContain('`owning_your_value:${assignmentId}`');
    expect(data).toContain('`where_your_joy_lives:${assignmentId}`');
    expect(data).toContain('`the_giving_ledger:${assignmentId}`');
  });

  it('a draft for this template drops the other two templates own keys', () => {
    expect(
      sanitizeTglDraft({
        energy_out_list: 'mine',
        held_sentence: 'owning your value',
        twenty_minute_version: 'where your joy lives',
        not_a_question: 'nothing',
      })
    ).toEqual({ energy_out_list: 'mine' });
  });
});

describe('the deposit has its own column', () => {
  it('question eight is stored beside the answers rather than only inside them', () => {
    const migration = readFileSync(MIGRATION, 'utf8');
    expect(migration).toContain('deposit_request');
    expect(read('lib/the-giving-ledger/data.ts')).toContain(
      'deposit_request: params.depositRequest'
    );
    expect(read('app/actions/theGivingLedger.ts')).toContain('TGL_DEPOSIT_KEY');
    expect(TGL_DEPOSIT_KEY).toBe('deposit_to_ask_for');
  });
});

describe('a finished sitting', () => {
  it('is returned rather than nothing, so a member who comes back gets an answer', async () => {
    world.sessions = [sessionRow()];
    const state = await buildTglState(fakeClient(), MEMBER);
    expect(state?.status).toBe('completed');
    expect(state?.status === 'completed' && state.session.depositRequest).toBe('answer 8');
  });

  it('a completed row never comes back as a resumable draft', async () => {
    world.assignment = { id: 'assignment-1', created_at: '2026-09-06T09:00:00.000Z', reason: null, due_at: null };
    world.sessions = [sessionRow()];
    const state = await buildTglState(fakeClient(), MEMBER);
    expect(state?.status === 'pending' && state.draft).toEqual({});
  });
});

describe('both reads fail shut', () => {
  it('a broken assignment read offers nothing', async () => {
    world.assignment = 'error';
    expect(await buildTglState(fakeClient(), MEMBER)).toBeNull();
  });

  it('a broken session read offers nothing', async () => {
    world.sessions = 'error';
    expect(await buildTglState(fakeClient(), MEMBER)).toBeNull();
  });

  it('the rule itself resolves both failures to "none"', () => {
    expect(
      resolveTglAccess({
        assignmentRead: { ok: false, assignment: null },
        sessionRead: { ok: true, records: [] },
      }).kind
    ).toBe('none');
    expect(
      resolveTglAccess({
        assignmentRead: { ok: true, assignment: null },
        sessionRead: { ok: false, records: [] },
      }).kind
    ).toBe('none');
  });
});

describe('one rule, three surfaces', () => {
  const SURFACES = [
    'app/the-giving-ledger/page.tsx',
    'app/dashboard/page.tsx',
    'app/actions/rootPopupMessages.ts',
  ];

  it('the route, the Home card and the pop-up chain all read the same accessor', () => {
    for (const surface of SURFACES) {
      expect(read(surface)).toContain('getMyTheGivingLedger');
    }
  });

  it('none of the three adds a tier or visibility check of its own around it', () => {
    expect(read('app/dashboard/page.tsx')).toContain("{theGivingLedger?.status === 'pending' && (");
    expect(read('app/actions/rootPopupMessages.ts')).toContain(
      "if (theGivingLedger?.status === 'pending') {"
    );
  });

  it('the route turns a typed URL away server side rather than hiding the content', () => {
    const route = read('app/the-giving-ledger/page.tsx');
    expect(route).toContain('const state = await getMyTheGivingLedger();');
    expect(route).toContain("if (!state) redirect('/dashboard');");
  });

  it('the route is member only, so a coach following an old link lands on their own dashboard', () => {
    expect(read('lib/auth/staffRouting.ts')).toContain("'/the-giving-ledger',");
  });

  it('the pop-up branch checks its own due-ness before returning a candidate', () => {
    const chain = read('app/actions/rootPopupMessages.ts');
    const branch = chain.slice(chain.indexOf("if (theGivingLedger?.status === 'pending') {"));
    expect(branch.slice(0, 400)).toContain('if (await isRecurringMessageDue(messageKey)) {');
  });

  it('its knock is protected from the one-knock delay, like every other coach assignment', () => {
    expect(read('lib/root-popup-messages/oneKnock.ts')).toContain("'the_giving_ledger_assigned'");
  });
});

describe('no render in this feature writes', () => {
  it('nothing on the read path calls insert, upsert or a save', () => {
    const readPath = [
      'lib/the-giving-ledger/view.ts',
      'lib/the-giving-ledger/service.ts',
      'lib/the-giving-ledger/access.ts',
      'app/the-giving-ledger/page.tsx',
      'components/the-giving-ledger/TheGivingLedgerEntry.tsx',
    ];
    for (const file of readPath) {
      const source = read(file)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect(source).not.toContain('.insert(');
      expect(source).not.toContain('.upsert(');
      expect(source).not.toContain('.update(');
      expect(source).not.toContain('saveTglDraft');
      expect(source).not.toContain('completeTglSession');
    }
  });

  it('the only writers are the server actions, and each is reached by a button', () => {
    const action = read('app/actions/theGivingLedger.ts');
    expect(action).toContain('saveTglDraft');
    expect(action).toContain('completeTglSession');
    const experience = read('components/the-giving-ledger/TheGivingLedgerExperience.tsx');
    expect(experience).toContain('await saveTheGivingLedgerDraftAction(draft)');
    expect(experience).toContain('await submitTheGivingLedgerAction(draft)');
  });
});

describe('the closing holds', () => {
  const route = () => read('app/the-giving-ledger/page.tsx');
  const experience = () => read('components/the-giving-ledger/TheGivingLedgerExperience.tsx');

  it('the route never sends a completed sitting anywhere else', () => {
    const source = route()
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    // The one redirect for a signed-in member is the "not offered" one. A
    // second redirect keyed on completion is exactly the bug this must not
    // inherit.
    expect(source.match(/redirect\(/g) ?? []).toHaveLength(2);
    expect(source).toContain("if (!state) redirect('/dashboard');");
    expect(source).not.toMatch(/completed[^\n]*redirect/);
  });

  it('the pending versus completed branch lives inside the mounted client component', () => {
    expect(experience()).toContain("if (status === 'completed' && !finished) {");
    // The route hands the state down and renders the SAME component either
    // way. It never picks a screen, so the re-render a Server Action
    // carries reconciles this component instead of replacing it.
    expect(route()).toContain('status={state.status}');
    expect((route().match(/<TheGivingLedgerExperience/g) ?? []).length).toBe(1);
  });

  it('finishing revalidates Home only, never the route she is standing on', () => {
    const action = read('app/actions/theGivingLedger.ts');
    expect(action).toContain("revalidatePath('/dashboard')");
    expect(action).not.toContain("revalidatePath('/the-giving-ledger')");
  });

  it('saving a draft revalidates nothing at all', () => {
    const action = read('app/actions/theGivingLedger.ts');
    const save = action.slice(
      action.indexOf('export async function saveTheGivingLedgerDraftAction'),
      action.indexOf('export type SubmitTglResult')
    );
    expect(save).not.toContain('revalidatePath');
  });

  it('the closing screen is reached by state, never by a navigation', () => {
    const source = experience();
    expect(source).toContain('setStep(CLOSING_STEP)');
    // router.push is the way OUT to Home, and it is never how she arrives
    // at her own closing.
    expect(source).not.toMatch(/router\.push\((?!'\/dashboard'\))/);
  });
});

describe('save and resume', () => {
  it('a partial draft is storable and a partial sheet is never a completion', () => {
    const partial = { energy_out_list: 'a', chosen_or_inherited: 'b' };
    expect(sanitizeTglDraft(partial)).toEqual(partial);
    expect(sanitizeTglAnswers(partial)).toBeNull();
    expect(sanitizeTglAnswers(fullAnswers())).toEqual(fullAnswers());
  });

  it('whitespace is not an answer', () => {
    expect(sanitizeTglDraft({ energy_out_list: '   ' })).toEqual({});
    expect(blockedReasonFor('   ')).not.toBeNull();
    expect(blockedReasonFor('something')).toBeNull();
  });

  it('she comes back to the first question she has not answered', () => {
    expect(firstUnansweredIndex({})).toBe(0);
    expect(firstUnansweredIndex({ energy_out_list: 'a' })).toBe(1);
    expect(firstUnansweredIndex(fullAnswers())).toBe(TGL_QUESTIONS.length);
  });

  it('a sheet missing the closing sentence is never a completion', () => {
    const missing = fullAnswers();
    delete missing[TGL_CLOSING_KEY];
    expect(sanitizeTglAnswers(missing)).toBeNull();
  });

  it('a sheet missing the deposit is never a completion either', () => {
    const missing = fullAnswers();
    delete missing[TGL_DEPOSIT_KEY];
    expect(sanitizeTglAnswers(missing)).toBeNull();
  });
});

describe('the coach side', () => {
  it('names this experience on the assignment list rather than calling it Assessment', () => {
    const names = read('lib/assignments/experienceNames.ts');
    expect(names).toContain('TGL_DEFINITION_ID');
    expect(names).toContain('TGL_LABEL');
    // The detail panel and the This Week band both read the one map.
    expect(read('app/coach/clients/[id]/detail/page.tsx')).toContain('assignmentNameRecord()');
    expect(read('app/actions/coachWeek.ts')).toContain('assignmentNamesByDefinitionId()');
  });

  it('the panel shows question six first and then all nine answers', () => {
    const full = read('app/coach/clients/[id]/TheGivingLedgerPanel.tsx');
    // From the component body down, so the alphabetical import block above
    // it cannot decide the order this is asserting.
    const panel = full.slice(full.indexOf('export function TheGivingLedgerPanel'));
    const openerAt = panel.indexOf('TGL_OPENER_HEADING');
    const answersAt = panel.indexOf('TGL_ANSWERS_HEADING');
    expect(openerAt).toBeGreaterThan(-1);
    expect(answersAt).toBeGreaterThan(openerAt);
    expect(panel).toContain('selected.answers[TGL_OPENER_KEY]');
    expect(panel).toContain('TGL_QUESTIONS.filter');
  });

  it('the three cards all stand on the client screen, each with its own Assign button', () => {
    const detail = read('app/coach/clients/[id]/detail/page.tsx');
    for (const id of [
      'detail-card-owning-your-value',
      'detail-card-where-your-joy-lives',
      'detail-card-the-giving-ledger',
    ]) {
      expect(detail).toContain(id);
    }
    // And the section index names all three, so the pinned search finds them.
    const sections = read('lib/coach-detail/sections.ts');
    expect(sections).toContain("title: 'The Giving Ledger'");
  });

  it('the assign button sends a default due date seven days out', () => {
    const action = read('app/actions/theGivingLedger.ts');
    expect(action).toContain('TGL_DEFAULT_DUE_IN_DAYS');
    expect(action).toContain('dueAtInDays(');
    expect(read('lib/the-giving-ledger/constants.ts')).toContain(
      'export const TGL_DEFAULT_DUE_IN_DAYS = 7;'
    );
  });

  it('test accounts are excluded in the data layer, not by this screen remembering', () => {
    expect(read('app/actions/theGivingLedger.ts')).toContain('isMemberVisibleToStaff');
  });

  it('the follow-up flag exists in the model and is null for this template', () => {
    expect(read('lib/the-giving-ledger/data.ts')).toContain(
      'follow_up_source_experience_key: null'
    );
  });
});
