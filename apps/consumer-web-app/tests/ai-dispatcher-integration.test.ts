/**
 * End-to-end integration test for the AI Coaching Engine dispatch
 * pipeline (lib/ai/events.ts -> lib/ai/dispatcher.ts -> lib/ai/rules ->
 * lib/ai/agents -> lib/ai/data.ts) against real local Supabase, using the
 * same session-scoped client and real RLS policies a triggering server
 * action would use — no mocked Supabase client, per this suite's stated
 * testing philosophy (see tests/setup/test-clients.ts).
 */
import { describe, it, expect, afterAll } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import { emitAndDispatch } from '../lib/ai/events';
import type { RuleFacts } from '../lib/ai/rules/facts';

function baseFacts(overrides: Partial<RuleFacts> = {}): RuleFacts {
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
    ...overrides,
  };
}

afterAll(async () => {
  // ai_events has no member/coach DELETE policy (by design — members and
  // coaches can insert/read, only a platform admin or the service role
  // can delete), so teardown goes through the service role, same pattern
  // tests/checkin.test.ts already uses for its own append-only table.
  const service = serviceRoleClient();
  const memberId = TEST_USERS.memberOne.id;
  for (const table of [
    'ai_actions',
    'ai_recommendations',
    'ai_insights',
    'ai_history',
    'ai_logs',
    'ai_events',
  ]) {
    await service.from(table).delete().eq('member_id', memberId);
  }
});

describe('AI dispatch pipeline (real RLS, real DB)', () => {
  it("a matching rule produces a linked insight -> recommendation -> action chain, persisted under the member's own session", async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const facts = baseFacts({ daysSinceLastCheckin: 5 });

    await emitAndDispatch(
      client,
      {
        eventType: 'member_completed_checkin',
        memberId: TEST_USERS.memberOne.id,
        source: 'member',
        payload: {},
      },
      facts
    );

    const { data: events, error: eventsError } = await client
      .from('ai_events')
      .select('*')
      .eq('member_id', TEST_USERS.memberOne.id)
      .eq('event_type', 'member_completed_checkin')
      .order('created_at', { ascending: false })
      .limit(1);
    expect(eventsError).toBeNull();
    const event = events?.[0];
    expect(event).toBeTruthy();
    expect(event.processed_at).not.toBeNull();

    const { data: insight, error: insightError } = await client
      .from('ai_insights')
      .select('*')
      .eq('source_event_id', event.id)
      .single();
    expect(insightError).toBeNull();
    expect(insight.agent_key).toBe('accountability');
    expect(insight.source_rule_key).toBe('missed_checkins_accountability');
    expect(insight.insight_type).toBe('missed_checkins');
    expect(insight.description).toBe('It has been 5 days since the last check-in.');
    expect(insight.supporting_data.facts.daysSinceLastCheckin).toBe(5);

    const { data: recommendation, error: recError } = await client
      .from('ai_recommendations')
      .select('*')
      .eq('source_insight_id', insight.id)
      .single();
    expect(recError).toBeNull();
    expect(recommendation.agent_key).toBe('accountability');
    // Rule 3's confidence (0.9) crosses the >= 0.85 threshold for "high" priority.
    expect(recommendation.priority).toBe('high');

    const { data: action, error: actionError } = await client
      .from('ai_actions')
      .select('*')
      .eq('source_recommendation_id', recommendation.id)
      .single();
    expect(actionError).toBeNull();
    expect(action.agent_key).toBe('accountability');
    expect(action.action_type).toBe('reminder_recommendation');
    expect(action.requires_coach_approval).toBe(false);
    expect(action.confidence).toBe(0.9);

    const { data: history, error: historyError } = await client
      .from('ai_history')
      .select('*')
      .eq('source_action_id', action.id)
      .single();
    expect(historyError).toBeNull();
    expect(history.memory_type).toBe('recommendation_given');
    expect(history.actor_type).toBe('system');
  });

  it('no matching rule and no custom-logic trigger produces zero insights/recommendations/actions, but still marks the event processed', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const facts = baseFacts(); // every fact null/0 — matches none of the three seeded rules

    await emitAndDispatch(
      client,
      {
        eventType: 'member_completed_checkin',
        memberId: TEST_USERS.memberOne.id,
        source: 'member',
        payload: {},
      },
      facts
    );

    const { data: events } = await client
      .from('ai_events')
      .select('*')
      .eq('member_id', TEST_USERS.memberOne.id)
      .eq('event_type', 'member_completed_checkin')
      .order('created_at', { ascending: false })
      .limit(1);
    const event = events?.[0];
    expect(event).toBeTruthy();
    expect(event.processed_at).not.toBeNull();

    const { data: insights } = await client
      .from('ai_insights')
      .select('id')
      .eq('source_event_id', event.id);
    expect(insights).toEqual([]);
  });
});
