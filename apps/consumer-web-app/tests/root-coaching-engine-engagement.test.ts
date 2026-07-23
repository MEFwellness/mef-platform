/**
 * Unit tests for Member Personality / engagement adaptation (Prompt 13) —
 * pure functions only, over already-fetched recommendation rows, recorded
 * events, and lifestyle experiments. No new query or confidence math.
 */
import { describe, it, expect } from 'vitest';
import { buildMemberEngagementProfile } from '../lib/root-coaching-engine/engagement';
import type { MemberRecommendationRow } from '../lib/recommendation-engine';
import type { RecommendationEvent } from '../lib/longitudinal-intelligence';
import type { LifestyleExperiment } from '../lib/lifestyle-experiments';

const ASOF = new Date('2026-07-23T00:00:00Z');

function recRow(overrides: Partial<MemberRecommendationRow> = {}): MemberRecommendationRow {
  return {
    id: 'r1',
    memberId: 'm1',
    recommendationId: 'key1',
    category: 'daily_habit',
    sourceDomain: 'hydration' as never,
    title: 'x',
    explanation: 'x',
    whyThisWasSelected: 'x',
    supportingFindings: [],
    confidence: 0.6,
    priority: 'medium',
    recommendedDuration: 'daily',
    reassessmentTrigger: null,
    completionTracking: true,
    status: 'completed',
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
    completedAt: '2026-07-02T00:00:00Z',
    ignoredAt: null,
    ignoredReason: null,
    ...overrides,
  };
}

function experiment(overrides: Partial<LifestyleExperiment> = {}): LifestyleExperiment {
  return {
    id: 'e1',
    memberId: 'm1',
    recommendationId: null,
    title: 'x',
    protocol: 'x',
    startDate: '2026-07-01',
    durationDays: 7,
    status: 'completed',
    reflectionText: 'x',
    outcome: 'worked',
    closedAt: '2026-07-08T00:00:00Z',
    createdAt: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

describe('buildMemberEngagementProfile — consistency level', () => {
  it('stays "mixed" with a thin sample rather than over-reading it', () => {
    const profile = buildMemberEngagementProfile({
      recommendationRows: [recRow({ status: 'completed' })],
      events: [],
      experiments: [],
      asOfDate: ASOF,
    });
    expect(profile.consistencyLevel).toBe('mixed');
  });

  it('reads "high" when most resolved recommendations/experiments were completed', () => {
    const profile = buildMemberEngagementProfile({
      recommendationRows: [
        recRow({ id: 'r1', status: 'completed' }),
        recRow({ id: 'r2', status: 'completed' }),
        recRow({ id: 'r3', status: 'completed' }),
        recRow({ id: 'r4', status: 'ignored', ignoredAt: '2026-07-05T00:00:00Z' }),
      ],
      events: [],
      experiments: [],
      asOfDate: ASOF,
    });
    expect(profile.consistencyLevel).toBe('high');
  });

  it('reads "low" when most resolved items were ignored/abandoned, without shaming language anywhere in the profile itself', () => {
    const profile = buildMemberEngagementProfile({
      recommendationRows: [
        recRow({ id: 'r1', status: 'ignored', ignoredAt: '2026-07-05T00:00:00Z' }),
        recRow({ id: 'r2', status: 'ignored', ignoredAt: '2026-07-06T00:00:00Z' }),
        recRow({ id: 'r3', status: 'ignored', ignoredAt: '2026-07-07T00:00:00Z' }),
        recRow({ id: 'r4', status: 'completed' }),
      ],
      events: [],
      experiments: [],
      asOfDate: ASOF,
    });
    expect(profile.consistencyLevel).toBe('low');
  });
});

describe('buildMemberEngagementProfile — unfinished experiment pattern', () => {
  it('flags a member who starts experiments but never finishes one', () => {
    const profile = buildMemberEngagementProfile({
      recommendationRows: [],
      events: [],
      experiments: [
        experiment({ id: 'e1', status: 'abandoned', outcome: null }),
        experiment({ id: 'e2', status: 'active', startDate: '2026-05-01', durationDays: 7, outcome: null }), // expired_no_reflection at asOfDate
      ],
      asOfDate: ASOF,
    });
    expect(profile.hasUnfinishedExperimentPattern).toBe(true);
  });

  it('does not flag a member who has completed at least one experiment', () => {
    const profile = buildMemberEngagementProfile({
      recommendationRows: [],
      events: [],
      experiments: [experiment({ id: 'e1', status: 'completed' }), experiment({ id: 'e2', status: 'abandoned' })],
      asOfDate: ASOF,
    });
    expect(profile.hasUnfinishedExperimentPattern).toBe(false);
  });
});

describe('buildMemberEngagementProfile — deprioritized topic words', () => {
  it('derives a deprioritized domain word from repeated negative history in that category', () => {
    const events: RecommendationEvent[] = [
      { id: 'ev1', memberId: 'm1', recommendationId: 'r1', eventType: 'marked_not_helpful', note: null, recordedAt: '2026-07-05T00:00:00Z' },
      { id: 'ev2', memberId: 'm1', recommendationId: 'r2', eventType: 'dismissed', note: null, recordedAt: '2026-07-06T00:00:00Z' },
    ];
    const profile = buildMemberEngagementProfile({
      recommendationRows: [
        recRow({ id: 'r1', category: 'sleep_optimization' }),
        recRow({ id: 'r2', category: 'sleep_optimization' }),
      ],
      events,
      experiments: [],
      asOfDate: ASOF,
    });
    expect(profile.deprioritizedTopicWords.has('sleep')).toBe(true);
  });
});
