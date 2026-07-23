/**
 * End-to-end tests for Longitudinal Intelligence (Prompt 12) against real
 * local Supabase — real RLS, no mocked client, same philosophy as
 * tests/lifestyle-experiments-integration.test.ts. Exercises
 * lib/longitudinal-intelligence/{data,service}.ts directly.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import {
  computeLongitudinalSignals,
  listMemberPatternStates,
  recordRecommendationEvent,
  listRecommendationEventsForMember,
  upsertMemberPatternState,
} from '../lib/longitudinal-intelligence';

const memberId = TEST_USERS.memberOne.id;

afterAll(async () => {
  const service = serviceRoleClient();
  await service.from('member_pattern_states').delete().eq('member_id', memberId);
  await service.from('member_recommendation_events').delete().eq('member_id', memberId);
});

describe('member_pattern_states — upsert, RLS isolation (migration 93)', () => {
  it('upserts by (member_id, signal_key) — recomputing touches the same row rather than duplicating it', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);
    await upsertMemberPatternState(memberClient, memberId, {
      signalKey: 'registry::stress::elevated_stress',
      signalKind: 'registry_finding',
      signalLabel: 'Elevated stress',
      state: 'one_time_observation',
      tier: 1,
      occurrenceCount: 1,
      confidence: 0.6,
      firstObservedAt: '2026-07-01T00:00:00Z',
      lastObservedAt: '2026-07-01T00:00:00Z',
      evidenceSummary: {},
    });
    await upsertMemberPatternState(memberClient, memberId, {
      signalKey: 'registry::stress::elevated_stress',
      signalKind: 'registry_finding',
      signalLabel: 'Elevated stress',
      state: 'repeated_signal',
      tier: 2,
      occurrenceCount: 2,
      confidence: 0.65,
      firstObservedAt: '2026-07-01T00:00:00Z',
      lastObservedAt: '2026-07-10T00:00:00Z',
      evidenceSummary: {},
    });

    const states = await listMemberPatternStates(memberClient, memberId);
    expect(states.size).toBe(1);
    expect(states.get('registry::stress::elevated_stress')!.state).toBe('repeated_signal');
    expect(states.get('registry::stress::elevated_stress')!.occurrenceCount).toBe(2);
  });

  it('a member cannot read another member’s pattern states, and an assigned coach can', async () => {
    const otherMemberClient = await signInAs(TEST_USERS.memberTwo);
    const asOtherMember = await listMemberPatternStates(otherMemberClient, memberId);
    expect(asOtherMember.size).toBe(0);

    const coachClient = await signInAs(TEST_USERS.coachOne);
    const asCoach = await listMemberPatternStates(coachClient, memberId);
    expect(asCoach.size).toBeGreaterThan(0);
  });
});

describe('computeLongitudinalSignals — end to end', () => {
  it('runs without error for a member with no history and returns an empty-but-valid signal set', async () => {
    const memberClient = await signInAs(TEST_USERS.memberTwo);
    const signals = await computeLongitudinalSignals(memberClient, TEST_USERS.memberTwo.id, '2026-07-23');
    expect(Array.isArray(signals)).toBe(true);
    // Every check-in metric area is always classified, even with zero
    // check-ins (as insufficient_data) — registry findings are only
    // present when real findings exist.
    expect(signals.some((s) => s.signalKind === 'checkin_metric')).toBe(true);
  });
});

describe('member_recommendation_events — append-only, RLS isolation (migration 94)', () => {
  it('records an event and lists it back, most recent first', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);
    const service = serviceRoleClient();

    const { data: rec } = await service
      .from('member_recommendations')
      .insert({
        member_id: memberId,
        recommendation_key: 'test_key_for_events',
        category: 'daily_habit',
        source_domain: 'hydration',
        title: 'Drink water',
        explanation: 'x',
        why_this_was_selected: 'x',
        confidence: 0.6,
        priority: 'medium',
        recommended_duration: 'daily',
      })
      .select('id')
      .single();

    await recordRecommendationEvent(memberClient, memberId, rec!.id, 'started');
    await recordRecommendationEvent(memberClient, memberId, rec!.id, 'stopped_early', 'too busy');

    const events = await listRecommendationEventsForMember(memberClient, memberId);
    const forThisRec = events.filter((e) => e.recommendationId === rec!.id);
    expect(forThisRec).toHaveLength(2);
    expect(forThisRec[0]!.eventType).toBe('stopped_early');
    expect(forThisRec[0]!.note).toBe('too busy');

    await service.from('member_recommendations').delete().eq('id', rec!.id);
  });

  it('a member cannot read another member’s recommendation events', async () => {
    const otherMemberClient = await signInAs(TEST_USERS.memberTwo);
    const asOtherMember = await listRecommendationEventsForMember(otherMemberClient, memberId);
    expect(asOtherMember.every((e) => e.memberId !== memberId)).toBe(true);
  });
});
