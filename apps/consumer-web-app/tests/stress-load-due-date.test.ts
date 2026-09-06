/**
 * The Stress & Load Deep-Dive gets a due date.
 *
 * WHAT WAS MISSING. Every other coach assignment could carry a due date
 * (assessment_assignments.due_at, migration 77). This one's assign button
 * never filled it in, so the deep-dive was the single assignment in the
 * ledger that could never be late, whatever the coach summary above it
 * eventually says.
 *
 * THREE THINGS ARE PROVED HERE, and the third is the one that only means
 * anything once it is wired together:
 *
 *   1. Seven days, counted from HER calendar day and not the server's.
 *   2. Written in the SAME SHAPE the coach panel's date input already
 *      produces for every other assessment, so one reader can read one
 *      calendar day back out of due_at for the whole table.
 *   3. The real action writes it, on a real insert, and still does
 *      everything it did before: no duplicate assignment, no touching of a
 *      prior completion.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { assignmentDueDate, dueAtInDays } from '@/lib/assignments/status';
import { STRESS_LOAD_DEFAULT_DUE_IN_DAYS } from '@/lib/stress-load/constants';

const NY = 'America/New_York';
const MEMBER = 'client-1';
const COACH = 'coach-1';

// ---------------------------------------------------------------------
// 1 and 2. The arithmetic, and the shape
// ---------------------------------------------------------------------

describe('seven days, in her own calendar', () => {
  it('is seven days', () => {
    expect(STRESS_LOAD_DEFAULT_DUE_IN_DAYS).toBe(7);
  });

  it('lands on the seventh day after hers, read back as that same calendar day', () => {
    expect(assignmentDueDate(dueAtInDays('2026-09-05', STRESS_LOAD_DEFAULT_DUE_IN_DAYS))).toBe(
      '2026-09-12'
    );
  });

  it('crosses a month end without losing a day', () => {
    expect(assignmentDueDate(dueAtInDays('2026-09-28', 7))).toBe('2026-10-05');
  });

  it('two members a calendar day apart get two different due days, from one press', () => {
    // A coach pressing the button at 9pm Eastern is already on tomorrow in
    // UTC. Counting from the SERVER's day would quietly give one of these
    // members a day less than the other.
    expect(assignmentDueDate(dueAtInDays('2026-09-05', 7))).toBe('2026-09-12');
    expect(assignmentDueDate(dueAtInDays('2026-09-06', 7))).toBe('2026-09-13');
  });
});

// ---------------------------------------------------------------------
// 3. The real action
// ---------------------------------------------------------------------

type World = {
  signedIn: boolean;
  isStaff: boolean;
  /** The open assignment her coach's read would find, or null when nothing is open. */
  pending: Record<string, unknown> | null;
  pendingReadFails: boolean;
  memberToday: string;
  inserted: Array<{ table: string; row: Record<string, unknown> }>;
};

const world: World = {
  signedIn: true,
  isStaff: true,
  pending: null,
  pendingReadFails: false,
  memberToday: '2026-09-05',
  inserted: [],
};

function resetWorld() {
  world.signedIn = true;
  world.isStaff = true;
  world.pending = null;
  world.pendingReadFails = false;
  world.memberToday = '2026-09-05';
  world.inserted = [];
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from(table: string) {
      const builder: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'in', 'is', 'not', 'order', 'limit']) {
        builder[method] = () => builder;
      }
      builder.insert = (row: Record<string, unknown>) => {
        world.inserted.push({ table, row });
        return builder;
      };
      builder.maybeSingle = async () => {
        if (table === 'assessment_assignments') {
          if (world.pendingReadFails) return { data: null, error: { message: 'boom' } };
          return { data: world.pending, error: null };
        }
        return { data: null, error: null };
      };
      builder.single = builder.maybeSingle;
      builder.then = undefined;
      return builder;
    },
  }),
}));

vi.mock('@/lib/supabase/currentUser', () => ({
  getCachedUser: async () => (world.signedIn ? { id: COACH } : null),
}));

vi.mock('@/lib/auth/guards', () => ({
  hasActiveRole: async (_client: unknown, _id: string, role: string) =>
    world.isStaff && role === 'coach',
}));

vi.mock('@/lib/time/memberToday', () => ({
  memberTimezone: async () => NY,
  FALLBACK_TIMEZONE: NY,
}));
vi.mock('@/lib/time/localDate', () => ({
  todaysLocalDate: () => world.memberToday,
  localDateStringFor: (iso: string) => new Date(iso).toISOString().slice(0, 10),
}));
vi.mock('@/lib/assessment-registry/facts', () => ({
  forgetMemberAssessmentFacts: () => {},
  getMemberAssessmentFacts: async () => new Map(),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

const { assignStressLoadDeepDiveAction } = await import('@/app/actions/stressLoad');

beforeEach(resetWorld);

function assignmentRow(): Record<string, unknown> {
  const row = world.inserted.find((i) => i.table === 'assessment_assignments')?.row;
  if (!row) throw new Error('expected one assessment_assignments insert, found none');
  return row;
}

describe('assigning the deep-dive', () => {
  it('writes a due date seven days out, in her own calendar', async () => {
    const result = await assignStressLoadDeepDiveAction(MEMBER);
    expect(result).toEqual({ ok: true });
    expect(assignmentDueDate(assignmentRow().due_at as string)).toBe('2026-09-12');
  });

  it('counts from the MEMBER’s day, so a different day gives a different deadline', async () => {
    world.memberToday = '2026-09-06';
    await assignStressLoadDeepDiveAction(MEMBER);
    expect(assignmentDueDate(assignmentRow().due_at as string)).toBe('2026-09-13');
  });

  it('a named day is used as it stands, and is not shifted by seven', async () => {
    await assignStressLoadDeepDiveAction(MEMBER, { dueDate: '2026-09-30' });
    expect(assignmentDueDate(assignmentRow().due_at as string)).toBe('2026-09-30');
  });

  it('a malformed named day falls back to the seven day default, never to no deadline', async () => {
    await assignStressLoadDeepDiveAction(MEMBER, { dueDate: 'next Tuesday' });
    expect(assignmentDueDate(assignmentRow().due_at as string)).toBe('2026-09-12');
  });

  it('everything else about the row is what it always was', async () => {
    await assignStressLoadDeepDiveAction(MEMBER);
    const row = assignmentRow();
    expect(row.member_id).toBe(MEMBER);
    expect(row.assigned_by).toBe(COACH);
    expect(row.is_required).toBe(true);
    expect(row.stage).toBe('standard');
    // No status, no completion and no attempt: an assignment is a
    // decision, and migration 144's trigger is still the only thing that
    // ever closes one.
    expect(row.status).toBeUndefined();
    expect(row.completed_attempt_id).toBeUndefined();
  });

  it('a duplicate click is still a quiet no-op, and writes no second row', async () => {
    world.pending = { id: 'assignment-1', created_at: '2026-09-01T10:00:00.000Z', reason: null, due_at: null };
    const result = await assignStressLoadDeepDiveAction(MEMBER);
    expect(result).toEqual({ ok: true });
    expect(world.inserted).toHaveLength(0);
  });

  it('a failed read of her assignments refuses rather than assigning twice', async () => {
    world.pendingReadFails = true;
    const result = await assignStressLoadDeepDiveAction(MEMBER);
    expect(result.ok).toBe(false);
    expect(world.inserted).toHaveLength(0);
  });

  it('somebody who is not staff writes nothing', async () => {
    world.isStaff = false;
    const result = await assignStressLoadDeepDiveAction(MEMBER);
    expect(result.ok).toBe(false);
    expect(world.inserted).toHaveLength(0);
  });
});
