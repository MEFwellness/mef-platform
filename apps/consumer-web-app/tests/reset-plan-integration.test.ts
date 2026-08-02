/**
 * Personal Reset Plan — real RLS, real DB, real constraints. Covers the
 * guard tests the build brief explicitly calls for: the daily-log
 * one-state-per-day constraint, the one-current-plan rule, the
 * coaching-style direct-vs-inferred precedence guard, and RLS (member
 * reads/writes her own, coach of record reads, an unassigned coach or a
 * different member cannot). Same real-RLS-real-RPC philosophy as
 * tests/driver-probe-admin-integration.test.ts — no mocked Supabase
 * client.
 */
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { serviceRoleClient, signInAs, TEST_USERS } from './setup/test-clients';

const createdPlanIds: string[] = [];

// Every test in this file that creates a "current" (draft/active) plan for
// memberOne/memberTwo must not leave one behind for the next test — the
// real partial unique index this suite is proving (member_reset_plans_one_current)
// would otherwise reject the next test's own insert as a genuine duplicate,
// which is a real cross-test collision, not a false guard failure.
afterEach(async () => {
  const service = serviceRoleClient();
  await service.from('member_reset_plans').delete().in('member_id', [TEST_USERS.memberOne.id, TEST_USERS.memberTwo.id]);
});

afterAll(async () => {
  const service = serviceRoleClient();
  if (createdPlanIds.length > 0) {
    await service.from('member_reset_plans').delete().in('id', createdPlanIds);
  }
  // Restore memberOne's coaching-style profile to a clean, non-'direct' state so this suite doesn't leak into any other test's expectations of that row.
  await service
    .from('wellness_coaching_style_profile')
    .update({ tone_preference: 'unclear', tone_preference_source: 'inferred', confidence: 0, evidence_count: 0 })
    .eq('member_id', TEST_USERS.memberOne.id);
});

describe('member_reset_plans — one current plan per member (real unique index)', () => {
  it('a second draft/active plan for the same member is refused at the database level', async () => {
    const member = await signInAs(TEST_USERS.memberOne);

    const { data: first, error: firstError } = await member
      .from('member_reset_plans')
      .insert({ member_id: TEST_USERS.memberOne.id, status: 'draft', current_screen: 'intro' })
      .select('id')
      .single();
    expect(firstError).toBeNull();
    expect(first).not.toBeNull();
    if (first) createdPlanIds.push(first.id as string);

    // Non-vacuous: without member_reset_plans_one_current (the partial
    // unique index on (member_id) where status in ('draft','active')),
    // this second insert would succeed and this assertion would fail —
    // confirmed manually by temporarily dropping the index locally,
    // rerunning this test (it failed, a second row was created), and
    // restoring it via `supabase db reset`.
    const { data: second, error: secondError } = await member
      .from('member_reset_plans')
      .insert({ member_id: TEST_USERS.memberOne.id, status: 'draft', current_screen: 'intro' })
      .select('id')
      .single();

    expect(second).toBeNull();
    expect(secondError).not.toBeNull();
    expect(secondError?.code).toBe('23505');
  });
});

describe('member_reset_plan_daily_logs — one final state per member/plan/local day (real unique constraint)', () => {
  it('a second row for the same (plan_id, local_date) is refused; a correction must go through upsert instead', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    const memberId = TEST_USERS.memberOne.id;

    const { data: plan } = await member
      .from('member_reset_plans')
      .insert({ member_id: memberId, status: 'active', current_screen: 'done', focus_signal: 'energy', action_tier: 'ready_now', start_local_date: '2026-01-01' })
      .select('id')
      .single();
    expect(plan).not.toBeNull();
    if (plan) createdPlanIds.push(plan.id as string);
    const planId = plan!.id as string;

    const { data: version } = await member
      .from('member_reset_plan_versions')
      .insert({ plan_id: planId, member_id: memberId, change_type: 'created', changed_by: memberId })
      .select('id')
      .single();
    expect(version).not.toBeNull();
    const versionId = version!.id as string;

    const localDate = '2026-01-03';

    const { error: firstError } = await member
      .from('member_reset_plan_daily_logs')
      .insert({ plan_id: planId, plan_version_id: versionId, member_id: memberId, local_date: localDate, state: 'completed_normal' });
    expect(firstError).toBeNull();

    // Non-vacuous: without unique (plan_id, local_date), this raw second
    // insert would succeed, leaving two rows for the same day — confirmed
    // manually by temporarily dropping the constraint locally, rerunning
    // (it failed, a duplicate row existed), and restoring via
    // `supabase db reset`.
    const { error: duplicateError } = await member
      .from('member_reset_plan_daily_logs')
      .insert({ plan_id: planId, plan_version_id: versionId, member_id: memberId, local_date: localDate, state: 'not_today' });
    expect(duplicateError).not.toBeNull();
    expect(duplicateError?.code).toBe('23505');

    // The real correction path: upsert on the same conflict target updates the existing row rather than inserting a duplicate.
    const { error: upsertError } = await member
      .from('member_reset_plan_daily_logs')
      .upsert(
        { plan_id: planId, plan_version_id: versionId, member_id: memberId, local_date: localDate, state: 'completed_difficult' },
        { onConflict: 'plan_id,local_date' }
      );
    expect(upsertError).toBeNull();

    const { data: rows } = await member.from('member_reset_plan_daily_logs').select('state').eq('plan_id', planId).eq('local_date', localDate);
    expect(rows).toHaveLength(1);
    expect(rows?.[0]?.state).toBe('completed_difficult');
  });
});

describe('wellness_coaching_style_profile — direct statements survive the background recompute', () => {
  it('an inferred call never overwrites a direct row; a new direct call still can', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    // wellness_coaching_style_profile deliberately has no member SELECT
    // policy (confidence/rationale are coach-internal working data, see
    // tests/intelligence-core-integration.test.ts) — reading the row back
    // to verify this guard goes through coach.one, who is actively
    // assigned to member.one in seed data and has a real coach_read_assigned
    // policy grant, the same reuse pattern the app itself would use.
    const coach = await signInAs(TEST_USERS.coachOne);

    const { error: directError } = await member.rpc('upsert_wellness_coaching_style_profile', {
      p_member: TEST_USERS.memberOne.id,
      p_tone_preference: 'direct',
      p_detail_preference: 'unclear',
      p_task_load_preference: 'unclear',
      p_time_commitment_sweet_spot_minutes: null,
      p_confidence: 0.9,
      p_evidence_count: 1,
      p_rationale: 'Test: direct statement.',
      p_source: 'direct',
    });
    expect(directError).toBeNull();

    let { data: profile } = await coach.from('wellness_coaching_style_profile').select('tone_preference, tone_preference_source').eq('member_id', TEST_USERS.memberOne.id).single();
    expect(profile?.tone_preference).toBe('direct');
    expect(profile?.tone_preference_source).toBe('direct');

    // Non-vacuous: this simulates exactly what
    // lib/intelligence-core/service.ts's recalculateIntelligenceCore does
    // on every check-in/conversation/etc — an ordinary background
    // recompute call with source defaulting to 'inferred'. Confirmed
    // manually by temporarily reverting the RPC's CASE guard to an
    // unconditional overwrite (migration 142's old, unguarded shape),
    // rerunning this test locally (it failed: tone_preference flipped to
    // 'encouragement'), and restoring the guard via `supabase db reset`.
    const { error: inferredError } = await member.rpc('upsert_wellness_coaching_style_profile', {
      p_member: TEST_USERS.memberOne.id,
      p_tone_preference: 'encouragement',
      p_detail_preference: 'unclear',
      p_task_load_preference: 'unclear',
      p_time_commitment_sweet_spot_minutes: null,
      p_confidence: 0.5,
      p_evidence_count: 5,
      p_rationale: 'Test: background recompute.',
      p_source: 'inferred',
    });
    expect(inferredError).toBeNull();

    ({ data: profile } = await coach.from('wellness_coaching_style_profile').select('tone_preference, tone_preference_source').eq('member_id', TEST_USERS.memberOne.id).single());
    expect(profile?.tone_preference).toBe('direct');
    expect(profile?.tone_preference_source).toBe('direct');

    // A new, explicit direct statement can still override an existing direct row.
    const { error: secondDirectError } = await member.rpc('upsert_wellness_coaching_style_profile', {
      p_member: TEST_USERS.memberOne.id,
      p_tone_preference: 'autonomous',
      p_detail_preference: 'unclear',
      p_task_load_preference: 'unclear',
      p_time_commitment_sweet_spot_minutes: null,
      p_confidence: 0.9,
      p_evidence_count: 2,
      p_rationale: 'Test: a later, different direct statement.',
      p_source: 'direct',
    });
    expect(secondDirectError).toBeNull();

    ({ data: profile } = await coach.from('wellness_coaching_style_profile').select('tone_preference, tone_preference_source').eq('member_id', TEST_USERS.memberOne.id).single());
    expect(profile?.tone_preference).toBe('autonomous');
    expect(profile?.tone_preference_source).toBe('direct');
  });
});

describe('RLS — member reads/writes her own plan, coach of record reads, nobody else can', () => {
  it('a different member cannot read, an unassigned coach cannot read, the assigned coach can', async () => {
    const memberOne = await signInAs(TEST_USERS.memberOne);
    const memberTwo = await signInAs(TEST_USERS.memberTwo);
    const coachOne = await signInAs(TEST_USERS.coachOne);

    const { data: plan } = await memberOne
      .from('member_reset_plans')
      .insert({ member_id: TEST_USERS.memberOne.id, status: 'draft', current_screen: 'intro' })
      .select('id')
      .single();
    expect(plan).not.toBeNull();
    if (plan) createdPlanIds.push(plan.id as string);
    const planId = plan!.id as string;

    // memberTwo has no RLS grant on memberOne's row — the row simply
    // doesn't appear (RLS filters, it does not error).
    const { data: asMemberTwo } = await memberTwo.from('member_reset_plans').select('id').eq('id', planId);
    expect(asMemberTwo ?? []).toHaveLength(0);

    // coach.one is actively assigned to member.one (seed data) — coach_read_assigned_member_reset_plans should let this through.
    const { data: asCoachOne } = await coachOne.from('member_reset_plans').select('id').eq('id', planId);
    expect(asCoachOne ?? []).toHaveLength(1);

    // coach.one's assignment to member.two was revoked in seed data — an unassigned coach reading a different member's plan should see nothing.
    const { data: memberTwoPlan } = await memberTwo
      .from('member_reset_plans')
      .insert({ member_id: TEST_USERS.memberTwo.id, status: 'draft', current_screen: 'intro' })
      .select('id')
      .single();
    if (memberTwoPlan) createdPlanIds.push(memberTwoPlan.id as string);
    const { data: coachOnUnassigned } = await coachOne.from('member_reset_plans').select('id').eq('id', memberTwoPlan!.id as string);
    expect(coachOnUnassigned ?? []).toHaveLength(0);
  });
});
