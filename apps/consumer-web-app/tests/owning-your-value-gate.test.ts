/**
 * Owning Your Value: the gate, the draft, and the closing that holds.
 *
 * Three things are proved here, and each one is a rule that only means
 * something once the pieces are wired together.
 *
 * THE ASSIGNMENT IS THE ENTIRE GATE. That is not provable by testing four
 * tiers, because a fifth would slip through. It is proved by counting the
 * TABLES the gate reads: if it never asks a subscription or a visibility
 * table anything, no plan can change its answer.
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
import { buildOyvState } from '@/lib/owning-your-value/service';
import { resolveOyvAccess } from '@/lib/owning-your-value/access';
import { OYV_DEFINITION_ID } from '@/lib/owning-your-value/constants';
import {
  OYV_QUESTIONS,
  firstUnansweredIndex,
  sanitizeOyvAnswers,
  sanitizeOyvDraft,
  blockedReasonFor,
} from '@/lib/owning-your-value/questions';

const APP_ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(APP_ROOT, rel), 'utf8');
const MEMBER = '22222222-2222-4222-8222-222222222222';

function fullAnswers(): Record<string, string> {
  return Object.fromEntries(
    OYV_QUESTIONS.map((question, index) => [question.key, `answer ${index + 1}`])
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

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    assignment_id: 'assignment-1',
    experience_key: 'owning-your-value',
    questions_version: 1,
    answers: fullAnswers(),
    held_sentence: 'answer 9',
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
    for (const method of ['select', 'eq', 'in', 'is', 'neq', 'gte', 'lte', 'order', 'limit', 'not']) {
      chain[method] = () => chain;
    }
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
});

describe('an unassigned member', () => {
  it('is offered nothing at all', async () => {
    expect(await buildOyvState(fakeClient(), MEMBER)).toBeNull();
  });

  it('and deciding that writes nothing', async () => {
    await buildOyvState(fakeClient(), MEMBER);
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
    const state = await buildOyvState(fakeClient(), MEMBER);
    expect(state?.status).toBe('pending');
    expect(state?.status === 'pending' && state.assignmentId).toBe('assignment-1');
  });

  it('NO TIER OR VISIBILITY TABLE IS EVER CONSULTED, so no plan can change the answer', async () => {
    world.assignment = { id: 'assignment-1', created_at: '2026-09-06T09:00:00.000Z', reason: null, due_at: null };
    await buildOyvState(fakeClient(), MEMBER);

    const assigned = [...reads];
    world.assignment = null;
    reads = [];
    await buildOyvState(fakeClient(), MEMBER);

    for (const table of [...assigned, ...reads]) {
      expect(table).not.toBe('member_subscriptions');
      expect(table).not.toBe('member_access_facts');
      expect(table).not.toBe('profiles');
      expect(table).not.toBe('member_visibility_rules');
    }
  });

  it('offering it, with a draft already written, still writes nothing', async () => {
    world.assignment = { id: 'assignment-1', created_at: '2026-09-06T09:00:00.000Z', reason: null, due_at: null };
    world.sessions = [sessionRow({ completed_at: null, held_sentence: null, answers: { doing_for_others: 'yesterday' } })];
    const state = await buildOyvState(fakeClient(), MEMBER);
    expect(state?.status).toBe('pending');
    expect(state?.status === 'pending' && state.draft).toEqual({ doing_for_others: 'yesterday' });
    expect(writes).toEqual([]);
  });

  it('addresses the one fixed catalog definition, and nothing else', () => {
    expect(OYV_DEFINITION_ID).toBe('c1d7a4f2-8b36-4e09-a5c7-2f9d63b48e15');
    const migration = readFileSync(
      path.resolve(APP_ROOT, '../../supabase/migrations/00000000000211_owning_your_value.sql'),
      'utf8'
    );
    expect(migration).toContain(OYV_DEFINITION_ID);
    expect(migration).toContain("'owning-your-value'");
  });
});

describe('a finished sitting', () => {
  it('is returned rather than nothing, so a member who comes back gets an answer', async () => {
    world.sessions = [sessionRow()];
    const state = await buildOyvState(fakeClient(), MEMBER);
    expect(state?.status).toBe('completed');
    expect(state?.status === 'completed' && state.session.heldSentence).toBe('answer 9');
  });

  it('a completed row never comes back as a resumable draft', async () => {
    world.assignment = { id: 'assignment-1', created_at: '2026-09-06T09:00:00.000Z', reason: null, due_at: null };
    world.sessions = [sessionRow()];
    const state = await buildOyvState(fakeClient(), MEMBER);
    expect(state?.status === 'pending' && state.draft).toEqual({});
  });
});

describe('both reads fail shut', () => {
  it('a broken assignment read offers nothing', async () => {
    world.assignment = 'error';
    expect(await buildOyvState(fakeClient(), MEMBER)).toBeNull();
  });

  it('a broken session read offers nothing', async () => {
    world.sessions = 'error';
    expect(await buildOyvState(fakeClient(), MEMBER)).toBeNull();
  });

  it('the rule itself resolves both failures to "none"', () => {
    expect(
      resolveOyvAccess({
        assignmentRead: { ok: false, assignment: null },
        sessionRead: { ok: true, records: [] },
      }).kind
    ).toBe('none');
    expect(
      resolveOyvAccess({
        assignmentRead: { ok: true, assignment: null },
        sessionRead: { ok: false, records: [] },
      }).kind
    ).toBe('none');
  });
});

describe('one rule, three surfaces', () => {
  const SURFACES = [
    'app/owning-your-value/page.tsx',
    'app/dashboard/page.tsx',
    'app/actions/rootPopupMessages.ts',
  ];

  it('the route, the Home card and the pop-up chain all read the same accessor', () => {
    for (const surface of SURFACES) {
      expect(read(surface)).toContain('getMyOwningYourValue');
    }
  });

  it('none of the three adds a tier or visibility check of its own around it', () => {
    expect(read('app/dashboard/page.tsx')).toContain("{owningYourValue?.status === 'pending' && (");
    expect(read('app/actions/rootPopupMessages.ts')).toContain(
      "if (owningYourValue?.status === 'pending') {"
    );
  });

  it('the route turns a typed URL away server side rather than hiding the content', () => {
    const route = read('app/owning-your-value/page.tsx');
    expect(route).toContain('const state = await getMyOwningYourValue();');
    expect(route).toContain("if (!state) redirect('/dashboard');");
  });

  it('the route is member only, so a coach following an old link lands on their own dashboard', () => {
    expect(read('lib/auth/staffRouting.ts')).toContain("'/owning-your-value',");
  });

  it('the pop-up branch checks its own due-ness before returning a candidate', () => {
    const chain = read('app/actions/rootPopupMessages.ts');
    const branch = chain.slice(chain.indexOf("if (owningYourValue?.status === 'pending') {"));
    expect(branch.slice(0, 400)).toContain('if (await isRecurringMessageDue(messageKey)) {');
  });
});

describe('no render in this feature writes', () => {
  it('nothing on the read path calls insert, upsert or a save', () => {
    const readPath = [
      'lib/owning-your-value/view.ts',
      'lib/owning-your-value/service.ts',
      'lib/owning-your-value/access.ts',
      'app/owning-your-value/page.tsx',
      'components/owning-your-value/OwningYourValueEntry.tsx',
    ];
    for (const file of readPath) {
      const source = read(file)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect(source).not.toContain('.insert(');
      expect(source).not.toContain('.upsert(');
      expect(source).not.toContain('.update(');
      expect(source).not.toContain('saveOyvDraft');
      expect(source).not.toContain('completeOyvSession');
    }
  });

  it('the only writers are the server actions, and each is reached by a button', () => {
    const action = read('app/actions/owningYourValue.ts');
    expect(action).toContain('saveOyvDraft');
    expect(action).toContain('completeOyvSession');
    const experience = read('components/owning-your-value/OwningYourValueExperience.tsx');
    expect(experience).toContain('await saveOwningYourValueDraftAction(draft)');
    expect(experience).toContain('await submitOwningYourValueAction(draft)');
  });
});

describe('the closing holds', () => {
  const route = () => read('app/owning-your-value/page.tsx');
  const experience = () => read('components/owning-your-value/OwningYourValueExperience.tsx');

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
    expect((route().match(/<OwningYourValueExperience/g) ?? []).length).toBe(1);
  });

  it('finishing revalidates Home only, never the route she is standing on', () => {
    const action = read('app/actions/owningYourValue.ts');
    expect(action).toContain("revalidatePath('/dashboard')");
    expect(action).not.toContain("revalidatePath('/owning-your-value')");
  });

  it('saving a draft revalidates nothing at all', () => {
    const action = read('app/actions/owningYourValue.ts');
    const save = action.slice(
      action.indexOf('export async function saveOwningYourValueDraftAction'),
      action.indexOf('export type SubmitOyvResult')
    );
    expect(save).not.toContain('revalidatePath');
  });
});

describe('save and resume', () => {
  it('a partial draft is storable and a partial sheet is never a completion', () => {
    const partial = { doing_for_others: 'a', doing_undone: 'b' };
    expect(sanitizeOyvDraft(partial)).toEqual(partial);
    expect(sanitizeOyvAnswers(partial)).toBeNull();
    expect(sanitizeOyvAnswers(fullAnswers())).toEqual(fullAnswers());
  });

  it('whitespace is not an answer', () => {
    expect(sanitizeOyvDraft({ doing_for_others: '   ' })).toEqual({});
    expect(blockedReasonFor('   ')).not.toBeNull();
    expect(blockedReasonFor('something')).toBeNull();
  });

  it('keys this experience does not own are dropped rather than stored', () => {
    expect(sanitizeOyvDraft({ doing_for_others: 'a', not_a_question: 'b' })).toEqual({
      doing_for_others: 'a',
    });
  });

  it('she comes back to the first question she has not answered', () => {
    expect(firstUnansweredIndex({})).toBe(0);
    expect(firstUnansweredIndex({ doing_for_others: 'a' })).toBe(1);
    expect(firstUnansweredIndex(fullAnswers())).toBe(OYV_QUESTIONS.length);
  });
});

describe('the coach side', () => {
  it('names this experience on the assignment list rather than calling it Assessment', () => {
    const names = read('lib/assignments/experienceNames.ts');
    expect(names).toContain('OYV_DEFINITION_ID');
    expect(names).toContain('OYV_LABEL');
    // The detail panel and the This Week band both read the one map.
    expect(read('app/coach/clients/[id]/detail/page.tsx')).toContain('assignmentNameRecord()');
    expect(read('app/actions/coachWeek.ts')).toContain('assignmentNamesByDefinitionId()');
  });

  it('the panel shows the held sentence first and then all nine answers', () => {
    const full = read('app/coach/clients/[id]/OwningYourValuePanel.tsx');
    // From the component body down, so the alphabetical import block above
    // it cannot decide the order this is asserting.
    const panel = full.slice(full.indexOf('export function OwningYourValuePanel'));
    const openerAt = panel.indexOf('OYV_OPENER_HEADING');
    const answersAt = panel.indexOf('OYV_ANSWERS_HEADING');
    expect(openerAt).toBeGreaterThan(-1);
    expect(answersAt).toBeGreaterThan(openerAt);
    expect(panel).toContain('selected.heldSentence');
    expect(panel).toContain('OYV_QUESTIONS.filter');
  });

  it('the assign button sends a default due date seven days out', () => {
    const action = read('app/actions/owningYourValue.ts');
    expect(action).toContain('OYV_DEFAULT_DUE_IN_DAYS');
    expect(action).toContain('dueAtInDays(');
    expect(read('lib/owning-your-value/constants.ts')).toContain(
      'export const OYV_DEFAULT_DUE_IN_DAYS = 7;'
    );
  });

  it('the follow-up field exists in the model and is null for this template', () => {
    const migration = readFileSync(
      path.resolve(APP_ROOT, '../../supabase/migrations/00000000000211_owning_your_value.sql'),
      'utf8'
    );
    expect(migration).toContain('follow_up_source_experience_key text');
    expect(read('lib/owning-your-value/data.ts')).toContain('follow_up_source_experience_key: null');
  });
});
