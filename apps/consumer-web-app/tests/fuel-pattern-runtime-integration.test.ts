/**
 * The Fuel Pattern Assessment end to end, against the real content
 * migration 236 seeds and the real Unified Adaptive Assessment Runtime.
 * Not fixtures: the 24 authored questions, the real session tables, the
 * real result row and the real RLS.
 *
 * WHAT A UNIT TEST CANNOT PROVE, and this can: that the option values the
 * weight map names are the option values in the database, that a
 * completion actually stores a row, that a second completion inside the
 * same second does not store a second one, and that another member cannot
 * read it.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import {
  completeSession,
  persistAnswer,
  startOrResumeSession,
  type AssessmentSession,
} from '../lib/assessment-runtime';
import {
  getUnifiedAssessmentDefinitionByKey,
  getUnifiedAssessmentQuestions,
} from '../lib/assessment-foundation/repository';
import { computeFpaScoring } from '../lib/fuel-pattern/scoring';
import {
  findFuelPatternResultBySession,
  saveFuelPatternResult,
} from '../lib/fuel-pattern/data';
import { FPA_KEY, FPA_QUESTION_COUNT, FPA_VITALITY_QUESTION_KEY } from '../lib/fuel-pattern/constants';
import { FPA_QUESTIONS } from '../lib/fuel-pattern/questionContent';
import type { FpaWeightClass } from '../lib/fuel-pattern/types';

const memberOneId = TEST_USERS.memberOne.id;
const memberTwoId = TEST_USERS.memberTwo.id;

let definitionId: string;

beforeAll(async () => {
  const service = serviceRoleClient();
  const definition = await getUnifiedAssessmentDefinitionByKey(service, FPA_KEY);
  if (!definition) throw new Error('Fuel Pattern definition not found, has migration 236 been applied?');
  definitionId = definition.id;

  // The Monthly plan is what opens this one, inherited from the retired
  // Primal Pattern Diet Type.
  await service
    .from('member_subscriptions')
    .update({ tier: 'monthly', status: 'active' })
    .eq('member_id', memberOneId);
});

afterEach(async () => {
  const service = serviceRoleClient();
  for (const memberId of [memberOneId, memberTwoId]) {
    await service.from('fuel_pattern_results').delete().eq('member_id', memberId);
    await service
      .from('assessment_attempts')
      .delete()
      .eq('member_id', memberId)
      .eq('source_table', 'unified_assessment_sessions');
    await service.from('unified_assessment_sessions').delete().eq('member_id', memberId);
    await service.from('health_timeline_events').delete().eq('member_id', memberId);
  }
  // Put her plan back where the seed left it, because other files read the
  // same database.
  await service
    .from('member_subscriptions')
    .update({ tier: 'trial', status: 'active' })
    .eq('member_id', memberOneId);
});

async function openSession(client: Parameters<typeof startOrResumeSession>[0], memberId: string) {
  const result = await startOrResumeSession(client, memberId, FPA_KEY);
  if (result.status !== 'started' && result.status !== 'resumed') {
    throw new Error(`expected an open session, got "${result.status}"`);
  }
  return result.session;
}

/** Answer every question with the option carrying this weight class, falling back to the first. */
async function answerEverything(
  client: Awaited<ReturnType<typeof signInAs>>,
  session: AssessmentSession,
  preferred: FpaWeightClass
): Promise<AssessmentSession> {
  let current = session;
  for (const question of current.visibleQuestions) {
    const authored = FPA_QUESTIONS.find((q) => q.key === question.question_key)!;
    const option = authored.options.find((o) => o.weight === preferred) ?? authored.options[0]!;
    const result = await persistAnswer(client, session.id, question.id, option.value);
    current = result.session;
  }
  return current;
}

describe('the content in the database is the content the code scores', () => {
  it('seeds 24 active questions and 4 sections', async () => {
    const service = serviceRoleClient();
    const questions = await getUnifiedAssessmentQuestions(service, definitionId);
    expect(questions.filter((q) => q.active)).toHaveLength(FPA_QUESTION_COUNT);

    const { data: sections } = await service
      .from('unified_assessment_sections')
      .select('id')
      .eq('assessment_definition_id', definitionId);
    expect(sections).toHaveLength(4);
  });

  /**
   * THE ONE THAT MATTERS. An option value in the database that the weight
   * map does not name scores nothing, silently, for every member who
   * picks it.
   */
  it('names every stored option value in the weight map, and no others', async () => {
    const service = serviceRoleClient();
    const questions = await getUnifiedAssessmentQuestions(service, definitionId);

    for (const question of questions) {
      const authored = FPA_QUESTIONS.find((q) => q.key === question.question_key);
      expect(authored, question.question_key).toBeTruthy();

      const stored = (question.answer_options as { value: string; label: string }[]).map((o) => o.value);
      expect(stored, question.question_key).toEqual(authored!.options.map((o) => o.value));

      const storedLabels = (question.answer_options as { label: string }[]).map((o) => o.label);
      expect(storedLabels, question.question_key).toEqual(authored!.options.map((o) => o.label));
      expect(question.prompt).toBe(authored!.prompt);
    }
  });

  it('publishes no Universal Registry findings, because it is not a symptom instrument', async () => {
    const service = serviceRoleClient();
    const questions = await getUnifiedAssessmentQuestions(service, definitionId);
    for (const question of questions) {
      expect(question.concern_category, question.question_key).toBeNull();
      expect(question.severity_tags ?? null, question.question_key).toBeNull();
    }
  });
});

describe('a real sitting, start to stored result', () => {
  it('answers all 24, finishes, and stores the reading', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const session = await openSession(client, memberOneId);
    expect(session.visibleQuestions).toHaveLength(FPA_QUESTION_COUNT);

    const answered = await answerEverything(client, session, 'protein');
    expect(Object.keys(answered.answers)).toHaveLength(FPA_QUESTION_COUNT);

    const { session: finished } = await completeSession(client, session.id);
    expect(finished.status).toBe('completed');

    const scoring = computeFpaScoring(finished.answers);
    expect(scoring.pattern).toBe('protein_supportive');

    const stored = await saveFuelPatternResult(client, memberOneId, session.id, scoring);
    expect(stored).not.toBeNull();
    expect(stored!.pattern).toBe('protein_supportive');
    expect(stored!.confidence).toBe('high');
    expect(stored!.scores.protein).toBeGreaterThan(stored!.scores.balanced);
    expect(stored!.scores.balanced).toBeGreaterThan(stored!.scores.carb);
    expect(Object.keys(stored!.responses)).toHaveLength(FPA_QUESTION_COUNT);
    expect(stored!.vitalityResponse).toBeTruthy();
  });

  it('reads an "it varies" sitting as Flexible Fuel and stores that', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const session = await openSession(client, memberOneId);
    await answerEverything(client, session, 'neutral');

    const { session: finished } = await completeSession(client, session.id);
    const scoring = computeFpaScoring(finished.answers);
    const stored = await saveFuelPatternResult(client, memberOneId, session.id, scoring);

    expect(stored!.pattern).toBe('flexible_fuel');
    expect(stored!.zeroWeightCount).toBe(stored!.scoredQuestionCount);
  });

  /** Finishing is a Server Action, and a Server Action re-renders the route it was called from. */
  it('stores one row per sitting however many times the completion arrives', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const session = await openSession(client, memberOneId);
    await answerEverything(client, session, 'carb');

    const { session: finished } = await completeSession(client, session.id);
    const scoring = computeFpaScoring(finished.answers);

    const first = await saveFuelPatternResult(client, memberOneId, session.id, scoring);
    const second = await saveFuelPatternResult(client, memberOneId, session.id, scoring);
    expect(first!.id).toBe(second!.id);

    const service = serviceRoleClient();
    const { data } = await service
      .from('fuel_pattern_results')
      .select('id')
      .eq('session_id', session.id);
    expect(data).toHaveLength(1);
  });

  it('refuses a second row for the same sitting at the database, not just in the read before the write', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const session = await openSession(client, memberOneId);
    await answerEverything(client, session, 'balanced');
    const { session: finished } = await completeSession(client, session.id);
    const scoring = computeFpaScoring(finished.answers);
    await saveFuelPatternResult(client, memberOneId, session.id, scoring);

    const service = serviceRoleClient();
    const { error } = await service.from('fuel_pattern_results').insert({
      member_id: memberOneId,
      session_id: session.id,
      pattern: 'protein_supportive',
      confidence: 'low',
      protein_score: 1,
      balanced_score: 1,
      carb_score: 1,
      scored_question_count: 1,
      zero_weight_count: 0,
      responses: {},
      response_tendencies: [],
      digestive_discomfort: false,
      vitality_response: null,
    });
    expect(error).not.toBeNull();
    expect(error!.code).toBe('23505');
  });

  it('keeps the vitality answer and scores nothing for it, whichever one she gives', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const session = await openSession(client, memberOneId);
    const answered = await answerEverything(client, session, 'protein');

    const vitality = answered.visibleQuestions.find((q) => q.question_key === FPA_VITALITY_QUESTION_KEY)!;
    const before = computeFpaScoring(answered.answers);
    const { session: changed } = await persistAnswer(client, session.id, vitality.id, 'prefer_not_to_answer');
    const after = computeFpaScoring(changed.answers);

    expect(after.scores).toEqual(before.scores);
    expect(after.pattern).toBe(before.pattern);
    expect(after.vitalityResponse).toBe('prefer_not_to_answer');
  });
});

describe('her result is hers', () => {
  it('cannot be read by another member', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const session = await openSession(client, memberOneId);
    await answerEverything(client, session, 'protein');
    const { session: finished } = await completeSession(client, session.id);
    await saveFuelPatternResult(client, memberOneId, session.id, computeFpaScoring(finished.answers));

    const other = await signInAs(TEST_USERS.memberTwo);
    const seen = await findFuelPatternResultBySession(other, session.id);
    expect(seen).toBeNull();
  });
});
