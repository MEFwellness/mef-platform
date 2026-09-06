/**
 * The This Week band, driven through the real action.
 *
 * TWO CLAIMS THE PURE TESTS CANNOT MAKE.
 *
 * 1. THE RENDER WRITES NOTHING. This action is called from a page render,
 *    and the standing rule is that a render only reads. The fake Postgres
 *    below THROWS on insert, update, upsert, delete and rpc rather than
 *    counting them, so a write anywhere in the whole composed read path is
 *    a failed test rather than a number somebody has to notice. Nothing
 *    downstream is mocked out for this: the real readers for the check-in
 *    dates, the workouts, the reflection, the experiments, the Reset Plan
 *    and the assignment ledger all run.
 *
 * 2. IT DOES NOT RENDER FOR ANYONE BUT A PROGRAM TIER CLIENT, and "does
 *    not render" means null rather than an empty band, because an empty
 *    band would be a claim that there was nothing this week.
 *
 * And one it can make more cheaply than the pure tests can: that the
 * check-in read is issued for the SAME Friday the Weekly Reflection recap
 * would use, which is what stops the coach's "3 of 7" and the member's
 * "you checked in on 3 days" ever meaning different weeks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mostRecentReflectionWeekStart, recapRangeFor } from '@/lib/weekly-reflection/week';

// vi.mock factories are hoisted above every top level statement, so the
// fixture they read has to be hoisted with them. vi.hoisted is the
// supported way to do that; a plain const here is a ReferenceError at
// mock time rather than at test time, which is a confusing way to find out.
const { NY, COACH, CLIENT, TODAY, WEEK_START, world } = vi.hoisted(() => ({
  NY: 'America/New_York',
  COACH: 'c0000000-0000-4000-8000-000000000001',
  CLIENT: 'm0000000-0000-4000-8000-000000000001',
  /** A Sunday, so the reflection window is open and the week is the Friday two days back. */
  TODAY: '2026-09-06',
  WEEK_START: '2026-09-04',
  world: {
    signedIn: true,
    isStaff: true,
    visible: true,
    tier: 'program' as string,
    /** Every table a read was issued against, and every filter value it carried. */
    reads: [] as string[],
    checkinFilters: [] as Array<{ column: string; value: unknown }>,
  },
}));

function resetWorld() {
  world.signedIn = true;
  world.isStaff = true;
  world.visible = true;
  world.tier = 'program';
  world.reads = [];
  world.checkinFilters = [];
}

/** The rows each table answers with. Deliberately small: the claim under test is the write count, not the content. */
function rowsFor(table: string): Record<string, unknown>[] {
  switch (table) {
    case 'daily_checkins_current':
      return [
        { local_date: '2026-08-30' },
        { local_date: '2026-09-01' },
        { local_date: '2026-09-04' },
      ];
    case 'member_access_facts':
      return [
        {
          member_id: CLIENT,
          tier: world.tier,
          source: 'manual',
          status: 'active',
          full_access: false,
          trial_started_at: '2026-01-01T00:00:00.000Z',
          trial_ends_at: '2026-01-08T00:00:00.000Z',
          is_test: false,
        },
      ];
    case 'coach_assigned_workouts':
      return [
        { id: 'w1', member_id: CLIENT, scheduled_date: '2026-09-02', status: 'completed' },
        { id: 'w2', member_id: CLIENT, scheduled_date: '2026-09-03', status: 'stopped' },
        // Outside the window, and must not be counted.
        { id: 'w3', member_id: CLIENT, scheduled_date: '2026-08-01', status: 'skipped' },
      ];
    default:
      return [];
  }
}

/**
 * A Supabase stand-in that answers reads and refuses writes.
 *
 * The write verbs throw rather than record, because "the render made zero
 * writes" is the whole claim and an assertion on a counter can pass by
 * accident if the counter is never read.
 */
function fakeClient() {
  return {
    from(table: string) {
      world.reads.push(table);
      const rows = rowsFor(table);
      const result = { data: rows, error: null, count: rows.length };
      const chain: Record<string, unknown> = {};
      for (const method of ['select', 'order', 'limit', 'in', 'is', 'neq', 'not', 'gte', 'lte']) {
        chain[method] = (...args: unknown[]) => {
          if (table === 'daily_checkins_current' && (method === 'gte' || method === 'lte')) {
            world.checkinFilters.push({ column: method, value: args[1] });
          }
          return chain;
        };
      }
      chain.eq = () => chain;
      chain.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
      chain.single = async () => ({ data: rows[0] ?? null, error: null });
      chain.then = (resolve: (value: typeof result) => unknown) =>
        Promise.resolve(result).then(resolve);
      for (const verb of ['insert', 'update', 'upsert', 'delete']) {
        chain[verb] = () => {
          throw new Error(`a render wrote to ${table} through ${verb}()`);
        };
      }
      return chain;
    },
    rpc() {
      throw new Error('a render called an rpc');
    },
    auth: {
      getUser: async () => ({ data: { user: world.signedIn ? { id: COACH } : null } }),
    },
  };
}

vi.mock('@/lib/supabase/server', () => ({ createClient: () => fakeClient() }));
vi.mock('@/lib/supabase/currentUser', () => ({
  getCachedUser: async () => (world.signedIn ? { id: COACH } : null),
}));
vi.mock('@/lib/auth/guards', () => ({
  hasActiveRole: async (_c: unknown, _u: string, role: string) =>
    world.isStaff && role === 'coach',
}));
vi.mock('@/lib/staff/testAccounts', () => ({
  isMemberVisibleToStaff: async () => world.visible,
}));
vi.mock('@/lib/time/memberToday', () => ({
  memberTimezone: async () => NY,
  memberTodayLocalDate: async () => TODAY,
  FALLBACK_TIMEZONE: NY,
}));
// Her own calendar day, pinned, so the window under test is a fact rather
// than whatever day the suite happens to run on.
vi.mock('@/lib/time/localDate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/time/localDate')>();
  return { ...actual, todaysLocalDate: () => TODAY };
});
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

const { getClientThisWeekBandAction } = await import('@/app/actions/coachWeek');

beforeEach(resetWorld);

describe('the band builds without writing anything', () => {
  it('returns a band for a program tier client, and makes no write at all', async () => {
    const band = await getClientThisWeekBandAction(CLIENT);
    expect(band).not.toBeNull();
    // It really did read. A "wrote nothing" test that also read nothing
    // would pass by doing nothing at all.
    expect(world.reads).toContain('daily_checkins_current');
    expect(world.reads).toContain('coach_assigned_workouts');
  });

  it('reads the check-ins over the recap\'s own seven days', async () => {
    const band = await getClientThisWeekBandAction(CLIENT);
    const range = recapRangeFor(mostRecentReflectionWeekStart(TODAY));

    expect(band!.window.weekStart).toBe(WEEK_START);
    expect({ from: band!.window.from, to: band!.window.to }).toEqual(range);
    expect(world.checkinFilters).toEqual([
      { column: 'gte', value: range.from },
      { column: 'lte', value: range.to },
    ]);
  });

  it('counts the three days it was handed, and says which seven days it counted', async () => {
    const band = await getClientThisWeekBandAction(CLIENT);
    const checkins = band!.rows.find((row) => row.key === 'checkins');
    expect(checkins!.statement).toBe('Checked in on 3 of 7 days.');
    expect(band!.window.label).toBe('Week of Aug 29 to Sep 4');
  });

  it('counts only the sessions scheduled inside the window', async () => {
    const band = await getClientThisWeekBandAction(CLIENT);
    const programs = band!.rows.find((row) => row.key === 'programs');
    expect(programs!.statement).toBe('2 sessions scheduled in these 7 days.');
    expect(programs!.details.map((d) => d.text).join(' ')).not.toContain('not today');
  });

  it('renders all six rows, in order', async () => {
    const band = await getClientThisWeekBandAction(CLIENT);
    expect(band!.rows.map((row) => row.key)).toEqual([
      'checkins',
      'weekly_reflection',
      'programs',
      'experiments',
      'reset_plan',
      'assignments',
    ]);
  });
});

describe('who gets a band at all', () => {
  it('gives no band to a monthly member, rather than an empty one', async () => {
    world.tier = 'monthly';
    expect(await getClientThisWeekBandAction(CLIENT)).toBeNull();
  });

  it('gives no band to a trial member', async () => {
    world.tier = 'trial';
    expect(await getClientThisWeekBandAction(CLIENT)).toBeNull();
  });

  it('gives no band to somebody who is not signed in', async () => {
    world.signedIn = false;
    expect(await getClientThisWeekBandAction(CLIENT)).toBeNull();
  });

  it('gives no band to a signed in member who is not staff', async () => {
    world.isStaff = false;
    expect(await getClientThisWeekBandAction(CLIENT)).toBeNull();
  });

  it('gives no band for a member this viewer may not be shown', async () => {
    world.visible = false;
    expect(await getClientThisWeekBandAction(CLIENT)).toBeNull();
  });
});
