/**
 * End-to-end test of the publish-time cascade
 * (lib/health-profile/orchestration.ts's onAssessmentPublished) against
 * real local Supabase — the mechanism behind "after a coach publishes an
 * approved assessment: update the Universal Registry, update Wellness
 * Insights, update the MEF Intelligence Engine, update the Intelligence
 * Core, update the persisted health profile."
 *
 * Server actions (app/actions/*.ts) can't be called directly in this test
 * suite ('use server' files use cookies(), which throws outside a Next.js
 * request scope — see tests/setup/test-clients.ts's own docblock). This
 * test instead replicates publishAiAnalysisReportAction's core DB steps by
 * calling the same lib/coach-intelligence/data.ts and
 * lib/body-assessment/data.ts functions the action itself calls, then
 * invokes onAssessmentPublished directly — proving the cascade itself,
 * which is the thing this milestone adds.
 *
 * Uses a dedicated 2021-06 local_date, disjoint from every other
 * integration suite's own fixture dates (2017/2018/2019/2020 already
 * claimed, see those suites' own headers). Runs against memberOne (the
 * only member seeded with an active coachOne assignment — memberTwo's own
 * assignment is seeded 'revoked', see supabase/seed/03_assignments_and_data.sql)
 * — this cascade's registry-derived identity observation
 * (deriveMovementResponseFromRegistryObservation) is a real, intentional
 * cross-cutting effect of recalculateIntelligenceCore, which is why
 * tests/intelligence-core-integration.test.ts's own "recalculating again
 * doesn't duplicate" assertion was narrowed to a specific observation_key
 * rather than a whole-domain count.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import { insertAssessment, insertFinding, setFindingReviewStatus } from '../lib/body-assessment/data';
import { insertAnalysis, insertObservations, updateObservation, updateAnalysis } from '../lib/coach-intelligence/data';
import { onAssessmentPublished } from '../lib/health-profile/orchestration';
import { listRegistryEntriesForMember } from '../lib/registry/data';
import { listTimelineEvents } from '../lib/timeline/data';

const LOCAL_DATE = '2021-06-01';
const memberId = TEST_USERS.memberOne.id;

afterAll(async () => {
  const service = serviceRoleClient();
  for (const table of [
    'registry_entries',
    'health_timeline_events',
    'member_health_profiles',
    'assessment_ai_observations',
    'assessment_ai_analyses',
    'body_assessment_findings',
    'body_assessments',
  ]) {
    await service.from(table).delete().eq('member_id', memberId);
  }
});

describe('onAssessmentPublished — publish-time cascade against real Supabase', () => {
  it('populates the Universal Registry, a timeline event, and the persisted health profile, and refreshes all three intelligence engines without throwing', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);
    const coachClient = await signInAs(TEST_USERS.coachOne);

    const assessment = await insertAssessment(memberClient, memberId, 'static_posture', 'America/New_York', LOCAL_DATE);
    expect(assessment).not.toBeNull();

    const finding = await insertFinding(coachClient, {
      assessmentId: assessment!.id,
      memberId,
      findingType: 'forward_head',
      severity: 'significant',
      confidence: 0.8,
      narrative: 'Marked forward head posture on both sides.',
    });
    expect(finding).not.toBeNull();
    await setFindingReviewStatus(coachClient, finding!.id, 'confirmed', TEST_USERS.coachOne.id);

    const analysis = await insertAnalysis(memberClient, {
      sourceFeature: 'body_assessment',
      sourceRecordId: assessment!.id,
      memberId,
    });
    expect(analysis).not.toBeNull();

    const [observation] = await insertObservations(coachClient, analysis!.id, memberId, [
      {
        category: 'observation',
        text: 'Notable forward head posture visible in both side captures.',
        confidence: 0.7,
        severity: 'moderate',
        evidence: [],
      },
    ]);
    expect(observation).toBeDefined();
    await updateObservation(coachClient, observation!.id, {
      status: 'accepted',
      coach_reviewed_by: TEST_USERS.coachOne.id,
      coach_reviewed_at: new Date().toISOString(),
    });

    const published = await updateAnalysis(coachClient, analysis!.id, {
      status: 'published',
      published_by: TEST_USERS.coachOne.id,
      published_at: new Date().toISOString(),
      coach_reviewed_by: TEST_USERS.coachOne.id,
      coach_reviewed_at: new Date().toISOString(),
    });
    expect(published).toBe(true);

    await onAssessmentPublished(coachClient, {
      memberId,
      assessmentId: assessment!.id,
      analysisId: analysis!.id,
      asOfLocalDate: LOCAL_DATE,
    });

    const registryEntries = await listRegistryEntriesForMember(coachClient, memberId, { statusFilter: ['active'] });
    const findingEntry = registryEntries.find((e) => e.source_record_id === finding!.id);
    expect(findingEntry).toBeDefined();
    expect(findingEntry!.domain).toBe('posture');
    expect(findingEntry!.severity).toBe('significant');
    const observationEntry = registryEntries.find((e) => e.source_record_id === observation!.id);
    expect(observationEntry).toBeDefined();
    expect(observationEntry!.member_visible).toBe(true);

    const timelineEvents = await listTimelineEvents(coachClient, memberId, { limit: 10 });
    const publishEvent = timelineEvents.find((e) => e.event_type === 'assessment_published');
    expect(publishEvent).toBeDefined();
    expect(publishEvent!.source_record_id).toBe(analysis!.id);

    const { data: profileRow, error: profileError } = await coachClient
      .from('member_health_profiles')
      .select('*')
      .eq('member_id', memberId)
      .maybeSingle();
    expect(profileError).toBeNull();
    expect(profileRow).not.toBeNull();
    expect(profileRow!.last_recalculated_trigger).toBe('assessment_published');
    expect(profileRow!.latest_registry_finding_count).toBeGreaterThanOrEqual(2);

    const { data: snapshots, error: snapshotError } = await coachClient
      .from('intelligence_profile_snapshots')
      .select('id')
      .eq('member_id', memberId)
      .eq('local_date', LOCAL_DATE);
    expect(snapshotError).toBeNull();
    expect(snapshots!.length).toBeGreaterThan(0);
  }, 60_000);

  it('re-running the cascade does not duplicate the body-assessment-derived registry entry', async () => {
    const coachClient = await signInAs(TEST_USERS.coachOne);
    const { data: assessments } = await coachClient
      .from('body_assessments')
      .select('id')
      .eq('member_id', memberId)
      .eq('local_date', LOCAL_DATE)
      .limit(1);
    const assessmentId = assessments![0]!.id as string;

    const { data: analyses } = await coachClient
      .from('assessment_ai_analyses')
      .select('id')
      .eq('source_record_id', assessmentId)
      .limit(1);
    const analysisId = analyses![0]!.id as string;

    await onAssessmentPublished(coachClient, { memberId, assessmentId, analysisId, asOfLocalDate: LOCAL_DATE });

    const registryEntries = await listRegistryEntriesForMember(coachClient, memberId, {
      statusFilter: ['active'],
    });
    const postureEntries = registryEntries.filter((e) => e.domain === 'posture' && e.code === 'forward_head');
    expect(postureEntries).toHaveLength(1);
  }, 60_000);

  it("RLS: an unassigned member (memberTwo) cannot read memberOne's registry entries or timeline events", async () => {
    const memberTwoClient = await signInAs(TEST_USERS.memberTwo);

    const { data: entries, error: entriesError } = await memberTwoClient
      .from('registry_entries')
      .select('*')
      .eq('member_id', memberId);
    expect(entriesError).toBeNull();
    expect(entries).toEqual([]);

    const { data: events, error: eventsError } = await memberTwoClient
      .from('health_timeline_events')
      .select('*')
      .eq('member_id', memberId);
    expect(eventsError).toBeNull();
    expect(events).toEqual([]);

    const { data: profileRows, error: profileError } = await memberTwoClient
      .from('member_health_profiles')
      .select('*')
      .eq('member_id', memberId);
    expect(profileError).toBeNull();
    expect(profileRows).toEqual([]);
  }, 60_000);
});
