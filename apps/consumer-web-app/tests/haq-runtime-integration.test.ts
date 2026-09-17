/**
 * The HAQ end to end, against the real content migration 262 seeds, the
 * real Unified Adaptive Assessment Runtime and the real RLS. Not fixtures:
 * a signed-in member answers through persistAnswer (or, where 260 answers
 * would only slow the suite, inserts her own answer rows under her own
 * session, which is the same table and the same triggers), and completes
 * through completeSession.
 *
 * WHAT A UNIT TEST CANNOT PROVE, and this can: that the database stores the
 * hidden value the rules give, refuses anything else, refuses to complete
 * an instance with an unanswered question, computes each section against
 * its own cutoffs exactly as lib/haq/scoring.ts does, never changes a
 * completed instance, and never hands a member a number.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import { completeSession, persistAnswer, startOrResumeSession, type AssessmentSession } from '../lib/assessment-runtime';
import { getUnifiedAssessmentDefinitionByKey } from '../lib/assessment-foundation/repository';
import { HAQ_KEY, HAQ_QUESTIONS, HAQ_RESPONSE_OPTIONS, HAQ_SECTIONS } from '../lib/haq/questionBank';
import { buildHaqAnswerOptionsJson } from '../lib/haq/sql';
import { scoreHaqInstance } from '../lib/haq/scoring';
import { haqInstanceStatus, readHaqMemberSectionResults } from '../lib/haq/memberData';
import { SPEC_BOUNDARIES, SPEC_BOUNDARY_COLORS, SPEC_HIDDEN_VALUES, SPEC_SPOT_CHECKS } from './haq-spec';
import { allHighestAnswers, allZeroAnswers, answersForSectionTotal, answersForSectionTotals } from './haq-fixture';

const memberOneId = TEST_USERS.memberOne.id;
const memberTwoId = TEST_USERS.memberTwo.id;

let definitionId: string;
/** question key to unified_assessment_questions.id */
const questionIdByKey = new Map<string, string>();

async function clearHaqInstances() {
  const service = serviceRoleClient();
  // Deleting the instance cascades to its answers, response records and
  // results, which is the only way a completed instance's records may go.
  const { error } = await service
    .from('unified_assessment_sessions')
    .delete()
    .in('member_id', [memberOneId, memberTwoId])
    .eq('assessment_definition_id', definitionId);
  if (error) throw new Error(error.message);
}

beforeAll(async () => {
  const service = serviceRoleClient();
  const definition = await getUnifiedAssessmentDefinitionByKey(service, HAQ_KEY);
  if (!definition) throw new Error('HAQ definition not found, has migration 262 been applied?');
  definitionId = definition.id;

  const { data, error } = await service
    .from('unified_assessment_questions')
    .select('id, question_key')
    .eq('assessment_definition_id', definitionId)
    .order('id');
  if (error) throw new Error(error.message);
  for (const row of data ?? []) questionIdByKey.set(row.question_key as string, row.id as string);

  await clearHaqInstances();
});

afterEach(async () => {
  await clearHaqInstances();
});

async function startInstance(member: SupabaseClient, memberId: string, retake = false): Promise<AssessmentSession> {
  const result = await startOrResumeSession(member, memberId, HAQ_KEY, { startRetake: retake });
  if (result.status !== 'started' && result.status !== 'resumed') {
    throw new Error(`Expected a session, got ${result.status}`);
  }
  return result.session;
}

/** Her own answer rows, written under her own session in one request. */
async function answerAll(member: SupabaseClient, sessionId: string, answers: Record<string, string>) {
  const rows = Object.entries(answers).map(([key, value]) => ({
    session_id: sessionId,
    question_id: questionIdByKey.get(key)!,
    value,
  }));
  const { error } = await member.from('unified_assessment_answers').upsert(rows, { onConflict: 'session_id,question_id' });
  if (error) throw new Error(error.message);
}

async function responsesFor(sessionId: string) {
  const { data, error } = await serviceRoleClient()
    .from('haq_question_responses')
    .select('*')
    .eq('session_id', sessionId)
    .order('question_key');
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function resultsFor(sessionId: string) {
  const { data, error } = await serviceRoleClient()
    .from('haq_section_results')
    .select('*')
    .eq('session_id', sessionId)
    .order('section_id');
  if (error) throw new Error(error.message);
  return data ?? [];
}

describe('7. seed integrity in the database', () => {
  it('holds 260 questions in 21 sections on the shared runtime, version 1, not in the catalog', async () => {
    const service = serviceRoleClient();
    const { data: def } = await service.from('unified_assessment_definitions').select('*').eq('key', HAQ_KEY).single();
    expect(def).toMatchObject({
      title: 'Rooted Reset Health Appraisal Questionnaire',
      version: 1,
      active: true,
      adaptive_enabled: false,
      catalog_definition_id: null,
      scoring_profile: { haq_version: 'haq_v1', scoring: 'per_section_cutoffs' },
    });

    const { count: questionCount } = await service
      .from('unified_assessment_questions')
      .select('id', { count: 'exact', head: true })
      .eq('assessment_definition_id', definitionId);
    const { count: sectionCount } = await service
      .from('unified_assessment_sections')
      .select('id', { count: 'exact', head: true })
      .eq('assessment_definition_id', definitionId);
    const { count: haqQuestionCount } = await service.from('haq_questions').select('question_id', { count: 'exact', head: true });
    const { count: haqSectionCount } = await service.from('haq_sections').select('section_id', { count: 'exact', head: true });
    expect([questionCount, sectionCount, haqQuestionCount, haqSectionCount]).toEqual([260, 21, 260, 21]);
  });

  it('stores every question with its exact wording, version 1, section, part, response type and options', async () => {
    const service = serviceRoleClient();
    const { data: sections } = await service.from('haq_sections').select('*').order('display_order');
    const { data: unifiedSections } = await service
      .from('unified_assessment_sections')
      .select('id, title, subtitle, display_order')
      .eq('assessment_definition_id', definitionId);
    const unifiedById = new Map((unifiedSections ?? []).map((s) => [s.id as string, s]));

    expect((sections ?? []).map((s) => s.section_id)).toEqual(HAQ_SECTIONS.map((s) => s.id));
    for (const [index, row] of (sections ?? []).entries()) {
      const authored = HAQ_SECTIONS[index]!;
      const unified = unifiedById.get(row.unified_section_id as string)!;
      expect(row).toMatchObject({ part_id: authored.partId, haq_version: 'haq_v1', display_order: authored.order });
      expect(unified).toMatchObject({ title: authored.title, subtitle: authored.intro, display_order: authored.order });
    }

    const { data: questions } = await service
      .from('unified_assessment_questions')
      .select('id, question_key, version, prompt, answer_type, answer_options, section_id, display_order, haq_questions(*)')
      .eq('assessment_definition_id', definitionId)
      .order('id');
    const byKey = new Map((questions ?? []).map((q) => [q.question_key as string, q]));
    for (const authored of HAQ_QUESTIONS) {
      const row = byKey.get(authored.key)!;
      const meta = (Array.isArray(row.haq_questions) ? row.haq_questions[0] : row.haq_questions) as Record<string, unknown>;
      const section = (sections ?? []).find((s) => s.section_id === authored.sectionId)!;
      expect(row, authored.key).toMatchObject({
        version: 1,
        prompt: authored.prompt,
        answer_type: 'single_select',
        answer_options: JSON.parse(buildHaqAnswerOptionsJson(authored.responseType)),
        section_id: section.unified_section_id,
        display_order: authored.order,
      });
      expect(meta, authored.key).toMatchObject({
        question_key: authored.key,
        question_version: 1,
        section_id: authored.sectionId,
        part_id: section.part_id,
        response_type: authored.responseType,
      });
    }
  });

  it.each(SPEC_SPOT_CHECKS)('%s is stored exactly as specified', async (key, prompt, responseType) => {
    const { data } = await serviceRoleClient()
      .from('unified_assessment_questions')
      .select('prompt, haq_questions(response_type)')
      .eq('question_key', key)
      .eq('version', 1)
      .single();
    const meta = Array.isArray(data!.haq_questions) ? data!.haq_questions[0] : data!.haq_questions;
    expect(data!.prompt).toBe(prompt);
    expect((meta as { response_type: string }).response_type).toBe(responseType);
  });

  it('stores cutoffs matching the specification for all 21 sections', async () => {
    const { data } = await serviceRoleClient().from('haq_section_cutoffs').select('*').order('section_id');
    const bySection = new Map((data ?? []).map((row) => [row.section_id as string, row]));
    expect(bySection.size).toBe(21);
    for (const [sectionId, greenTop, , yellowTop] of SPEC_BOUNDARIES) {
      expect(bySection.get(sectionId), sectionId).toMatchObject({ green_max: greenTop, yellow_max: yellowTop });
    }
  });

  it('stores exactly the six locked response values, and the table refuses any other', async () => {
    const service = serviceRoleClient();
    const { data } = await service.from('haq_response_scale').select('response_type, response_value, hidden_value');
    expect(
      (data ?? []).map((r) => [r.response_type, r.response_value, r.hidden_value]).sort()
    ).toEqual([...SPEC_HIDDEN_VALUES].sort());

    const { error } = await service
      .from('haq_response_scale')
      .insert({ response_type: 'frequency', response_value: 'always', hidden_value: 8, display_order: 5 });
    expect(error).not.toBeNull();
  });
});

describe('1. value mapping in the database', () => {
  it('stores 0, 1, 4, 8 for the frequency answers and 0, 8 for No and Yes, through the runtime', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    const session = await startInstance(member, memberOneId);

    const picks: Array<[string, string, number]> = [
      ['haq_p1_a_q1', 'never_or_rarely', 0],
      ['haq_p1_a_q2', 'sometimes', 1],
      ['haq_p1_a_q3', 'often', 4],
      ['haq_p1_a_q4', 'very_often', 8],
      ['haq_p1_b_q6', 'no', 0],
      ['haq_p1_d_q8', 'yes', 8],
    ];
    for (const [key, response] of picks) {
      await persistAnswer(member, session.id, questionIdByKey.get(key)!, response);
    }

    const stored = await responsesFor(session.id);
    expect(stored).toHaveLength(6);
    for (const [key, response, value] of picks) {
      const row = stored.find((r) => r.question_key === key)!;
      const question = HAQ_QUESTIONS.find((q) => q.key === key)!;
      expect(row, key).toMatchObject({
        selected_response: response,
        hidden_value: value,
        response_type: question.responseType,
        section_id: question.sectionId,
        question_version: 1,
        member_id: memberOneId,
      });
      expect(row.answered_at).toBeTruthy();
    }
  });

  it.each([
    ['haq_p1_a_q1', 'always'],
    ['haq_p1_a_q1', 'yes'],
    ['haq_p1_a_q1', 'Often'],
    ['haq_p1_a_q1', 'Never or rarely'],
    ['haq_p1_a_q1', 4],
    ['haq_p1_a_q1', true],
    ['haq_p1_a_q1', ['often']],
    ['haq_p1_d_q8', 'often'],
    ['haq_p1_d_q8', 'never_or_rarely'],
    ['haq_p1_d_q8', 8],
  ] as const)('%s refuses %j and stores nothing', async (key, value) => {
    const member = await signInAs(TEST_USERS.memberOne);
    const session = await startInstance(member, memberOneId);
    await expect(
      persistAnswer(member, session.id, questionIdByKey.get(key)!, value as unknown as string)
    ).rejects.toThrow(/not accepted/);
    expect(await responsesFor(session.id)).toHaveLength(0);
    const { count } = await serviceRoleClient()
      .from('unified_assessment_answers')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', session.id);
    expect(count).toBe(0);
  });
});

describe('hidden values never reach a member', () => {
  it('a member session reads no response values, totals, cutoffs or scale, and cannot write them', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    const session = await startInstance(member, memberOneId);
    await answerAll(member, session.id, allHighestAnswers());
    await completeSession(member, session.id);

    // The rows exist, as the service role can see.
    expect(await responsesFor(session.id)).toHaveLength(260);
    expect(await resultsFor(session.id)).toHaveLength(21);

    for (const table of ['haq_question_responses', 'haq_section_results', 'haq_response_scale', 'haq_section_cutoffs']) {
      const { data, error } = await member.from(table).select('*');
      expect(error, table).toBeNull();
      expect(data, table).toEqual([]);
    }

    const { error: classifyError } = await member.rpc('haq_classify_section_total', { p_section_id: 'haq_p1_a', p_total: 5 });
    expect(classifyError).not.toBeNull();

    const { error: forgedResult } = await member.from('haq_section_results').insert({
      session_id: session.id,
      member_id: memberOneId,
      haq_version: 'haq_v1',
      section_id: 'haq_p1_a',
      raw_total: 0,
      result_color: 'green',
      member_result_label: 'Doing Well',
      original_priority: 'Low Priority',
    });
    expect(forgedResult).not.toBeNull();

    const { error: forgedResponse } = await member.from('haq_question_responses').insert({
      session_id: session.id,
      member_id: memberOneId,
      question_id: questionIdByKey.get('haq_p1_a_q1'),
      question_key: 'haq_p1_a_q1',
      part_id: 'haq_p1',
      section_id: 'haq_p1_a',
      question_version: 1,
      response_type: 'frequency',
      selected_response: 'never_or_rarely',
      hidden_value: 0,
      answered_at: new Date().toISOString(),
    });
    expect(forgedResponse).not.toBeNull();
  });

  it('what a member can read about her results is the section, the color and the label, and nothing numeric', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    const session = await startInstance(member, memberOneId);
    await answerAll(member, session.id, allHighestAnswers());
    await completeSession(member, session.id);

    const { data: raw } = await member.rpc('haq_member_section_results', { p_session_id: session.id });
    expect(raw).toHaveLength(21);
    for (const row of raw as Record<string, unknown>[]) {
      expect(Object.keys(row).sort()).toEqual(['member_result_label', 'result_color', 'section_id']);
      for (const value of Object.values(row)) expect(typeof value).toBe('string');
    }

    const results = await readHaqMemberSectionResults(member, session.id);
    expect(results.map((r) => r.sectionId)).toEqual(HAQ_SECTIONS.map((s) => s.id));
    expect(results.every((r) => r.resultColor === 'red' && r.memberResultLabel === 'High Attention')).toBe(true);

    // Her own answers carry the response she chose, never its value.
    const { data: answers } = await member.from('unified_assessment_answers').select('value').eq('session_id', session.id);
    expect(answers).toHaveLength(260);
    expect((answers ?? []).every((a) => typeof a.value === 'string' && !/\d/.test(a.value as string))).toBe(true);

    // Another member reads none of it.
    const other = await signInAs(TEST_USERS.memberTwo);
    expect(await readHaqMemberSectionResults(other, session.id)).toEqual([]);
  });

  it('an assigned coach can read the numbers, for the Prompt 3 coach view', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    const session = await startInstance(member, memberOneId);
    await answerAll(member, session.id, allZeroAnswers());
    await completeSession(member, session.id);

    const coach = await signInAs(TEST_USERS.coachOne);
    const { data: results } = await coach.from('haq_section_results').select('section_id, raw_total').eq('session_id', session.id);
    expect(results).toHaveLength(21);
    const { data: cutoffs } = await coach.from('haq_section_cutoffs').select('section_id');
    expect(cutoffs).toHaveLength(21);
  });
});

describe('2. every section at its own four boundaries, in the database', () => {
  it('four completed instances put all 21 sections at each boundary, and the database agrees with the engine', async () => {
    const member = await signInAs(TEST_USERS.memberOne);

    for (let index = 0; index < 4; index++) {
      const totals = Object.fromEntries(SPEC_BOUNDARIES.map((row) => [row[0], row[index + 1] as number]));
      const answers = answersForSectionTotals(totals);
      const session = await startInstance(member, memberOneId, index > 0);
      await answerAll(member, session.id, answers);
      const { session: completed } = await completeSession(member, session.id);
      expect(completed.status).toBe('completed');

      const stored = await resultsFor(session.id);
      const engine = scoreHaqInstance(answers)!;
      expect(stored).toHaveLength(21);
      for (const [sectionId] of SPEC_BOUNDARIES) {
        const row = stored.find((r) => r.section_id === sectionId)!;
        const computed = engine.find((r) => r.sectionId === sectionId)!;
        const label = `${sectionId} at ${totals[sectionId]}`;
        expect(row.raw_total, label).toBe(totals[sectionId]);
        expect(row.result_color, label).toBe(SPEC_BOUNDARY_COLORS[index]);
        expect(row, label).toMatchObject({
          haq_version: 'haq_v1',
          member_id: memberOneId,
          raw_total: computed.rawTotal,
          result_color: computed.resultColor,
          member_result_label: computed.memberResultLabel,
          original_priority: computed.originalPriority,
        });
      }
    }
  });
});

describe('3. a deliberate zero is Green; an unanswered section has no result', () => {
  it('260 deliberate Never or rarely / No answers complete to 21 Green sections at 0', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    const session = await startInstance(member, memberOneId);
    await answerAll(member, session.id, allZeroAnswers());
    await completeSession(member, session.id);

    const responses = await responsesFor(session.id);
    expect(responses).toHaveLength(260);
    expect(responses.every((r) => r.hidden_value === 0)).toBe(true);

    const results = await resultsFor(session.id);
    expect(results).toHaveLength(21);
    for (const row of results) {
      expect(row).toMatchObject({ raw_total: 0, result_color: 'green', member_result_label: 'Doing Well', original_priority: 'Low Priority' });
    }
  });

  it('an instance with a section left unanswered stores no response for it and produces no result', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    const session = await startInstance(member, memberOneId);
    const answers: Record<string, string> = { ...allZeroAnswers() };
    for (const q of HAQ_QUESTIONS.filter((q) => q.sectionId === 'haq_p2')) delete answers[q.key];
    await answerAll(member, session.id, answers);

    const responses = await responsesFor(session.id);
    expect(responses).toHaveLength(244);
    expect(responses.some((r) => r.section_id === 'haq_p2')).toBe(false);
    expect(await resultsFor(session.id)).toEqual([]);
    expect(await readHaqMemberSectionResults(member, session.id)).toEqual([]);
  });
});

describe('4. an instance with any unanswered question cannot complete', () => {
  it('259 of 260 answered: the runtime refuses, the database refuses, it stays In Progress with no results', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    const session = await startInstance(member, memberOneId);
    const answers: Record<string, string> = { ...allZeroAnswers() };
    delete answers.haq_p7_q31;
    await answerAll(member, session.id, answers);

    await expect(completeSession(member, session.id)).rejects.toThrow(/unanswered/);

    // Around the runtime, straight at the row: the database says no too.
    const { error } = await member
      .from('unified_assessment_sessions')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', session.id);
    expect(error?.message).toMatch(/1 unanswered/);

    const { data: row } = await serviceRoleClient().from('unified_assessment_sessions').select('status, completed_at').eq('id', session.id).single();
    expect(row).toEqual({ status: 'in_progress', completed_at: null });
    expect(haqInstanceStatus(row as { status: 'in_progress' })).toBe('in_progress');
    expect(await resultsFor(session.id)).toEqual([]);

    // Answer the last one and it completes.
    await persistAnswer(member, session.id, questionIdByKey.get('haq_p7_q31')!, 'no');
    const { session: completed } = await completeSession(member, session.id);
    expect(haqInstanceStatus(completed)).toBe('completed');
    expect(await resultsFor(session.id)).toHaveLength(21);
  });

  it('Not Started is no instance at all', async () => {
    const member = await signInAs(TEST_USERS.memberTwo);
    const result = await startOrResumeSession(member, memberTwoId, HAQ_KEY, { createIfMissing: false });
    expect(result.status).toBe('no_session');
    expect(haqInstanceStatus(null)).toBe('not_started');
  });

  it('an instance cannot be created already completed', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    const { error } = await member.from('unified_assessment_sessions').insert({
      member_id: memberOneId,
      assessment_definition_id: definitionId,
      status: 'completed',
      completed_at: new Date().toISOString(),
    });
    expect(error?.message).toMatch(/starts In Progress/);
  });
});

describe('5. changing an answer before completion', () => {
  it('replaces the stored response and value, and the total counts only the final selection', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    const session = await startInstance(member, memberOneId);
    const questionId = questionIdByKey.get('haq_p1_a_q1')!;

    await persistAnswer(member, session.id, questionId, 'very_often');
    const first = (await responsesFor(session.id))[0]!;
    expect(first).toMatchObject({ selected_response: 'very_often', hidden_value: 8 });

    await persistAnswer(member, session.id, questionId, 'sometimes');
    const after = await responsesFor(session.id);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ id: first.id, selected_response: 'sometimes', hidden_value: 1 });
    expect(new Date(after[0]!.answered_at).getTime()).toBeGreaterThanOrEqual(new Date(first.answered_at).getTime());

    const { data: answerRows } = await serviceRoleClient().from('unified_assessment_answers').select('value').eq('session_id', session.id);
    expect(answerRows).toEqual([{ value: 'sometimes' }]);

    const rest: Record<string, string> = { ...allZeroAnswers() };
    delete rest.haq_p1_a_q1;
    await answerAll(member, session.id, rest);
    await completeSession(member, session.id);

    const gastric = (await resultsFor(session.id)).find((r) => r.section_id === 'haq_p1_a')!;
    expect(gastric).toMatchObject({ raw_total: 1, result_color: 'green' });
  });
});

describe('6. a retake is a new instance and every earlier one is unchanged', () => {
  it('completing a retake leaves the first instance, its answers, its records and its results exactly as they were', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    const service = serviceRoleClient();

    const first = await startInstance(member, memberOneId);
    await answerAll(member, first.id, { ...allZeroAnswers(), ...answersForSectionTotal('haq_p5_a', 8) });
    await completeSession(member, first.id);

    const snapshot = async (sessionId: string) => ({
      session: (await service.from('unified_assessment_sessions').select('*').eq('id', sessionId).single()).data,
      answers: (await service.from('unified_assessment_answers').select('*').eq('session_id', sessionId).order('id')).data,
      responses: await responsesFor(sessionId),
      results: await resultsFor(sessionId),
    });
    const before = await snapshot(first.id);
    expect(before.results.find((r) => r.section_id === 'haq_p5_a')).toMatchObject({ raw_total: 8, result_color: 'yellow' });

    // Without asking for a retake, the runtime reports the completion and writes nothing.
    const again = await startOrResumeSession(member, memberOneId, HAQ_KEY);
    expect(again.status).toBe('already_completed');

    const second = await startInstance(member, memberOneId, true);
    expect(second.id).not.toBe(first.id);
    expect(second.answers).toEqual({});
    await answerAll(member, second.id, allHighestAnswers());
    await completeSession(member, second.id);

    // Attempts to reach back into the completed first instance, as the member.
    await expect(persistAnswer(member, first.id, questionIdByKey.get('haq_p1_a_q1')!, 'very_often')).rejects.toThrow(
      /never changed/
    );
    const { error: reopen } = await member
      .from('unified_assessment_sessions')
      .update({ status: 'in_progress', completed_at: null })
      .eq('id', first.id);
    expect(reopen?.message).toMatch(/never changed/);

    // And as the service role, which RLS does not stop.
    const { error: rewrite } = await service
      .from('haq_section_results')
      .update({ raw_total: 0, result_color: 'green', member_result_label: 'Doing Well', original_priority: 'Low Priority' })
      .eq('session_id', first.id)
      .eq('section_id', 'haq_p5_a');
    expect(rewrite?.message).toMatch(/never changed/);
    const { error: erase } = await service.from('haq_section_results').delete().eq('session_id', first.id);
    expect(erase?.message).toMatch(/never changed/);
    const { error: eraseAnswer } = await service.from('unified_assessment_answers').delete().eq('session_id', first.id);
    expect(eraseAnswer?.message).toMatch(/never changed/);

    expect(await snapshot(first.id)).toEqual(before);

    const secondResults = await resultsFor(second.id);
    expect(secondResults).toHaveLength(21);
    expect(secondResults.every((r) => r.result_color === 'red')).toBe(true);

    const { count } = await service
      .from('unified_assessment_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('member_id', memberOneId)
      .eq('assessment_definition_id', definitionId)
      .eq('status', 'completed');
    expect(count).toBe(2);
  });
});

describe('body map storage', () => {
  it('stores location, side and issue on an open instance, refuses anything else, and never enters a total', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    const session = await startInstance(member, memberOneId);

    const { error } = await member.from('haq_body_map_entries').insert([
      { session_id: session.id, member_id: memberOneId, body_location: 'lower back', body_side: 'back', issue_type: 'pain' },
      { session_id: session.id, member_id: memberOneId, body_location: 'left knee', body_side: 'front', issue_type: 'swelling' },
      { session_id: session.id, member_id: memberOneId, body_location: 'forearm', body_side: 'front', issue_type: 'skin_change' },
      { session_id: session.id, member_id: memberOneId, body_location: 'abdomen', body_side: 'front', issue_type: 'discomfort' },
    ]);
    expect(error).toBeNull();

    for (const bad of [
      { body_side: 'side', issue_type: 'pain' },
      { body_side: 'front', issue_type: 'numbness' },
    ]) {
      const { error: refused } = await member
        .from('haq_body_map_entries')
        .insert({ session_id: session.id, member_id: memberOneId, body_location: 'neck', ...bad });
      expect(refused).not.toBeNull();
    }

    await answerAll(member, session.id, allZeroAnswers());
    await completeSession(member, session.id);
    const results = await resultsFor(session.id);
    expect(results.every((r) => r.raw_total === 0 && r.result_color === 'green')).toBe(true);

    const { error: late } = await member
      .from('haq_body_map_entries')
      .insert({ session_id: session.id, member_id: memberOneId, body_location: 'neck', body_side: 'back', issue_type: 'pain' });
    expect(late).not.toBeNull();

    const { data: mine } = await member.from('haq_body_map_entries').select('body_location').eq('session_id', session.id);
    expect(mine).toHaveLength(4);
    const other = await signInAs(TEST_USERS.memberTwo);
    const { data: theirs } = await other.from('haq_body_map_entries').select('id').eq('session_id', session.id);
    expect(theirs).toEqual([]);
  });
});

describe('the options the database offers are the options the bank offers', () => {
  it('frequency and yes_no', () => {
    expect(JSON.parse(buildHaqAnswerOptionsJson('frequency'))).toEqual(HAQ_RESPONSE_OPTIONS.frequency);
    expect(JSON.parse(buildHaqAnswerOptionsJson('yes_no'))).toEqual(HAQ_RESPONSE_OPTIONS.yes_no);
  });
});
