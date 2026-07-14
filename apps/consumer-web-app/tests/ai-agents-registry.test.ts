import { describe, it, expect } from 'vitest';
import {
  AGENT_DEFINITIONS,
  agentsRespondingTo,
  getAgentDefinition,
} from '../lib/ai/agents/registry';
import { ruleMatchToOutputItem, mergeAgentOutputs } from '../lib/ai/agents/types';
import type { AiRule } from '@mef/shared-types-contracts';
import type { RuleMatch } from '../lib/ai/rules/engine';
import type { RuleFacts } from '../lib/ai/rules/facts';

const EXPECTED_AGENT_KEYS = [
  'member_engagement',
  'wellness_analysis',
  'coach_assistant',
  'education',
  'accountability',
  // AI Body Assessment Framework — deterministic bookkeeping agent added
  // alongside the five foundation agents; see lib/ai/agents/body-assessment.ts.
  'body_assessment',
  // Wearables + Proactive AI Coach — reacts to already-detected wearable
  // patterns; see lib/ai/agents/proactive-coach.ts.
  'proactive_coach',
];

describe('AGENT_DEFINITIONS', () => {
  it('registers exactly the foundation agents plus Body Assessment and Proactive Coach', () => {
    expect(AGENT_DEFINITIONS.map((a) => a.key).sort()).toEqual([...EXPECTED_AGENT_KEYS].sort());
  });

  it('every agent responds to at least one event type', () => {
    for (const agent of AGENT_DEFINITIONS) {
      expect(agent.respondsTo.length).toBeGreaterThan(0);
    }
  });
});

describe('getAgentDefinition', () => {
  it('finds a registered agent by key', () => {
    expect(getAgentDefinition('wellness_analysis')?.key).toBe('wellness_analysis');
  });

  it('returns undefined for an unregistered key', () => {
    expect(getAgentDefinition('nutrition' as never)).toBeUndefined();
  });
});

describe('agentsRespondingTo', () => {
  it('returns every agent whose respondsTo includes this event type — adding a new agent that lists an existing event type requires no dispatcher changes', () => {
    const agents = agentsRespondingTo('member_completed_checkin');
    expect(agents.length).toBeGreaterThan(1);
    expect(agents.every((a) => a.respondsTo.includes('member_completed_checkin'))).toBe(true);
  });

  it('returns an empty list for an event type nothing subscribes to — proves this is a real filter, not "return everything"', () => {
    expect(agentsRespondingTo('nonexistent_event_type' as never)).toEqual([]);
  });
});

function fakeRule(overrides: Partial<AiRule> = {}): AiRule {
  return {
    id: 'r1',
    rule_key: 'fake_rule',
    agent_key: 'wellness_analysis',
    name: 'Fake',
    description: 'Fake rule for a unit test.',
    trigger_event_types: ['member_completed_checkin'],
    conditions: {},
    produces: {},
    priority: 100,
    enabled: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function fakeFacts(): RuleFacts {
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

describe('ruleMatchToOutputItem', () => {
  it("links insight, recommendation, and action from a single rule match — the schema's three-tier chain is only meaningful if these actually correlate", () => {
    const match: RuleMatch = {
      rule: fakeRule(),
      produces: {
        insightType: 'test_insight',
        actionType: 'risk_alert',
        title: 'Title',
        descriptionTemplate: 'desc',
        confidence: 0.9,
        requiresCoachApproval: true,
      },
      description: 'Rendered description',
      facts: fakeFacts(),
    };

    const item = ruleMatchToOutputItem(match);
    expect(item.insight?.title).toBe('Title');
    expect(item.recommendation?.title).toBe('Title');
    expect(item.action?.actionType).toBe('risk_alert');
    expect(item.action?.requiresCoachApproval).toBe(true);
    // High confidence (0.9) should land in the "high" priority bucket.
    expect(item.recommendation?.priority).toBe('high');
  });
});

describe('mergeAgentOutputs', () => {
  it('flattens multiple agent outputs into one list without dropping items', () => {
    const a = [{}];
    const b = [{}, {}];
    expect(mergeAgentOutputs([a, b])).toHaveLength(3);
  });
});
