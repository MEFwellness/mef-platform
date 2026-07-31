/**
 * Guard tests for Protein Phase 1a's target-approval flow — real local
 * Supabase (no mocks), proving the invariants the task asked for:
 *
 *   1. A structured-program (24-week / holistic_reset tier) member's own
 *      client cannot read a pending_coach_review target row at all — not
 *      just "the UI doesn't show it as active," but a genuine RLS block.
 *   2. That same member cannot bypass review by inserting an already-
 *      active row directly — the INSERT policy cross-checks their real
 *      membership_tier, not client-supplied input.
 *   3. A coach can see the pending row in their queue, approve it, and
 *      the member can then read the real active target back.
 *   4. A coach edit stores a different active_grams than computed_grams
 *      and is flagged is_coach_edited.
 *   5. A self-guided (non-holistic_reset) member's own client can insert
 *      an already-active row directly and read it back immediately — no
 *      coach step required for that track.
 *   6. A different member (not the target's owner) can never read
 *      another member's row, active or not.
 */
import { describe, it, expect, afterAll, afterEach } from 'vitest';
import { serviceRoleClient, signInAs, TEST_USERS } from './setup/test-clients';
import { computeProteinGrams } from '../lib/protein/calculation';

const TABLE = 'member_protein_targets';
const createdTargetIds: string[] = [];

afterAll(async () => {
  const supabase = serviceRoleClient();
  if (createdTargetIds.length > 0) {
    await supabase.from(TABLE).delete().in('id', createdTargetIds);
  }
  await supabase.from('member_protein_profile').delete().eq('member_id', TEST_USERS.memberOne.id);
  await supabase.from('member_protein_profile').delete().eq('member_id', TEST_USERS.memberTwo.id);
  // Restore memberOne's membership tier to the seeded default (null -> resolves to 'membership').
  await supabase
    .from('profiles')
    .update({ membership_tier: null })
    .eq('id', TEST_USERS.memberOne.id);
});

async function setMembershipTier(memberId: string, tier: string | null) {
  const supabase = serviceRoleClient();
  const { error } = await supabase.from('profiles').update({ membership_tier: tier }).eq('id', memberId);
  expect(error).toBeNull();
}

describe('structured-program (24-week) member: pending target is invisible until coach approval', () => {
  afterEach(async () => {
    await setMembershipTier(TEST_USERS.memberOne.id, null);
  });

  it('member cannot self-insert an already-active row while their real tier is holistic_reset', async () => {
    await setMembershipTier(TEST_USERS.memberOne.id, 'holistic_reset');
    const memberClient = await signInAs(TEST_USERS.memberOne);

    // Labeling the row track: 'self_guided' is exactly what a member
    // trying to bypass coach review would do — it's the only track value
    // the INSERT policy's "already active" branch accepts, regardless of
    // what the member's real membership_tier actually is. The
    // policy's membership_tier subquery is what has to catch this, not
    // the track label itself.
    const computedGrams = computeProteinGrams(180, 'regular_movement');
    const { error } = await memberClient.from(TABLE).insert({
      member_id: TEST_USERS.memberOne.id,
      track: 'self_guided',
      body_weight_lb: 180,
      activity_level: 'regular_movement',
      computed_grams: computedGrams,
      status: 'active',
      active_grams: computedGrams,
    });

    expect(error).not.toBeNull();
  });

  it('member CAN insert a pending_coach_review row for themselves, but cannot read it back', async () => {
    await setMembershipTier(TEST_USERS.memberOne.id, 'holistic_reset');
    const memberClient = await signInAs(TEST_USERS.memberOne);

    const computedGrams = computeProteinGrams(180, 'regular_movement');
    const { error: insertError } = await memberClient.from(TABLE).insert({
      member_id: TEST_USERS.memberOne.id,
      track: 'structured_program',
      body_weight_lb: 180,
      activity_level: 'regular_movement',
      computed_grams: computedGrams,
      status: 'pending_coach_review',
    });
    expect(insertError).toBeNull();

    // Track it for cleanup via the service-role client (the member's own
    // client can't read it back to get its id — that's the point).
    const supabase = serviceRoleClient();
    const { data: rows } = await supabase
      .from(TABLE)
      .select('id')
      .eq('member_id', TEST_USERS.memberOne.id)
      .eq('status', 'pending_coach_review');
    for (const row of rows ?? []) createdTargetIds.push(row.id);

    const { data: memberOwnRead } = await memberClient
      .from(TABLE)
      .select('*')
      .eq('member_id', TEST_USERS.memberOne.id)
      .eq('status', 'pending_coach_review');
    expect(memberOwnRead ?? []).toEqual([]);
  });

  it('full flow: coach sees it in the queue, approves as-is, member then reads the real active target', async () => {
    await setMembershipTier(TEST_USERS.memberOne.id, 'holistic_reset');
    const memberClient = await signInAs(TEST_USERS.memberOne);
    const computedGrams = computeProteinGrams(200, 'muscle_building_emphasis');

    // Deliberately no .select() here — PostgREST raises 42501 when asked
    // to return a row that the caller's own SELECT policy can't see
    // (proof, not just an assumption: verified empirically before writing
    // this test), which is exactly why lib/protein/store.ts's
    // createProteinTargetRequest never calls .select() on this insert.
    const { error: insertError } = await memberClient.from(TABLE).insert({
      member_id: TEST_USERS.memberOne.id,
      track: 'structured_program',
      body_weight_lb: 200,
      activity_level: 'muscle_building_emphasis',
      computed_grams: computedGrams,
      status: 'pending_coach_review',
    });
    expect(insertError).toBeNull();

    // Fetch the real id via service role purely so this test can target
    // it for approval/cleanup — the member's own client genuinely cannot
    // read this row back yet, which is the behavior under test.
    const supabase = serviceRoleClient();
    const { data: row } = await supabase
      .from(TABLE)
      .select('id')
      .eq('member_id', TEST_USERS.memberOne.id)
      .eq('body_weight_lb', 200)
      .eq('status', 'pending_coach_review')
      .single();
    const targetId = row!.id;
    createdTargetIds.push(targetId);

    const coachClient = await signInAs(TEST_USERS.coachOne);
    const { data: queue, error: queueError } = await coachClient
      .from(TABLE)
      .select('*')
      .eq('id', targetId);
    expect(queueError).toBeNull();
    expect(queue).toHaveLength(1);
    expect(queue![0].status).toBe('pending_coach_review');
    expect(queue![0].computed_grams).toBe(computedGrams);

    const { error: approveError } = await coachClient
      .from(TABLE)
      .update({
        status: 'active',
        active_grams: computedGrams,
        is_coach_edited: false,
        approved_by: TEST_USERS.coachOne.id,
        approved_at: new Date().toISOString(),
      })
      .eq('id', targetId)
      .eq('status', 'pending_coach_review');
    expect(approveError).toBeNull();

    const { data: memberRead, error: memberReadError } = await memberClient
      .from(TABLE)
      .select('*')
      .eq('id', targetId);
    expect(memberReadError).toBeNull();
    expect(memberRead).toHaveLength(1);
    expect(memberRead![0].status).toBe('active');
    expect(memberRead![0].active_grams).toBe(computedGrams);
    expect(memberRead![0].is_coach_edited).toBe(false);
  });

  it('a coach edit stores a different active_grams than computed_grams, flagged is_coach_edited', async () => {
    await setMembershipTier(TEST_USERS.memberOne.id, 'holistic_reset');
    const memberClient = await signInAs(TEST_USERS.memberOne);
    const computedGrams = computeProteinGrams(150, 'general_wellness');
    const editedGrams = computedGrams + 15;

    await memberClient.from(TABLE).insert({
      member_id: TEST_USERS.memberOne.id,
      track: 'structured_program',
      body_weight_lb: 150,
      activity_level: 'general_wellness',
      computed_grams: computedGrams,
      status: 'pending_coach_review',
    });

    const supabase = serviceRoleClient();
    const { data: row } = await supabase
      .from(TABLE)
      .select('id')
      .eq('member_id', TEST_USERS.memberOne.id)
      .eq('body_weight_lb', 150)
      .eq('status', 'pending_coach_review')
      .single();
    const targetId = row!.id;
    createdTargetIds.push(targetId);

    const coachClient = await signInAs(TEST_USERS.coachOne);
    const { error: approveError } = await coachClient
      .from(TABLE)
      .update({
        status: 'active',
        active_grams: editedGrams,
        is_coach_edited: true,
        approved_by: TEST_USERS.coachOne.id,
        approved_at: new Date().toISOString(),
      })
      .eq('id', targetId)
      .eq('status', 'pending_coach_review');
    expect(approveError).toBeNull();

    const { data: memberRead } = await memberClient.from(TABLE).select('*').eq('id', targetId);
    expect(memberRead![0].active_grams).toBe(editedGrams);
    expect(memberRead![0].active_grams).not.toBe(memberRead![0].computed_grams);
    expect(memberRead![0].is_coach_edited).toBe(true);
  });

  it('a different member can never read memberOne row, active or pending', async () => {
    await setMembershipTier(TEST_USERS.memberOne.id, 'holistic_reset');
    const memberOneClient = await signInAs(TEST_USERS.memberOne);
    const computedGrams = computeProteinGrams(170, 'regular_movement');

    await memberOneClient.from(TABLE).insert({
      member_id: TEST_USERS.memberOne.id,
      track: 'structured_program',
      body_weight_lb: 170,
      activity_level: 'regular_movement',
      computed_grams: computedGrams,
      status: 'pending_coach_review',
    });

    const supabase = serviceRoleClient();
    const { data: row } = await supabase
      .from(TABLE)
      .select('id')
      .eq('member_id', TEST_USERS.memberOne.id)
      .eq('body_weight_lb', 170)
      .single();
    const targetId = row!.id;
    createdTargetIds.push(targetId);

    // Approve it via service role so it's genuinely active, then confirm
    // a different member still can't read it purely by row id.
    await supabase
      .from(TABLE)
      .update({ status: 'active', active_grams: computedGrams })
      .eq('id', targetId);

    const memberTwoClient = await signInAs(TEST_USERS.memberTwo);
    const { data: crossRead } = await memberTwoClient.from(TABLE).select('*').eq('id', targetId);
    expect(crossRead ?? []).toEqual([]);
  });
});

describe('self-guided (non-structured) member: no coach review needed', () => {
  it('member can insert an already-active row for themselves and read it back immediately', async () => {
    // memberTwo has no membership_tier override -> resolves to 'membership' -> self_guided.
    const memberClient = await signInAs(TEST_USERS.memberTwo);
    const computedGrams = computeProteinGrams(140, 'resistance_training_or_fat_loss');

    const { error: insertError } = await memberClient.from(TABLE).insert({
      member_id: TEST_USERS.memberTwo.id,
      track: 'self_guided',
      body_weight_lb: 140,
      activity_level: 'resistance_training_or_fat_loss',
      computed_grams: computedGrams,
      status: 'active',
      active_grams: computedGrams,
    });
    expect(insertError).toBeNull();

    const { data: memberRead } = await memberClient
      .from(TABLE)
      .select('*')
      .eq('member_id', TEST_USERS.memberTwo.id)
      .eq('status', 'active');
    expect(memberRead).toHaveLength(1);
    expect(memberRead![0].active_grams).toBe(computedGrams);
    for (const r of memberRead ?? []) createdTargetIds.push(r.id);
  });

  it('a self-guided member cannot insert an active row with an edited active_grams (no self-editing)', async () => {
    const memberClient = await signInAs(TEST_USERS.memberTwo);
    const computedGrams = computeProteinGrams(140, 'general_wellness');

    const { error } = await memberClient.from(TABLE).insert({
      member_id: TEST_USERS.memberTwo.id,
      track: 'self_guided',
      body_weight_lb: 140,
      activity_level: 'general_wellness',
      computed_grams: computedGrams,
      status: 'active',
      active_grams: computedGrams + 25, // doesn't match computed_grams
    });
    expect(error).not.toBeNull();
  });
});
