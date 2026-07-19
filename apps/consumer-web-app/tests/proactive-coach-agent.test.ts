import { describe, it, expect } from 'vitest';
import { proactiveCoachAgent } from '../lib/ai/agents/proactive-coach';
import { agentsRespondingTo, getAgentDefinition } from '../lib/ai/agents/registry';
import {
  hrvDecliningMessage,
  sleepDecliningMessage,
  recoveryExcellentMessage,
  activityDeclinedMessage,
  stressRisingMessage,
  stressEasingMessage,
  wearableConnectedMessage,
} from '../lib/ai/agents/proactiveCoachCopy';
import type { AgentContext } from '../lib/ai/agents/types';
import type { AiEvent, AiEventType } from '@mef/shared-types-contracts';

function fakeEvent(eventType: AiEventType, payload: Record<string, unknown>): AiEvent {
  return {
    id: 'evt-1',
    event_type: eventType,
    member_id: 'member-1',
    source: 'system',
    payload,
    occurred_at: '2026-01-01T00:00:00.000Z',
    processed_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

function fakeContext(eventType: AiEventType, payload: Record<string, unknown>): AgentContext {
  return {
    supabase: {} as AgentContext['supabase'],
    memberId: 'member-1',
    event: fakeEvent(eventType, payload),
    facts: {
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
    },
    ruleMatches: [],
  };
}

describe('proactiveCoachAgent registration', () => {
  it('is registered under the proactive_coach key', () => {
    expect(getAgentDefinition('proactive_coach')).toBe(proactiveCoachAgent);
  });

  it('responds to every wearable-driven event type this milestone defines', () => {
    for (const eventType of [
      'wearable_synced',
      'hrv_declining',
      'sleep_declined',
      'activity_declined',
      'stress_increased',
      'stress_decreased',
      'recovery_excellent',
    ] as const) {
      expect(agentsRespondingTo(eventType)).toContain(proactiveCoachAgent);
    }
  });

  it('does not respond to unrelated event types', () => {
    expect(agentsRespondingTo('member_completed_checkin')).not.toContain(proactiveCoachAgent);
  });
});

describe('proactiveCoachAgent.handle — wearable_synced (first-connect welcome)', () => {
  it('produces a welcome insight/action/notification on a real first sync', async () => {
    const output = await proactiveCoachAgent.handle(
      fakeContext('wearable_synced', { provider: 'oura', isFirstSync: true })
    );
    expect(output).toHaveLength(1);
    const item = output[0]!;
    expect(item.insight?.insightType).toBe('wearable_connected');
    expect(item.notification?.notificationType).toBe('proactive_coach_message');
    expect(item.notification?.title).toBe(wearableConnectedMessage('oura').title);
    expect(item.action?.actionType).toBe('member_encouragement');
  });

  it('produces nothing when isFirstSync is not set — a routine re-sync should stay silent', async () => {
    const output = await proactiveCoachAgent.handle(
      fakeContext('wearable_synced', { provider: 'oura' })
    );
    expect(output).toEqual([]);
  });

  it('produces nothing without a provider in the payload', async () => {
    const output = await proactiveCoachAgent.handle(
      fakeContext('wearable_synced', { isFirstSync: true })
    );
    expect(output).toEqual([]);
  });
});

describe('proactiveCoachAgent.handle — hrv_declining', () => {
  it('always produces the HRV-declining message — no source gate, since only wearables measure HRV', async () => {
    const output = await proactiveCoachAgent.handle(
      fakeContext('hrv_declining', { values: [70, 60, 50] })
    );
    expect(output).toHaveLength(1);
    expect(output[0]!.insight?.title).toBe(hrvDecliningMessage().title);
    expect(output[0]!.action?.actionType).toBe('risk_alert');
    expect(output[0]!.action?.requiresCoachApproval).toBe(false);
  });
});

describe('proactiveCoachAgent.handle — sleep_declined (shared event type, wearable-source gated)', () => {
  it('produces nothing when the event did not originate from wearable data', async () => {
    const output = await proactiveCoachAgent.handle(fakeContext('sleep_declined', {}));
    expect(output).toEqual([]);
  });

  it('produces the sleep-declining message when source is wearable', async () => {
    const output = await proactiveCoachAgent.handle(
      fakeContext('sleep_declined', { source: 'wearable', values: [420, 390, 360] })
    );
    expect(output).toHaveLength(1);
    expect(output[0]!.insight?.title).toBe(sleepDecliningMessage().title);
  });
});

describe('proactiveCoachAgent.handle — activity_declined', () => {
  it('always produces the activity-declined message', async () => {
    const output = await proactiveCoachAgent.handle(
      fakeContext('activity_declined', { values: [8000, 4000, 2000] })
    );
    expect(output).toHaveLength(1);
    expect(output[0]!.insight?.title).toBe(activityDeclinedMessage().title);
  });
});

describe('proactiveCoachAgent.handle — stress_increased / stress_decreased (shared event types, wearable-source gated)', () => {
  it('stress_increased produces nothing without a wearable source', async () => {
    expect(await proactiveCoachAgent.handle(fakeContext('stress_increased', {}))).toEqual([]);
  });

  it('stress_increased produces the "rising" message with a wearable source', async () => {
    const output = await proactiveCoachAgent.handle(
      fakeContext('stress_increased', { source: 'wearable', values: [30, 50, 70] })
    );
    expect(output).toHaveLength(1);
    expect(output[0]!.insight?.title).toBe(stressRisingMessage().title);
    expect(output[0]!.action?.actionType).toBe('educational_recommendation');
  });

  it('stress_decreased produces nothing without a wearable source', async () => {
    expect(await proactiveCoachAgent.handle(fakeContext('stress_decreased', {}))).toEqual([]);
  });

  it('stress_decreased produces the "easing" celebration message with a wearable source', async () => {
    const output = await proactiveCoachAgent.handle(
      fakeContext('stress_decreased', { source: 'wearable', values: [70, 50, 30] })
    );
    expect(output).toHaveLength(1);
    expect(output[0]!.insight?.title).toBe(stressEasingMessage().title);
    expect(output[0]!.action?.actionType).toBe('progress_milestone');
  });
});

describe('proactiveCoachAgent.handle — recovery_excellent', () => {
  it('always produces the excellent-recovery celebration message', async () => {
    const output = await proactiveCoachAgent.handle(
      fakeContext('recovery_excellent', { readinessScore: 92 })
    );
    expect(output).toHaveLength(1);
    expect(output[0]!.insight?.title).toBe(recoveryExcellentMessage().title);
    expect(output[0]!.action?.actionType).toBe('follow_up_recommendation');
  });
});

describe('proactiveCoachAgent.handle — no two conditions share an actionType', () => {
  it("regression guard: every one of the 7 conditions gets its own AiActionType, so the dispatcher's per-(agent, actionType) cooldown can never suppress one condition because another just fired — see the module docblock for why a real first sync can trigger several of these on the same day", async () => {
    const outputs = await Promise.all([
      proactiveCoachAgent.handle(
        fakeContext('wearable_synced', { provider: 'oura', isFirstSync: true })
      ),
      proactiveCoachAgent.handle(fakeContext('hrv_declining', {})),
      proactiveCoachAgent.handle(fakeContext('sleep_declined', { source: 'wearable' })),
      proactiveCoachAgent.handle(fakeContext('activity_declined', {})),
      proactiveCoachAgent.handle(fakeContext('stress_increased', { source: 'wearable' })),
      proactiveCoachAgent.handle(fakeContext('stress_decreased', { source: 'wearable' })),
      proactiveCoachAgent.handle(fakeContext('recovery_excellent', {})),
    ]);

    const actionTypes = outputs.map((output) => output[0]!.action!.actionType);
    expect(actionTypes).toHaveLength(7);
    expect(new Set(actionTypes).size).toBe(7);
  });
});

describe('proactiveCoachAgent.handle — every produced item is fully linked and notification-backed', () => {
  it('every item has an insight, action, and notification all pointing at the same message', async () => {
    const output = await proactiveCoachAgent.handle(fakeContext('recovery_excellent', {}));
    const item = output[0]!;
    expect(item.insight?.description).toBe(item.action?.reason);
    expect(item.notification?.title).toBe(item.insight?.title);
    expect(item.notification?.body).toBe(item.insight?.description);
  });
});
