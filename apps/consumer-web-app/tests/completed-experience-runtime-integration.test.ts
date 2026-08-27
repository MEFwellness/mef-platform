/**
 * BUG FIX, 2026-08-27: completed free experiences were served again the
 * next day. This is the half of that bug that lives in the database, run
 * against real local Supabase and real RLS rather than mocks.
 *
 * THE ORIGINAL FAULT. `startOrResumeSession` created a brand-new empty
 * session for anybody with no open draft, INCLUDING somebody who had just
 * finished the whole thing. The take pages call it while rendering, and
 * finishing an assessment is a Next.js Server Action, which re-renders the
 * page it was called from, so the act of finishing started a fresh empty
 * session of the assessment just completed. Measured in a real browser
 * against a real dev server: 72 milliseconds after the completion.
 * Production carried the same signature at 1.4 to 2.5 seconds, four times
 * over for one member.
 *
 * These tests would have caught it: the second call after a completion
 * must write nothing at all.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import {
  completeSession,
  findLatestCompletedSession,
  persistAnswer,
  startOrResumeSession,
} from '../lib/assessment-runtime';

const memberId = TEST_USERS.memberOne.id;
const FIXTURE_KEY = 'completed-experience-fixture';

let definitionId: string;
let questionId: string;

async function seedFixture() {
  const service = serviceRoleClient();

  const { data: definition, error: definitionError } = await service
    .from('unified_assessment_definitions')
    .insert({ key: FIXTURE_KEY, title: 'Completed Experience Fixture', assessment_type: 'test_fixture' })
    .select('id')
    .single();
  if (definitionError || !definition) throw definitionError ?? new Error('failed to seed definition');
  definitionId = definition.id;

  const { data: section, error: sectionError } = await service
    .from('unified_assessment_sections')
    .insert({ assessment_definition_id: definitionId, title: 'Only Section', display_order: 0 })
    .select('id')
    .single();
  if (sectionError || !section) throw sectionError ?? new Error('failed to seed section');

  const { data: question, error: questionError } = await service
    .from('unified_assessment_questions')
    .insert({
      question_key: 'fixture_only_question',
      assessment_definition_id: definitionId,
      section_id: section.id,
      display_order: 0,
      prompt: 'Is this the only question?',
      answer_type: 'boolean',
    })
    .select('id')
    .single();
  if (questionError || !question) throw questionError ?? new Error('failed to seed question');
  questionId = question.id;
}

async function clearSessions() {
  const service = serviceRoleClient();
  await service.from('unified_assessment_sessions').delete().eq('member_id', memberId).eq('assessment_definition_id', definitionId);
  await service.from('assessment_attempts').delete().eq('member_id', memberId).eq('source_table', 'unified_assessment_sessions');
}

async function sessionRows() {
  const service = serviceRoleClient();
  const { data } = await service
    .from('unified_assessment_sessions')
    .select('id, status, started_at, completed_at')
    .eq('member_id', memberId)
    .eq('assessment_definition_id', definitionId)
    .order('started_at');
  return data ?? [];
}

/** Start it, answer its one question, finish it. Returns the finished session id. */
async function finishOnce(client: Awaited<ReturnType<typeof signInAs>>): Promise<string> {
  const started = await startOrResumeSession(client, memberId, FIXTURE_KEY, { startRetake: true });
  if (started.status !== 'started' && started.status !== 'resumed') {
    throw new Error(`expected an open session, got "${started.status}"`);
  }
  await persistAnswer(client, started.session.id, questionId, true);
  await completeSession(client, started.session.id);
  return started.session.id;
}

beforeAll(async () => {
  await seedFixture();
});

beforeEach(async () => {
  await clearSessions();
});

afterAll(async () => {
  await clearSessions();
  const service = serviceRoleClient();
  if (definitionId) await service.from('unified_assessment_definitions').delete().eq('id', definitionId);
});

describe('finishing an assessment leaves no empty draft behind', () => {
  it('the render that follows a completion writes nothing at all', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const finishedId = await finishOnce(client);

    // Exactly what the take page does when the Server Action re-renders it.
    const afterCompletion = await startOrResumeSession(client, memberId, FIXTURE_KEY);
    expect(afterCompletion.status).toBe('already_completed');
    if (afterCompletion.status === 'already_completed') {
      expect(afterCompletion.latestCompletedSessionId).toBe(finishedId);
    }

    const rows = await sessionRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('completed');
  });

  it('opening the take route again the next day still writes nothing', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    await finishOnce(client);

    // Three more renders, standing in for a bookmark, a pop-up and a card.
    for (let visit = 0; visit < 3; visit += 1) {
      const result = await startOrResumeSession(client, memberId, FIXTURE_KEY);
      expect(result.status).toBe('already_completed');
    }

    const rows = await sessionRows();
    expect(rows).toHaveLength(1);
    expect(rows.filter((r) => r.status === 'in_progress')).toHaveLength(0);
  });

  it('a member who asks for a retake still gets one, and her completed session survives it', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const finishedId = await finishOnce(client);

    const retake = await startOrResumeSession(client, memberId, FIXTURE_KEY, { startRetake: true });
    expect(retake.status).toBe('started');

    const rows = await sessionRows();
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === finishedId)!.status).toBe('completed');
    expect(rows.filter((r) => r.status === 'in_progress')).toHaveLength(1);

    // And the retake draft resumes rather than multiplying, retake flag or not.
    const resumed = await startOrResumeSession(client, memberId, FIXTURE_KEY);
    expect(resumed.status).toBe('resumed');
    expect(await sessionRows()).toHaveLength(2);
  });

  it('somebody who has never finished it still gets a session created for her', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const first = await startOrResumeSession(client, memberId, FIXTURE_KEY);
    expect(first.status).toBe('started');
    expect(await sessionRows()).toHaveLength(1);
  });

  it('findLatestCompletedSession returns the most recent completion, not the first', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    await finishOnce(client);
    const secondId = await finishOnce(client);

    const latest = await findLatestCompletedSession(client, memberId, definitionId);
    expect(latest?.id).toBe(secondId);
  });
});
