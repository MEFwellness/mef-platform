/**
 * THE SAVE, AGAINST THE REAL DATABASE, THE REAL POLICIES AND THE REAL
 * PARTIAL INDEX.
 *
 * WHY THIS TEST EXISTS, IN ONE SENTENCE. A real walk of ten chapters on
 * production saved absolutely nothing, silently, and every unit test in
 * this feature passed while it happened.
 *
 * THE BUG IT CLOSES. The one-row-per-assignment index is PARTIAL
 * (`where assignment_id is not null`), and Postgres will not accept a
 * partial index as an ON CONFLICT arbiter unless the statement repeats its
 * predicate, which PostgREST's `onConflict` cannot express. So the upsert
 * the save used was refused every single time. Because a failed autosave
 * is deliberately not something to interrupt a member with, the refusal
 * never reached her screen: she answered ninety questions and her Home
 * card still offered to begin.
 *
 * NOTHING ABOUT THAT IS VISIBLE TO A MOCK. The refusal comes from the
 * database's own index, so the only test that can see it is one that talks
 * to a real database. Server actions cannot be called from this suite
 * (they read cookies() outside a request scope), so these issue the
 * identical query the data layer issues, signed in as a real seeded
 * member, which is what actually exercises RLS.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import { HLI_CONTENT_VERSION, HLI_DEFINITION_ID } from '../lib/health-intake/constants';
import {
  completeHliSession,
  fetchHliSessionForAssignment,
  fetchPendingHliAssignment,
  saveHliProgress,
} from '../lib/health-intake/data';
import type { IntakeAnswers } from '../lib/health-intake/types';

const memberOneId = TEST_USERS.memberOne.id;
const coachOneId = TEST_USERS.coachOne.id;

async function cleanup() {
  const service = serviceRoleClient();
  await service.from('member_health_intake_sessions').delete().eq('member_id', memberOneId);
  await service
    .from('assessment_attempts')
    .delete()
    .eq('member_id', memberOneId)
    .eq('assessment_definition_id', HLI_DEFINITION_ID);
  await service
    .from('assessment_assignments')
    .delete()
    .eq('member_id', memberOneId)
    .eq('assessment_definition_id', HLI_DEFINITION_ID);
}

beforeEach(cleanup);
afterAll(cleanup);

/** The coach's Assign, issued as the coach, so its own policy is what allows it. */
async function assign(): Promise<string> {
  const coach = await signInAs(TEST_USERS.coachOne);
  const { data, error } = await coach
    .from('assessment_assignments')
    .insert({
      member_id: memberOneId,
      assessment_definition_id: HLI_DEFINITION_ID,
      assigned_by: coachOneId,
      is_required: true,
      stage: 'standard',
      due_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    })
    .select('id')
    .single();
  if (error) throw new Error(`could not assign: ${error.message}`);
  return data.id as string;
}

const FIRST: IntakeAnswers = {
  full_name: 'Member One',
  date_of_birth: '1986-04-02',
};
const LATER: IntakeAnswers = {
  ...FIRST,
  medications_gate: 'yes',
  medications: [
    { medication_name: 'Levothyroxine', medication_dose: '50mcg', medication_reason: 'Thyroid' },
    { medication_name: 'Sertraline' },
  ],
};

describe('a draft is written, read back, and survives', () => {
  it('creates the row on her first Continue and returns it', async () => {
    const assignmentId = await assign();
    const member = await signInAs(TEST_USERS.memberOne);

    const record = await saveHliProgress(member, memberOneId, {
      assignmentId,
      answers: FIRST,
      archived: {},
      stepIndex: 2,
      contentVersion: HLI_CONTENT_VERSION,
    });

    expect(record, 'the first save returned nothing, so nothing was stored').not.toBeNull();
    expect(record!.answers).toEqual(FIRST);
    expect(record!.stepIndex).toBe(2);
    expect(record!.completedAt).toBeNull();
    expect(record!.startedAt).toBeTruthy();
  });

  it('updates that same row on every save after it, and never makes a second', async () => {
    const assignmentId = await assign();
    const member = await signInAs(TEST_USERS.memberOne);

    const first = await saveHliProgress(member, memberOneId, {
      assignmentId,
      answers: FIRST,
      archived: {},
      stepIndex: 2,
      contentVersion: HLI_CONTENT_VERSION,
    });
    const second = await saveHliProgress(member, memberOneId, {
      assignmentId,
      answers: LATER,
      archived: {},
      stepIndex: 14,
      contentVersion: HLI_CONTENT_VERSION,
    });

    expect(second).not.toBeNull();
    expect(second!.id).toBe(first!.id);
    expect(second!.answers.medications).toHaveLength(2);
    expect(second!.stepIndex).toBe(14);

    const service = serviceRoleClient();
    const { data: rows } = await service
      .from('member_health_intake_sessions')
      .select('id')
      .eq('member_id', memberOneId);
    expect(rows, 'one assignment must hold exactly one sitting').toHaveLength(1);
  });

  it('reads back what she left, which is what resume is built on', async () => {
    const assignmentId = await assign();
    const member = await signInAs(TEST_USERS.memberOne);
    await saveHliProgress(member, memberOneId, {
      assignmentId,
      answers: LATER,
      archived: {},
      stepIndex: 14,
      contentVersion: HLI_CONTENT_VERSION,
    });

    // A fresh session, exactly as reopening the app is.
    const returning = await signInAs(TEST_USERS.memberOne);
    const pending = await fetchPendingHliAssignment(returning, memberOneId);
    expect(pending.ok).toBe(true);
    expect(pending.assignment?.id).toBe(assignmentId);

    const resumed = await fetchHliSessionForAssignment(returning, memberOneId, assignmentId);
    expect(resumed, 'she came back to nothing').not.toBeNull();
    expect(resumed!.answers.medications).toHaveLength(2);
    expect(resumed!.stepIndex).toBe(14);
  });

  it('keeps what she removed in its own column, and out of her answers', async () => {
    const assignmentId = await assign();
    const member = await signInAs(TEST_USERS.memberOne);
    const record = await saveHliProgress(member, memberOneId, {
      assignmentId,
      answers: { ...FIRST, medications_gate: 'no' },
      archived: { medications: LATER.medications },
      stepIndex: 16,
      contentVersion: HLI_CONTENT_VERSION,
    });
    expect(record!.answers.medications).toBeUndefined();
    expect(record!.archived.medications).toHaveLength(2);
  });
});

describe('the database is the gate, not the screen', () => {
  it('refuses a sitting for a member with no pending assignment of her own', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    const { error } = await member.from('member_health_intake_sessions').insert({
      member_id: memberOneId,
      assignment_id: null,
      answers: FIRST,
    });
    expect(error, 'a member with no assignment wrote a sitting').not.toBeNull();
  });

  it('refuses a second sitting for one assignment', async () => {
    const assignmentId = await assign();
    const member = await signInAs(TEST_USERS.memberOne);
    await saveHliProgress(member, memberOneId, {
      assignmentId,
      answers: FIRST,
      archived: {},
      stepIndex: 1,
      contentVersion: HLI_CONTENT_VERSION,
    });

    const { error } = await member.from('member_health_intake_sessions').insert({
      member_id: memberOneId,
      assignment_id: assignmentId,
      answers: FIRST,
    });
    expect(error, 'two sittings landed on one assignment').not.toBeNull();
    expect(error!.code).toBe('23505');
  });

  it('makes a finished sitting immutable, and closes the assignment out', async () => {
    const assignmentId = await assign();
    const member = await signInAs(TEST_USERS.memberOne);
    const draft = await saveHliProgress(member, memberOneId, {
      assignmentId,
      answers: FIRST,
      archived: {},
      stepIndex: 1,
      contentVersion: HLI_CONTENT_VERSION,
    });

    const done = await completeHliSession(member, memberOneId, {
      sessionId: draft!.id,
      answers: LATER,
      archived: {},
      stepIndex: 40,
    });
    expect(done?.completedAt).toBeTruthy();

    // Write once: a second completion matches no row.
    const again = await completeHliSession(member, memberOneId, {
      sessionId: draft!.id,
      answers: FIRST,
      archived: {},
      stepIndex: 41,
    });
    expect(again, 'a finished sitting was edited').toBeNull();

    // And the trigger closed the assignment, which is what stops the
    // pop-up and the Home card.
    const service = serviceRoleClient();
    const { data: assignment } = await service
      .from('assessment_assignments')
      .select('status')
      .eq('id', assignmentId)
      .maybeSingle();
    expect(assignment?.status).toBe('completed');
  });

  it('never lets a saver write into a finished sitting either', async () => {
    const assignmentId = await assign();
    const member = await signInAs(TEST_USERS.memberOne);
    const draft = await saveHliProgress(member, memberOneId, {
      assignmentId,
      answers: FIRST,
      archived: {},
      stepIndex: 1,
      contentVersion: HLI_CONTENT_VERSION,
    });
    await completeHliSession(member, memberOneId, {
      sessionId: draft!.id,
      answers: LATER,
      archived: {},
      stepIndex: 40,
    });

    const stale = await saveHliProgress(member, memberOneId, {
      assignmentId,
      answers: FIRST,
      archived: {},
      stepIndex: 5,
      contentVersion: HLI_CONTENT_VERSION,
    });
    expect(stale?.completedAt, 'a stale tab rewrote a completion').toBeTruthy();
    expect(stale?.answers.medications).toHaveLength(2);
  });
});

describe('her coach can read it and can never write it', () => {
  it('the coach reads her sitting', async () => {
    const assignmentId = await assign();
    const member = await signInAs(TEST_USERS.memberOne);
    await saveHliProgress(member, memberOneId, {
      assignmentId,
      answers: LATER,
      archived: {},
      stepIndex: 14,
      contentVersion: HLI_CONTENT_VERSION,
    });

    const coach = await signInAs(TEST_USERS.coachOne);
    const { data, error } = await coach
      .from('member_health_intake_sessions')
      .select('id, answers')
      .eq('member_id', memberOneId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('the coach cannot correct one of her answers', async () => {
    const assignmentId = await assign();
    const member = await signInAs(TEST_USERS.memberOne);
    const draft = await saveHliProgress(member, memberOneId, {
      assignmentId,
      answers: LATER,
      archived: {},
      stepIndex: 14,
      contentVersion: HLI_CONTENT_VERSION,
    });

    const coach = await signInAs(TEST_USERS.coachOne);
    const { data } = await coach
      .from('member_health_intake_sessions')
      .update({ answers: { full_name: 'Corrected by a coach' } })
      .eq('id', draft!.id)
      .select('id');
    // No update policy for a coach, so the update matches no row.
    expect(data ?? []).toHaveLength(0);

    const service = serviceRoleClient();
    const { data: row } = await service
      .from('member_health_intake_sessions')
      .select('answers')
      .eq('id', draft!.id)
      .maybeSingle();
    expect((row?.answers as IntakeAnswers).full_name).toBe('Member One');
  });
});
