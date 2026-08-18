/**
 * "New from your coach", against real local Supabase — real rows, real
 * RLS, the real event type migration 185 added. No mocks.
 *
 * The mark on the home screen's program card is only as good as the fact
 * behind it, and that fact has exactly three jobs:
 *
 *   1. A program her coach has just handed her reads as unopened.
 *   2. Opening ANY session of it clears the mark for the whole program,
 *      not just for that session, because a program is delivered as one
 *      assignment per weekly session (migration 172).
 *   3. It never comes back. Opening it a second, third and tenth time
 *      writes nothing more, so this is a durable mark rather than a
 *      page-view counter, and a program stays opened across days,
 *      devices and sessions.
 *
 * Plus the two things a member-facing fact must never do: leak across
 * members, and be writable by anyone but her own session.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { serviceRoleClient, signInAs, TEST_USERS } from './setup/test-clients';
import { isProgramUnopened, recordProgramOpened } from '../lib/program-lifecycle/opened';
import { endDateFor } from '../lib/program-lifecycle/transitions';

const MEMBER = TEST_USERS.memberOne.id;
const OTHER_MEMBER = TEST_USERS.memberTwo.id;
const COACH = TEST_USERS.coachOne.id;

const createdAssignmentIds: string[] = [];

afterAll(async () => {
  const supabase = serviceRoleClient();
  if (createdAssignmentIds.length === 0) return;
  await supabase
    .from('member_wellness_events')
    .delete()
    .in('source_record_id', createdAssignmentIds);
  await supabase.from('coach_program_assignments').delete().in('id', createdAssignmentIds);
});

/** One weekly session of a program. Several of them sharing a group key are one program. */
async function seedSession(input: {
  memberId?: string;
  groupKey: string;
  name: string;
}): Promise<string> {
  const supabase = serviceRoleClient();
  const startDate = '2026-09-01';
  const { data, error } = await supabase
    .from('coach_program_assignments')
    .insert({
      member_id: input.memberId ?? MEMBER,
      coach_id: COACH,
      template_id: null,
      template_name_snapshot: input.name,
      schedule_type: 'weekly',
      schedule_config: { type: 'weekly', startDate, daysOfWeek: [1], weeks: 4 },
      visibility: 'published',
      published_at: new Date().toISOString(),
      status: 'upcoming',
      start_date: startDate,
      end_date: endDateFor(startDate, 4),
      duration_weeks: 4,
      current_week: 1,
      program_group_key: input.groupKey,
    })
    .select('id')
    .single();
  expect(error).toBeNull();
  createdAssignmentIds.push(data!.id);
  return data!.id;
}

async function countOpenEvents(assignmentIds: string[]): Promise<number> {
  const supabase = serviceRoleClient();
  const { data } = await supabase
    .from('member_wellness_events')
    .select('id')
    .eq('event_type', 'program_opened')
    .in('source_record_id', assignmentIds);
  return (data ?? []).length;
}

describe('a program she has never opened', () => {
  it('reads as unopened when her coach has just handed it to her', async () => {
    const groupKey = `opened-test-fresh-${Date.now()}`;
    const sessionA = await seedSession({ groupKey, name: 'Fresh program: Session A' });
    const sessionB = await seedSession({ groupKey, name: 'Fresh program: Session B' });

    const supabase = await signInAs(TEST_USERS.memberOne);
    expect(await isProgramUnopened(supabase, [sessionA, sessionB])).toBe(true);
  });

  it('is never marked unopened when there is no program at all', async () => {
    const supabase = await signInAs(TEST_USERS.memberOne);
    expect(await isProgramUnopened(supabase, [])).toBe(false);
  });
});

describe('opening it, once, for good', () => {
  it('opening one session clears the mark for the whole program', async () => {
    const groupKey = `opened-test-group-${Date.now()}`;
    const sessionA = await seedSession({ groupKey, name: 'Group program: Session A' });
    const sessionB = await seedSession({ groupKey, name: 'Group program: Session B' });
    const group = [sessionA, sessionB];

    const supabase = await signInAs(TEST_USERS.memberOne);
    expect(await isProgramUnopened(supabase, group)).toBe(true);

    // She opens Session B.
    const wrote = await recordProgramOpened(supabase, {
      memberId: MEMBER,
      assignmentIds: group,
      openedAssignmentId: sessionB,
      timezone: 'America/New_York',
    });
    expect(wrote).toBe(true);

    // "No error" is not "it worked": read the row back.
    expect(await countOpenEvents(group)).toBe(1);
    // One row for the whole program, whichever end of the group it is
    // asked from. Session A, which she never touched, does not make the
    // program unopened again.
    expect(await isProgramUnopened(supabase, group)).toBe(false);
    expect(await isProgramUnopened(supabase, [sessionB, sessionA])).toBe(false);

    // The contract, stated so nobody mistakes it later: the question is
    // always asked about a PROGRAM, meaning every assignment in the group,
    // which is exactly what MemberProgramView.assignmentIds is and exactly
    // what getMyCurrentProgramEntryAction passes. Asked about one session
    // in isolation it answers about that session, which is why no caller
    // does that.
    expect(await isProgramUnopened(supabase, [sessionA])).toBe(true);
  });

  it('opening it again writes nothing, however many times she comes back', async () => {
    const groupKey = `opened-test-repeat-${Date.now()}`;
    const sessionA = await seedSession({ groupKey, name: 'Repeat program: Session A' });
    const group = [sessionA];

    const supabase = await signInAs(TEST_USERS.memberOne);
    for (let visit = 0; visit < 5; visit++) {
      await recordProgramOpened(supabase, {
        memberId: MEMBER,
        assignmentIds: group,
        openedAssignmentId: sessionA,
        timezone: 'America/New_York',
      });
    }

    expect(await countOpenEvents(group)).toBe(1);
    expect(await isProgramUnopened(supabase, group)).toBe(false);
  });

  it('a second program assigned later is new again, and the first one stays opened', async () => {
    const stamp = Date.now();
    const first = await seedSession({ groupKey: `opened-first-${stamp}`, name: 'First program' });
    const second = await seedSession({ groupKey: `opened-second-${stamp}`, name: 'Second program' });

    const supabase = await signInAs(TEST_USERS.memberOne);
    await recordProgramOpened(supabase, {
      memberId: MEMBER,
      assignmentIds: [first],
      openedAssignmentId: first,
      timezone: 'America/New_York',
    });

    expect(await isProgramUnopened(supabase, [first])).toBe(false);
    expect(await isProgramUnopened(supabase, [second])).toBe(true);
  });
});

describe('the mark is hers and nobody else’s', () => {
  it('another member’s open never clears her mark, and she cannot see it', async () => {
    const stamp = Date.now();
    const hers = await seedSession({ groupKey: `opened-hers-${stamp}`, name: 'Her program' });
    const theirs = await seedSession({
      memberId: OTHER_MEMBER,
      groupKey: `opened-theirs-${stamp}`,
      name: 'Their program',
    });

    const otherSession = await signInAs(TEST_USERS.memberTwo);
    await recordProgramOpened(otherSession, {
      memberId: OTHER_MEMBER,
      assignmentIds: [theirs],
      openedAssignmentId: theirs,
      timezone: 'America/New_York',
    });
    expect(await countOpenEvents([theirs])).toBe(1);

    const herSession = await signInAs(TEST_USERS.memberOne);
    expect(await isProgramUnopened(herSession, [hers])).toBe(true);
    // Her session cannot read the other member's event even when it asks
    // for it by assignment id: RLS, not a filter in application code.
    expect(await isProgramUnopened(herSession, [theirs])).toBe(true);
  });

  it('one member cannot write an open onto another member', async () => {
    const stamp = Date.now();
    const victim = await seedSession({
      memberId: OTHER_MEMBER,
      groupKey: `opened-victim-${stamp}`,
      name: 'Victim program',
    });

    const attacker = await signInAs(TEST_USERS.memberOne);
    const { error } = await attacker.from('member_wellness_events').insert({
      member_id: OTHER_MEMBER,
      event_type: 'program_opened',
      occurred_at: new Date().toISOString(),
      timezone: 'America/New_York',
      local_date: '2026-08-18',
      payload: {},
      source: 'member',
      source_record_id: victim,
    });
    expect(error).not.toBeNull();
    expect(await countOpenEvents([victim])).toBe(0);
  });
});

describe('the event type itself', () => {
  it('the database refuses an event type nobody added to the constraint', async () => {
    const supabase = serviceRoleClient();
    const { error } = await supabase.from('member_wellness_events').insert({
      member_id: MEMBER,
      event_type: 'program_peeked_at',
      occurred_at: new Date().toISOString(),
      timezone: 'America/New_York',
      local_date: '2026-08-18',
      payload: {},
      source: 'member',
    });
    expect(error).not.toBeNull();
  });

  it('program_opened stayed out of the product analytics view', async () => {
    const supabase = serviceRoleClient();
    const { data, error } = await supabase.rpc('is_product_analytics_event_type', {
      p_event_type: 'program_opened',
    });
    expect(error).toBeNull();
    expect(data).toBe(false);
  });
});
