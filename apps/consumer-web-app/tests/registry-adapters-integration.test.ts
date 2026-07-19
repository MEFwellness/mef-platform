/**
 * Integration tests for the Universal Registry adapters
 * (lib/registry/adapters/*) against real local Supabase — domain-mapping
 * and status/category-filtering correctness, isolated from the full
 * publish cascade covered by tests/health-profile-orchestration-
 * integration.test.ts.
 *
 * Runs against memberOne (the only member seeded with an active coachOne
 * assignment — see supabase/seed/03_assignments_and_data.sql). These
 * findings are mild/moderate/significant severity, which feed
 * buildRegistryPatternInsights and can cascade into a movement_response
 * identity observation on the next recalculateIntelligenceCore for this
 * member — see tests/intelligence-core-integration.test.ts's own note on
 * why its "recalculating again" assertion is scoped to a specific
 * observation_key rather than a whole-domain count.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import {
  insertAssessment,
  insertFinding,
  setFindingReviewStatus,
} from '../lib/body-assessment/data';
import {
  insertAnalysis,
  insertObservations,
  updateObservation,
} from '../lib/coach-intelligence/data';
import { upsertRegistryEntriesFromBodyAssessment } from '../lib/registry/adapters/bodyAssessment';
import { upsertRegistryEntriesFromCoachIntelligence } from '../lib/registry/adapters/coachIntelligence';
import { listRegistryEntriesForMember } from '../lib/registry/data';

const LOCAL_DATE = '2021-06-10';
const memberId = TEST_USERS.memberOne.id;

afterAll(async () => {
  const service = serviceRoleClient();
  for (const table of [
    'registry_entries',
    'assessment_ai_observations',
    'assessment_ai_analyses',
    'body_assessment_findings',
    'body_assessments',
  ]) {
    await service.from(table).delete().eq('member_id', memberId);
  }
});

describe('upsertRegistryEntriesFromBodyAssessment — domain mapping and status filtering', () => {
  it('maps finding types to the correct domain and only registers confirmed/coach_overridden findings', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);
    const coachClient = await signInAs(TEST_USERS.coachOne);

    const assessment = await insertAssessment(
      memberClient,
      memberId,
      'static_posture',
      'America/New_York',
      LOCAL_DATE
    );

    // coach_overridden is a valid insert-time status (a coach's own correction, not a review of an AI draft).
    await insertFinding(coachClient, {
      assessmentId: assessment!.id,
      memberId,
      findingType: 'breathing_pattern',
      severity: 'mild',
      confidence: 0.6,
      status: 'coach_overridden',
      coachReviewedBy: TEST_USERS.coachOne.id,
    });

    const kneeValgus = await insertFinding(coachClient, {
      assessmentId: assessment!.id,
      memberId,
      findingType: 'knee_valgus',
      severity: 'moderate',
      confidence: 0.65,
    });
    await setFindingReviewStatus(coachClient, kneeValgus!.id, 'confirmed', TEST_USERS.coachOne.id);

    const roundedShoulders = await insertFinding(coachClient, {
      assessmentId: assessment!.id,
      memberId,
      findingType: 'rounded_shoulders',
      severity: 'moderate',
      confidence: 0.7,
    });
    await setFindingReviewStatus(
      coachClient,
      roundedShoulders!.id,
      'confirmed',
      TEST_USERS.coachOne.id
    );

    // Not yet coach-gated — must NOT be registered.
    await insertFinding(coachClient, {
      assessmentId: assessment!.id,
      memberId,
      findingType: 'pelvic_tilt',
      severity: 'significant',
      confidence: 0.9,
    });

    const footTurnout = await insertFinding(coachClient, {
      assessmentId: assessment!.id,
      memberId,
      findingType: 'foot_turnout',
      severity: 'mild',
      confidence: 0.5,
    });
    await setFindingReviewStatus(coachClient, footTurnout!.id, 'dismissed', TEST_USERS.coachOne.id);

    await upsertRegistryEntriesFromBodyAssessment(coachClient, memberId, assessment!.id);

    const entries = await listRegistryEntriesForMember(coachClient, memberId, {
      statusFilter: ['active'],
    });
    const byCode = Object.fromEntries(entries.map((e) => [e.code, e]));

    expect(byCode.breathing_pattern?.domain).toBe('breathing');
    expect(byCode.knee_valgus?.domain).toBe('movement');
    expect(byCode.rounded_shoulders?.domain).toBe('posture');
    expect(byCode.pelvic_tilt).toBeUndefined(); // pending_review — excluded
    expect(byCode.foot_turnout).toBeUndefined(); // dismissed — excluded
    expect(entries).toHaveLength(3);
  }, 30_000);
});

describe('upsertRegistryEntriesFromCoachIntelligence — category filtering and red_flag visibility', () => {
  it('registers observation/compensation/red_flag but not coaching-plan categories, and forces red_flag member_visible=false', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);
    const coachClient = await signInAs(TEST_USERS.coachOne);

    const assessment = await insertAssessment(
      memberClient,
      memberId,
      'static_posture',
      'America/New_York',
      LOCAL_DATE
    );
    const analysis = await insertAnalysis(memberClient, {
      sourceFeature: 'body_assessment',
      sourceRecordId: assessment!.id,
      memberId,
    });

    const observations = await insertObservations(coachClient, analysis!.id, memberId, [
      { category: 'observation', text: 'Visible forward lean.', confidence: 0.6, evidence: [] },
      {
        category: 'compensation',
        text: 'Compensating with lumbar extension.',
        confidence: 0.6,
        evidence: [],
      },
      {
        category: 'red_flag',
        text: 'Recommend medical evaluation.',
        confidence: 0.9,
        evidence: [],
      },
      {
        category: 'education_topic',
        text: 'Explain diaphragmatic breathing.',
        confidence: 0.5,
        evidence: [],
      },
      {
        category: 'coach_question',
        text: 'Ask about prior injuries.',
        confidence: 0.5,
        evidence: [],
      },
    ]);
    for (const obs of observations) {
      await updateObservation(coachClient, obs.id, {
        status: 'accepted',
        coach_reviewed_by: TEST_USERS.coachOne.id,
        coach_reviewed_at: new Date().toISOString(),
      });
    }

    await upsertRegistryEntriesFromCoachIntelligence(coachClient, memberId, analysis!.id);

    const entries = await listRegistryEntriesForMember(coachClient, memberId, {
      statusFilter: ['active'],
    });
    const bySource = Object.fromEntries(entries.map((e) => [e.source_record_id, e]));

    const observationEntry = observations.find((o) => o.category === 'observation')!;
    const compensationEntry = observations.find((o) => o.category === 'compensation')!;
    const redFlagEntry = observations.find((o) => o.category === 'red_flag')!;
    const educationEntry = observations.find((o) => o.category === 'education_topic')!;
    const questionEntry = observations.find((o) => o.category === 'coach_question')!;

    expect(bySource[observationEntry.id]).toBeDefined();
    expect(bySource[observationEntry.id]!.member_visible).toBe(true);
    expect(bySource[compensationEntry.id]).toBeDefined();
    expect(bySource[redFlagEntry.id]).toBeDefined();
    expect(bySource[redFlagEntry.id]!.member_visible).toBe(false);
    expect(bySource[educationEntry.id]).toBeUndefined();
    expect(bySource[questionEntry.id]).toBeUndefined();
  }, 30_000);
});
