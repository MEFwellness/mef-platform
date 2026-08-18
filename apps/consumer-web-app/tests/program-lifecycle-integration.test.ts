/**
 * Assignment lifecycle against real local Supabase — real rows, real RLS,
 * the real daily job and the real coach transitions. No mocks.
 *
 * What this proves that the pure tests cannot:
 *
 *   1. Every transition really lands in the database: upcoming -> active,
 *      the week advance, active -> completed, pause, resume, and replace
 *      with lineage.
 *   2. The daily job is idempotent against a real table: a second run the
 *      same day writes nothing and reports nothing.
 *   3. Frozen snapshots stay frozen. The workout, section and exercise
 *      rows are byte-identical before and after a program has been started,
 *      advanced, paused, resumed, completed and replaced.
 *   4. A member sees the right thing at every status through the real
 *      member_program_lifecycle view under her own session, and sees
 *      nothing of another member's programs.
 *   5. A completed program is excluded from "active" queries everywhere:
 *      the job's own working set, the coach's live list, and the member's
 *      current-program view.
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { serviceRoleClient, signInAs, TEST_USERS } from './setup/test-clients';
import {
  applyLifecycleForAssignments,
  runProgramLifecyclePass,
} from '../lib/program-lifecycle/service';
import {
  getAssignmentLifecycle,
  listLiveAssignments,
  pauseAssignment,
  resumeAssignment,
  replacePreviousAssignments,
  listMyProgramLifecycles,
  type AssignmentLifecycleRow,
} from '../lib/coach-program-builder/assignments';
import { buildMemberProgramViews, isCurrentProgramStatus } from '../lib/program-lifecycle/memberView';
import { addDays, endDateFor } from '../lib/program-lifecycle/transitions';
import type { MemberProgramLifecycle } from '@mef/shared-types-contracts';

const MEMBER = TEST_USERS.memberOne.id;
const OTHER_MEMBER = TEST_USERS.memberTwo.id;
const COACH = TEST_USERS.coachOne.id;

const createdAssignmentIds: string[] = [];
const createdWorkoutIds: string[] = [];

afterAll(async () => {
  const supabase = serviceRoleClient();
  if (createdWorkoutIds.length > 0) {
    await supabase.from('coach_assigned_workouts').delete().in('id', createdWorkoutIds);
  }
  if (createdAssignmentIds.length > 0) {
    await supabase
      .from('member_wellness_events')
      .delete()
      .in('source_record_id', createdAssignmentIds);
    // Clear lineage first: replaced_by_assignment_id is a self-reference,
    // and deleting the successor before the row pointing at it would
    // otherwise depend on delete order.
    await supabase
      .from('coach_program_assignments')
      .update({ replaced_by_assignment_id: null })
      .in('id', createdAssignmentIds);
    await supabase.from('coach_program_assignments').delete().in('id', createdAssignmentIds);
  }
});

/**
 * A real assignment row with real lifecycle dates. Inserted through the
 * service-role client rather than createAssignment() because these tests
 * are about the lifecycle, not about generating occurrences: each one needs
 * to place a program precisely in time (already ended, about to start) and
 * createAssignment would compute the opening state itself.
 */
async function seedAssignment(input: {
  memberId?: string;
  startDate: string;
  durationWeeks?: number;
  status: string;
  currentWeek?: number;
  groupKey?: string;
  visibility?: 'draft' | 'published';
  name?: string;
}): Promise<string> {
  const supabase = serviceRoleClient();
  const durationWeeks = input.durationWeeks ?? 4;
  const { data, error } = await supabase
    .from('coach_program_assignments')
    .insert({
      member_id: input.memberId ?? MEMBER,
      coach_id: COACH,
      template_id: null,
      template_name_snapshot: input.name ?? 'Lifecycle test program',
      schedule_type: 'weekly',
      schedule_config: {
        type: 'weekly',
        startDate: input.startDate,
        daysOfWeek: [1],
        weeks: durationWeeks,
      },
      visibility: input.visibility ?? 'published',
      published_at: (input.visibility ?? 'published') === 'published' ? new Date().toISOString() : null,
      status: input.status,
      start_date: input.startDate,
      end_date: endDateFor(input.startDate, durationWeeks),
      duration_weeks: durationWeeks,
      current_week: input.currentWeek ?? 1,
      program_group_key: input.groupKey ?? null,
    })
    .select('id')
    .single();
  expect(error).toBeNull();
  createdAssignmentIds.push(data!.id);

  await supabase
    .from('coach_program_assignments')
    .update({ program_group_key: input.groupKey ?? data!.id })
    .eq('id', data!.id);

  return data!.id;
}

async function readAssignment(id: string) {
  const supabase = serviceRoleClient();
  const { data } = await supabase
    .from('coach_program_assignments')
    .select('*')
    .eq('id', id)
    .single();
  return data!;
}

/** The lifecycle job, run over exactly the rows this test seeded, on a supplied day. */
async function runJobOn(assignmentIds: string[], today: string) {
  const supabase = serviceRoleClient();
  const { data } = await supabase
    .from('coach_program_assignments')
    .select('*')
    .in('id', assignmentIds)
    .in('status', ['upcoming', 'active']);
  return applyLifecycleForAssignments(
    supabase,
    (data ?? []) as unknown as AssignmentLifecycleRow[],
    () => ({ localDate: today, timezone: 'America/New_York' })
  );
}

describe('the daily job moves a program through its life', () => {
  it('upcoming becomes active on its start date, and not the day before', async () => {
    const id = await seedAssignment({ startDate: '2026-08-03', status: 'upcoming' });

    const before = await runJobOn([id], '2026-08-02');
    expect(before.started).toBe(0);
    expect((await readAssignment(id)).status).toBe('upcoming');

    const onTheDay = await runJobOn([id], '2026-08-03');
    expect(onTheDay.started).toBe(1);
    expect(onTheDay.transitions[0]).toMatchObject({
      kind: 'started',
      fromStatus: 'upcoming',
      toStatus: 'active',
      week: 1,
    });

    const row = await readAssignment(id);
    expect(row.status).toBe('active');
    expect(row.current_week).toBe(1);
    expect(row.started_at).not.toBeNull();
  });

  it('the week advances on a week boundary, and the job logs it', async () => {
    const id = await seedAssignment({ startDate: '2026-08-03', status: 'active', currentWeek: 1 });

    const result = await runJobOn([id], '2026-08-17');
    expect(result.weekAdvanced).toBe(1);
    expect(result.transitions[0]).toMatchObject({ kind: 'week_advanced', week: 3 });
    expect((await readAssignment(id)).current_week).toBe(3);
  });

  it('active becomes completed the day after the end date, never on it', async () => {
    const id = await seedAssignment({ startDate: '2026-08-03', status: 'active', currentWeek: 4 });

    const onLastDay = await runJobOn([id], '2026-08-30');
    expect(onLastDay.completed).toBe(0);
    expect((await readAssignment(id)).status).toBe('active');

    const dayAfter = await runJobOn([id], '2026-08-31');
    expect(dayAfter.completed).toBe(1);

    const row = await readAssignment(id);
    expect(row.status).toBe('completed');
    expect(row.current_week).toBe(4);
    expect(row.completed_at).not.toBeNull();
  });

  it('is idempotent: a second run the same day changes nothing', async () => {
    const id = await seedAssignment({ startDate: '2026-08-03', status: 'upcoming' });

    const first = await runJobOn([id], '2026-08-17');
    expect(first.started + first.weekAdvanced + first.completed).toBe(1);
    const afterFirst = await readAssignment(id);

    const second = await runJobOn([id], '2026-08-17');
    expect(second.transitions).toEqual([]);
    expect(second.started + second.weekAdvanced + second.completed).toBe(0);
    expect(second.unchanged).toBe(1);

    const afterSecond = await readAssignment(id);
    expect(afterSecond.status).toBe(afterFirst.status);
    expect(afterSecond.current_week).toBe(afterFirst.current_week);
    expect(afterSecond.updated_at).toBe(afterFirst.updated_at);
  });

  it('records one lifecycle event per transition on the member’s own stream', async () => {
    const id = await seedAssignment({ startDate: '2026-08-03', status: 'upcoming' });
    await runJobOn([id], '2026-08-03');
    await runJobOn([id], '2026-08-10');
    await runJobOn([id], '2026-08-31');

    const supabase = serviceRoleClient();
    const { data: events } = await supabase
      .from('member_wellness_events')
      .select('event_type, payload, source, member_id')
      .eq('source_record_id', id);

    // Sorted rather than read in insertion order: all three land within the
    // same second, and occurred_at (the only column a reader of this table
    // may order by) cannot separate them. What matters is that each
    // transition wrote exactly one event, not which millisecond it got.
    expect((events ?? []).map((e) => e.event_type).sort()).toEqual([
      'program_completed',
      'program_started',
      'program_week_advanced',
    ]);
    for (const event of events ?? []) {
      expect(event.source).toBe('system');
      expect(event.member_id).toBe(MEMBER);
      // Numbers and statuses only. Never a program name, never content.
      expect(Object.keys(event.payload as object).sort()).toEqual([
        'durationWeeks',
        'fromStatus',
        'toStatus',
        'week',
      ]);
    }
  });

  it('a completed program is out of the job’s working set forever', async () => {
    const id = await seedAssignment({ startDate: '2026-08-03', status: 'active', currentWeek: 4 });
    await runJobOn([id], '2026-08-31');

    const supabase = serviceRoleClient();
    const live = await listLiveAssignments(supabase);
    expect(live.map((row) => row.id)).not.toContain(id);

    // And it is still completed a year later, not revived.
    await runJobOn([id], '2027-08-31');
    expect((await readAssignment(id)).status).toBe('completed');
  });

  it('the whole pass runs against the real table without error', async () => {
    const result = await runProgramLifecyclePass(serviceRoleClient());
    expect(result.failed).toBe(0);
    expect(result.scanned).toBeGreaterThanOrEqual(0);
  });
});

describe('a coach pausing and resuming a program', () => {
  it('pause holds it, and the weeks stop advancing', async () => {
    const supabase = serviceRoleClient();
    const id = await seedAssignment({ startDate: '2026-08-03', status: 'active', currentWeek: 1 });

    expect(await pauseAssignment(supabase, id)).toBe(true);
    const paused = await readAssignment(id);
    expect(paused.status).toBe('paused');
    expect(paused.paused_at).not.toBeNull();

    // The job leaves it exactly where it is, even months later.
    const result = await runJobOn([id], '2026-12-01');
    expect(result.scanned).toBe(0);
    expect((await readAssignment(id)).current_week).toBe(1);
  });

  it('a program that is already finished or cancelled cannot be paused', async () => {
    const supabase = serviceRoleClient();
    const done = await seedAssignment({ startDate: '2026-06-01', status: 'completed' });
    const cancelled = await seedAssignment({ startDate: '2026-06-01', status: 'cancelled' });
    expect(await pauseAssignment(supabase, done)).toBe(false);
    expect(await pauseAssignment(supabase, cancelled)).toBe(false);
  });

  it('resume gives back every day it was held, so four weeks is still four weeks', async () => {
    const supabase = serviceRoleClient();
    const id = await seedAssignment({ startDate: '2026-08-03', status: 'active', currentWeek: 2 });

    // Held on 12 August, resumed on 26 August: fourteen days.
    await supabase
      .from('coach_program_assignments')
      .update({ status: 'paused', paused_at: '2026-08-12T09:00:00Z' })
      .eq('id', id);

    expect(await resumeAssignment(supabase, id, '2026-08-26')).toBe(true);

    const row = await readAssignment(id);
    expect(row.status).toBe('active');
    expect(row.paused_days).toBe(14);
    expect(row.end_date).toBe('2026-09-13'); // 2026-08-30 plus fourteen days
    expect(row.paused_at).toBeNull();
    expect(row.resumed_at).not.toBeNull();
    // Two weeks of program elapsed, not four: she is in week 2.
    expect(row.current_week).toBe(2);
  });

  it('only a paused program can be resumed', async () => {
    const supabase = serviceRoleClient();
    const active = await seedAssignment({ startDate: '2026-08-03', status: 'active' });
    expect(await resumeAssignment(supabase, active, '2026-08-10')).toBe(false);
  });

  it('a program paused before it started resumes as upcoming', async () => {
    const supabase = serviceRoleClient();
    const id = await seedAssignment({ startDate: '2026-09-07', status: 'upcoming' });
    expect(await pauseAssignment(supabase, id)).toBe(true);
    await supabase
      .from('coach_program_assignments')
      .update({ paused_at: '2026-08-20T09:00:00Z' })
      .eq('id', id);
    expect(await resumeAssignment(supabase, id, '2026-08-21')).toBe(true);
    expect((await readAssignment(id)).status).toBe('upcoming');
  });
});

describe('replacing a program keeps its lineage and never deletes it', () => {
  it('the old program becomes replaced and points at its successor', async () => {
    const supabase = serviceRoleClient();
    const older = await seedAssignment({ startDate: '2026-07-06', status: 'active', currentWeek: 3 });
    const successor = await seedAssignment({ startDate: '2026-08-03', status: 'active' });

    const superseded = await replacePreviousAssignments(supabase, {
      memberId: MEMBER,
      newAssignmentIds: [successor],
      supersededBy: successor,
    });
    expect(superseded).toContain(older);

    const oldRow = await readAssignment(older);
    expect(oldRow.status).toBe('replaced');
    expect(oldRow.replaced_by_assignment_id).toBe(successor);
    expect(oldRow.replaced_at).not.toBeNull();
    // Its own record survives untouched.
    expect(oldRow.current_week).toBe(3);
    expect(oldRow.start_date).toBe('2026-07-06');

    // The successor is untouched.
    expect((await readAssignment(successor)).status).toBe('active');
  });

  it('a program delivered as several weekly sessions never replaces itself', async () => {
    const supabase = serviceRoleClient();
    const group = `corrective-program:${crypto.randomUUID()}`;
    const sessionA = await seedAssignment({ startDate: '2026-08-03', status: 'active', groupKey: group });
    const sessionB = await seedAssignment({ startDate: '2026-08-03', status: 'active', groupKey: group });
    const sessionC = await seedAssignment({ startDate: '2026-08-03', status: 'active', groupKey: group });

    const superseded = await replacePreviousAssignments(supabase, {
      memberId: MEMBER,
      newAssignmentIds: [sessionA, sessionB, sessionC],
      supersededBy: sessionA,
    });

    expect(superseded).not.toContain(sessionA);
    expect(superseded).not.toContain(sessionB);
    expect(superseded).not.toContain(sessionC);
    for (const id of [sessionA, sessionB, sessionC]) {
      expect((await readAssignment(id)).status).toBe('active');
    }
  });

  it('a program that already finished is left in its history, not re-marked replaced', async () => {
    const supabase = serviceRoleClient();
    const finished = await seedAssignment({ startDate: '2026-06-01', status: 'completed' });
    const successor = await seedAssignment({ startDate: '2026-08-03', status: 'active' });

    const superseded = await replacePreviousAssignments(supabase, {
      memberId: MEMBER,
      newAssignmentIds: [successor],
      supersededBy: successor,
    });
    expect(superseded).not.toContain(finished);
    expect((await readAssignment(finished)).status).toBe('completed');
  });
});

describe('frozen snapshots stay frozen across every transition', () => {
  it('the workout, its sections and its exercises are identical before and after', async () => {
    const supabase = serviceRoleClient();
    const assignmentId = await seedAssignment({
      startDate: '2026-08-03',
      status: 'upcoming',
      name: 'Snapshot immutability program',
    });

    const { data: workout, error: workoutError } = await supabase
      .from('coach_assigned_workouts')
      .insert({
        assignment_id: assignmentId,
        member_id: MEMBER,
        coach_id: COACH,
        scheduled_date: '2026-08-03',
        template_name: 'Snapshot immutability program',
        published_at: new Date().toISOString(),
      })
      .select('*')
      .single();
    expect(workoutError).toBeNull();
    createdWorkoutIds.push(workout!.id);

    const { data: section } = await supabase
      .from('coach_assigned_workout_sections')
      .insert({
        assigned_workout_id: workout!.id,
        member_id: MEMBER,
        coach_id: COACH,
        name: 'Release',
        section_type: 'corrective',
        sequence_index: 0,
      })
      .select('*')
      .single();

    const { data: exercise } = await supabase
      .from('coach_assigned_workout_exercises')
      .insert({
        assigned_workout_id: workout!.id,
        section_id: section!.id,
        member_id: MEMBER,
        coach_id: COACH,
        provider: 'your_move',
        external_id: 'test-exercise',
        exercise_name: 'Quadriceps Roll',
        sequence_index: 0,
        sets: 1,
        hold_duration_seconds: 60,
        rest_seconds: 15,
      })
      .select('*')
      .single();

    const before = { workout: workout!, section: section!, exercise: exercise! };

    // Every lifecycle transition there is, in sequence.
    await runJobOn([assignmentId], '2026-08-03'); // started
    await runJobOn([assignmentId], '2026-08-10'); // week advanced
    await pauseAssignment(supabase, assignmentId);
    await resumeAssignment(supabase, assignmentId, '2026-08-11');
    await supabase
      .from('coach_program_assignments')
      .update({ end_date: '2026-08-12' })
      .eq('id', assignmentId);
    await runJobOn([assignmentId], '2026-08-13'); // completed
    const successor = await seedAssignment({ startDate: '2026-08-14', status: 'active' });
    await replacePreviousAssignments(supabase, {
      memberId: MEMBER,
      newAssignmentIds: [successor],
      supersededBy: successor,
    });

    expect((await readAssignment(assignmentId)).status).toBe('completed');

    const [{ data: afterWorkout }, { data: afterSection }, { data: afterExercise }] =
      await Promise.all([
        supabase.from('coach_assigned_workouts').select('*').eq('id', workout!.id).single(),
        supabase.from('coach_assigned_workout_sections').select('*').eq('id', section!.id).single(),
        supabase
          .from('coach_assigned_workout_exercises')
          .select('*')
          .eq('id', exercise!.id)
          .single(),
      ]);

    expect(afterWorkout).toEqual(before.workout);
    expect(afterSection).toEqual(before.section);
    expect(afterExercise).toEqual(before.exercise);
  });
});

describe('what the member can read, per status', () => {
  const seeded: Record<string, string> = {};

  beforeAll(async () => {
    seeded.active = await seedAssignment({
      startDate: addDays(new Date().toISOString().slice(0, 10), -8),
      status: 'active',
      currentWeek: 2,
      name: 'Visible active program',
    });
    seeded.upcoming = await seedAssignment({
      startDate: addDays(new Date().toISOString().slice(0, 10), 7),
      status: 'upcoming',
      name: 'Visible upcoming program',
    });
    seeded.paused = await seedAssignment({
      startDate: addDays(new Date().toISOString().slice(0, 10), -8),
      status: 'paused',
      currentWeek: 2,
      name: 'Visible paused program',
    });
    seeded.completed = await seedAssignment({
      startDate: '2026-01-05',
      status: 'completed',
      currentWeek: 4,
      name: 'Visible completed program',
    });
    seeded.draft = await seedAssignment({
      startDate: '2026-08-03',
      status: 'active',
      visibility: 'draft',
      name: 'Unpublished program',
    });
    seeded.otherMember = await seedAssignment({
      memberId: OTHER_MEMBER,
      startDate: '2026-08-03',
      status: 'active',
      name: 'Another member’s program',
    });
  });

  async function memberLifecycles(): Promise<MemberProgramLifecycle[]> {
    const client = await signInAs(TEST_USERS.memberOne);
    return listMyProgramLifecycles(client);
  }

  it('she sees her own published programs at every status', async () => {
    const rows = await memberLifecycles();
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(seeded.active!)?.status).toBe('active');
    expect(byId.get(seeded.upcoming!)?.status).toBe('upcoming');
    expect(byId.get(seeded.paused!)?.status).toBe('paused');
    expect(byId.get(seeded.completed!)?.status).toBe('completed');
    expect(byId.get(seeded.active!)?.current_week).toBe(2);
    expect(byId.get(seeded.active!)?.duration_weeks).toBe(4);
  });

  it('she never sees a draft, and never sees another member’s program', async () => {
    const rows = await memberLifecycles();
    const ids = rows.map((r) => r.id);
    expect(ids).not.toContain(seeded.draft);
    expect(ids).not.toContain(seeded.otherMember);
    expect(rows.every((r) => r.member_id === MEMBER)).toBe(true);
  });

  it('the view carries no coach-only field at all', async () => {
    const rows = await memberLifecycles();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row).not.toHaveProperty('internal_notes');
      expect(row).not.toHaveProperty('assignment_notes');
      expect(row).not.toHaveProperty('coach_id');
    }
  });

  it('a completed program is history, not something she is currently on', async () => {
    const rows = await memberLifecycles();
    const views = buildMemberProgramViews(rows, []);
    const current = views.filter((v) => isCurrentProgramStatus(v.status));
    const history = views.filter((v) => !isCurrentProgramStatus(v.status));

    expect(current.map((v) => v.name)).not.toContain('Visible completed program');
    expect(history.map((v) => v.name)).toContain('Visible completed program');

    const completed = history.find((v) => v.name === 'Visible completed program')!;
    expect(completed.headline).toBe('Program complete');
    expect(completed.detail).toContain('Your coach is reviewing your next phase.');
  });

  it('a paused program tells her it is paused, and an upcoming one tells her when it starts', async () => {
    const views = buildMemberProgramViews(await memberLifecycles(), []);
    expect(views.find((v) => v.name === 'Visible paused program')!.headline).toBe('Paused');
    expect(views.find((v) => v.name === 'Visible upcoming program')!.headline).toMatch(/^Starts /);
  });

  it('she is never shown a stale active program past its end date', async () => {
    const views = buildMemberProgramViews(await memberLifecycles(), []);
    const today = new Date().toISOString().slice(0, 10);
    for (const view of views) {
      if (view.status !== 'active') continue;
      expect(view.endDate === null || view.endDate >= today).toBe(true);
    }
  });

  it('a member cannot read the assignment table itself, only the lifecycle view', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const { data } = await client
      .from('coach_program_assignments')
      .select('id')
      .eq('id', seeded.active!);
    expect(data ?? []).toHaveLength(0);
  });
});

describe('the coach reads true statuses', () => {
  it('getAssignmentLifecycle returns the lifecycle columns for a coach', async () => {
    const supabase = serviceRoleClient();
    const id = await seedAssignment({ startDate: '2026-08-03', status: 'active', currentWeek: 2 });
    const row = await getAssignmentLifecycle(supabase, id);
    expect(row).toMatchObject({
      status: 'active',
      start_date: '2026-08-03',
      end_date: '2026-08-30',
      duration_weeks: 4,
      current_week: 2,
    });
  });

  it('a coach sees a member’s completed and replaced programs in history, with their dates', async () => {
    const coachClient = await signInAs(TEST_USERS.coachOne);
    const completed = await seedAssignment({
      startDate: '2026-02-02',
      status: 'completed',
      currentWeek: 4,
      name: 'Coach history program',
    });

    const { data } = await coachClient
      .from('coach_program_assignments')
      .select('id, status, start_date, end_date, current_week')
      .eq('id', completed)
      .single();

    expect(data).toMatchObject({
      status: 'completed',
      start_date: '2026-02-02',
      end_date: '2026-03-01',
      current_week: 4,
    });
  });
});
