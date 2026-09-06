/**
 * Where Your Joy Lives: the gate, the draft, and the closing that holds.
 *
 * Four things are proved here, and each one is a rule that only means
 * something once the pieces are wired together.
 *
 * THE ASSIGNMENT IS THE ENTIRE GATE. That is not provable by testing four
 * tiers, because a fifth would slip through. It is proved by counting the
 * TABLES the gate reads: if it never asks a subscription or a visibility
 * table anything, no plan can change its answer. It is also not gated on
 * having finished the template beside it, which is asserted directly.
 *
 * TWO TEMPLATES SHARE ONE TABLE AND MUST NOT SHARE A ROW. Every read here
 * is scoped by experience_key, so a member with both Happiness deep-dives
 * assigned can never be shown one template's answers under the other
 * template's questions.
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
import { buildWyjlState } from '@/lib/where-your-joy-lives/service';
import { resolveWyjlAccess } from '@/lib/where-your-joy-lives/access';
import { WYJL_DEFINITION_ID, WYJL_KEY } from '@/lib/where-your-joy-lives/constants';
import { OYV_DEFINITION_ID } from '@/lib/owning-your-value/constants';
import {
  WYJL_QUESTIONS,
  WYJL_CLOSING_PAIR_KEYS,
  firstUnansweredIndex,
  sanitizeWyjlAnswers,
  sanitizeWyjlDraft,
  blockedReasonFor,
} from '@/lib/where-your-joy-lives/questions';

const APP_ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(APP_ROOT, rel), 'utf8');
const MIGRATION = path.resolve(
  APP_ROOT,
  '../../supabase/migrations/00000000000212_where_your_joy_lives.sql'
);
const MEMBER = '33333333-3333-4333-8333-333333333333';

function fullAnswers(): Record<string, string> {
  return Object.fromEntries(
    WYJL_QUESTIONS.map((question, index) => [question.key, `answer ${index + 1}`])
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
    experience_key: WYJL_KEY,
    questions_version: 1,
    answers: fullAnswers(),
    twenty_minute_joy: 'answer 8',
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
    expect(await buildWyjlState(fakeClient(), MEMBER)).toBeNull();
  });

  it('and deciding that writes nothing', async () => {
    await buildWyjlState(fakeClient(), MEMBER);
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
    const state = await buildWyjlState(fakeClient(), MEMBER);
    expect(state?.status).toBe('pending');
    expect(state?.status === 'pending' && state.assignmentId).toBe('assignment-1');
  });

  it('NO TIER OR VISIBILITY TABLE IS EVER CONSULTED, so no plan can change the answer', async () => {
    world.assignment = { id: 'assignment-1', created_at: '2026-09-06T09:00:00.000Z', reason: null, due_at: null };
    await buildWyjlState(fakeClient(), MEMBER);

    const assigned = [...reads];
    world.assignment = null;
    reads = [];
    await buildWyjlState(fakeClient(), MEMBER);

    for (const table of [...assigned, ...reads]) {
      expect(table).not.toBe('member_subscriptions');
      expect(table).not.toBe('member_access_facts');
      expect(table).not.toBe('profiles');
      expect(table).not.toBe('member_visibility_rules');
    }
  });

  it('is NOT gated on having finished the template beside it', () => {
    // The second Happiness template greets a member Root has sat with
    // before, but "has sat with Root before" is a thing the coach knows and
    // this app does not check. A prerequisite here would be the second
    // invisible lock the standing rules forbid, and it would take this
    // experience away from a member her coach deliberately started here.
    const gate = [
      'lib/where-your-joy-lives/access.ts',
      'lib/where-your-joy-lives/service.ts',
      'lib/where-your-joy-lives/data.ts',
    ];
    for (const file of gate) {
      const source = read(file)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect(source).not.toContain('OYV_');
      expect(source).not.toContain('owning-your-value');
    }
  });

  it('offering it, with a draft already written, still writes nothing', async () => {
    world.assignment = { id: 'assignment-1', created_at: '2026-09-06T09:00:00.000Z', reason: null, due_at: null };
    world.sessions = [
      sessionRow({
        completed_at: null,
        twenty_minute_joy: null,
        answers: { light_moment: 'the kitchen, Sunday' },
      }),
    ];
    const state = await buildWyjlState(fakeClient(), MEMBER);
    expect(state?.status).toBe('pending');
    expect(state?.status === 'pending' && state.draft).toEqual({
      light_moment: 'the kitchen, Sunday',
    });
    expect(writes).toEqual([]);
  });

  it('addresses the one fixed catalog definition, and nothing else', () => {
    expect(WYJL_DEFINITION_ID).toBe('b3e9c85a-47d1-4f26-9c0b-1a5e8d37f402');
    expect(WYJL_DEFINITION_ID).not.toBe(OYV_DEFINITION_ID);
    const migration = readFileSync(MIGRATION, 'utf8');
    expect(migration).toContain(WYJL_DEFINITION_ID);
    expect(migration).toContain("'where-your-joy-lives'");
  });
});

describe('two templates, one table, never one row', () => {
  it('every read of the shared table is scoped by experience_key', async () => {
    world.assignment = { id: 'assignment-1', created_at: '2026-09-06T09:00:00.000Z', reason: null, due_at: null };
    world.sessions = [sessionRow({ completed_at: null })];
    await buildWyjlState(fakeClient(), MEMBER);

    expect(sessionFilters.length).toBeGreaterThan(0);
    expect(sessionFilters).toContainEqual(['experience_key', WYJL_KEY]);

    // And the history read is scoped too, on the path that actually runs it.
    world.assignment = null;
    sessionFilters = [];
    world.sessions = [sessionRow()];
    await buildWyjlState(fakeClient(), MEMBER);
    expect(sessionFilters).toContainEqual(['experience_key', WYJL_KEY]);
  });

  it('the migration pairs this key with this definition, and leaves the other pairing standing', () => {
    const migration = readFileSync(MIGRATION, 'utf8');
    // The insert policy carries both templates, each bound to its own id.
    expect(migration).toContain("experience_key = 'owning-your-value'");
    expect(migration).toContain("experience_key = 'where-your-joy-lives'");
    expect(migration).toContain(OYV_DEFINITION_ID);
    // The trigger knows both, so finishing either one closes its own
    // assignment out.
    expect(migration).toContain("when 'where-your-joy-lives' then");
    expect(migration).toContain("when 'owning-your-value' then");
  });

  it('the two pop-up keys cannot silence each other', () => {
    const data = read('lib/root-popup-messages/data.ts');
    expect(data).toContain('`owning_your_value:${assignmentId}`');
    expect(data).toContain('`where_your_joy_lives:${assignmentId}`');
  });
});

describe('the twenty minute answer has its own column', () => {
  it('question eight is stored beside the answers rather than only inside them', () => {
    const migration = readFileSync(MIGRATION, 'utf8');
    expect(migration).toContain('twenty_minute_joy');
    expect(read('lib/where-your-joy-lives/data.ts')).toContain('twenty_minute_joy: params.twentyMinuteJoy');
    expect(read('app/actions/whereYourJoyLives.ts')).toContain('WYJL_TWENTY_MINUTE_KEY');
  });

  it('it does not borrow the column belonging to the template beside it', () => {
    // held_sentence means "the sentence she would like to believe about
    // herself" on an Owning Your Value row. Writing a different meaning
    // into it here would leave a later reader of the family unable to tell
    // two questions apart.
    for (const file of ['lib/where-your-joy-lives/data.ts', 'app/actions/whereYourJoyLives.ts']) {
      expect(read(file)).not.toContain('held_sentence');
    }
  });
});

describe('a finished sitting', () => {
  it('is returned rather than nothing, so a member who comes back gets an answer', async () => {
    world.sessions = [sessionRow()];
    const state = await buildWyjlState(fakeClient(), MEMBER);
    expect(state?.status).toBe('completed');
    expect(state?.status === 'completed' && state.session.twentyMinuteJoy).toBe('answer 8');
  });

  it('a completed row never comes back as a resumable draft', async () => {
    world.assignment = { id: 'assignment-1', created_at: '2026-09-06T09:00:00.000Z', reason: null, due_at: null };
    world.sessions = [sessionRow()];
    const state = await buildWyjlState(fakeClient(), MEMBER);
    expect(state?.status === 'pending' && state.draft).toEqual({});
  });
});

describe('both reads fail shut', () => {
  it('a broken assignment read offers nothing', async () => {
    world.assignment = 'error';
    expect(await buildWyjlState(fakeClient(), MEMBER)).toBeNull();
  });

  it('a broken session read offers nothing', async () => {
    world.sessions = 'error';
    expect(await buildWyjlState(fakeClient(), MEMBER)).toBeNull();
  });

  it('the rule itself resolves both failures to "none"', () => {
    expect(
      resolveWyjlAccess({
        assignmentRead: { ok: false, assignment: null },
        sessionRead: { ok: true, records: [] },
      }).kind
    ).toBe('none');
    expect(
      resolveWyjlAccess({
        assignmentRead: { ok: true, assignment: null },
        sessionRead: { ok: false, records: [] },
      }).kind
    ).toBe('none');
  });
});

describe('one rule, three surfaces', () => {
  const SURFACES = [
    'app/where-your-joy-lives/page.tsx',
    'app/dashboard/page.tsx',
    'app/actions/rootPopupMessages.ts',
  ];

  it('the route, the Home card and the pop-up chain all read the same accessor', () => {
    for (const surface of SURFACES) {
      expect(read(surface)).toContain('getMyWhereYourJoyLives');
    }
  });

  it('none of the three adds a tier or visibility check of its own around it', () => {
    expect(read('app/dashboard/page.tsx')).toContain(
      "{whereYourJoyLives?.status === 'pending' && ("
    );
    expect(read('app/actions/rootPopupMessages.ts')).toContain(
      "if (whereYourJoyLives?.status === 'pending') {"
    );
  });

  it('the route turns a typed URL away server side rather than hiding the content', () => {
    const route = read('app/where-your-joy-lives/page.tsx');
    expect(route).toContain('const state = await getMyWhereYourJoyLives();');
    expect(route).toContain("if (!state) redirect('/dashboard');");
  });

  it('the route is member only, so a coach following an old link lands on their own dashboard', () => {
    expect(read('lib/auth/staffRouting.ts')).toContain("'/where-your-joy-lives',");
  });

  it('the pop-up branch checks its own due-ness before returning a candidate', () => {
    const chain = read('app/actions/rootPopupMessages.ts');
    const branch = chain.slice(chain.indexOf("if (whereYourJoyLives?.status === 'pending') {"));
    expect(branch.slice(0, 400)).toContain('if (await isRecurringMessageDue(messageKey)) {');
  });
});

describe('no render in this feature writes', () => {
  it('nothing on the read path calls insert, upsert or a save', () => {
    const readPath = [
      'lib/where-your-joy-lives/view.ts',
      'lib/where-your-joy-lives/service.ts',
      'lib/where-your-joy-lives/access.ts',
      'app/where-your-joy-lives/page.tsx',
      'components/where-your-joy-lives/WhereYourJoyLivesEntry.tsx',
    ];
    for (const file of readPath) {
      const source = read(file)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect(source).not.toContain('.insert(');
      expect(source).not.toContain('.upsert(');
      expect(source).not.toContain('.update(');
      expect(source).not.toContain('saveWyjlDraft');
      expect(source).not.toContain('completeWyjlSession');
    }
  });

  it('the only writers are the server actions, and each is reached by a button', () => {
    const action = read('app/actions/whereYourJoyLives.ts');
    expect(action).toContain('saveWyjlDraft');
    expect(action).toContain('completeWyjlSession');
    const experience = read('components/where-your-joy-lives/WhereYourJoyLivesExperience.tsx');
    expect(experience).toContain('await saveWhereYourJoyLivesDraftAction(draft)');
    expect(experience).toContain('await submitWhereYourJoyLivesAction(draft)');
  });
});

describe('the closing holds', () => {
  const route = () => read('app/where-your-joy-lives/page.tsx');
  const experience = () =>
    read('components/where-your-joy-lives/WhereYourJoyLivesExperience.tsx');

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
    expect((route().match(/<WhereYourJoyLivesExperience/g) ?? []).length).toBe(1);
  });

  it('finishing revalidates Home only, never the route she is standing on', () => {
    const action = read('app/actions/whereYourJoyLives.ts');
    expect(action).toContain("revalidatePath('/dashboard')");
    expect(action).not.toContain("revalidatePath('/where-your-joy-lives')");
  });

  it('saving a draft revalidates nothing at all', () => {
    const action = read('app/actions/whereYourJoyLives.ts');
    const save = action.slice(
      action.indexOf('export async function saveWhereYourJoyLivesDraftAction'),
      action.indexOf('export type SubmitWyjlResult')
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
    const partial = { light_moment: 'a', loved_doing_before: 'b' };
    expect(sanitizeWyjlDraft(partial)).toEqual(partial);
    expect(sanitizeWyjlAnswers(partial)).toBeNull();
    expect(sanitizeWyjlAnswers(fullAnswers())).toEqual(fullAnswers());
  });

  it('whitespace is not an answer', () => {
    expect(sanitizeWyjlDraft({ light_moment: '   ' })).toEqual({});
    expect(blockedReasonFor('   ')).not.toBeNull();
    expect(blockedReasonFor('something')).toBeNull();
  });

  it('keys this experience does not own are dropped rather than stored', () => {
    // Including the other Happiness template's keys, which share a table.
    expect(
      sanitizeWyjlDraft({ light_moment: 'a', held_sentence: 'b', not_a_question: 'c' })
    ).toEqual({ light_moment: 'a' });
  });

  it('she comes back to the first question she has not answered', () => {
    expect(firstUnansweredIndex({})).toBe(0);
    expect(firstUnansweredIndex({ light_moment: 'a' })).toBe(1);
    expect(firstUnansweredIndex(fullAnswers())).toBe(WYJL_QUESTIONS.length);
  });

  it('a sheet missing either closing-pair answer is never a completion', () => {
    for (const key of WYJL_CLOSING_PAIR_KEYS) {
      const missing = fullAnswers();
      delete missing[key];
      expect(sanitizeWyjlAnswers(missing)).toBeNull();
    }
  });
});

describe('the coach side', () => {
  it('names this experience on the assignment list rather than calling it Assessment', () => {
    const names = read('lib/assignments/experienceNames.ts');
    expect(names).toContain('WYJL_DEFINITION_ID');
    expect(names).toContain('WYJL_LABEL');
    // The detail panel and the This Week band both read the one map.
    expect(read('app/coach/clients/[id]/detail/page.tsx')).toContain('assignmentNameRecord()');
    expect(read('app/actions/coachWeek.ts')).toContain('assignmentNamesByDefinitionId()');
  });

  it('the panel shows question seven first and then all nine answers', () => {
    const full = read('app/coach/clients/[id]/WhereYourJoyLivesPanel.tsx');
    // From the component body down, so the alphabetical import block above
    // it cannot decide the order this is asserting.
    const panel = full.slice(full.indexOf('export function WhereYourJoyLivesPanel'));
    const openerAt = panel.indexOf('WYJL_OPENER_HEADING');
    const answersAt = panel.indexOf('WYJL_ANSWERS_HEADING');
    expect(openerAt).toBeGreaterThan(-1);
    expect(answersAt).toBeGreaterThan(openerAt);
    expect(panel).toContain('selected.answers[WYJL_OPENER_KEY]');
    expect(panel).toContain('WYJL_QUESTIONS.filter');
  });

  it('the assign button sends a default due date seven days out', () => {
    const action = read('app/actions/whereYourJoyLives.ts');
    expect(action).toContain('WYJL_DEFAULT_DUE_IN_DAYS');
    expect(action).toContain('dueAtInDays(');
    expect(read('lib/where-your-joy-lives/constants.ts')).toContain(
      'export const WYJL_DEFAULT_DUE_IN_DAYS = 7;'
    );
  });

  it('test accounts are excluded in the data layer, not by this screen remembering', () => {
    expect(read('app/actions/whereYourJoyLives.ts')).toContain('isMemberVisibleToStaff');
  });

  it('the follow-up field exists in the model and is null for this template', () => {
    expect(read('lib/where-your-joy-lives/data.ts')).toContain(
      'follow_up_source_experience_key: null'
    );
  });
});
