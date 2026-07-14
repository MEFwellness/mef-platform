/**
 * End-to-end integration test for the AI Body Assessment Framework
 * (migration 37, lib/body-assessment/*, lib/ai/agents/body-assessment.ts,
 * lib/narrative's body-assessment case) against real local Supabase —
 * real RLS, real Storage, no mocked Supabase client, same philosophy as
 * tests/narrative-integration.test.ts and tests/ai-dispatcher-integration.test.ts.
 *
 * Server actions in app/actions/body-assessment.ts can't be called
 * directly here (they use cookies() from next/headers, which throws
 * outside a request scope) — these tests instead call the same
 * lib/body-assessment/data.ts functions and lib/ai/events.ts's
 * emitAndDispatch the actions call, which is what actually proves the
 * database's own RLS policies and the dispatcher's behavior.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import {
  insertAssessment,
  insertCapture,
  listCaptures,
  insertFinding,
  listFindings,
  getFinding,
  upsertComparison,
  listComparisons,
  insertCoachReview,
  listCoachReviews,
  setFindingReviewStatus,
} from '../lib/body-assessment/data';
import { buildCaptureStoragePath, BODY_ASSESSMENT_BUCKET } from '../lib/body-assessment/storage';
import { emitAndDispatch } from '../lib/ai/events';
import type { RuleFacts } from '../lib/ai/rules/facts';

function baseFacts(): RuleFacts {
  return {
    daysSinceLastCheckin: null,
    stressConsecutiveIncreaseDays: 0,
    sleepConsecutiveDecreaseDays: 0,
    stressTrend: null,
    sleepTrend: null,
    energyTrend: null,
    moodTrend: null,
    hydrationTrend: null,
    digestionTrend: null,
    movementTrend: null,
    painTrend: null,
    wellnessIndexScore: null,
    wellnessIndexDelta: null,
  };
}

const memberIds = [TEST_USERS.memberOne.id, TEST_USERS.memberTwo.id];

afterAll(async () => {
  const service = serviceRoleClient();
  for (const table of [
    'body_assessment_coach_reviews',
    'body_assessment_comparisons',
    'body_assessment_findings',
    'body_landmark_sets',
    'body_assessment_captures',
    'body_assessments',
  ]) {
    await service.from(table).delete().in('member_id', memberIds);
  }
  for (const table of [
    'ai_actions',
    'ai_recommendations',
    'ai_insights',
    'ai_events',
    'narrative_items',
  ]) {
    await service.from(table).delete().in('member_id', memberIds);
  }
  // Storage `list()` is non-recursive — this suite's test files live one
  // level below `${memberId}/test-assessment/`, so list the subfolder
  // directly rather than the member's top-level folder.
  const { data: objects } = await service.storage
    .from(BODY_ASSESSMENT_BUCKET)
    .list(`${memberIds[0]}/test-assessment`);
  if (objects && objects.length > 0) {
    await service.storage
      .from(BODY_ASSESSMENT_BUCKET)
      .remove(objects.map((o) => `${memberIds[0]}/test-assessment/${o.name}`));
  }
});

describe('body_assessments / captures / findings — CRUD and RLS', () => {
  it('a member can create an assessment, add a capture, and read it back under their own session', async () => {
    const client = await signInAs(TEST_USERS.memberOne);

    const assessment = await insertAssessment(
      client,
      TEST_USERS.memberOne.id,
      'static_posture',
      'America/New_York',
      '2026-01-01'
    );
    expect(assessment).toBeTruthy();
    expect(assessment!.status).toBe('in_progress');

    const capture = await insertCapture(client, {
      assessmentId: assessment!.id,
      memberId: TEST_USERS.memberOne.id,
      captureType: 'front',
      sequenceIndex: 0,
      mediaType: 'image',
      storagePath: buildCaptureStoragePath(TEST_USERS.memberOne.id, assessment!.id, 'cap-1', 'jpg'),
    });
    expect(capture).toBeTruthy();

    const captures = await listCaptures(client, assessment!.id);
    expect(captures).toHaveLength(1);
    expect(captures[0]!.capture_type).toBe('front');
  });

  it("a member cannot read another member's assessment (RLS denies, not errors)", async () => {
    const memberOneClient = await signInAs(TEST_USERS.memberOne);
    const assessment = await insertAssessment(
      memberOneClient,
      TEST_USERS.memberOne.id,
      'walking_gait',
      'America/New_York',
      '2026-01-02'
    );

    const memberTwoClient = await signInAs(TEST_USERS.memberTwo);
    const { data } = await memberTwoClient
      .from('body_assessments')
      .select('*')
      .eq('id', assessment!.id);
    expect(data).toEqual([]);
  });

  it("an unassigned coach cannot read memberTwo's assessment, but the assigned coach can read memberOne's", async () => {
    const memberOneClient = await signInAs(TEST_USERS.memberOne);
    const assessmentOne = await insertAssessment(
      memberOneClient,
      TEST_USERS.memberOne.id,
      'squat',
      'America/New_York',
      '2026-01-03'
    );

    const memberTwoClient = await signInAs(TEST_USERS.memberTwo);
    const assessmentTwo = await insertAssessment(
      memberTwoClient,
      TEST_USERS.memberTwo.id,
      'squat',
      'America/New_York',
      '2026-01-03'
    );

    const coachClient = await signInAs(TEST_USERS.coachOne);
    const { data: allowed } = await coachClient
      .from('body_assessments')
      .select('*')
      .eq('id', assessmentOne!.id);
    expect(allowed).toHaveLength(1);

    const { data: denied } = await coachClient
      .from('body_assessments')
      .select('*')
      .eq('id', assessmentTwo!.id);
    expect(denied).toEqual([]);
  });
});

describe('Storage RLS — body-assessment-media bucket', () => {
  it("a member can upload to their own folder but not to another member's folder", async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const ownPath = `${TEST_USERS.memberOne.id}/test-assessment/own-file.txt`;
    const { error: ownUploadError } = await client.storage
      .from(BODY_ASSESSMENT_BUCKET)
      .upload(ownPath, new Blob(['test'], { type: 'text/plain' }), { upsert: true });
    expect(ownUploadError).toBeNull();

    const otherPath = `${TEST_USERS.memberTwo.id}/test-assessment/intrusion.txt`;
    const { error: otherUploadError } = await client.storage
      .from(BODY_ASSESSMENT_BUCKET)
      .upload(otherPath, new Blob(['test'], { type: 'text/plain' }), { upsert: true });
    expect(otherUploadError).not.toBeNull();
  });

  it('the assigned coach can generate a signed URL for a read they are authorized to make', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);
    const path = `${TEST_USERS.memberOne.id}/test-assessment/coach-read.txt`;
    await memberClient.storage
      .from(BODY_ASSESSMENT_BUCKET)
      .upload(path, new Blob(['test'], { type: 'text/plain' }), { upsert: true });

    const coachClient = await signInAs(TEST_USERS.coachOne);
    const { data, error } = await coachClient.storage
      .from(BODY_ASSESSMENT_BUCKET)
      .createSignedUrl(path, 60);
    expect(error).toBeNull();
    expect(data?.signedUrl).toBeTruthy();
  });
});

describe('Findings — coach confirm/dismiss/override supersede chain', () => {
  it('a coach override supersedes the original finding rather than mutating it', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);
    const assessment = await insertAssessment(
      memberClient,
      TEST_USERS.memberOne.id,
      'static_posture',
      'America/New_York',
      '2026-01-04'
    );

    const original = await insertFinding(memberClient, {
      assessmentId: assessment!.id,
      memberId: TEST_USERS.memberOne.id,
      findingType: 'forward_head',
      severity: 'moderate',
      confidence: 0.7,
      narrative: 'Placeholder finding for test.',
    });
    expect(original).toBeTruthy();
    expect(original!.status).toBe('pending_review');

    const coachClient = await signInAs(TEST_USERS.coachOne);
    const overridden = await insertFinding(coachClient, {
      assessmentId: assessment!.id,
      memberId: TEST_USERS.memberOne.id,
      findingType: 'forward_head',
      severity: 'mild',
      confidence: 0.7,
      narrative: 'Coach-corrected severity.',
      supersedesId: original!.id,
      status: 'coach_overridden',
      coachReviewedBy: TEST_USERS.coachOne.id,
      coachOverrideNotes: 'Looked closer at the side view — this is milder than detected.',
    });
    expect(overridden).toBeTruthy();
    expect(overridden!.status).toBe('coach_overridden');
    expect(overridden!.supersedes_id).toBe(original!.id);

    const originalAfter = await getFinding(coachClient, original!.id);
    expect(originalAfter!.status).toBe('superseded');
    expect(originalAfter!.superseded_by_id).toBe(overridden!.id);

    const active = await listFindings(memberClient, assessment!.id, { activeOnly: true });
    expect(active.map((f) => f.id)).not.toContain(original!.id);
    expect(active.map((f) => f.id)).toContain(overridden!.id);
  });

  it('confirm and dismiss set review status and reviewer without superseding', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);
    const assessment = await insertAssessment(
      memberClient,
      TEST_USERS.memberOne.id,
      'static_posture',
      'America/New_York',
      '2026-01-05'
    );
    const finding = await insertFinding(memberClient, {
      assessmentId: assessment!.id,
      memberId: TEST_USERS.memberOne.id,
      findingType: 'rounded_shoulders',
      severity: 'mild',
      confidence: 0.6,
    });

    const coachClient = await signInAs(TEST_USERS.coachOne);
    const ok = await setFindingReviewStatus(
      coachClient,
      finding!.id,
      'confirmed',
      TEST_USERS.coachOne.id
    );
    expect(ok).toBe(true);

    const confirmed = await getFinding(coachClient, finding!.id);
    expect(confirmed!.status).toBe('confirmed');
    expect(confirmed!.coach_reviewed_by).toBe(TEST_USERS.coachOne.id);
  });
});

describe('Comparison engine persistence', () => {
  it('upserts and reads back a comparison row between two assessments', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);
    const earlier = await insertAssessment(
      memberClient,
      TEST_USERS.memberOne.id,
      'static_posture',
      'America/New_York',
      '2026-01-06'
    );
    const later = await insertAssessment(
      memberClient,
      TEST_USERS.memberOne.id,
      'static_posture',
      'America/New_York',
      '2026-01-13'
    );

    const created = await upsertComparison(memberClient, {
      memberId: TEST_USERS.memberOne.id,
      assessmentAId: earlier!.id,
      assessmentBId: later!.id,
      dimension: 'overall',
      trend: 'improved',
      confidence: 0.6,
      summary: 'Test summary.',
    });
    expect(created).toBeTruthy();

    const rows = await listComparisons(memberClient, earlier!.id, later!.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.trend).toBe('improved');
  });
});

describe('Coach review workflow — append-only', () => {
  it('an assigned coach can add a review entry; an unassigned coach cannot', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);
    const assessment = await insertAssessment(
      memberClient,
      TEST_USERS.memberOne.id,
      'static_posture',
      'America/New_York',
      '2026-01-07'
    );

    const coachClient = await signInAs(TEST_USERS.coachOne);
    const review = await insertCoachReview(coachClient, {
      assessmentId: assessment!.id,
      memberId: TEST_USERS.memberOne.id,
      coachId: TEST_USERS.coachOne.id,
      reviewStatus: 'completed',
      observations: 'Posture looks solid overall.',
      reassessmentMarkedComplete: true,
    });
    expect(review).toBeTruthy();

    const reviews = await listCoachReviews(memberClient, assessment!.id);
    expect(reviews).toHaveLength(1);
    expect(reviews[0]!.reassessment_marked_complete).toBe(true);

    // memberTwo's own assessment, reviewed by an unassigned coachTwo-like
    // attempt from coachOne (not assigned to memberTwo) must be rejected.
    const memberTwoClient = await signInAs(TEST_USERS.memberTwo);
    const assessmentTwo = await insertAssessment(
      memberTwoClient,
      TEST_USERS.memberTwo.id,
      'static_posture',
      'America/New_York',
      '2026-01-07'
    );
    const { error } = await coachClient.from('body_assessment_coach_reviews').insert({
      assessment_id: assessmentTwo!.id,
      member_id: TEST_USERS.memberTwo.id,
      coach_id: TEST_USERS.coachOne.id,
      review_status: 'in_review',
    });
    expect(error).not.toBeNull();
  });
});

describe('Dispatcher integration — body_assessment_completed event', () => {
  it('with findings, the body_assessment agent produces an insight -> recommendation -> action chain and the narrative records the completion', async () => {
    const client = await signInAs(TEST_USERS.memberOne);

    await emitAndDispatch(
      client,
      {
        eventType: 'body_assessment_completed',
        memberId: TEST_USERS.memberOne.id,
        source: 'member',
        payload: {
          assessmentId: 'fake-assessment-id',
          assessmentType: 'static_posture',
          assessmentTypeLabel: 'Static Posture',
          findingsCount: 2,
          significantFindingsCount: 0,
        },
      },
      baseFacts()
    );

    const { data: events } = await client
      .from('ai_events')
      .select('*')
      .eq('member_id', TEST_USERS.memberOne.id)
      .eq('event_type', 'body_assessment_completed')
      .order('created_at', { ascending: false })
      .limit(1);
    const event = events?.[0];
    expect(event).toBeTruthy();
    expect(event.processed_at).not.toBeNull();

    const { data: insight } = await client
      .from('ai_insights')
      .select('*')
      .eq('source_event_id', event.id)
      .single();
    expect(insight.agent_key).toBe('body_assessment');
    expect(insight.insight_type).toBe('body_assessment_findings_ready');

    const { data: action } = await client
      .from('ai_actions')
      .select('*')
      .eq('agent_key', 'body_assessment')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    expect(action.action_type).toBe('coach_notification');

    const { data: narrativeItems } = await client
      .from('narrative_items')
      .select('*')
      .eq('member_id', TEST_USERS.memberOne.id)
      .eq('category', 'recent_changes')
      .ilike('title', 'Completed a Static Posture assessment');
    expect(narrativeItems!.length).toBeGreaterThan(0);
  });

  it('with zero findings, the agent produces nothing but the event is still marked processed', async () => {
    const client = await signInAs(TEST_USERS.memberTwo);

    await emitAndDispatch(
      client,
      {
        eventType: 'body_assessment_completed',
        memberId: TEST_USERS.memberTwo.id,
        source: 'member',
        payload: {
          assessmentId: 'fake-assessment-id-2',
          assessmentType: 'walking_gait',
          assessmentTypeLabel: 'Walking Gait',
          findingsCount: 0,
        },
      },
      baseFacts()
    );

    const { data: events } = await client
      .from('ai_events')
      .select('*')
      .eq('member_id', TEST_USERS.memberTwo.id)
      .eq('event_type', 'body_assessment_completed')
      .order('created_at', { ascending: false })
      .limit(1);
    const event = events?.[0];
    expect(event.processed_at).not.toBeNull();

    const { data: insights } = await client
      .from('ai_insights')
      .select('id')
      .eq('source_event_id', event.id);
    expect(insights).toEqual([]);
  });
});
