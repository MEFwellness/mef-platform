/**
 * The gate, end to end through the real service, against a fake database.
 *
 * tests/stress-load-questions.test.ts and tests/stress-load-patterns.test.ts
 * prove the pure rules. This proves the one that only means anything once
 * it is wired together: a member's answer to "is this offered to me" is ONE
 * answer, it comes from her coach's assignment and from nothing else, and
 * producing it writes nothing.
 *
 * THE TIER ASSERTION IS THE LOAD-BEARING ONE. The brief is explicit that
 * the assignment is the entire gate, with no tier lock on top. That is not
 * a thing you can prove by testing four tiers, because a fifth would slip
 * through. It is proved by counting the TABLES the gate reads: if it never
 * asks a subscription table anything, no tier can change its answer.
 *
 * The write count is asserted the same way tests/render-writes-and-prefetch.ts
 * asserts Home's, and for the same reason: "the same state comes back" was
 * always true and is not the claim.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildStressLoadState } from '@/lib/stress-load/service';
import { resolveStressLoadAccess } from '@/lib/stress-load/access';
import { STRESS_LOAD_DEFINITION_ID } from '@/lib/stress-load/constants';
import { buildStressLoadReading } from '@/lib/stress-load/patterns';
import { fullAnswers } from './stress-load-questions.test';

const APP_ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(APP_ROOT, rel), 'utf8');
const MEMBER = '11111111-1111-4111-8111-111111111111';

type World = {
  /** null means "no pending assignment", 'error' means the read itself failed. */
  assignment: Record<string, unknown> | null | 'error';
  /** [] means "never finished one", 'error' means the read itself failed. */
  sessions: Array<Record<string, unknown>> | 'error';
};

const world: World = { assignment: null, sessions: [] };

/** Every table the fake was asked to READ, in order. */
let reads: string[] = [];
/** Every write, as `verb:table`. A gate that writes fails here rather than in production. */
let writes: string[] = [];

function completedSessionRow(overrides: Record<string, unknown> = {}) {
  const answers = fullAnswers();
  return {
    id: 'session-1',
    assignment_id: 'assignment-1',
    questions_version: 1,
    answers,
    pattern: { ...buildStressLoadReading(answers), crossReference: null },
    started_at: '2026-08-29T10:00:00.000Z',
    completed_at: '2026-08-29T10:04:00.000Z',
    created_at: '2026-08-29T10:04:00.000Z',
    ...overrides,
  };
}

function fakeClient() {
  const builder = (table: string): Record<string, unknown> => {
    const failed =
      (table === 'assessment_assignments' && world.assignment === 'error') ||
      (table === 'member_stress_load_sessions' && world.sessions === 'error');

    const rows =
      table === 'assessment_assignments'
        ? world.assignment && world.assignment !== 'error'
          ? [world.assignment]
          : []
        : table === 'member_stress_load_sessions'
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
    expect(await buildStressLoadState(fakeClient(), MEMBER)).toBeNull();
  });

  it('and deciding that writes nothing', async () => {
    await buildStressLoadState(fakeClient(), MEMBER);
    expect(writes).toEqual([]);
    // It really did look, so "no writes" is not "did nothing".
    expect(reads).toContain('assessment_assignments');
  });
});

describe('the assignment is the entire gate', () => {
  it('an assigned member is offered it', async () => {
    world.assignment = { id: 'assignment-1', created_at: '2026-08-29T09:00:00.000Z', reason: null };
    const state = await buildStressLoadState(fakeClient(), MEMBER);
    expect(state?.status).toBe('pending');
    expect(state?.status === 'pending' && state.assignmentId).toBe('assignment-1');
  });

  it('NO TIER TABLE IS EVER CONSULTED, so no plan can change the answer', async () => {
    world.assignment = { id: 'assignment-1', created_at: '2026-08-29T09:00:00.000Z', reason: null };
    await buildStressLoadState(fakeClient(), MEMBER);

    const assigned = [...reads];
    world.assignment = null;
    reads = [];
    await buildStressLoadState(fakeClient(), MEMBER);

    for (const table of [...assigned, ...reads]) {
      expect(table).not.toBe('member_subscriptions');
      expect(table).not.toBe('member_access_facts');
      expect(table).not.toBe('profiles');
      expect(table).not.toBe('member_visibility_rules');
    }
  });

  it('offering it writes nothing either', async () => {
    world.assignment = { id: 'assignment-1', created_at: '2026-08-29T09:00:00.000Z', reason: null };
    await buildStressLoadState(fakeClient(), MEMBER);
    expect(writes).toEqual([]);
  });

  it('addresses the one fixed catalog definition, and nothing else', () => {
    expect(STRESS_LOAD_DEFINITION_ID).toBe('9f2c4d7e-3a51-4b86-9c0d-6e5f1a72b834');
    expect(read('../../supabase/migrations/00000000000190_stress_load_deep_dive.sql')).toContain(
      STRESS_LOAD_DEFINITION_ID
    );
  });
});

describe('a finished sitting', () => {
  it('reads as completed once the assignment has closed out', async () => {
    world.assignment = null;
    world.sessions = [completedSessionRow()];
    const state = await buildStressLoadState(fakeClient(), MEMBER);
    expect(state?.status).toBe('completed');
    expect(state?.status === 'completed' && state.session.interpretation?.patternKey).toBeTruthy();
  });

  it('is outranked by a fresh assignment, so re-assigning starts a new sitting', async () => {
    world.assignment = { id: 'assignment-2', created_at: '2026-08-30T09:00:00.000Z', reason: null };
    world.sessions = [completedSessionRow()];
    const state = await buildStressLoadState(fakeClient(), MEMBER);
    expect(state?.status).toBe('pending');
    expect(state?.status === 'pending' && state.assignmentId).toBe('assignment-2');
  });

  it('and the prior sitting is untouched by that, because nothing here writes', async () => {
    world.assignment = { id: 'assignment-2', created_at: '2026-08-30T09:00:00.000Z', reason: null };
    world.sessions = [completedSessionRow()];
    await buildStressLoadState(fakeClient(), MEMBER);
    expect(writes).toEqual([]);
  });
});

describe('a broken read fails shut', () => {
  it('an unreadable assignment offers nothing rather than guessing', async () => {
    world.assignment = 'error';
    expect(await buildStressLoadState(fakeClient(), MEMBER)).toBeNull();
  });

  it('an unreadable history offers nothing rather than a half state', async () => {
    world.assignment = null;
    world.sessions = 'error';
    expect(await buildStressLoadState(fakeClient(), MEMBER)).toBeNull();
  });

  it('the rule itself resolves both failures to "none"', () => {
    expect(
      resolveStressLoadAccess({
        assignmentRead: { ok: false, assignment: null },
        sessionRead: { ok: true, records: [] },
      }).kind
    ).toBe('none');
    expect(
      resolveStressLoadAccess({
        assignmentRead: { ok: true, assignment: null },
        sessionRead: { ok: false, records: [] },
      }).kind
    ).toBe('none');
  });
});

describe('one rule, three surfaces', () => {
  const SURFACES = [
    'app/stress-load/page.tsx',
    'app/dashboard/page.tsx',
    'app/actions/rootPopupMessages.ts',
  ];

  it('the route, the Home card and the pop-up chain all read the same accessor', () => {
    for (const surface of SURFACES) {
      expect(read(surface)).toContain('getMyStressLoadDeepDive');
    }
  });

  it('none of the three adds a tier or visibility check of its own around it', () => {
    // The Home card and the pop-up branch each gate on the state alone.
    const home = read('app/dashboard/page.tsx');
    expect(home).toContain("{stressLoad?.status === 'pending' && (");
    const chain = read('app/actions/rootPopupMessages.ts');
    expect(chain).toContain("if (stressLoad?.status === 'pending') {");
  });

  it('the route turns a typed URL away server side rather than hiding the content', () => {
    const route = read('app/stress-load/page.tsx');
    expect(route).toContain('const state = await getMyStressLoadDeepDive();');
    expect(route).toContain("if (!state) redirect('/dashboard');");
  });

  it('the route is member only, so a coach following an old link lands on their own dashboard', () => {
    expect(read('lib/auth/staffRouting.ts')).toContain("'/stress-load',");
  });
});

describe('no render in this feature writes', () => {
  it('nothing on the read path calls insert, upsert or a claim', () => {
    const readPath = [
      'lib/stress-load/view.ts',
      'lib/stress-load/service.ts',
      'lib/stress-load/access.ts',
      'app/stress-load/page.tsx',
      'components/stress-load/StressLoadEntry.tsx',
    ];
    for (const file of readPath) {
      const source = read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(source).not.toContain('.insert(');
      expect(source).not.toContain('.upsert(');
      expect(source).not.toContain('claimStressLoadSession');
    }
  });

  it('the only writer is the server action, and it is reached by a button', () => {
    const action = read('app/actions/stressLoad.ts');
    expect(action).toContain('claimStressLoadSession');
    const experience = read('components/stress-load/StressLoadExperience.tsx');
    expect(experience).toContain('submitStressLoadDeepDiveAction(draft)');
  });
});
