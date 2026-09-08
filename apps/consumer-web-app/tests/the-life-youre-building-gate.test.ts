/**
 * The Life You're Building: the gate, the marks, the draft, and the closing
 * that holds.
 *
 * THE ASSIGNMENT IS THE ENTIRE GATE. That is not provable by testing four
 * tiers, because a fifth would slip through. It is proved by counting the
 * TABLES the gate reads: if it never asks a subscription or a visibility
 * table anything, no plan can change its answer. It is also not gated on
 * having finished any template beside it, INCLUDING the one this template
 * can follow, which is asserted directly, in the source and at runtime.
 *
 * EIGHT TEMPLATES SHARE ONE TABLE AND MUST NOT SHARE A ROW. Every read here
 * is scoped by experience_key, so a member with all eight Happiness
 * deep-dives assigned can never be shown one template's answers under
 * another template's questions. The eight-way version of that proof lives
 * in its own describe block below and reads all eight features at once.
 *
 * NO RENDER WRITES. This experience has a draft row, which is exactly the
 * situation where a render-time write creeps in. The write count is
 * asserted directly against the real service, on both the standalone and
 * the follow-up path.
 *
 * THE MARKS SAVE AND RESUME LIKE ANYTHING ELSE SHE WROTE. Three of the nine
 * questions open with something that leaves no prose at all, so a resume
 * that only restored writing would drop a member who had placed herself on
 * two lines back at the first of them.
 *
 * THE CLOSING HOLDS. The bug this experience must not inherit lives in the
 * shape of the files rather than in any value, so it is asserted in the
 * source: the route never redirects a completed sitting, and the
 * pending-versus-completed branch is inside the mounted client component.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildTlybState } from '@/lib/the-life-youre-building/service';
import { resolveTlybAccess } from '@/lib/the-life-youre-building/access';
import { TLYB_DEFINITION_ID, TLYB_KEY } from '@/lib/the-life-youre-building/constants';
import { YOC_DEFINITION_ID, YOC_KEY } from '@/lib/your-own-company/constants';
import { WYPD_DEFINITION_ID, WYPD_KEY } from '@/lib/what-you-put-down/constants';
import { BSN_DEFINITION_ID, BSN_KEY } from '@/lib/being-seen/constants';
import { TWOY_DEFINITION_ID, TWOY_KEY } from '@/lib/the-weight-of-yes/constants';
import { TGL_DEFINITION_ID, TGL_KEY } from '@/lib/the-giving-ledger/constants';
import { OYV_DEFINITION_ID, OYV_KEY } from '@/lib/owning-your-value/constants';
import { WYJL_DEFINITION_ID, WYJL_KEY } from '@/lib/where-your-joy-lives/constants';
import {
  TLYB_QUESTIONS,
  TLYB_SENTENCE_KEY,
  TLYB_SLIDER_KEYS,
  TLYB_STONE_KEY,
  firstUnfinishedIndex,
  sanitizeTlybAnswers,
  sanitizeTlybDraft,
  tlybBlockedReasonFor,
  tlybSittingComplete,
} from '@/lib/the-life-youre-building/questions';
import {
  TLYB_EMPTY_SLIDERS,
  sanitizeTlybSliders,
  tlybAllPlaced,
  tlybPlacedCount,
  tlybPositionFor,
  tlybWithPosition,
} from '@/lib/the-life-youre-building/sliders';

const APP_ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(APP_ROOT, rel), 'utf8');
const MIGRATIONS = path.resolve(APP_ROOT, '../../supabase/migrations');
const MIGRATION = path.join(MIGRATIONS, '00000000000219_the_life_youre_building.sql');
const MEMBER = '88888888-8888-4888-8888-888888888888';

function fullAnswers(): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const question of TLYB_QUESTIONS) {
    answers[question.key] = `answer for ${question.key}`;
  }
  return answers;
}

function fullSliders() {
  return { positions: { built_or_handed: 20, beginning_or_almost: 55, what_is_between: 90 } };
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
    experience_key: TLYB_KEY,
    questions_version: 1,
    answers: fullAnswers(),
    first_stone: 'answer for the_first_stone',
    forward_sentence: 'answer for the_sentence_forward',
    slider_positions: fullSliders(),
    follow_up_source_experience_key: null,
    held_sentence: null,
    started_at: '2026-09-07T10:00:00.000Z',
    completed_at: '2026-09-07T10:20:00.000Z',
    created_at: '2026-09-07T10:00:00.000Z',
    ...overrides,
  };
}

/** A completed sitting of one of the seven templates that share this table. */
function otherTemplateRow(key: string) {
  return sessionRow({
    id: `other-${key}`,
    assignment_id: `assignment-${key}`,
    experience_key: key,
    first_stone: null,
    forward_sentence: null,
    slider_positions: null,
    completed_at: '2026-09-01T09:00:00.000Z',
  });
}

/**
 * A Supabase stand-in that honours the experience_key filter.
 *
 * That is the whole point on a template sharing a table with seven others:
 * a fake that ignored the filter would let a test pass while the real code
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
    for (const method of ['select', 'in', 'is', 'neq', 'gte', 'lte', 'order', 'limit']) {
      chain[method] = () => chain;
    }
    chain.not = (column: string) => {
      if (table === 'member_happiness_deep_dive_sessions' && column === 'completed_at') {
        rows = rows.filter((entry) => entry.completed_at !== null);
      }
      return chain;
    };
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
    expect(await buildTlybState(fakeClient(), MEMBER)).toBeNull();
  });

  it('and deciding that writes nothing', async () => {
    await buildTlybState(fakeClient(), MEMBER);
    expect(writes).toEqual([]);
    // It really did look, so "no writes" is not "did nothing".
    expect(reads).toContain('assessment_assignments');
  });

  it('is offered nothing even with all seven earlier templates finished', async () => {
    world.sessions = [OYV_KEY, WYJL_KEY, TGL_KEY, TWOY_KEY, BSN_KEY, WYPD_KEY, YOC_KEY].map(
      otherTemplateRow
    );
    expect(await buildTlybState(fakeClient(), MEMBER)).toBeNull();
  });
});

describe('the assignment is the entire gate', () => {
  it('an assigned member is offered it', async () => {
    world.assignment = OPEN_ASSIGNMENT;
    const state = await buildTlybState(fakeClient(), MEMBER);
    expect(state?.status).toBe('pending');
    expect(state?.status === 'pending' && state.assignmentId).toBe('assignment-1');
  });

  it('NO TIER OR VISIBILITY TABLE IS EVER CONSULTED, so no plan can change the answer', async () => {
    world.assignment = OPEN_ASSIGNMENT;
    await buildTlybState(fakeClient(), MEMBER);
    world.assignment = null;
    world.sessions = [sessionRow()];
    await buildTlybState(fakeClient(), MEMBER);

    for (const table of [
      'member_subscriptions',
      'member_visibility',
      'profiles',
      'membership_tiers',
      'member_feature_grants',
      'coach_client_assignments',
    ]) {
      expect(reads, `the gate read ${table}`).not.toContain(table);
    }
    expect(new Set(reads)).toEqual(
      new Set(['assessment_assignments', 'member_happiness_deep_dive_sessions'])
    );
  });

  it('is NOT gated on having finished any template beside it, including the one it can follow', () => {
    const access = read('lib/the-life-youre-building/access.ts')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    for (const other of [
      'owning-your-value',
      'where-your-joy-lives',
      'the-giving-ledger',
      'the-weight-of-yes',
      'being-seen',
      'what-you-put-down',
      'your-own-company',
    ]) {
      expect(access, `the gate imports ${other}`).not.toContain(other);
    }
    // And the follow-up module, which DOES read another template, is
    // resolved after the gate rather than inside it.
    expect(access).not.toContain('followUp');
    const service = read('lib/the-life-youre-building/service.ts');
    expect(service.indexOf('resolveTlybAccess({')).toBeLessThan(
      service.indexOf('resolveTlybFollowUp(')
    );
  });

  it('an assigned member with no earlier sitting at all is offered it exactly the same', async () => {
    world.assignment = OPEN_ASSIGNMENT;
    world.sessions = [];
    const first = await buildTlybState(fakeClient(), MEMBER);

    world.sessions = [otherTemplateRow(OYV_KEY)];
    const second = await buildTlybState(fakeClient(), MEMBER);

    expect(first?.status).toBe('pending');
    expect(second?.status).toBe('pending');
    expect(first?.status === 'pending' && first.assignmentId).toBe(
      second?.status === 'pending' ? second.assignmentId : null
    );
  });

  it('offering it, with a draft and two marks placed, still writes nothing', async () => {
    world.assignment = OPEN_ASSIGNMENT;
    world.sessions = [
      sessionRow({
        completed_at: null,
        answers: { built_or_handed: 'half written' },
        slider_positions: { positions: { built_or_handed: 30, beginning_or_almost: 70 } },
      }),
    ];
    const state = await buildTlybState(fakeClient(), MEMBER);
    expect(state?.status).toBe('pending');
    expect(state?.status === 'pending' && state.draft).toEqual({
      built_or_handed: 'half written',
    });
    expect(state?.status === 'pending' && state.sliders.positions).toEqual({
      built_or_handed: 30,
      beginning_or_almost: 70,
    });
    expect(writes).toEqual([]);
  });

  it('addresses the one fixed catalog definition, and nothing else', () => {
    expect(TLYB_DEFINITION_ID).toBe('c9f4a1d7-8e52-4b36-a7c1-4d9b2e650f83');
    const migration = readFileSync(MIGRATION, 'utf8');
    expect(migration).toContain(TLYB_DEFINITION_ID);
    expect(migration).toContain("'the-life-youre-building'");
    expect(read('lib/the-life-youre-building/data.ts')).toContain('TLYB_DEFINITION_ID');
  });
});

describe('eight templates, one table, never one row', () => {
  /** The eight Happiness templates, each with the file that reads the shared table. */
  const FAMILY = [
    { key: OYV_KEY, id: OYV_DEFINITION_ID, data: 'lib/owning-your-value/data.ts' },
    { key: WYJL_KEY, id: WYJL_DEFINITION_ID, data: 'lib/where-your-joy-lives/data.ts' },
    { key: TGL_KEY, id: TGL_DEFINITION_ID, data: 'lib/the-giving-ledger/data.ts' },
    { key: TWOY_KEY, id: TWOY_DEFINITION_ID, data: 'lib/the-weight-of-yes/data.ts' },
    { key: BSN_KEY, id: BSN_DEFINITION_ID, data: 'lib/being-seen/data.ts' },
    { key: WYPD_KEY, id: WYPD_DEFINITION_ID, data: 'lib/what-you-put-down/data.ts' },
    { key: YOC_KEY, id: YOC_DEFINITION_ID, data: 'lib/your-own-company/data.ts' },
    { key: TLYB_KEY, id: TLYB_DEFINITION_ID, data: 'lib/the-life-youre-building/data.ts' },
  ];

  it('the eight keys and the eight definition ids are all distinct', () => {
    expect(new Set(FAMILY.map((entry) => entry.key)).size).toBe(8);
    expect(new Set(FAMILY.map((entry) => entry.id)).size).toBe(8);
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
    await buildTlybState(fakeClient(), MEMBER);

    expect(sessionFilters.length).toBeGreaterThan(0);
    expect(sessionFilters).toContainEqual(['experience_key', TLYB_KEY]);
    for (const other of [WYJL_KEY, TGL_KEY, TWOY_KEY, BSN_KEY, WYPD_KEY, YOC_KEY]) {
      expect(sessionFilters).not.toContainEqual(['experience_key', other]);
    }

    // And the history read is scoped too, on the path that actually runs it.
    world.assignment = null;
    sessionFilters = [];
    world.sessions = [sessionRow()];
    await buildTlybState(fakeClient(), MEMBER);
    expect(sessionFilters).toContainEqual(['experience_key', TLYB_KEY]);
  });

  it("another template's finished sitting never leaks in as this one's draft or marks", async () => {
    world.assignment = OPEN_ASSIGNMENT;
    world.sessions = [WYJL_KEY, TGL_KEY, TWOY_KEY, BSN_KEY, WYPD_KEY, YOC_KEY].map(
      otherTemplateRow
    );
    const state = await buildTlybState(fakeClient(), MEMBER);
    expect(state?.status === 'pending' && state.draft).toEqual({});
    expect(state?.status === 'pending' && state.sliders).toEqual(TLYB_EMPTY_SLIDERS);
  });

  it('the migration pairs this key with this definition and leaves the other seven standing', () => {
    const migration = readFileSync(MIGRATION, 'utf8');
    for (const entry of FAMILY) {
      expect(migration).toContain(`experience_key = '${entry.key}'`);
      expect(migration).toContain(entry.id);
      expect(migration).toContain(`when '${entry.key}' then`);
    }
  });

  it('each template stores its own question in its OWN column, never a shared one', () => {
    const migration = readFileSync(MIGRATION, 'utf8');
    expect(migration).toContain('first_stone');
    expect(migration).toContain('forward_sentence');
    expect(migration).toContain('slider_positions');
    for (const file of [
      'lib/the-life-youre-building/data.ts',
      'app/actions/theLifeYoureBuilding.ts',
    ]) {
      // Its own writes never touch another template's column. held_sentence
      // is deliberately excluded from this list for the action file, which
      // READS Owning Your Value's own column through that template's own
      // accessor; the assertion below pins that it is only ever read.
      expect(read(file)).not.toContain('twenty_minute_joy');
      expect(read(file)).not.toContain('deposit_request');
      expect(read(file)).not.toContain('kind_no');
      expect(read(file)).not.toContain('noticed_wish');
      expect(read(file)).not.toContain('shelf_state');
      expect(read(file)).not.toContain('doorway');
      expect(read(file)).not.toContain('rewritten_line');
      expect(read(file)).not.toContain('instinct_state');
    }
    // This template never writes held_sentence anywhere: it reads Owning
    // Your Value's stored answer through that template's own record type.
    expect(read('lib/the-life-youre-building/data.ts')).not.toContain('held_sentence');
    expect(read('app/actions/theLifeYoureBuilding.ts')).not.toContain('held_sentence:');

    // And the seven templates before it never learned about this one's columns.
    for (const file of [
      'lib/owning-your-value/data.ts',
      'lib/where-your-joy-lives/data.ts',
      'lib/the-giving-ledger/data.ts',
      'lib/the-weight-of-yes/data.ts',
      'lib/being-seen/data.ts',
      'lib/what-you-put-down/data.ts',
      'lib/your-own-company/data.ts',
      'app/actions/owningYourValue.ts',
      'app/actions/whereYourJoyLives.ts',
      'app/actions/theGivingLedger.ts',
      'app/actions/theWeightOfYes.ts',
      'app/actions/beingSeen.ts',
      'app/actions/whatYouPutDown.ts',
      'app/actions/yourOwnCompany.ts',
    ]) {
      expect(read(file), file).not.toContain('first_stone');
      expect(read(file), file).not.toContain('forward_sentence');
      expect(read(file), file).not.toContain('slider_positions');
    }
  });

  it('the eight pop-up keys cannot silence each other', () => {
    const data = read('lib/root-popup-messages/data.ts');
    expect(data).toContain('`owning_your_value:${assignmentId}`');
    expect(data).toContain('`where_your_joy_lives:${assignmentId}`');
    expect(data).toContain('`the_giving_ledger:${assignmentId}`');
    expect(data).toContain('`the_weight_of_yes:${assignmentId}`');
    expect(data).toContain('`being_seen:${assignmentId}`');
    expect(data).toContain('`what_you_put_down:${assignmentId}`');
    expect(data).toContain('`your_own_company:${assignmentId}`');
    expect(data).toContain('`the_life_youre_building:${assignmentId}`');
  });

  it("a draft for this template drops the other seven templates' own keys", () => {
    expect(
      sanitizeTlybDraft({
        ordinary_day: 'mine',
        held_sentence: 'owning your value',
        twenty_minute_version: 'where your joy lives',
        deposit_to_ask_for: 'the giving ledger',
        kind_version: 'the weight of yes',
        wish_noticed: 'being seen',
        used_to_be: 'what you put down',
        greatest_hits: 'your own company',
        not_a_question: 'nothing',
      })
    ).toEqual({ ordinary_day: 'mine' });
  });
});

describe('the three stored pieces each have their own storage', () => {
  it('question eight is stored beside the answers rather than only inside them', () => {
    const migration = readFileSync(MIGRATION, 'utf8');
    expect(migration).toContain('add column if not exists first_stone text');
    expect(read('lib/the-life-youre-building/data.ts')).toContain(
      'first_stone: params.firstStone'
    );
    expect(read('app/actions/theLifeYoureBuilding.ts')).toContain('TLYB_STONE_KEY');
    expect(TLYB_STONE_KEY).toBe('the_first_stone');
  });

  it('question nine is stored in BOTH modes, in a column of its own', () => {
    const migration = readFileSync(MIGRATION, 'utf8');
    expect(migration).toContain('add column if not exists forward_sentence text');
    const data = read('lib/the-life-youre-building/data.ts');
    expect(data).toContain('forward_sentence: params.forwardSentence');
    // The completing write is the ONE place it is written, and it does not
    // branch on the mode: a standalone sitting stores it exactly as a
    // follow-up sitting does.
    const completing = data.slice(data.indexOf('export async function completeTlybSession'));
    const updateCall = completing.slice(
      completing.indexOf('.update({'),
      completing.indexOf(".eq('id'")
    );
    expect(updateCall).toContain('forward_sentence');
    expect(updateCall).not.toContain('follow_up_source_experience_key');
    expect(TLYB_SENTENCE_KEY).toBe('the_sentence_forward');
  });

  it('her three marks are stored structured, in a column of their own', () => {
    const migration = readFileSync(MIGRATION, 'utf8');
    expect(migration).toContain('add column if not exists slider_positions jsonb');
    expect(read('lib/the-life-youre-building/data.ts')).toContain(
      'slider_positions: params.sliders'
    );
  });
});

describe('a mark can only ever be one she could have made', () => {
  it('a position under a question this template does not ask is refused', () => {
    expect(
      sanitizeTlybSliders(
        { positions: { built_or_handed: 40, ordinary_day: 90, made_up: 10 } },
        TLYB_SLIDER_KEYS
      )
    ).toEqual({ positions: { built_or_handed: 40 } });
  });

  it('a value off the line, or not a number, is no mark at all', () => {
    expect(
      sanitizeTlybSliders(
        {
          positions: {
            built_or_handed: -1,
            beginning_or_almost: 101,
            what_is_between: '50',
          },
        },
        TLYB_SLIDER_KEYS
      )
    ).toEqual({ positions: {} });
    // A float she could not have set with a step of 1 is rounded to the
    // whole number on the line rather than stored as a float.
    expect(
      sanitizeTlybSliders({ positions: { built_or_handed: 42.4 } }, TLYB_SLIDER_KEYS)
    ).toEqual({ positions: { built_or_handed: 42 } });
    // The two ends of the line are legitimate places to stand.
    expect(
      sanitizeTlybSliders(
        { positions: { built_or_handed: 0, what_is_between: 100 } },
        TLYB_SLIDER_KEYS
      )
    ).toEqual({ positions: { built_or_handed: 0, what_is_between: 100 } });
  });

  it('nonsense in, no marks out, and never a thrown error', () => {
    for (const input of [null, undefined, 'nope', 42, [], { positions: 'nope' }, {}]) {
      expect(sanitizeTlybSliders(input, TLYB_SLIDER_KEYS)).toEqual({ positions: {} });
    }
  });

  it('null is not zero: a line she never touched is absent rather than at the near pole', () => {
    const placed = tlybWithPosition(TLYB_EMPTY_SLIDERS, 'built_or_handed', 0);
    expect(tlybPositionFor(placed, 'built_or_handed')).toBe(0);
    expect(tlybPositionFor(placed, 'what_is_between')).toBeNull();
    expect(tlybPlacedCount(placed, TLYB_SLIDER_KEYS)).toBe(1);
    expect(tlybAllPlaced(placed, TLYB_SLIDER_KEYS)).toBe(false);
    expect(tlybAllPlaced({ positions: fullSliders().positions }, TLYB_SLIDER_KEYS)).toBe(true);
  });

  it('the server filters her marks rather than accepting them', () => {
    const action = read('app/actions/theLifeYoureBuilding.ts');
    expect(action).toContain('sanitizeTlybSliders(sliders, TLYB_SLIDER_KEYS)');
    // On both writes, not only on the completion.
    expect(action.match(/sanitizeTlybSliders\(sliders, TLYB_SLIDER_KEYS\)/g)?.length).toBe(2);
  });
});

describe('a finished sitting', () => {
  it('is returned rather than nothing, so a member who comes back gets an answer', async () => {
    world.assignment = null;
    world.sessions = [sessionRow()];
    const state = await buildTlybState(fakeClient(), MEMBER);
    expect(state?.status).toBe('completed');
    expect(state?.status === 'completed' && state.session.firstStone).toBe(
      'answer for the_first_stone'
    );
    expect(state?.status === 'completed' && state.session.forwardSentence).toBe(
      'answer for the_sentence_forward'
    );
    expect(state?.status === 'completed' && state.session.sliders).toEqual(fullSliders());
  });

  it('a completed row never comes back as a resumable draft', async () => {
    world.assignment = OPEN_ASSIGNMENT;
    world.sessions = [sessionRow()];
    const state = await buildTlybState(fakeClient(), MEMBER);
    expect(state?.status).toBe('pending');
    expect(state?.status === 'pending' && state.draft).toEqual({});
    expect(state?.status === 'pending' && state.sliders).toEqual(TLYB_EMPTY_SLIDERS);
  });
});

describe('both reads fail shut', () => {
  it('a broken assignment read offers nothing', async () => {
    world.assignment = 'error';
    expect(await buildTlybState(fakeClient(), MEMBER)).toBeNull();
  });

  it('a broken session read offers nothing', async () => {
    world.sessions = 'error';
    expect(await buildTlybState(fakeClient(), MEMBER)).toBeNull();
  });

  it('the rule itself resolves both failures to "none"', () => {
    expect(
      resolveTlybAccess({
        assignmentRead: { ok: false, assignment: null },
        sessionRead: { ok: true, records: [] },
      }).kind
    ).toBe('none');
    expect(
      resolveTlybAccess({
        assignmentRead: { ok: true, assignment: null },
        sessionRead: { ok: false, records: [] },
      }).kind
    ).toBe('none');
  });
});

describe('one rule, three surfaces', () => {
  it('the route, the Home card and the pop-up chain all read the same accessor', () => {
    for (const file of [
      'app/the-life-youre-building/page.tsx',
      'app/dashboard/page.tsx',
      'app/actions/rootPopupMessages.ts',
    ]) {
      expect(read(file), file).toContain('getMyTheLifeYoureBuilding');
    }
  });

  it('none of the three adds a tier or visibility check of its own around it', () => {
    const page = read('app/the-life-youre-building/page.tsx');
    expect(page).not.toContain('membership');
    expect(page).not.toContain('visibility');
    expect(page).not.toContain('minLevel');
  });

  it('the route turns a typed URL away server side rather than hiding the content', () => {
    const page = read('app/the-life-youre-building/page.tsx');
    expect(page).toContain('if (!state) redirect(');
  });

  it('the route is member only, so a coach following an old link lands on their own dashboard', () => {
    expect(read('lib/auth/staffRouting.ts')).toContain("'/the-life-youre-building'");
  });

  it('the pop-up branch checks its own due-ness before returning a candidate', () => {
    const chain = read('app/actions/rootPopupMessages.ts');
    const branch = chain.slice(chain.indexOf('const theLifeYoureBuilding = await'));
    expect(branch.slice(0, 600)).toContain('isRecurringMessageDue(messageKey)');
  });

  it('its knock is protected from the one-knock delay, like every other coach assignment', () => {
    expect(read('lib/root-popup-messages/oneKnock.ts')).toContain(
      "'the_life_youre_building_assigned'"
    );
  });
});

describe('no render in this feature writes', () => {
  it('nothing on the read path calls insert, upsert or a save', () => {
    for (const file of [
      'lib/the-life-youre-building/service.ts',
      'lib/the-life-youre-building/access.ts',
      'lib/the-life-youre-building/view.ts',
      'lib/the-life-youre-building/followUp.ts',
      'app/the-life-youre-building/page.tsx',
    ]) {
      const source = read(file)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect(source, file).not.toContain('.insert(');
      expect(source, file).not.toContain('.upsert(');
      expect(source, file).not.toContain('.update(');
      expect(source, file).not.toContain('saveTlybDraft');
      expect(source, file).not.toContain('completeTlybSession');
    }
  });

  it('the only writers are the server actions, and each is reached by a button', () => {
    const experience = read(
      'components/the-life-youre-building/TheLifeYoureBuildingExperience.tsx'
    );
    for (const call of [
      'saveTheLifeYoureBuildingDraftAction(draft, sliders)',
      'submitTheLifeYoureBuildingAction(draft, sliders)',
      'startTheLifeYoureBuildingExperimentAction(finished.sessionId)',
    ]) {
      expect(experience).toContain(call);
    }
    // No effect calls any of them: they are reached from advance() and the
    // two experiment handlers, all of which are onClick.
    expect(experience).not.toContain('useEffect');
  });
});

describe('the closing holds', () => {
  const page = read('app/the-life-youre-building/page.tsx');
  const experience = read(
    'components/the-life-youre-building/TheLifeYoureBuildingExperience.tsx'
  );

  it('the route never sends a completed sitting anywhere else', () => {
    const redirects = page.match(/redirect\([^)]*\)/g) ?? [];
    expect(redirects).toEqual(["redirect('/login')", "redirect('/dashboard')"]);
    expect(page).not.toContain("state.status === 'completed' && redirect");
  });

  it('the pending versus completed branch lives inside the mounted client component', () => {
    expect(experience).toContain("if (status === 'completed' && !finished)");
    expect(page).toContain('<TheLifeYoureBuildingExperience');
  });

  it('finishing revalidates Home only, never the route she is standing on', () => {
    const action = read('app/actions/theLifeYoureBuilding.ts');
    const submit = action.slice(
      action.indexOf('export async function submitTheLifeYoureBuildingAction'),
      action.indexOf('async function followUpSentenceFor')
    );
    expect(submit).toContain("revalidatePath('/dashboard')");
    expect(submit).not.toContain("revalidatePath('/the-life-youre-building')");
  });

  it('saving a draft revalidates nothing at all', () => {
    const action = read('app/actions/theLifeYoureBuilding.ts');
    const save = action.slice(
      action.indexOf('export async function saveTheLifeYoureBuildingDraftAction'),
      action.indexOf('export type SubmitTlybResult')
    );
    expect(save).not.toContain('revalidatePath');
  });

  it('the closing screen is reached by state, never by a navigation', () => {
    expect(experience).toContain('setStep(CLOSING_STEP)');
    expect(experience).not.toContain("router.push('/the-life-youre-building')");
  });
});

describe('save and resume, including the marks', () => {
  it('a partial draft is storable and a partial sheet is never a completion', () => {
    expect(sanitizeTlybDraft({ ordinary_day: 'something' })).toEqual({
      ordinary_day: 'something',
    });
    expect(sanitizeTlybAnswers({ ordinary_day: 'something' })).toBeNull();
    expect(sanitizeTlybAnswers(fullAnswers())).toEqual(fullAnswers());
  });

  it('whitespace is not an answer', () => {
    expect(sanitizeTlybDraft({ ordinary_day: '   \n\t ' })).toEqual({});
    const almost = fullAnswers();
    almost.ordinary_day = '  ';
    expect(sanitizeTlybAnswers(almost)).toBeNull();
  });

  it('a full sheet of writing with an unplaced line is NOT a finished sitting', () => {
    const answers = fullAnswers();
    expect(sanitizeTlybAnswers(answers)).not.toBeNull();
    const twoOfThree = {
      positions: { built_or_handed: 20, beginning_or_almost: 55 },
    };
    expect(tlybSittingComplete(answers, twoOfThree)).toBe(false);
    expect(tlybSittingComplete(answers, { positions: fullSliders().positions })).toBe(true);
  });

  it('the server refuses that same half-finished sitting, not just the button', () => {
    const action = read('app/actions/theLifeYoureBuilding.ts');
    expect(action).toContain('if (!tlybSittingComplete(clean, cleanSliders))');
  });

  it('she comes back to the first question she has not finished, marks included', () => {
    // Nothing done at all.
    expect(firstUnfinishedIndex({}, TLYB_EMPTY_SLIDERS)).toBe(0);

    // Question one's mark placed but nothing written: still question one.
    expect(
      firstUnfinishedIndex({}, { positions: { built_or_handed: 30 } })
    ).toBe(0);

    // Question one whole: question two.
    expect(
      firstUnfinishedIndex(
        { built_or_handed: 'written' },
        { positions: { built_or_handed: 30 } }
      )
    ).toBe(1);

    // Everything: past the end.
    expect(
      firstUnfinishedIndex(fullAnswers(), { positions: fullSliders().positions })
    ).toBe(TLYB_QUESTIONS.length);
  });

  it('a question with two halves says which half is missing', () => {
    const slider = TLYB_QUESTIONS[0]!;
    expect(tlybBlockedReasonFor(slider, {}, TLYB_EMPTY_SLIDERS)).toBe(
      'Put your mark somewhere on the line first. You can move it.'
    );
    expect(
      tlybBlockedReasonFor(slider, {}, { positions: { built_or_handed: 30 } })
    ).toBe('Write something here first. There is no wrong answer.');
    expect(
      tlybBlockedReasonFor(
        slider,
        { built_or_handed: 'written' },
        { positions: { built_or_handed: 30 } }
      )
    ).toBeNull();
  });

  it('a plain written question never asks for a mark', () => {
    const written = TLYB_QUESTIONS[2]!;
    expect(tlybBlockedReasonFor(written, {}, TLYB_EMPTY_SLIDERS)).toBe(
      'Write something here first. There is no wrong answer.'
    );
  });

  it('the saved draft carries the marks as well as the writing', () => {
    const data = read('lib/the-life-youre-building/data.ts');
    const save = data.slice(
      data.indexOf('export async function saveTlybDraft'),
      data.indexOf('export async function completeTlybSession')
    );
    expect(save).toContain('answers: params.draft');
    expect(save).toContain('slider_positions: params.sliders');
  });
});

describe('the coach side', () => {
  it('names this experience on the assignment list rather than calling it Assessment', () => {
    const names = read('lib/assignments/experienceNames.ts');
    expect(names).toContain('TLYB_DEFINITION_ID');
    expect(names).toContain('TLYB_LABEL');
    expect(read('lib/assignments/assignableCatalog.ts')).toContain(
      "id: 'the-life-youre-building'"
    );
  });

  it('the panel shows her positions, then the first stone, then the writing', () => {
    const full = read('app/coach/clients/[id]/TheLifeYoureBuildingPanel.tsx');
    const panel = full.slice(full.indexOf('export function TheLifeYoureBuildingPanel'));
    const positionsAt = panel.indexOf('<ThePositions');
    const stoneAt = panel.indexOf('<TheFirstStone');
    const answersAt = panel.indexOf('TLYB_COACH_COPY.answersHeading');
    expect(positionsAt).toBeGreaterThan(-1);
    expect(stoneAt).toBeGreaterThan(positionsAt);
    expect(answersAt).toBeGreaterThan(stoneAt);
  });

  it('the eight cards all stand on the client screen, each with its own Assign button', () => {
    const detail = read('app/coach/clients/[id]/detail/page.tsx');
    for (const card of [
      'OwningYourValuePanel',
      'WhereYourJoyLivesPanel',
      'TheGivingLedgerPanel',
      'TheWeightOfYesPanel',
      'BeingSeenPanel',
      'WhatYouPutDownPanel',
      'YourOwnCompanyPanel',
      'TheLifeYoureBuildingPanel',
    ]) {
      expect(detail, card).toContain(`<${card}`);
    }
    expect(read('lib/coach-detail/sections.ts')).toContain(
      'detail-card-the-life-youre-building'
    );
  });

  it('the assign button sends a default due date seven days out', () => {
    const action = read('app/actions/theLifeYoureBuilding.ts');
    expect(action).toContain('TLYB_DEFAULT_DUE_IN_DAYS');
    expect(read('lib/the-life-youre-building/constants.ts')).toContain(
      'export const TLYB_DEFAULT_DUE_IN_DAYS = 7'
    );
    // From HER calendar day, not the coach's browser.
    expect(action).toContain('todaysLocalDate(await memberTimezone(supabase, clientId))');
  });

  it('assigning checks nothing about any other template', () => {
    const action = read('app/actions/theLifeYoureBuilding.ts');
    const assign = action.slice(
      action.indexOf('export async function assignTheLifeYoureBuildingAction')
    );
    expect(assign).not.toContain('listOyvSessions');
    expect(assign).not.toContain('resolveTlybFollowUp');
  });

  it('test accounts are excluded in the data layer, not by this screen remembering', () => {
    expect(read('app/actions/theLifeYoureBuilding.ts')).toContain('isMemberVisibleToStaff');
  });
});
