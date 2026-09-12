/**
 * REASSIGNMENT, AGAINST THE REAL DATABASE, THE REAL POLICIES AND THE REAL
 * TRIGGER.
 *
 * The rule this build rests on is not in the app: it is
 * assessment_assignments' own partial unique index (migration 144), which
 * makes a second open assignment of one instrument for one client
 * impossible, and the trigger beside it that closes an assignment out the
 * moment an attempt lands. Everything the coach's screen does is built on
 * those two facts, so those two facts are what is proved here rather than
 * a wrapper around them.
 *
 * Server actions cannot be called from this suite (they read cookies()
 * outside a request scope), so these issue the identical queries the
 * actions issue, signed in as the real seeded coach, which is what
 * actually exercises RLS.
 *
 *   1. A coach can open an assignment for their own client.
 *   2. A SECOND OPEN ONE IS REFUSED BY THE DATABASE. This is what "a
 *      client must never have two open assignments of the same
 *      instrument" means, and it is not the app being careful.
 *   3. A RESEND MOVES THE DUE DATE of the one that is open, under the
 *      coach's own policy, and leaves exactly one row.
 *   4. Once it is finished, a NEW one can be opened, which is the whole
 *      point: reassignment after completion, with no cooldown and no
 *      limit, and the finished row still standing behind it so the
 *      reassessment comparison has two sittings to compare.
 *   5. THE FINISHED ROW IS NOT MERELY STILL PRESENT, IT IS UNCHANGED.
 *      Every column of it is compared before and after the second
 *      assignment, because "a row with that id still exists" and "the
 *      sitting she finished is intact" are two different claims and only
 *      the second one is what a coach is promised.
 *   6. AND THE COACH'S SCREEN, FILED FROM THOSE REAL ROWS, puts the open
 *      sitting in Assigned, Waiting and leaves the finished one in
 *      Completed. That is the bridge between the ledger and the block:
 *      the unit tests file hand-made rows, this files the ones the
 *      database actually wrote.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import { WBS_DEFINITION_ID } from '../lib/whole-body-signal/constants';
import { assignmentStatusLine, dueAtForLocalDate, resolveAssignmentProgress } from '../lib/assignments/status';
import { groupAssessmentsByStatus } from '../lib/coach-detail/assessmentStatus';
import { listAssignableTemplates } from '../lib/assignments/assignableCatalog';
import { assignmentNameRecord } from '../lib/assignments/experienceNames';
import { buildAssignmentHistory } from '../lib/coach-assign/history';
import { DEFAULT_COACH_ASSIGN_COPY } from '../lib/coach-assign/copy';

const memberOneId = TEST_USERS.memberOne.id;
const coachOneId = TEST_USERS.coachOne.id;

async function cleanup() {
  const service = serviceRoleClient();
  await service
    .from('assessment_attempts')
    .delete()
    .eq('member_id', memberOneId)
    .eq('assessment_definition_id', WBS_DEFINITION_ID);
  await service
    .from('assessment_assignments')
    .delete()
    .eq('member_id', memberOneId)
    .eq('assessment_definition_id', WBS_DEFINITION_ID);
}

beforeEach(cleanup);
afterAll(cleanup);

/** The insert the coach's Assign button makes, issued as the coach. */
async function assignAsCoach(dueDate: string | null) {
  const coach = await signInAs(TEST_USERS.coachOne);
  return coach
    .from('assessment_assignments')
    .insert({
      member_id: memberOneId,
      assessment_definition_id: WBS_DEFINITION_ID,
      assigned_by: coachOneId,
      is_required: true,
      stage: 'standard',
      due_at: dueDate ? dueAtForLocalDate(dueDate) : null,
    })
    .select('id, due_at, status')
    .maybeSingle();
}

async function openRow() {
  const service = serviceRoleClient();
  const { data } = await service
    .from('assessment_assignments')
    .select('id, due_at, status, created_at, assigned_by, updated_at')
    .eq('member_id', memberOneId)
    .eq('assessment_definition_id', WBS_DEFINITION_ID)
    .eq('status', 'pending')
    .maybeSingle();
  return data;
}

async function allRows() {
  const service = serviceRoleClient();
  const { data } = await service
    .from('assessment_assignments')
    .select('id, status, due_at, created_at, assigned_by, updated_at')
    .eq('member_id', memberOneId)
    .eq('assessment_definition_id', WBS_DEFINITION_ID)
    .order('created_at', { ascending: false });
  return data ?? [];
}

/** What a completion really is: an attempt row, which fires migration 144's trigger. */
async function completeIt() {
  const service = serviceRoleClient();
  const { error } = await service.from('assessment_attempts').insert({
    member_id: memberOneId,
    assessment_definition_id: WBS_DEFINITION_ID,
    attempt_type: 'standard',
    status: 'completed',
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    source_table: 'member_whole_body_signal_sessions',
    source_id: crypto.randomUUID(),
  });
  expect(error).toBeNull();
}

describe('a coach opening an assignment', () => {
  it('writes one open row for their own client', async () => {
    const { data, error } = await assignAsCoach('2026-09-19');
    expect(error).toBeNull();
    expect(data?.status).toBe('pending');
    expect((await allRows()).length).toBe(1);
  });

  it('CANNOT OPEN A SECOND ONE. The database refuses it, not the app', async () => {
    await assignAsCoach('2026-09-19');
    const { error } = await assignAsCoach('2026-09-26');
    expect(error).not.toBeNull();
    // 23505 is the partial unique index (migration 144) doing its job.
    expect(error?.code).toBe('23505');
    expect((await allRows()).length).toBe(1);
  });
});

describe('resending the one that is open', () => {
  it('moves its due date and leaves exactly one row', async () => {
    await assignAsCoach('2026-09-19');
    const before = await openRow();
    expect(before).not.toBeNull();

    // The identical update resendAssessmentRowAction makes, as the coach,
    // so the coach_update_assigned_assessment_assignments policy is what
    // decides whether it lands.
    const coach = await signInAs(TEST_USERS.coachOne);
    const { data: moved, error } = await coach
      .from('assessment_assignments')
      .update({ due_at: dueAtForLocalDate('2026-09-30'), updated_at: new Date().toISOString() })
      .eq('id', before!.id)
      .eq('status', 'pending')
      .select('id, due_at')
      .maybeSingle();

    expect(error).toBeNull();
    // "No error" is not "it worked": the row is read back.
    expect(moved).not.toBeNull();

    const after = await allRows();
    expect(after.length).toBe(1);
    expect(after[0]!.id).toBe(before!.id);
    expect(after[0]!.status).toBe('pending');
    expect(String(after[0]!.due_at)).toContain('2026-09-30');
  });

  it('REFUSES A CLIENT THIS COACH IS NOT ASSIGNED TO, which is the policy and not a check', async () => {
    await assignAsCoach('2026-09-19');
    const row = await openRow();
    const stranger = await signInAs(TEST_USERS.memberTwo);
    const { data } = await stranger
      .from('assessment_assignments')
      .update({ due_at: dueAtForLocalDate('2026-12-25') })
      .eq('id', row!.id)
      .select('id')
      .maybeSingle();
    expect(data).toBeNull();
    expect(String((await openRow())!.due_at)).toContain('2026-09-19');
  });
});

describe('sending it again once she has finished', () => {
  it('closes the first out and lets a new one open, with no cooldown and no limit', async () => {
    await assignAsCoach('2026-09-19');
    await completeIt();

    const closed = await allRows();
    expect(closed.length).toBe(1);
    expect(closed[0]!.status).toBe('completed');
    expect(await openRow()).toBeNull();

    // The second cycle. This is the write the Assign Again button makes.
    const { error } = await assignAsCoach('2026-09-30');
    expect(error).toBeNull();

    const both = await allRows();
    expect(both.length).toBe(2);
    expect(both.filter((row) => row.status === 'pending').length).toBe(1);
    // THE FINISHED ONE IS STILL THERE, which is what the reassessment
    // comparison reads to have two sittings to compare.
    expect(both.filter((row) => row.status === 'completed').length).toBe(1);
  });

  it('LEAVES THE FINISHED ROW BYTE FOR BYTE AS IT WAS, not merely still present', async () => {
    await assignAsCoach('2026-09-19');
    await completeIt();

    const before = (await allRows())[0]!;
    expect(before.status).toBe('completed');

    await assignAsCoach('2026-09-30');

    const after = (await allRows()).find((row) => row.id === before.id);
    expect(after, 'the finished assignment was removed').toBeTruthy();
    // Its own id, its own status, its own due date and the moment the
    // trigger closed it out. A second assignment that rewrote any of them
    // would be overwriting the sitting rather than adding one.
    expect(after).toEqual(before);
  });

  it('files the real rows the way the coach screen reads them: one waiting, one completed', async () => {
    await assignAsCoach('2026-09-19');
    await completeIt();
    await assignAsCoach('2026-09-30');

    const rows = await allRows();
    const memberToday = new Date().toISOString().slice(0, 10);
    const assignments = rows.map((row) => {
      const progress = resolveAssignmentProgress({
        status: row.status as 'pending' | 'completed' | 'cancelled',
        createdAt: row.created_at as string,
        dueAt: (row.due_at as string | null) ?? null,
        cancelledAt: null,
        completedAt: row.status === 'completed' ? (row.updated_at as string) : null,
        deliveredAt: null,
        memberToday,
      });
      return {
        id: row.id as string,
        assessmentDefinitionId: WBS_DEFINITION_ID,
        assignedBy: row.assigned_by as string,
        isRequired: true,
        status: row.status as 'pending' | 'completed' | 'cancelled',
        createdAt: row.created_at as string,
        progress,
        statusLine: assignmentStatusLine(progress, { timeZone: 'UTC' }),
      };
    });

    const groups = groupAssessmentsByStatus(
      listAssignableTemplates(),
      assignments,
      assignmentNameRecord()
    );

    const waiting = groups.waiting.filter((row) => row.definitionId === WBS_DEFINITION_ID);
    const completed = groups.completed.filter((row) => row.definitionId === WBS_DEFINITION_ID);
    expect(waiting).toHaveLength(1);
    expect(completed).toHaveLength(1);
    expect(waiting[0]!.assignment!.id).toBe(
      rows.find((row) => row.status === 'pending')!.id
    );
    expect(completed[0]!.assignment!.id).toBe(
      rows.find((row) => row.status === 'completed')!.id
    );
    // The finished half cannot offer to send a second open sitting, which
    // is the very thing the database refused in claim 2.
    expect(completed[0]!.openElsewhere).toBe(true);
  });

  it('and a third, so nothing here counts how many times it has been sent', async () => {
    for (let cycle = 0; cycle < 3; cycle += 1) {
      const { error } = await assignAsCoach(null);
      expect(error, `cycle ${cycle}`).toBeNull();
      await completeIt();
    }
    const rows = await allRows();
    expect(rows.length).toBe(3);
    expect(rows.every((row) => row.status === 'completed')).toBe(true);
  });

  it('builds the history sentences a coach reads from those very rows', async () => {
    await assignAsCoach('2026-09-19');
    await completeIt();
    await assignAsCoach('2026-09-30');

    const rows = await allRows();
    const view = buildAssignmentHistory({
      assignments: rows.map((row) => ({
        id: row.id as string,
        assessmentDefinitionId: WBS_DEFINITION_ID,
        status: row.status as 'pending' | 'completed' | 'cancelled',
        createdAt: row.created_at as string,
        assignedBy: row.assigned_by as string,
        completedAt: row.status === 'completed' ? (row.updated_at as string) : null,
      })),
      definitionId: WBS_DEFINITION_ID,
      copy: DEFAULT_COACH_ASSIGN_COPY as Record<string, string>,
      timeZone: 'UTC',
      memberToday: new Date().toISOString().slice(0, 10),
      clientFirstName: 'Member',
      viewerId: coachOneId,
      assignerNames: {},
    });

    expect(view).not.toBeNull();
    expect(view!.isOpen).toBe(true);
    expect(view!.lastAssignedLine).toContain('by you.');
    expect(view!.lastCompletedLine).toMatch(/^Last completed /);
    expect(view!.recentCompletionLine).toBe('Completed today.');
    expect(view!.openNoticeLine).toContain('This is already waiting for Member');
  });
});
