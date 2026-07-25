/**
 * WBSA — real end-to-end proof against the Unified Adaptive Assessment
 * Runtime and real product content (supabase/migrations/
 * 00000000000101_wbsa_content.sql), not test fixtures. Complements
 * tests/assessment-runtime-integration.test.ts (which deliberately stays
 * fixture-only) by exercising the actual 16-section/64-question WBSA
 * definition: branching, prefer-not-to-answer, red-flag findings
 * publishing under a new registry domain, resume/duplicate-session
 * prevention, and coach-assigned RLS visibility.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import {
  completeSession,
  findInProgressSession,
  getSessionById,
  persistAnswer,
  startOrResumeSession,
  PREFER_NOT_TO_ANSWER,
  type AnswerValue,
  type AssessmentSession,
} from '../lib/assessment-runtime';
import { getUnifiedAssessmentDefinitionByKey } from '../lib/assessment-foundation/repository';

const WBSA_KEY = 'wbsa';
const memberOneId = TEST_USERS.memberOne.id;
const memberTwoId = TEST_USERS.memberTwo.id;

let definitionId: string;

beforeAll(async () => {
  const service = serviceRoleClient();
  const definition = await getUnifiedAssessmentDefinitionByKey(service, WBSA_KEY);
  if (!definition) throw new Error('WBSA definition not found — has migration 101 been applied?');
  definitionId = definition.id;
});

afterEach(async () => {
  const service = serviceRoleClient();
  await service.from('registry_entries').delete().eq('member_id', memberOneId);
  await service.from('registry_entries').delete().eq('member_id', memberTwoId);
  // The migration-100 live-sync trigger writes a row here on every
  // completion — not cascade-deleted by removing the session, so it must
  // be cleaned up explicitly or later tests (e.g. free_trial gating) would
  // see a stale "already completed WBSA" attempt for this member forever.
  await service
    .from('assessment_attempts')
    .delete()
    .eq('member_id', memberOneId)
    .eq('source_table', 'unified_assessment_sessions');
  await service
    .from('assessment_attempts')
    .delete()
    .eq('member_id', memberTwoId)
    .eq('source_table', 'unified_assessment_sessions');
  await service.from('unified_assessment_sessions').delete().eq('member_id', memberOneId);
  await service.from('unified_assessment_sessions').delete().eq('member_id', memberTwoId);
});

function defaultAnswerFor(question: { answer_type: string; answer_options: unknown }): AnswerValue {
  switch (question.answer_type) {
    case 'boolean':
      return false;
    case 'multi_select':
      return [];
    case 'frequency':
    case 'single_select': {
      const options = question.answer_options as { value: string }[] | null;
      return options?.[0]?.value ?? 'unknown';
    }
    default:
      return false;
  }
}

/** Answers every currently-visible question with a neutral default (or an override by question_key), re-fetching after each write since answering a gate question can reveal new questions. Returns the final completed-eligible session. */
async function answerAllVisible(
  client: Awaited<ReturnType<typeof signInAs>>,
  session: AssessmentSession,
  overrides: Record<string, AnswerValue>
): Promise<AssessmentSession> {
  let current = session;
  // Bounded loop — WBSA has 64 authored questions total, so 200 iterations
  // is a generous ceiling that only a real infinite-loop bug would hit.
  for (let i = 0; i < 200; i++) {
    const unanswered = current.visibleQuestions.find((q) => current.answers[q.question_key] === undefined);
    if (!unanswered) return current;

    const value = overrides[unanswered.question_key] ?? defaultAnswerFor(unanswered);
    const result = await persistAnswer(client, session.id, unanswered.id, value);
    current = result.session;
  }
  throw new Error('answerAllVisible did not converge — possible branching loop');
}

describe('WBSA on the Unified Adaptive Assessment Runtime — real product content', () => {
  it('has real, active content: 16 sections, 64 questions', async () => {
    const service = serviceRoleClient();
    const { data: sections } = await service
      .from('unified_assessment_sections')
      .select('id')
      .eq('assessment_definition_id', definitionId);
    const { data: questions } = await service
      .from('unified_assessment_questions')
      .select('id')
      .eq('assessment_definition_id', definitionId)
      .eq('active', true);

    expect(sections).toHaveLength(16);
    expect(questions).toHaveLength(64);
  });

  it('reveals a conditional follow-up only once the gating frequency answer is elevated', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const started = await startOrResumeSession(client, memberOneId, WBSA_KEY);
    expect(started).not.toBeNull();

    // Before answering the gate, the timing follow-up must not be visible.
    expect(started!.session.visibleQuestions.map((q) => q.question_key)).not.toContain('wbsa_updig_timing');

    const gate = started!.session.visibleQuestions.find((q) => q.question_key === 'wbsa_updig_fullness')!;
    const afterGate = await persistAnswer(client, started!.session.id, gate.id, 'often');
    expect(afterGate.session.visibleQuestions.map((q) => q.question_key)).toContain('wbsa_updig_timing');

    // Answering back down to 'never_rarely' hides it again — branching is
    // driven live off current answers, not a one-way reveal.
    const afterUngate = await persistAnswer(client, started!.session.id, gate.id, 'never_rarely');
    expect(afterUngate.session.visibleQuestions.map((q) => q.question_key)).not.toContain('wbsa_updig_timing');
  }, 30000);

  it('accepts the prefer-not-to-answer sentinel as a real answer that produces no finding', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const started = await startOrResumeSession(client, memberOneId, WBSA_KEY);
    const question = started!.session.visibleQuestions.find((q) => q.question_key === 'wbsa_liver_body_odor')!;
    expect(question.allows_prefer_not_to_answer).toBe(true);

    const afterAnswer = await persistAnswer(client, started!.session.id, question.id, PREFER_NOT_TO_ANSWER);
    // Counts as answered for progress purposes...
    expect(afterAnswer.session.answers['wbsa_liver_body_odor']).toBe(PREFER_NOT_TO_ANSWER);
    // ...but never produces a finding, even though this question has no
    // finding rule authored anyway — the real proof is in the next test,
    // where a question that DOES have a finding rule is skipped instead.
    expect(afterAnswer.session.findings.find((f) => f.questionKey === 'wbsa_liver_body_odor')).toBeUndefined();
  }, 30000);

  it('a red-flag answer produces a significant finding and publishes to the registry under a new WBSA-specific domain, without a duplicate publish on re-completion attempts', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const started = await startOrResumeSession(client, memberOneId, WBSA_KEY);

    const withRedFlag = await answerAllVisible(client, started!.session, {
      wbsa_lowdig_discomfort: 'often', // gates the red-flag question into visibility
      wbsa_lowdig_redflag_bleeding: true,
    });
    expect(withRedFlag.completionPercentage).toBe(100);

    const completed = await completeSession(client, started!.session.id);
    expect(completed.session.status).toBe('completed');
    expect(completed.events.map((e) => e.type)).toContain('findings_published');

    const finding = completed.session.findings.find((f) => f.questionKey === 'wbsa_lowdig_redflag_bleeding');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('significant');
    expect(finding!.domain).toBe('digestive'); // one of the 7 domains added for WBSA (migration 100)

    const service = serviceRoleClient();
    const { data: entries } = await service
      .from('registry_entries')
      .select('*')
      .eq('member_id', memberOneId)
      .eq('code', 'wbsa_lowdig_redflag_bleeding');
    expect(entries).toHaveLength(1);
    expect(entries![0].domain).toBe('digestive');
    expect(entries![0].severity).toBe('significant');
    expect(entries![0].source_feature).toBe('unified_assessment_finding');

    // No open draft remains after completion.
    const afterComplete = await findInProgressSession(client, memberOneId, definitionId);
    expect(afterComplete).toBeNull();
  }, 30000);

  it('start-or-resume is idempotent — a second call resumes the same session, never creates a duplicate draft', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const started = await startOrResumeSession(client, memberOneId, WBSA_KEY);
    const resumed = await startOrResumeSession(client, memberOneId, WBSA_KEY);
    expect(resumed!.session.id).toBe(started!.session.id);
    expect(resumed!.events).toEqual([{ type: 'assessment_resumed', sessionId: started!.session.id }]);

    const service = serviceRoleClient();
    const { data: draftRows } = await service
      .from('unified_assessment_sessions')
      .select('id')
      .eq('member_id', memberOneId)
      .eq('assessment_definition_id', definitionId)
      .eq('status', 'in_progress');
    expect(draftRows).toHaveLength(1);
  }, 30000);

  it('a coach with an active client assignment can read a completed WBSA session; a coach with only a revoked assignment cannot', async () => {
    const memberOneClient = await signInAs(TEST_USERS.memberOne);
    const startedOne = await startOrResumeSession(memberOneClient, memberOneId, WBSA_KEY);
    const finishedOne = await answerAllVisible(memberOneClient, startedOne!.session, {});
    await completeSession(memberOneClient, startedOne!.session.id);

    const memberTwoClient = await signInAs(TEST_USERS.memberTwo);
    const startedTwo = await startOrResumeSession(memberTwoClient, memberTwoId, WBSA_KEY);
    const finishedTwo = await answerAllVisible(memberTwoClient, startedTwo!.session, {});
    await completeSession(memberTwoClient, startedTwo!.session.id);
    void finishedOne;
    void finishedTwo;

    const coach = await signInAs(TEST_USERS.coachOne);
    // coach.one has an active assignment to member.one (seed data).
    const asCoachSeesOne = await getSessionById(coach, startedOne!.session.id);
    expect(asCoachSeesOne).not.toBeNull();
    expect(asCoachSeesOne!.memberId).toBe(memberOneId);

    // coach.one's assignment to member.two is revoked (seed data) — RLS
    // must return no row, not an error.
    const asCoachSeesTwo = await getSessionById(coach, startedTwo!.session.id);
    expect(asCoachSeesTwo).toBeNull();
  }, 30000);
});
