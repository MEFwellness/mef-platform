import { describe, it, expect } from 'vitest';
import { evaluateCondition, evaluateRules, type RuleCondition } from '../lib/ai/rules/engine';
import type { RuleFacts } from '../lib/ai/rules/facts';
import type { AiRule } from '@mef/shared-types-contracts';

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

function rule(overrides: Partial<AiRule> = {}): AiRule {
  return {
    id: 'rule-1',
    rule_key: 'test_rule',
    agent_key: 'wellness_analysis',
    name: 'Test rule',
    description: 'A rule used only in tests.',
    trigger_event_types: ['member_completed_checkin'],
    conditions: { all: [{ fact: 'stressConsecutiveIncreaseDays', operator: 'gte', value: 3 }] },
    produces: {
      insightType: 'test_insight',
      actionType: 'risk_alert',
      title: 'Test title',
      descriptionTemplate: 'Stress rose for {{stressConsecutiveIncreaseDays}} days.',
      confidence: 0.7,
      requiresCoachApproval: false,
    },
    priority: 100,
    enabled: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('evaluateCondition — leaf conditions', () => {
  it('never matches a null/missing fact, regardless of operator', () => {
    const condition: RuleCondition = { fact: 'wellnessIndexScore', operator: 'gte', value: 0 };
    expect(evaluateCondition(condition, baseFacts({ wellnessIndexScore: null }))).toBe(false);
  });

  it('matches numeric comparisons correctly', () => {
    const facts = baseFacts({ stressConsecutiveIncreaseDays: 3 });
    expect(
      evaluateCondition({ fact: 'stressConsecutiveIncreaseDays', operator: 'gte', value: 3 }, facts)
    ).toBe(true);
    expect(
      evaluateCondition({ fact: 'stressConsecutiveIncreaseDays', operator: 'gt', value: 3 }, facts)
    ).toBe(false);
    expect(
      evaluateCondition({ fact: 'stressConsecutiveIncreaseDays', operator: 'lt', value: 4 }, facts)
    ).toBe(true);
  });

  it('matches string equality for trend facts', () => {
    const facts = baseFacts({ sleepTrend: 'declining' });
    expect(
      evaluateCondition({ fact: 'sleepTrend', operator: 'eq', value: 'declining' }, facts)
    ).toBe(true);
    expect(
      evaluateCondition({ fact: 'sleepTrend', operator: 'eq', value: 'improving' }, facts)
    ).toBe(false);
    expect(
      evaluateCondition({ fact: 'sleepTrend', operator: 'neq', value: 'improving' }, facts)
    ).toBe(true);
  });
});

describe('evaluateCondition — combinators', () => {
  it('all() requires every sub-condition to match', () => {
    const facts = baseFacts({ stressConsecutiveIncreaseDays: 3, sleepTrend: 'declining' });
    const condition: RuleCondition = {
      all: [
        { fact: 'stressConsecutiveIncreaseDays', operator: 'gte', value: 3 },
        { fact: 'sleepTrend', operator: 'eq', value: 'declining' },
      ],
    };
    expect(evaluateCondition(condition, facts)).toBe(true);
    expect(evaluateCondition(condition, baseFacts({ stressConsecutiveIncreaseDays: 3 }))).toBe(
      false
    );
  });

  it('any() requires at least one sub-condition to match', () => {
    const condition: RuleCondition = {
      any: [
        { fact: 'painTrend', operator: 'eq', value: 'improving' },
        { fact: 'movementTrend', operator: 'eq', value: 'improving' },
      ],
    };
    expect(evaluateCondition(condition, baseFacts({ movementTrend: 'improving' }))).toBe(true);
    expect(evaluateCondition(condition, baseFacts())).toBe(false);
  });
});

describe('evaluateRules', () => {
  it('only evaluates rules whose trigger_event_types includes the given event type', () => {
    const rules = [rule({ trigger_event_types: ['reassessment_completed'] })];
    const matches = evaluateRules(
      rules,
      'member_completed_checkin',
      baseFacts({ stressConsecutiveIncreaseDays: 5 })
    );
    expect(matches).toHaveLength(0);
  });

  it('skips disabled rules even when the condition would match', () => {
    const rules = [rule({ enabled: false })];
    const matches = evaluateRules(
      rules,
      'member_completed_checkin',
      baseFacts({ stressConsecutiveIncreaseDays: 5 })
    );
    expect(matches).toHaveLength(0);
  });

  it('renders the description template from the real facts that matched', () => {
    const rules = [rule()];
    const matches = evaluateRules(
      rules,
      'member_completed_checkin',
      baseFacts({ stressConsecutiveIncreaseDays: 4 })
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]!.description).toBe('Stress rose for 4 days.');
  });

  it('sorts matches by rule priority ascending', () => {
    const rules = [
      rule({ rule_key: 'low_priority', priority: 200 }),
      rule({ rule_key: 'high_priority', priority: 10 }),
    ];
    const matches = evaluateRules(
      rules,
      'member_completed_checkin',
      baseFacts({ stressConsecutiveIncreaseDays: 4 })
    );
    expect(matches.map((m) => m.rule.rule_key)).toEqual(['high_priority', 'low_priority']);
  });
});
