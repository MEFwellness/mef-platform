/**
 * The coach-assignable Weekly Reflection (migration 193).
 *
 * WHAT THIS FEATURE HAD TO NOT BREAK. Before it, the Weekly Reflection was
 * a pure consequence of the plan: program tier, her own Friday through
 * Sunday, nobody else and no other day. A coach can now send THIS week's
 * to any client on their caseload, on any day, and the whole risk is that
 * the new way in either takes the old one away or doubles it up. So this
 * file proves four things:
 *
 *   1. THE RULE, pure. Two ways in, a plain OR, and one week key for both,
 *      which is what makes doubling structurally impossible rather than
 *      merely unlikely.
 *   2. THE WRITE, over a fake Postgres that actually enforces all three
 *      unique constraints. One tap and ten taps are the same one row.
 *   3. THE WHOLE ROUND TRIP: a coach assigns on a Tuesday, a member on no
 *      plan at all opens the app that same Tuesday, is offered it, one
 *      receipt is written, and she finishes it. Then the coach's sentence
 *      is read back at every step.
 *   4. THE UNTOUCHED CASE. A program member on her own Friday behaves
 *      exactly as she did before this existed, assignment or no
 *      assignment, and gets exactly one delivery either way.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  hasWeeklyReflectionAccess,
  isWeeklyReflectionOffered,
} from '@/lib/weekly-reflection/access';
import {
  isReflectionWindowOpen,
  mostRecentReflectionWeekStart,
  reflectionWeekStartFor,
} from '@/lib/weekly-reflection/week';
import {
  reflectionStatusLine,
  resolveReflectionDeliveryStatus,
} from '@/lib/weekly-reflection/delivery';
import type { MemberAccessFacts } from '@/lib/membership/types';

const FRIDAY = '2026-09-04';
const SATURDAY = '2026-09-05';
const SUNDAY = '2026-09-06';
const MONDAY = '2026-09-07';
const TUESDAY = '2026-09-08';
const THURSDAY = '2026-09-10';
const NEXT_FRIDAY = '2026-09-11';

const NY = 'America/New_York';

// ---------------------------------------------------------------------
// 1. The rule
// ---------------------------------------------------------------------

function facts(tier: string, status = 'active'): MemberAccessFacts {
  return {
    subscription: {
      tier,
      status,
      source: 'manual',
      fullAccess: false,
      trialStartedAt: null,
      trialEndsAt: null,
    },
    isTest: false,
  } as unknown as MemberAccessFacts;
}

describe('two ways in, and neither can close the other', () => {
  it('the plan alone still opens it, on her own Friday through Sunday', () => {
    for (const day of [FRIDAY, SATURDAY, SUNDAY]) {
      expect(
        isWeeklyReflectionOffered({
          facts: facts('program'),
          windowOpen: isReflectionWindowOpen(day),
          assigned: false,
        })
      ).toBe(true);
    }
  });

  it('the plan alone opens nothing Monday through Thursday, exactly as before', () => {
    for (const day of [MONDAY, TUESDAY, THURSDAY]) {
      expect(
        isWeeklyReflectionOffered({
          facts: facts('program'),
          windowOpen: isReflectionWindowOpen(day),
          assigned: false,
        })
      ).toBe(false);
    }
  });

  it('an assignment overrides the tier: any plan, including none at all', () => {
    for (const tier of ['trial', 'monthly', 'annual']) {
      expect(
        isWeeklyReflectionOffered({ facts: facts(tier), windowOpen: true, assigned: true })
      ).toBe(true);
    }
    expect(isWeeklyReflectionOffered({ facts: null, windowOpen: true, assigned: true })).toBe(true);
  });

  it('an assignment overrides the window: a Tuesday assignment is open on that Tuesday', () => {
    expect(
      isWeeklyReflectionOffered({
        facts: facts('monthly'),
        windowOpen: isReflectionWindowOpen(TUESDAY),
        assigned: true,
      })
    ).toBe(true);
  });

  it('it only ever ADDS: there is no combination where assigning closes a program member out', () => {
    for (const day of [FRIDAY, SATURDAY, SUNDAY, MONDAY, TUESDAY, THURSDAY]) {
      const windowOpen = isReflectionWindowOpen(day);
      const withoutAssignment = isWeeklyReflectionOffered({
        facts: facts('program'),
        windowOpen,
        assigned: false,
      });
      const withAssignment = isWeeklyReflectionOffered({
        facts: facts('program'),
        windowOpen,
        assigned: true,
      });
      if (withoutAssignment) expect(withAssignment).toBe(true);
    }
  });

  it('the tier answer itself is untouched, so nothing else that reads it changed', () => {
    expect(hasWeeklyReflectionAccess(facts('program'))).toBe(true);
    expect(hasWeeklyReflectionAccess(facts('monthly'))).toBe(false);
  });

  it('a failed assignment read is not an assignment, which is the fail-shut direction', () => {
    expect(
      isWeeklyReflectionOffered({ facts: facts('monthly'), windowOpen: false, assigned: false })
    ).toBe(false);
  });
});

describe('one week key for both ways in, which is what makes doubling impossible', () => {
  it('inside her window the assignment week IS the window week, to the day', () => {
    for (const day of [FRIDAY, SATURDAY, SUNDAY]) {
      expect(mostRecentReflectionWeekStart(day)).toBe(reflectionWeekStartFor(day));
      expect(mostRecentReflectionWeekStart(day)).toBe(FRIDAY);
    }
  });

  it('Monday through Thursday it is the Friday that BEGAN the seven day span', () => {
    expect(mostRecentReflectionWeekStart(MONDAY)).toBe(FRIDAY);
    expect(mostRecentReflectionWeekStart(TUESDAY)).toBe(FRIDAY);
    expect(mostRecentReflectionWeekStart(THURSDAY)).toBe(FRIDAY);
  });

  it('it expires by itself: the next Friday is a genuinely new week', () => {
    expect(mostRecentReflectionWeekStart(NEXT_FRIDAY)).toBe(NEXT_FRIDAY);
    expect(mostRecentReflectionWeekStart(NEXT_FRIDAY)).not.toBe(FRIDAY);
  });

  it('every day of the span resolves to one key, so one member has one row a week', () => {
    const keys = new Set(
      [FRIDAY, SATURDAY, SUNDAY, MONDAY, TUESDAY, '2026-09-09', THURSDAY].map(
        mostRecentReflectionWeekStart
      )
    );
    expect([...keys]).toEqual([FRIDAY]);
  });
});

describe('the status line for an assigned week', () => {
  const SENT_TUESDAY = '2026-09-08T18:00:00.000Z';

  function lineFor(input: {
    deliveredAt?: string | null;
    completedAt?: string | null;
    assignedAt?: string | null;
    windowOpen?: boolean;
  }): string {
    const assignedAt = input.assignedAt ?? null;
    const status = resolveReflectionDeliveryStatus({
      weekStart: FRIDAY,
      deliveredAt: input.deliveredAt ?? null,
      completedAt: input.completedAt ?? null,
      assignedAt,
    });
    return reflectionStatusLine(status, {
      windowOpen: input.windowOpen ?? false,
      timeZone: NY,
      assignedAt,
    });
  }

  it('assigned and not opened yet names the day it was sent, not "since Friday"', () => {
    const line = lineFor({ assignedAt: SENT_TUESDAY });
    expect(line).toBe('Assigned Tuesday. Not delivered yet, they have not opened the app since.');
    expect(line).not.toContain('since Friday');
    expect(line).not.toContain('that weekend');
  });

  it('assigned and delivered reads in the present tense on a Tuesday, because the week is live', () => {
    expect(
      lineFor({ assignedAt: SENT_TUESDAY, deliveredAt: '2026-09-08T19:00:00.000Z' })
    ).toBe('Delivered Tuesday. Not yet completed.');
  });

  it('assigned and completed reads in the present tense too', () => {
    expect(
      lineFor({
        assignedAt: SENT_TUESDAY,
        deliveredAt: '2026-09-08T19:00:00.000Z',
        completedAt: '2026-09-09T19:00:00.000Z',
      })
    ).toBe('Completed Wednesday.');
  });

  it('an assigned week is never "no delivery record", because every assignment postdates receipts', () => {
    const status = resolveReflectionDeliveryStatus({
      weekStart: '2026-08-21',
      deliveredAt: null,
      completedAt: null,
      assignedAt: SENT_TUESDAY,
    });
    expect(status.kind).toBe('not_delivered');
  });

  it('with no assignment, every sentence is exactly what it was before this build', () => {
    expect(lineFor({ windowOpen: true })).toBe(
      'Not delivered yet. They have not opened the app since Friday.'
    );
    expect(lineFor({ windowOpen: false })).toBe(
      'Week of Sep 4: not delivered. They did not open the app that weekend.'
    );
    expect(lineFor({ windowOpen: false, deliveredAt: '2026-09-04T18:30:00.000Z' })).toBe(
      'Week of Sep 4: delivered Friday, not completed.'
    );
  });

  it('no sentence an assigned week can produce carries an em dash or a raw date', () => {
    const cases = [
      lineFor({ assignedAt: SENT_TUESDAY }),
      lineFor({ assignedAt: 'not a date' }),
      lineFor({ assignedAt: SENT_TUESDAY, deliveredAt: '2026-09-08T19:00:00.000Z' }),
      lineFor({ assignedAt: SENT_TUESDAY, completedAt: '2026-09-09T19:00:00.000Z' }),
      lineFor({ assignedAt: SENT_TUESDAY, windowOpen: true }),
    ];
    for (const line of cases) {
      expect(line).not.toContain('—');
      expect(line).not.toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(line).not.toContain('Invalid');
    }
  });

  it('an assignment whose timestamp will not parse still says something true', () => {
    expect(lineFor({ assignedAt: 'not a date' })).toBe('Assigned this week. Not delivered yet.');
  });
});

// ---------------------------------------------------------------------
// 2, 3 and 4. Over a fake Postgres that enforces the three constraints
// ---------------------------------------------------------------------

const MEMBER = 'member-1';
const COACH = 'coach-1';

type Row = Record<string, unknown>;

type World = {
  currentUserId: string | null;
  localDate: string;
  tier: string;
  subscriptionStatus: string;
  isCoach: boolean;
  visible: boolean;
  tables: Record<string, Row[]>;
  inserts: string[];
};

const world = vi.hoisted<World>(() => ({
  currentUserId: 'member-1',
  localDate: '2026-09-08',
  tier: 'monthly',
  subscriptionStatus: 'active',
  isCoach: false,
  visible: true,
  tables: {},
  inserts: [],
}));

/** The three tables whose unique (member_id, week_start) index is the whole "once a week" rule. */
const UNIQUE_BY_MEMBER_WEEK = [
  'member_weekly_reflections',
  'member_weekly_reflection_deliveries',
  'member_weekly_reflection_assignments',
];

function resetWorld(): void {
  world.currentUserId = MEMBER;
  world.localDate = TUESDAY;
  world.tier = 'monthly';
  world.subscriptionStatus = 'active';
  world.isCoach = false;
  world.visible = true;
  world.tables = {
    member_weekly_reflections: [],
    member_weekly_reflection_deliveries: [],
    member_weekly_reflection_assignments: [],
    daily_checkins_current: [],
  };
  world.inserts = [];
}

/**
 * A fake PostgREST that honours the constraint this whole build leans on:
 * unique (member_id, week_start) on all three tables. An insert that would
 * break it returns the shape a real duplicate returns, zero rows and an
 * error, so every claim's read-back path is genuinely exercised rather
 * than assumed.
 */
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const builder: Record<string, unknown> = {};
      let inserted: Row | null = null;
      let insertFailed = false;

      const matches = (row: Row): boolean =>
        Object.entries(filters).every(([column, value]) => row[column] === value);

      builder.select = () => builder;
      builder.order = () => builder;
      builder.limit = () => builder;
      builder.not = () => builder;
      builder.gte = () => builder;
      builder.lte = () => builder;
      builder.eq = (column: string, value: unknown) => {
        filters[column] = value;
        return builder;
      };

      builder.insert = (row: Row) => {
        world.inserts.push(table);
        const rows = world.tables[table] ?? (world.tables[table] = []);
        const clash =
          UNIQUE_BY_MEMBER_WEEK.includes(table) &&
          rows.some(
            (existing) =>
              existing.member_id === row.member_id && existing.week_start === row.week_start
          );
        if (clash) {
          insertFailed = true;
        } else {
          const stored: Row = { created_at: '2026-09-08T18:00:00.000Z', ...row };
          rows.push(stored);
          inserted = stored;
        }
        return builder;
      };

      builder.maybeSingle = async () => {
        if (inserted) return { data: inserted, error: null };
        if (insertFailed) return { data: null, error: { message: 'duplicate key value' } };

        if (table === 'member_access_facts') {
          return {
            data: {
              member_id: filters.member_id,
              tier: world.tier,
              source: 'manual',
              status: world.subscriptionStatus,
              full_access: false,
              trial_started_at: null,
              trial_ends_at: null,
              is_test: false,
            },
            error: null,
          };
        }
        return { data: (world.tables[table] ?? []).find(matches) ?? null, error: null };
      };

      // Every list read (the recap's check-in days, the coach's week list)
      // awaits the builder itself rather than calling maybeSingle.
      builder.then = (
        resolve: (value: { data: Row[]; error: null }) => unknown
      ): unknown => resolve({ data: (world.tables[table] ?? []).filter(matches), error: null });

      return builder;
    },
  }),
}));

vi.mock('@/lib/supabase/currentUser', () => ({
  getCachedUser: async () => (world.currentUserId ? { id: world.currentUserId } : null),
}));
vi.mock('@/lib/time/memberToday', () => ({
  memberTimezone: async () => 'America/New_York',
  FALLBACK_TIMEZONE: 'America/New_York',
}));
vi.mock('@/lib/time/localDate', () => ({ todaysLocalDate: () => world.localDate }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('@/lib/auth/guards', () => ({
  hasActiveRole: async (_client: unknown, _userId: string, role: string) =>
    role === 'coach' ? world.isCoach : false,
}));
vi.mock('@/lib/staff/testAccounts', () => ({
  isMemberVisibleToStaff: async () => world.visible,
}));
vi.mock('@/lib/longitudinal-intelligence/data', () => ({
  listMemberPatternStates: async () => new Map(),
}));
vi.mock('@/lib/root-popup-messages/data', () => ({
  clearRootPopupDismissal: async () => {},
  weeklyReflectionPopupMessageKey: (weekStart: string) => `weekly_reflection:${weekStart}`,
}));

const {
  assignWeeklyReflectionAction,
  getClientWeeklyReflectionAssignStateAction,
  getClientWeeklyReflectionStatusAction,
  submitWeeklyReflectionAction,
  trackWeeklyReflectionDeliveredAction,
} = await import('@/app/actions/weeklyReflection');
const { createClient } = await import('@/lib/supabase/server');
const { buildWeeklyReflectionState } = await import('@/lib/weekly-reflection/service');

beforeEach(resetWorld);

/** Signs the world in as the coach, which is who presses Assign. */
function asCoach(): void {
  world.currentUserId = COACH;
  world.isCoach = true;
}

/** Signs the world back in as the member, which is who opens the app. */
function asMember(): void {
  world.currentUserId = MEMBER;
  world.isCoach = false;
}

const assignments = () => world.tables.member_weekly_reflection_assignments!;
const receipts = () => world.tables.member_weekly_reflection_deliveries!;
const reflections = () => world.tables.member_weekly_reflections!;

/** What the member's own surfaces are handed on the day the world is set to. */
const memberState = () => buildWeeklyReflectionState(createClient(), MEMBER, world.localDate);

const ANSWERS = {
  week_overall: 4,
  what_helped: 'Two long walks',
  what_got_in_the_way: 'A late night on Wednesday',
  body_response: 'Shoulders looser',
  next_week_change: 'Walk before breakfast',
};

describe('assigning creates one row, and a second tap creates nothing', () => {
  it('one tap writes exactly one assignment, for HER Friday-anchored week', async () => {
    asCoach();
    const result = await assignWeeklyReflectionAction(MEMBER);

    expect(result).toEqual({ ok: true });
    expect(assignments()).toHaveLength(1);
    expect(assignments()[0]!.member_id).toBe(MEMBER);
    expect(assignments()[0]!.week_start).toBe(FRIDAY);
    expect(assignments()[0]!.assigned_by).toBe(COACH);
  });

  it('a second tap is a quiet success and writes nothing', async () => {
    asCoach();
    await assignWeeklyReflectionAction(MEMBER);
    const first = assignments()[0];

    expect(await assignWeeklyReflectionAction(MEMBER)).toEqual({ ok: true });
    expect(await assignWeeklyReflectionAction(MEMBER)).toEqual({ ok: true });

    expect(assignments()).toHaveLength(1);
    expect(assignments()[0]).toBe(first);
  });

  it('every day of one span assigns the same week, so Tuesday and Thursday cannot both count', async () => {
    asCoach();
    for (const day of [TUESDAY, '2026-09-09', THURSDAY, MONDAY]) {
      world.localDate = day;
      await assignWeeklyReflectionAction(MEMBER);
    }
    expect(assignments()).toHaveLength(1);
  });

  it('the next Friday is a new week, and gets its own row', async () => {
    asCoach();
    await assignWeeklyReflectionAction(MEMBER);
    world.localDate = NEXT_FRIDAY;
    await assignWeeklyReflectionAction(MEMBER);

    expect(assignments().map((row) => row.week_start)).toEqual([FRIDAY, NEXT_FRIDAY]);
  });

  it('it creates no reflection row and no receipt: an assignment is its own record', async () => {
    asCoach();
    await assignWeeklyReflectionAction(MEMBER);
    expect(world.inserts).toEqual(['member_weekly_reflection_assignments']);
    expect(reflections()).toHaveLength(0);
    expect(receipts()).toHaveLength(0);
  });

  it('somebody who is not a coach writes nothing', async () => {
    asMember();
    expect(await assignWeeklyReflectionAction(MEMBER)).toEqual({
      ok: false,
      error: 'Not allowed.',
    });
    expect(assignments()).toHaveLength(0);
  });

  it('a coach who may not see this client writes nothing', async () => {
    asCoach();
    world.visible = false;
    expect(await assignWeeklyReflectionAction(MEMBER)).toEqual({
      ok: false,
      error: 'Not allowed.',
    });
    expect(assignments()).toHaveLength(0);
  });

  it('nobody signed in writes nothing', async () => {
    world.currentUserId = null;
    expect(await assignWeeklyReflectionAction(MEMBER)).toEqual({
      ok: false,
      error: 'Not signed in.',
    });
    expect(assignments()).toHaveLength(0);
  });
});

describe('a Tuesday assignment reaches a member on no program, on that Tuesday', () => {
  it('she is offered nothing before it is assigned', async () => {
    expect(await memberState()).toBeNull();
  });

  it('she is offered it the moment it is assigned, on the same Tuesday', async () => {
    asCoach();
    await assignWeeklyReflectionAction(MEMBER);
    asMember();

    const state = await memberState();
    expect(state?.status).toBe('pending');
    expect(state?.weekStart).toBe(FRIDAY);
  });

  it('it does not wait for Friday, which is the whole point of the button', async () => {
    asCoach();
    await assignWeeklyReflectionAction(MEMBER);
    asMember();

    expect(isReflectionWindowOpen(TUESDAY)).toBe(false);
    expect((await memberState())?.status).toBe('pending');
  });

  it('exactly one receipt is written, however many surfaces show it', async () => {
    asCoach();
    await assignWeeklyReflectionAction(MEMBER);
    asMember();

    // Home renders the pop-up and the persistent card in one pass.
    await trackWeeklyReflectionDeliveredAction('popup');
    await trackWeeklyReflectionDeliveredAction('home_card');
    // She reopens the app the next day, still inside the assigned week.
    world.localDate = '2026-09-09';
    await trackWeeklyReflectionDeliveredAction('popup');

    expect(receipts()).toHaveLength(1);
    expect(receipts()[0]!.week_start).toBe(FRIDAY);
    expect(receipts()[0]!.presentation).toBe('popup');
  });

  it('she can finish it, and the reflection is stored against the same Friday', async () => {
    asCoach();
    await assignWeeklyReflectionAction(MEMBER);
    asMember();

    expect(await submitWeeklyReflectionAction(ANSWERS)).toEqual({ ok: true });
    expect(reflections()).toHaveLength(1);
    expect(reflections()[0]!.week_start).toBe(FRIDAY);
    expect((await memberState())?.status).toBe('completed');
  });

  it('with no assignment she still cannot submit, however hand-built the request', async () => {
    asMember();
    const result = await submitWeeklyReflectionAction(ANSWERS);
    expect(result).toEqual({ ok: false, error: 'This week is not open for you right now.' });
    expect(reflections()).toHaveLength(0);
  });

  it('the assignment expires on its own when the next Friday opens a new week', async () => {
    asCoach();
    await assignWeeklyReflectionAction(MEMBER);
    asMember();

    world.localDate = NEXT_FRIDAY;
    expect(await memberState()).toBeNull();
  });
});

describe('the program tier is untouched, and cannot be delivered twice', () => {
  beforeEach(() => {
    world.tier = 'program';
    world.localDate = FRIDAY;
  });

  it('a program member is offered it on her Friday with nobody doing anything', async () => {
    asMember();
    const state = await memberState();
    expect(state?.status).toBe('pending');
    expect(state?.weekStart).toBe(FRIDAY);
    expect(assignments()).toHaveLength(0);
  });

  it('and is offered nothing on a Tuesday, exactly as before', async () => {
    asMember();
    world.localDate = TUESDAY;
    expect(await memberState()).toBeNull();
  });

  it('a program member WITH an assignment gets one delivery, not two', async () => {
    asCoach();
    await assignWeeklyReflectionAction(MEMBER);
    asMember();

    // Both routes are open at once. They name the same Friday, so the
    // receipt's unique index has exactly one row to be.
    await trackWeeklyReflectionDeliveredAction('popup');
    await trackWeeklyReflectionDeliveredAction('home_card');

    expect(assignments()).toHaveLength(1);
    expect(receipts()).toHaveLength(1);
    expect(receipts()[0]!.week_start).toBe(assignments()[0]!.week_start);
  });

  it('and one reflection, not two, when she finishes it', async () => {
    asCoach();
    await assignWeeklyReflectionAction(MEMBER);
    asMember();

    await submitWeeklyReflectionAction(ANSWERS);
    await submitWeeklyReflectionAction(ANSWERS);

    expect(reflections()).toHaveLength(1);
  });

  it('a lapsed program subscription is still turned away when nothing was assigned', async () => {
    asMember();
    world.subscriptionStatus = 'expired';
    expect(await memberState()).toBeNull();
  });
});

describe('the sentence the coach reads, at every step of an assigned week', () => {
  it('says nothing at all before anything is assigned, for a client off the program', async () => {
    asCoach();
    expect(await getClientWeeklyReflectionStatusAction(MEMBER)).toBeNull();
  });

  it('after assigning, it says who opened the week and that nothing has reached them', async () => {
    asCoach();
    await assignWeeklyReflectionAction(MEMBER);

    const status = await getClientWeeklyReflectionStatusAction(MEMBER);
    expect(status?.kind).toBe('not_delivered');
    expect(status?.weekStart).toBe(FRIDAY);
    expect(status?.line).toBe(
      'Assigned Tuesday. Not delivered yet, they have not opened the app since.'
    );
  });

  it('after she opens the app, it says delivered', async () => {
    asCoach();
    await assignWeeklyReflectionAction(MEMBER);
    asMember();
    await trackWeeklyReflectionDeliveredAction('popup');
    asCoach();

    const status = await getClientWeeklyReflectionStatusAction(MEMBER);
    expect(status?.kind).toBe('delivered');
    // The receipt is stamped with the real instant it was written, so the
    // day it names is the day this test runs. What is asserted is the
    // PRESENT tense: an assigned week is live, so a coach reading this on
    // a Tuesday must never be handed "Week of Sep 4: delivered".
    expect(status?.line).toMatch(/^Delivered [A-Z][a-z]+\. Not yet completed\.$/);
    expect(status?.line).not.toContain('Week of');
  });

  it('after she writes it, it says completed', async () => {
    asCoach();
    await assignWeeklyReflectionAction(MEMBER);
    asMember();
    await trackWeeklyReflectionDeliveredAction('popup');
    await submitWeeklyReflectionAction(ANSWERS);
    asCoach();

    const status = await getClientWeeklyReflectionStatusAction(MEMBER);
    expect(status?.kind).toBe('completed');
    expect(status?.line).toMatch(/^Completed [A-Z][a-z]+\.$/);
  });

  it('no sentence it produced along the way carries an em dash', async () => {
    asCoach();
    await assignWeeklyReflectionAction(MEMBER);
    const assigned = await getClientWeeklyReflectionStatusAction(MEMBER);
    asMember();
    await trackWeeklyReflectionDeliveredAction('popup');
    asCoach();
    const delivered = await getClientWeeklyReflectionStatusAction(MEMBER);

    for (const status of [assigned, delivered]) {
      expect(status?.line).not.toContain('—');
      expect(status?.line).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    }
  });
});

describe('what the Assign button is allowed to say', () => {
  it('nothing sent yet, off the program: the live button', async () => {
    asCoach();
    const state = await getClientWeeklyReflectionAssignStateAction(MEMBER);
    expect(state).toEqual({
      weekStart: FRIDAY,
      assignedAt: null,
      completed: false,
      automaticallyOffered: false,
    });
  });

  it('already sent: the disabled state, carrying the moment it was sent', async () => {
    asCoach();
    await assignWeeklyReflectionAction(MEMBER);

    const state = await getClientWeeklyReflectionAssignStateAction(MEMBER);
    expect(state?.assignedAt).toBe('2026-09-08T18:00:00.000Z');
    expect(state?.completed).toBe(false);
  });

  it('a program member inside her own window is already offered it, so there is nothing to send', async () => {
    asCoach();
    world.tier = 'program';
    world.localDate = SATURDAY;

    const state = await getClientWeeklyReflectionAssignStateAction(MEMBER);
    expect(state?.automaticallyOffered).toBe(true);
  });

  it('a program member OUTSIDE her window is not being offered anything, so the button is live', async () => {
    asCoach();
    world.tier = 'program';
    world.localDate = TUESDAY;

    const state = await getClientWeeklyReflectionAssignStateAction(MEMBER);
    expect(state?.automaticallyOffered).toBe(false);
  });

  it('a finished week says finished, whichever way it was opened', async () => {
    asCoach();
    await assignWeeklyReflectionAction(MEMBER);
    asMember();
    await submitWeeklyReflectionAction(ANSWERS);
    asCoach();

    expect((await getClientWeeklyReflectionAssignStateAction(MEMBER))?.completed).toBe(true);
  });

  it('a coach who may not see this client gets nothing to press', async () => {
    asCoach();
    world.visible = false;
    expect(await getClientWeeklyReflectionAssignStateAction(MEMBER)).toBeNull();
  });

  it('a member asking about herself gets nothing', async () => {
    asMember();
    expect(await getClientWeeklyReflectionAssignStateAction(MEMBER)).toBeNull();
  });
});
