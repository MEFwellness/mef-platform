/**
 * End-to-end integration test for the coaching safety layer
 * (lib/safety/service.ts, app/actions/safety.ts) against real local
 * Supabase — real RLS, no mocked Supabase client, per this suite's
 * established testing philosophy (see tests/setup/test-clients.ts).
 */
import { describe, it, expect, afterAll } from 'vitest';
import { signInAs, serviceRoleClient, anonClient, TEST_USERS } from './setup/test-clients';
import { evaluateConcern } from '../lib/safety/service';
import { recordAcknowledgment } from '../lib/safety/data';

const createdMemberIds = [TEST_USERS.memberOne.id, TEST_USERS.memberTwo.id];

afterAll(async () => {
  const service = serviceRoleClient();
  for (const table of [
    'safety_review_queue',
    'safety_acknowledgments',
    'safety_audit_log',
    'safety_classifications',
  ]) {
    await service.from(table).delete().in('member_id', createdMemberIds);
  }
});

describe('evaluateConcern — classification + acknowledgment + review queue creation', () => {
  it('a routine-wellness check-in note is classified STANDARD_COACHING with no acknowledgment/review created', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const evaluation = await evaluateConcern(client, {
      memberId: TEST_USERS.memberOne.id,
      sourceFeature: 'daily_checkin',
      sourceRecordType: 'daily_checkin',
      text: 'Feeling really good today, energy has been steady.',
    });

    expect(evaluation).not.toBeNull();
    expect(evaluation!.classification.classification_level).toBe('standard_coaching');
    expect(evaluation!.memberMessage).toBeNull();
    expect(evaluation!.acknowledgmentId).toBeNull();
    expect(evaluation!.reviewId).toBeNull();
  });

  it('a medication question creates a classification, an approved message, an acknowledgment, and a coach review queue entry', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const evaluation = await evaluateConcern(client, {
      memberId: TEST_USERS.memberOne.id,
      sourceFeature: 'daily_checkin',
      sourceRecordType: 'daily_checkin',
      text: 'Should I stop taking my medication this week?',
    });

    expect(evaluation).not.toBeNull();
    expect(evaluation!.classification.classification_level).toBe('coach_review_required');
    expect(evaluation!.classification.policy_version).toBe('safety-policy-v1');
    expect(evaluation!.memberMessage).not.toBeNull();
    expect(evaluation!.memberMessage!.title.length).toBeGreaterThan(0);
    expect(evaluation!.acknowledgmentId).not.toBeNull();
    expect(evaluation!.reviewId).not.toBeNull();

    // The classification never fabricates coaching_allowed = false for a
    // topic-restricted (not fully stopped) level.
    expect(evaluation!.classification.coaching_allowed).toBe(true);
    expect(evaluation!.classification.restricted_topics).toEqual(['medication']);

    // The review queue entry carries the required fields end to end. Read
    // back via the service role, not the member's own client — a member
    // has no SELECT policy on safety_review_queue by design (see the RLS
    // describe block below), so this intentionally can't use `client`.
    const { data: review } = await serviceRoleClient()
      .from('safety_review_queue')
      .select('*')
      .eq('id', evaluation!.reviewId!)
      .single();
    expect(review.member_id).toBe(TEST_USERS.memberOne.id);
    expect(review.status).toBe('new');
    expect(review.classification_id).toBe(evaluation!.classification.id);

    // Acknowledging never unlocks anything about the classification itself.
    const ackOk = await recordAcknowledgment(client, evaluation!.acknowledgmentId!);
    expect(ackOk).toBe(true);
    const { data: ack } = await client
      .from('safety_acknowledgments')
      .select('*')
      .eq('id', evaluation!.acknowledgmentId!)
      .single();
    expect(ack.status).toBe('acknowledged');
    expect(ack.acknowledged_at).not.toBeNull();

    // Audit history recorded the full lifecycle.
    const { data: auditRows } = await client
      .from('safety_audit_log')
      .select('event_type')
      .eq('classification_id', evaluation!.classification.id);
    const eventTypes = (auditRows ?? []).map((r) => r.event_type);
    expect(eventTypes).toContain('classification_created');
    expect(eventTypes).toContain('message_shown');
    expect(eventTypes).toContain('review_created');
  });

  it('a self-harm crisis message fully stops coaching for that input and escalates urgently', async () => {
    const client = await signInAs(TEST_USERS.memberTwo);
    const evaluation = await evaluateConcern(client, {
      memberId: TEST_USERS.memberTwo.id,
      sourceFeature: 'daily_checkin',
      sourceRecordType: 'daily_checkin',
      text: "I've been thinking about suicide and I don't want to be here anymore.",
    });

    expect(evaluation).not.toBeNull();
    expect(evaluation!.classification.classification_level).toBe('safety_response_only');
    expect(evaluation!.classification.coaching_allowed).toBe(false);
    expect(evaluation!.classification.urgency).toBe('critical');
    expect(evaluation!.memberMessage!.title).toContain('support');
    // Uses the crisis-specific template, not the generic safety_response_only one.
    expect(evaluation!.memberMessage!.body).toMatch(/988/);
  });
});

describe("RLS — a member cannot read another member's safety records", () => {
  it("memberOne cannot see memberTwo's classification via their own session", async () => {
    const memberOneClient = await signInAs(TEST_USERS.memberOne);
    const { data } = await memberOneClient
      .from('safety_classifications')
      .select('*')
      .eq('member_id', TEST_USERS.memberTwo.id);
    expect(data).toEqual([]);
  });

  it('an anonymous client cannot read any safety_classifications', async () => {
    const anon = anonClient();
    const { data, error } = await anon.from('safety_classifications').select('*').limit(1);
    // RLS denies by default — either an empty result set or a permission error, never real rows.
    expect(error === null ? data : []).toEqual([]);
  });

  it('a member cannot read the coach review queue at all (coach-internal working data)', async () => {
    const memberOneClient = await signInAs(TEST_USERS.memberOne);
    const { data } = await memberOneClient
      .from('safety_review_queue')
      .select('*')
      .eq('member_id', TEST_USERS.memberOne.id);
    expect(data).toEqual([]);
  });
});

describe('Coach review queue — authorization and coach controls', () => {
  it('coachOne (assigned to memberOne) can read and update the review case created above', async () => {
    const coachClient = await signInAs(TEST_USERS.coachOne);
    const { data: cases } = await coachClient
      .from('safety_review_queue')
      .select('*')
      .eq('member_id', TEST_USERS.memberOne.id);
    expect(cases!.length).toBeGreaterThan(0);

    const reviewCase = cases![0];
    const { error: updateError } = await coachClient
      .from('safety_review_queue')
      .update({ status: 'reviewing', coach_notes: 'Following up with client directly.' })
      .eq('id', reviewCase.id);
    expect(updateError).toBeNull();

    const { data: updated } = await coachClient
      .from('safety_review_queue')
      .select('status, coach_notes')
      .eq('id', reviewCase.id)
      .single();
    expect(updated!.status).toBe('reviewing');
    expect(updated!.coach_notes).toBe('Following up with client directly.');
  });

  it("an unassigned coach sees zero review-queue rows for memberTwo's crisis case", async () => {
    // coachOne is not assigned to memberTwo in the seed data.
    const coachClient = await signInAs(TEST_USERS.coachOne);
    const { data } = await coachClient
      .from('safety_review_queue')
      .select('*')
      .eq('member_id', TEST_USERS.memberTwo.id);
    expect(data).toEqual([]);
  });
});
