/**
 * Unit tests for Recommendation Learning (Prompt 12, Part 4) — pure
 * functions only: outcomeHistory.ts's summarizers plus classifier.ts's
 * history-aware whyThisWasSelected/adjustedDurationForCategory, and
 * builder.ts's suppression of recommendations with an unresolved negative
 * event. No Supabase client, same convention as
 * tests/recommendation-engine-classifier.test.ts /
 * tests/recommendation-engine-builder.test.ts.
 */
import { describe, it, expect } from 'vitest';
import {
  categoriesWithNegativeHistory,
  hasUnresolvedNegativeEvent,
  summarizeOutcomeHistory,
} from '../lib/recommendation-engine/outcomeHistory';
import { adjustedDurationForCategory, whyThisWasSelected } from '../lib/recommendation-engine/classifier';
import { buildMemberRecommendations } from '../lib/recommendation-engine/builder';
import type { RecommendationEvent } from '../lib/longitudinal-intelligence/data';
import type { Recommendation } from '../lib/intelligence-engine/types';
import type { RootRouterOutcomeView } from '../lib/investigation-engine/routerOutcome';

function event(overrides: Partial<RecommendationEvent> = {}): RecommendationEvent {
  return {
    id: 'evt-1',
    memberId: 'member-1',
    recommendationId: 'rec-1',
    eventType: 'marked_helpful',
    note: null,
    recordedAt: '2026-07-20T00:00:00Z',
    ...overrides,
  };
}

describe('summarizeOutcomeHistory', () => {
  it('counts positive, negative, and stopped-early events per category', () => {
    const events: RecommendationEvent[] = [
      event({ id: '1', recommendationId: 'a', eventType: 'marked_helpful' }),
      event({ id: '2', recommendationId: 'a', eventType: 'reflection_outcome_worked' }),
      event({ id: '3', recommendationId: 'b', eventType: 'marked_not_helpful' }),
      event({ id: '4', recommendationId: 'c', eventType: 'stopped_early' }),
      event({ id: '5', recommendationId: 'c', eventType: 'stopped_early' }),
    ];
    const categoryById = new Map([
      ['a', 'sleep_optimization' as const],
      ['b', 'sleep_optimization' as const],
      ['c', 'movement_focus' as const],
    ]);

    const summary = summarizeOutcomeHistory(events, categoryById);
    expect(summary.get('sleep_optimization')).toEqual({ positiveCount: 2, negativeCount: 1, stoppedEarlyCount: 0 });
    expect(summary.get('movement_focus')).toEqual({ positiveCount: 0, negativeCount: 0, stoppedEarlyCount: 2 });
  });

  it('ignores events whose recommendation id has no known category', () => {
    const summary = summarizeOutcomeHistory([event({ recommendationId: 'unknown' })], new Map());
    expect(summary.size).toBe(0);
  });
});

describe('hasUnresolvedNegativeEvent', () => {
  it('is true when the most recent event for a row is negative', () => {
    const events = [
      event({ id: '2', recommendationId: 'row-1', eventType: 'marked_not_helpful', recordedAt: '2026-07-22' }),
      event({ id: '1', recommendationId: 'row-1', eventType: 'started', recordedAt: '2026-07-10' }),
    ];
    expect(hasUnresolvedNegativeEvent('row-1', events)).toBe(true);
  });

  it('is false when there is no event for that row', () => {
    expect(hasUnresolvedNegativeEvent('row-2', [event({ recommendationId: 'row-1' })])).toBe(false);
  });
});

describe('categoriesWithNegativeHistory', () => {
  it('flags a category whose negative count is at or above its positive count', () => {
    const history = new Map([
      ['sleep_optimization' as const, { positiveCount: 0, negativeCount: 2, stoppedEarlyCount: 0 }],
      ['movement_focus' as const, { positiveCount: 3, negativeCount: 1, stoppedEarlyCount: 0 }],
    ]);
    const flagged = categoriesWithNegativeHistory(history);
    expect(flagged.has('sleep_optimization')).toBe(true);
    expect(flagged.has('movement_focus')).toBe(false);
  });
});

describe('adjustedDurationForCategory', () => {
  it('keeps the base duration with no outcome history', () => {
    expect(adjustedDurationForCategory('movement_focus', undefined)).toBe('daily');
  });

  it('steps a daily category down to weekly after repeated stopped_early with no offsetting positives', () => {
    const result = adjustedDurationForCategory('movement_focus', {
      positiveCount: 0,
      negativeCount: 0,
      stoppedEarlyCount: 2,
    });
    expect(result).toBe('weekly');
  });

  it('does not step down a daily category when positives outweigh stopped-early events', () => {
    const result = adjustedDurationForCategory('movement_focus', {
      positiveCount: 3,
      negativeCount: 0,
      stoppedEarlyCount: 2,
    });
    expect(result).toBe('daily');
  });

  it('never adjusts a non-daily category', () => {
    const result = adjustedDurationForCategory('reflection', {
      positiveCount: 0,
      negativeCount: 0,
      stoppedEarlyCount: 5,
    });
    expect(result).toBe('weekly');
  });
});

describe('whyThisWasSelected — history-aware', () => {
  const rec: Recommendation = {
    domain: 'movement',
    title: 'Add a short walk',
    detail: 'detail',
    priority: 'medium',
    confidence: 0.7,
    evidence: [],
  };

  it('cites real positive history when it exists, over the generic priority phrasing', () => {
    const text = whyThisWasSelected(rec, 'movement_focus', {
      positiveCount: 2,
      negativeCount: 0,
      stoppedEarlyCount: 0,
    });
    expect(text).toMatch(/worked well for you before/i);
  });

  it('cites a lighter-version rationale when stopped-early events dominate', () => {
    const text = whyThisWasSelected(rec, 'movement_focus', {
      positiveCount: 0,
      negativeCount: 0,
      stoppedEarlyCount: 2,
    });
    expect(text).toMatch(/lighter version/i);
  });

  it('falls back to the generic priority phrasing with no history', () => {
    const text = whyThisWasSelected(rec, 'movement_focus');
    expect(text).toMatch(/traces back to/i);
  });

  it('never fabricates history language when history is empty/neutral', () => {
    const text = whyThisWasSelected(rec, 'movement_focus', { positiveCount: 0, negativeCount: 0, stoppedEarlyCount: 0 });
    expect(text).not.toMatch(/worked well for you before/i);
  });
});

describe('buildMemberRecommendations — suppression + outcome history (Part 4)', () => {
  const routerOutcome: RootRouterOutcomeView = {
    outcome: 'lifestyle_experiment',
    memberMessage: 'msg',
    investigation: null,
  };

  function baseInput(overrides: Partial<Recommendation> = {}) {
    const rec: Recommendation = {
      domain: 'movement',
      title: 'Add a short walk',
      detail: 'detail',
      priority: 'high',
      confidence: 0.7,
      evidence: [],
      ...overrides,
    };
    return {
      recommendations: [rec],
      routerOutcome,
      isCoachAttentionPriority: false,
      restrictedTopics: [],
      hasOpenMedicalEvaluationAlert: false,
    };
  }

  it('suppresses a candidate whose recommendation_key is in suppressedRecommendationKeys', () => {
    const input = baseInput();
    const [candidate] = buildMemberRecommendations(input);
    const suppressed = buildMemberRecommendations({
      ...input,
      suppressedRecommendationKeys: new Set([candidate!.recommendationId]),
    });
    expect(suppressed).toHaveLength(0);
  });

  it('does not suppress a differently-titled candidate (fresh evidence produces a fresh key)', () => {
    const input = baseInput();
    const [candidate] = buildMemberRecommendations(input);
    const differentTitle = buildMemberRecommendations({
      ...baseInput({ title: 'A completely different suggestion' }),
      suppressedRecommendationKeys: new Set([candidate!.recommendationId]),
    });
    expect(differentTitle).toHaveLength(1);
  });

  it('passes outcome history through to whyThisWasSelected and recommendedDuration on the built recommendation', () => {
    const input = baseInput();
    const category = buildMemberRecommendations(input)[0]!.category;
    const withHistory = buildMemberRecommendations({
      ...input,
      outcomeHistory: new Map([[category, { positiveCount: 0, negativeCount: 0, stoppedEarlyCount: 3 }]]),
    });
    expect(withHistory[0]!.whyThisWasSelected).toMatch(/lighter version/i);
  });
});
