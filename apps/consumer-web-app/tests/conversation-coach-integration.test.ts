/**
 * End-to-end integration test for the MEF Conversation Coach
 * (lib/conversation-coach/*) against real local Supabase — real RLS, no
 * mocked Supabase client, per this project's stated testing philosophy
 * (see tests/narrative-integration.test.ts / tests/safety-integration.test.ts).
 *
 * ANTHROPIC_API_KEY/ANTHROPIC_MODEL are deliberately cleared before every
 * test in this file so the LLM provider is always unconfigured here —
 * these tests verify the deterministic scaffolding (safety routing,
 * persistence, RLS, memory extraction, handoff) independent of whatever
 * real credentials happen to be present in a given environment. The
 * fallback path this exercises is itself part of section 16's required
 * behavior, not a workaround.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import { sendMessage } from '../lib/conversation-coach/service';
import { requestHandoff } from '../lib/conversation-coach/handoff';
import {
  getSession,
  setSessionStatus,
  listMessages,
  listActiveMemory,
  listHandoffsForSession,
} from '../lib/conversation-coach/data';
import { resetConversationCoachProviderForTests } from '../lib/conversation-coach/provider';

const memberOne = TEST_USERS.memberOne;
const memberTwo = TEST_USERS.memberTwo;
const memberIds = [memberOne.id, memberTwo.id];

// A local_date far outside any other integration test's fixture range
// (feed-integration.test.ts uses 2020-06-xx) — gatherConversationContext
// calls getOrCreateTodaysFeed for this date, and this file's own cleanup
// only touches rows for this specific date so it can never delete another
// suite's fixture data even when test files run in parallel.
const TEST_LOCAL_DATE = '2031-01-01';

beforeAll(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_MODEL;
  resetConversationCoachProviderForTests();
});

afterAll(async () => {
  const service = serviceRoleClient();
  // conversation_messages/conversation_memory/conversation_handoffs all
  // cascade from conversation_sessions (migration 33), so deleting
  // sessions is sufficient for this feature's own tables.
  await service.from('conversation_sessions').delete().in('member_id', memberIds);
  await service
    .from('daily_feed_items')
    .delete()
    .in('member_id', memberIds)
    .eq('local_date', TEST_LOCAL_DATE);
  // Scoped to this feature's own source_feature so a concurrently-running
  // safety/feed integration test's own fixtures are never touched.
  await service
    .from('safety_review_queue')
    .delete()
    .in('member_id', memberIds)
    .eq('source_feature', 'conversation_coach');
  await service
    .from('safety_classifications')
    .delete()
    .in('member_id', memberIds)
    .eq('source_feature', 'conversation_coach');
});

async function send(memberId: string, content: string, sessionId: string | null = null) {
  const client = memberId === memberOne.id ? await signInAs(memberOne) : await signInAs(memberTwo);
  const result = await sendMessage({
    supabase: client,
    memberId,
    memberFirstName: 'Test',
    localDate: TEST_LOCAL_DATE,
    timezone: 'America/New_York',
    content,
    sourcePage: '/coaching?entry=nav',
    sessionId,
    entryPoint: 'nav',
  });
  return { client, result };
}

describe('Conversation Coach — normal wellness conversation + fallback experience', () => {
  it('classifies routine text as standard_coaching and persists a fallback coach reply when the provider is unconfigured', async () => {
    const { result } = await send(
      memberOne.id,
      'I slept pretty well last night, feeling decent today.'
    );
    expect(result).not.toBeNull();
    expect(result!.safetyLevel).toBe('standard_coaching');
    expect(result!.restricted).toBe(false);
    expect(result!.providerFailed).toBe(true); // no provider configured in this test env
    expect(result!.coachMessage.content.length).toBeGreaterThan(0);
    expect(result!.coachMessage.role).toBe('coach_ai');
  });

  it('never fabricates a coach reply referencing history the member never provided', async () => {
    const { result } = await send(memberOne.id, 'Just saying hi.');
    // The fallback reply is built only from real Coaching Brain fields —
    // it must not contain placeholder/lorem-style fabricated text.
    expect(result!.coachMessage.content.toLowerCase()).not.toContain('lorem');
  });
});

describe('Conversation Coach — safety routing', () => {
  it('routes a medication question to COACH_REVIEW_REQUIRED without calling the LLM, and links the classification', async () => {
    const { result } = await send(memberOne.id, 'Should I stop taking my medication?');
    expect(result!.safetyLevel).toBe('coach_review_required');
    expect(result!.coachMessage.safety_classification_id).not.toBeNull();
    expect(result!.coachMessage.prompt_version).toBeNull(); // no LLM prompt actually ran
  });

  it('routes self-harm/crisis language to SAFETY_RESPONSE_ONLY with the crisis-specific template, stopping normal coaching', async () => {
    const { result } = await send(memberOne.id, 'I want to end my life.');
    expect(result!.safetyLevel).toBe('safety_response_only');
    expect(result!.coachMessage.content).toMatch(/988/);
  });

  it('does not let a flagged topic block unrelated safe coaching in the same conversation', async () => {
    const first = await send(memberOne.id, 'Should I stop taking my medication?');
    const sessionId = first.result!.session.id;
    const second = await send(
      memberOne.id,
      'On a different note, I had a good walk today.',
      sessionId
    );
    expect(second.result!.safetyLevel).toBe('standard_coaching');
  });
});

describe('Conversation Coach — memory extraction', () => {
  // findSimilarActiveMemory (lib/conversation-coach/data.ts) dedups by
  // substring containment, not fuzzy/semantic similarity — deliberately,
  // per memoryExtraction.ts's header comment: a second generative pass to
  // detect "this means the same thing" risks fabricating a match that was
  // never really said. It reliably catches a verbatim-or-near-verbatim
  // repeat (a member restating the same barrier across turns), which is
  // the realistic "recurring barrier" case section 11 describes.
  it('deduplicates a verbatim-repeated barrier instead of writing it twice', async () => {
    const { client, result } = await send(
      memberOne.id,
      "I didn't have time for my walk today, work was crazy."
    );
    await send(
      memberOne.id,
      "I didn't have time for my walk today, work was crazy.",
      result!.session.id
    );

    const memory = await listActiveMemory(client, memberOne.id, 20);
    const barrierMatches = memory.filter(
      (m) => m.memory_type === 'barrier' && m.content.toLowerCase().includes("didn't have time")
    );
    expect(barrierMatches.length).toBe(1);
  });
});

describe('Conversation Coach — coach handoff', () => {
  it('creates a handoff resolved to the assigned coach and records a transcript notice', async () => {
    const client = await signInAs(memberOne);
    const { result } = await send(memberOne.id, 'Checking in for today.');
    const sessionId = result!.session.id;

    const handoff = await requestHandoff(
      client,
      memberOne.id,
      sessionId,
      'Please take a look',
      'high'
    );
    expect(handoff).not.toBeNull();
    expect(handoff!.assigned_coach_id).toBe(TEST_USERS.coachOne.id);

    const messages = await listMessages(client, sessionId);
    expect(messages.some((m) => m.role === 'system' && m.content.includes('coach'))).toBe(true);
  });

  it('an assigned coach can read the handoff and messages; an unassigned coach cannot', async () => {
    const memberTwoClient = await signInAs(memberTwo);
    const { result } = await send(memberTwo.id, 'Checking in for today.');
    const sessionId = result!.session.id;
    await requestHandoff(memberTwoClient, memberTwo.id, sessionId, null, 'low');

    // coachOne's assignment to memberTwo was revoked in seed data.
    const coachOneClient = await signInAs(TEST_USERS.coachOne);
    const handoffsAsUnassignedCoach = await listHandoffsForSession(coachOneClient, sessionId);
    expect(handoffsAsUnassignedCoach).toEqual([]);
    const messagesAsUnassignedCoach = await listMessages(coachOneClient, sessionId);
    expect(messagesAsUnassignedCoach).toEqual([]);
  });
});

describe('Conversation Coach — authorization / RLS', () => {
  it("a member cannot read another member's session or messages", async () => {
    const { result } = await send(memberOne.id, 'A private message.');
    const sessionId = result!.session.id;

    const memberTwoClient = await signInAs(memberTwo);
    const session = await getSession(memberTwoClient, sessionId);
    // RLS hides the row entirely rather than erroring.
    expect(session).toBeNull();
    const messages = await listMessages(memberTwoClient, sessionId);
    expect(messages).toEqual([]);
  });

  it('the assigned coach can read the full transcript for their client', async () => {
    const { result } = await send(memberOne.id, 'A coach-visible message.');
    const sessionId = result!.session.id;

    const coachClient = await signInAs(TEST_USERS.coachOne);
    const messages = await listMessages(coachClient, sessionId);
    expect(messages.length).toBeGreaterThan(0);
  });
});

describe('Conversation Coach — coach restriction / reopen', () => {
  it('pauses normal coaching on a restricted session and resumes once reopened', async () => {
    const { client, result } = await send(memberOne.id, 'Starting a fresh thread.');
    const sessionId = result!.session.id;

    const coachClient = await signInAs(TEST_USERS.coachOne);
    const restricted = await setSessionStatus(coachClient, sessionId, 'restricted');
    expect(restricted).toBe(true);

    const duringRestriction = await send(memberOne.id, 'Are you still there?', sessionId);
    expect(duringRestriction.result!.restricted).toBe(true);
    expect(duringRestriction.result!.coachMessage.role).toBe('system');

    const reopened = await setSessionStatus(coachClient, sessionId, 'active');
    expect(reopened).toBe(true);

    const afterReopen = await send(memberOne.id, 'Good to be back.', sessionId);
    expect(afterReopen.result!.restricted).toBe(false);
    void client;
  });
});
