/**
 * Integration test for the Unified Adaptive Assessment Runtime
 * (lib/assessment-runtime/) against real local Supabase/RLS — mirrors
 * tests/registry-adapters-questionnaire-integration.test.ts's approach:
 * exercise the real start/answer/complete write path exactly as a
 * member's own session would, against migration 99's real partial unique
 * index and RLS policies, rather than mocking the Supabase client.
 *
 * This is also the runtime's "second consumer alongside onboarding" proof
 * — two structurally different fixture assessment definitions (branching
 * shape, section count, answer types all differ) run through the exact
 * same runtime functions with no per-assessment code, demonstrating the
 * runtime never knows which assessment it's running. Fixture content only
 * — not product content, not WBSA.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import { completeSession, findInProgressSession, persistAnswer, startOrResumeSession } from '../lib/assessment-runtime';

const memberId = TEST_USERS.memberOne.id;

const ALPHA_KEY = 'assessment-runtime-test-fixture-alpha';
const BETA_KEY = 'assessment-runtime-test-fixture-beta';

let alphaDefinitionId: string;
let betaDefinitionId: string;

async function seedFixtures() {
  const service = serviceRoleClient();

  const { data: alphaDef, error: alphaDefError } = await service
    .from('unified_assessment_definitions')
    .insert({ key: ALPHA_KEY, title: 'Runtime Test Fixture Alpha', assessment_type: 'test_fixture' })
    .select('id')
    .single();
  if (alphaDefError || !alphaDef) throw alphaDefError ?? new Error('failed to seed alpha definition');
  alphaDefinitionId = alphaDef.id;

  const { data: alphaSection, error: alphaSectionError } = await service
    .from('unified_assessment_sections')
    .insert({ assessment_definition_id: alphaDefinitionId, title: 'Section A', display_order: 0 })
    .select('id')
    .single();
  if (alphaSectionError || !alphaSection) throw alphaSectionError ?? new Error('failed to seed alpha section');

  const { error: alphaQuestionsError } = await service.from('unified_assessment_questions').insert([
    {
      question_key: 'alpha_gate',
      assessment_definition_id: alphaDefinitionId,
      section_id: alphaSection.id,
      display_order: 0,
      prompt: 'Do you experience this symptom?',
      answer_type: 'boolean',
    },
    {
      question_key: 'alpha_followup',
      assessment_definition_id: alphaDefinitionId,
      section_id: alphaSection.id,
      display_order: 1,
      prompt: 'How many days per week?',
      answer_type: 'numeric',
      requires: { type: 'leaf', questionKey: 'alpha_gate', op: 'equals', value: true },
    },
    {
      question_key: 'alpha_finding',
      assessment_definition_id: alphaDefinitionId,
      section_id: alphaSection.id,
      display_order: 2,
      prompt: 'Elevated stress symptom',
      answer_type: 'boolean',
      concern_category: 'stress',
      severity_tags: ['significant'],
      validation: { findingRule: { type: 'boolean_true' } },
    },
  ]);
  if (alphaQuestionsError) throw alphaQuestionsError;

  const { data: betaDef, error: betaDefError } = await service
    .from('unified_assessment_definitions')
    .insert({ key: BETA_KEY, title: 'Runtime Test Fixture Beta', assessment_type: 'test_fixture' })
    .select('id')
    .single();
  if (betaDefError || !betaDef) throw betaDefError ?? new Error('failed to seed beta definition');
  betaDefinitionId = betaDef.id;

  const { data: betaSections, error: betaSectionsError } = await service
    .from('unified_assessment_sections')
    .insert([
      { assessment_definition_id: betaDefinitionId, title: 'Intro', display_order: 0 },
      { assessment_definition_id: betaDefinitionId, title: 'Sleep Follow-up', display_order: 1 },
    ])
    .select('id, title');
  if (betaSectionsError || !betaSections) throw betaSectionsError ?? new Error('failed to seed beta sections');

  const introSection = betaSections.find((s) => s.title === 'Intro')!;
  const followupSection = betaSections.find((s) => s.title === 'Sleep Follow-up')!;

  const { error: betaQuestionsError } = await service.from('unified_assessment_questions').insert([
    {
      question_key: 'beta_concern',
      assessment_definition_id: betaDefinitionId,
      section_id: introSection.id,
      display_order: 0,
      prompt: 'What is your primary concern?',
      answer_type: 'enum',
      answer_options: ['sleep', 'energy'],
    },
    {
      question_key: 'beta_sleep_followup',
      assessment_definition_id: betaDefinitionId,
      section_id: followupSection.id,
      display_order: 0,
      prompt: 'How many hours of sleep do you get?',
      answer_type: 'numeric',
      requires: { type: 'leaf', questionKey: 'beta_concern', op: 'equals', value: 'sleep' },
    },
    {
      question_key: 'beta_energy_followup',
      assessment_definition_id: betaDefinitionId,
      section_id: followupSection.id,
      display_order: 1,
      prompt: 'What time of day is your energy lowest?',
      answer_type: 'enum',
      answer_options: ['morning', 'afternoon', 'evening'],
      requires: { type: 'leaf', questionKey: 'beta_concern', op: 'equals', value: 'energy' },
    },
  ]);
  if (betaQuestionsError) throw betaQuestionsError;
}

async function cleanupFixtures() {
  const service = serviceRoleClient();
  await service.from('registry_entries').delete().eq('member_id', memberId);
  await service.from('unified_assessment_sessions').delete().eq('member_id', memberId);
  if (alphaDefinitionId) await service.from('unified_assessment_definitions').delete().eq('id', alphaDefinitionId);
  if (betaDefinitionId) await service.from('unified_assessment_definitions').delete().eq('id', betaDefinitionId);
}

beforeAll(async () => {
  await seedFixtures();
});

afterAll(async () => {
  await cleanupFixtures();
});

describe('Unified Adaptive Assessment Runtime — fixture Alpha (single-section, requires branching, finding)', () => {
  it('starts, branches, resumes, completes, and publishes a finding — all through generic runtime calls', async () => {
    const client = await signInAs(TEST_USERS.memberOne);

    const started = await startOrResumeSession(client, memberId, ALPHA_KEY);
    expect(started).not.toBeNull();
    expect(started!.events).toEqual([]);
    expect(started!.session.visibleQuestions.map((q) => q.question_key)).toEqual(['alpha_gate', 'alpha_finding']);
    expect(started!.session.currentQuestion?.question_key).toBe('alpha_gate');
    expect(started!.session.progress).toEqual({ answered: 0, visible: 2 });

    const gateQuestionId = started!.session.currentQuestion!.id;
    const afterGate = await persistAnswer(client, started!.session.id, gateQuestionId, true);
    expect(afterGate.events).toEqual([{ type: 'question_answered', questionKey: 'alpha_gate', value: true }]);
    // Answering the gate 'true' makes alpha_followup visible — the denominator grows.
    expect(afterGate.session.visibleQuestions.map((q) => q.question_key)).toEqual([
      'alpha_gate',
      'alpha_followup',
      'alpha_finding',
    ]);
    expect(afterGate.session.currentQuestion?.question_key).toBe('alpha_followup');

    // Calling startOrResumeSession again must resume the SAME session, never create a second one.
    const resumed = await startOrResumeSession(client, memberId, ALPHA_KEY);
    expect(resumed!.session.id).toBe(started!.session.id);
    expect(resumed!.events).toEqual([{ type: 'assessment_resumed', sessionId: started!.session.id }]);

    const service = serviceRoleClient();
    const { data: draftRows } = await service
      .from('unified_assessment_sessions')
      .select('id')
      .eq('member_id', memberId)
      .eq('assessment_definition_id', alphaDefinitionId)
      .eq('status', 'in_progress');
    expect(draftRows).toHaveLength(1);

    const followupQuestionId = afterGate.session.currentQuestion!.id;
    const afterFollowup = await persistAnswer(client, started!.session.id, followupQuestionId, 3);
    expect(afterFollowup.session.currentQuestion?.question_key).toBe('alpha_finding');

    const findingQuestionId = afterFollowup.session.currentQuestion!.id;
    const afterFinding = await persistAnswer(client, started!.session.id, findingQuestionId, true);
    expect(afterFinding.session.progress).toEqual({ answered: 3, visible: 3 });
    expect(afterFinding.session.completionPercentage).toBe(100);
    expect(afterFinding.session.findings).toHaveLength(1);
    expect(afterFinding.session.flags).toHaveLength(1);

    const completed = await completeSession(client, started!.session.id);
    expect(completed.session.status).toBe('completed');
    expect(completed.session.completedAt).not.toBeNull();
    const eventTypes = completed.events.map((e) => e.type);
    expect(eventTypes).toContain('assessment_completed');
    expect(eventTypes).toContain('findings_published');

    const { data: entries } = await service.from('registry_entries').select('*').eq('member_id', memberId);
    const published = (entries ?? []).find(
      (e) => e.source_feature === 'unified_assessment_finding' && e.code === 'alpha_finding'
    );
    expect(published).toBeDefined();
    expect(published!.domain).toBe('stress');
    expect(published!.severity).toBe('significant');
    expect(published!.trend_status).toBe('new');
    expect(published!.source_record_id).toBe(started!.session.id);

    // No open draft remains — findInProgressSession returns null after completion.
    const afterComplete = await findInProgressSession(client, memberId, alphaDefinitionId);
    expect(afterComplete).toBeNull();
  }, 30000);
});

describe('Unified Adaptive Assessment Runtime — fixture Beta (two sections, mutually-exclusive branching)', () => {
  it('shows only the branch matching the answered concern, proving the runtime is generic across differently-shaped assessments', async () => {
    const client = await signInAs(TEST_USERS.memberOne);

    const started = await startOrResumeSession(client, memberId, BETA_KEY);
    expect(started).not.toBeNull();
    expect(started!.session.visibleQuestions.map((q) => q.question_key)).toEqual(['beta_concern']);

    const concernQuestionId = started!.session.currentQuestion!.id;
    const afterConcern = await persistAnswer(client, started!.session.id, concernQuestionId, 'sleep');
    expect(afterConcern.session.visibleQuestions.map((q) => q.question_key)).toEqual([
      'beta_concern',
      'beta_sleep_followup',
    ]);
    expect(afterConcern.session.hiddenQuestions.map((q) => q.question_key)).toEqual(['beta_energy_followup']);
    expect(afterConcern.session.currentSection?.title).toBe('Sleep Follow-up');

    const followupQuestionId = afterConcern.session.currentQuestion!.id;
    const afterFollowup = await persistAnswer(client, started!.session.id, followupQuestionId, 6);
    expect(afterFollowup.session.completionPercentage).toBe(100);

    const completed = await completeSession(client, started!.session.id);
    expect(completed.session.status).toBe('completed');
    // Beta's questions declare no finding rule at all — a completed session with zero findings must still succeed cleanly.
    expect(completed.session.findings).toEqual([]);
  }, 30000);
});
