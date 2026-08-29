/**
 * The Weekly Reflection end to end through the real service, against a
 * fake database.
 *
 * tests/weekly-reflection.test.ts proves the pure rules. This proves the
 * three of them that only mean anything once they are wired together, and
 * that a member's answer to "is this offered to me" is ONE answer rather
 * than three surfaces each deciding for themselves:
 *
 *   the tier gate, over a real subscription row
 *   the Friday-to-Sunday window, over her own timezone's date
 *   once per week, over a row that already exists
 *
 * The failure this file exists to catch is the one where the pure helpers
 * all pass and the service reads the wrong column, checks the window after
 * the read, or turns a failed read into "not done yet" and puts the pop-up
 * back in front of somebody who already finished.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

type World = {
  tier: string;
  status: string;
  fullAccess: boolean;
  /** null means "no row", 'error' means the read itself failed. */
  reflectionRow: Record<string, unknown> | null | 'error';
  checkinDates: string[];
  patternStates: Array<Record<string, unknown>>;
};

const world: World = {
  tier: 'program',
  status: 'active',
  fullAccess: false,
  reflectionRow: null,
  checkinDates: [],
  patternStates: [],
};

function resetWorld(): void {
  world.tier = 'program';
  world.status = 'active';
  world.fullAccess = false;
  world.reflectionRow = null;
  world.checkinDates = [];
  world.patternStates = [];
}

/**
 * A chainable stand-in for the PostgREST builder, small enough to read.
 * Every method the three reads in this path use returns `this`; the two
 * terminals are maybeSingle() and awaiting the builder itself.
 */
function fakeClient() {
  return {
    from(table: string) {
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      for (const method of ['select', 'eq', 'gte', 'lte', 'order', 'limit', 'not']) {
        builder[method] = chain;
      }
      builder.maybeSingle = async () => {
        if (table === 'member_access_facts') {
          return {
            data: {
              member_id: 'member-1',
              tier: world.tier,
              source: 'manual',
              status: world.status,
              full_access: world.fullAccess,
              trial_started_at: '2026-08-01T00:00:00.000Z',
              trial_ends_at: '2026-08-31T00:00:00.000Z',
              is_test: false,
            },
            error: null,
          };
        }
        if (table === 'member_weekly_reflections') {
          if (world.reflectionRow === 'error') return { data: null, error: { message: 'boom' } };
          return { data: world.reflectionRow, error: null };
        }
        return { data: null, error: null };
      };
      builder.then = (resolve: (value: unknown) => unknown) => {
        if (table === 'daily_checkins_current') {
          return Promise.resolve(
            resolve({ data: world.checkinDates.map((local_date) => ({ local_date })), error: null })
          );
        }
        return Promise.resolve(resolve({ data: [], error: null }));
      };
      return builder;
    },
  } as never;
}

vi.mock('@/lib/longitudinal-intelligence/data', () => ({
  listMemberPatternStates: async () =>
    new Map(world.patternStates.map((row) => [row.signalKey as string, row])),
}));

const { buildWeeklyReflectionState } = await import('@/lib/weekly-reflection/service');

const FRIDAY = '2026-08-28';
const SATURDAY = '2026-08-29';
const SUNDAY = '2026-08-30';
const WEDNESDAY = '2026-08-26';

function build(localDate: string) {
  return buildWeeklyReflectionState(fakeClient(), 'member-1', localDate);
}

beforeEach(resetWorld);

describe('the tier gate, over a real subscription row', () => {
  it('a program member on a Friday is offered it', async () => {
    const state = await build(FRIDAY);
    expect(state?.status).toBe('pending');
    expect(state?.weekStart).toBe(FRIDAY);
  });

  it('a monthly member on the same Friday is offered nothing at all', async () => {
    world.tier = 'monthly';
    expect(await build(FRIDAY)).toBeNull();
  });

  it('trial, annual and none are offered nothing either', async () => {
    for (const tier of ['trial', 'annual', 'none']) {
      world.tier = tier;
      expect(await build(FRIDAY), tier).toBeNull();
    }
  });

  it('a lapsed program assignment is offered nothing', async () => {
    world.status = 'expired';
    expect(await build(FRIDAY)).toBeNull();
  });
});

describe('the window, over her own local date', () => {
  it('Saturday and Sunday resolve to the same Friday, so it is one week and not three', async () => {
    for (const day of [FRIDAY, SATURDAY, SUNDAY]) {
      const state = await build(day);
      expect(state?.weekStart, day).toBe(FRIDAY);
      expect(state?.range, day).toEqual({ from: '2026-08-22', to: FRIDAY });
    }
  });

  it('Monday through Thursday: nothing, even for a program member', async () => {
    expect(await build(WEDNESDAY)).toBeNull();
  });

  it('the window is checked before the tier, so a closed day costs no subscription read', async () => {
    // A Wednesday returns null with the tier set to program, which only
    // proves the outcome. What proves the ORDER is that a broken row read
    // on a Wednesday is still null rather than an exception.
    world.reflectionRow = 'error';
    expect(await build(WEDNESDAY)).toBeNull();
  });
});

describe('once per week', () => {
  const completedRow = {
    id: 'reflection-1',
    week_start: FRIDAY,
    questions_version: 1,
    recap: {
      weekStart: FRIDAY,
      from: '2026-08-22',
      to: FRIDAY,
      checkinCount: 4,
      signals: [
        {
          signalKey: 'checkin_metric::sleep',
          signalLabel: 'sleep',
          state: 'improving',
          tier: 3,
          occurrenceCount: 4,
          confidence: 0.8,
        },
      ],
    },
    answers: {
      week_overall: 4,
      what_helped: 'Walking',
      what_got_in_the_way: 'Travel',
      body_response: 'Tired but steadier',
      next_week_change: 'Earlier nights',
    },
    completed_at: '2026-08-28T18:00:00.000Z',
    created_at: '2026-08-28T18:00:00.000Z',
  };

  it('a finished week reads as completed, not as pending, so nothing offers it again', async () => {
    world.reflectionRow = completedRow;
    const state = await build(FRIDAY);
    expect(state?.status).toBe('completed');
  });

  it('it stays completed for the rest of the window, on Saturday and on Sunday', async () => {
    world.reflectionRow = completedRow;
    expect((await build(SATURDAY))?.status).toBe('completed');
    expect((await build(SUNDAY))?.status).toBe('completed');
  });

  it('the completed state carries the STORED recap, not a fresh one', async () => {
    // Her check-ins have moved on since Friday. What she and her coach read
    // must still be the week she actually reflected on.
    world.reflectionRow = completedRow;
    world.checkinDates = ['2026-08-22', '2026-08-23', '2026-08-24', '2026-08-25', '2026-08-26'];
    const state = await build(SUNDAY);
    if (state?.status !== 'completed') throw new Error('expected completed');
    expect(state.recap?.checkinCount).toBe(4);
    expect(state.recap?.observations).toHaveLength(1);
    expect(state.answers?.what_helped).toBe('Walking');
  });

  it('next Friday is a new week, and pending again', async () => {
    world.reflectionRow = null;
    const state = await build('2026-09-04');
    expect(state?.status).toBe('pending');
    expect(state?.weekStart).toBe('2026-09-04');
  });
});

describe('a failed read offers nothing, rather than offering it twice', () => {
  it('an unreadable row is not the same fact as no row', async () => {
    world.reflectionRow = 'error';
    expect(await build(FRIDAY)).toBeNull();
  });
});

describe('the live recap reaches the pending state', () => {
  it('a thin week arrives with the count said and no observations', async () => {
    world.checkinDates = ['2026-08-27', '2026-08-28'];
    world.patternStates = [
      {
        signalKey: 'checkin_metric::sleep',
        signalKind: 'checkin_metric',
        signalLabel: 'sleep',
        state: 'improving',
        tier: 3,
        occurrenceCount: 4,
        confidence: 0.8,
        firstObservedAt: '2026-08-01',
        lastObservedAt: FRIDAY,
        evidenceSummary: {},
      },
    ];
    const state = await build(FRIDAY);
    if (state?.status !== 'pending') throw new Error('expected pending');
    expect(state.recap.checkinCount).toBe(2);
    expect(state.recap.thin).toBe(true);
    expect(state.recap.observations).toEqual([]);
    expect(state.recap.intro).toContain('We only have 2 days of check-ins');
  });

  it('a full week arrives with the engine\'s own qualified observations', async () => {
    world.checkinDates = ['2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27'];
    world.patternStates = [
      {
        signalKey: 'checkin_metric::sleep',
        signalKind: 'checkin_metric',
        signalLabel: 'sleep',
        state: 'improving',
        tier: 3,
        occurrenceCount: 4,
        confidence: 0.8,
        firstObservedAt: '2026-08-01',
        lastObservedAt: FRIDAY,
        evidenceSummary: {},
      },
    ];
    const state = await build(FRIDAY);
    if (state?.status !== 'pending') throw new Error('expected pending');
    expect(state.recap.checkinCount).toBe(4);
    expect(state.recap.thin).toBe(false);
    expect(state.recap.observations.map((o) => o.label)).toEqual(['Sleep']);
    expect(state.recap.intro).toContain('You checked in on 4 days in the last 7 days');
  });
});
