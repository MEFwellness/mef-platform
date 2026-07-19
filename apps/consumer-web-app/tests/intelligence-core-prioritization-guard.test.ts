/**
 * Unit tests for lib/intelligence-core/prioritization.ts and
 * recommendationGuard.ts — pure functions only, no Supabase client.
 * Confirms the "one primary, two secondary, everything else waits" cap
 * (section "COACH PRIORITIZATION") and the "never repeat a recommendation
 * that keeps failing unless there is new evidence" suppression policy
 * (section "PERSONALIZED RECOMMENDATION ENGINE").
 */
import { describe, it, expect } from 'vitest';
import { prioritizeRecommendations } from '../lib/intelligence-core/prioritization';
import {
  guardRecommendations,
  recommendationKeyFor,
  evidenceSignatureFor,
} from '../lib/intelligence-core/recommendationGuard';
import type { Recommendation } from '../lib/intelligence-engine/types';
import type { RecommendationFeedbackState } from '../lib/intelligence-core/types';

function rec(overrides: Partial<Recommendation> = {}): Recommendation {
  return {
    domain: 'movement',
    title: 'Take a short walk',
    detail: 'detail',
    priority: 'medium',
    confidence: 0.6,
    evidence: ['evidence-a'],
    ...overrides,
  };
}

describe('prioritizeRecommendations', () => {
  it('caps output at one primary and at most two secondary, deferring the rest', () => {
    const recs = [
      rec({ title: 'A', priority: 'high', confidence: 0.9 }),
      rec({ title: 'B', priority: 'high', confidence: 0.8 }),
      rec({ title: 'C', priority: 'medium', confidence: 0.7 }),
      rec({ title: 'D', priority: 'medium', confidence: 0.6 }),
      rec({ title: 'E', priority: 'low', confidence: 0.5 }),
    ];
    const result = prioritizeRecommendations(recs);
    expect(result.primary?.title).toBe('A');
    expect(result.secondary.map((s) => s.title)).toEqual(['B', 'C']);
    expect(result.deferredCount).toBe(2);
  });

  it('ranks by priority first, then confidence within the same priority', () => {
    const recs = [
      rec({ title: 'low-conf-high', priority: 'high', confidence: 0.5 }),
      rec({ title: 'hi-conf-high', priority: 'high', confidence: 0.95 }),
    ];
    const result = prioritizeRecommendations(recs);
    expect(result.primary?.title).toBe('hi-conf-high');
  });

  it('returns null primary and empty secondary with no recommendations at all', () => {
    const result = prioritizeRecommendations([]);
    expect(result.primary).toBeNull();
    expect(result.secondary).toEqual([]);
    expect(result.deferredCount).toBe(0);
  });
});

describe('recommendationKeyFor / evidenceSignatureFor', () => {
  it('derives a stable, slugified key from domain + title', () => {
    expect(recommendationKeyFor(rec({ domain: 'sleep', title: 'Wind down earlier!' }))).toBe(
      'sleep:wind_down_earlier'
    );
  });

  it('derives the evidence signature from the joined evidence array', () => {
    expect(evidenceSignatureFor(rec({ evidence: ['a', 'b'] }))).toBe('a|b');
  });
});

describe('guardRecommendations', () => {
  it('surfaces a brand-new recommendation with no prior feedback state', () => {
    const result = guardRecommendations([rec()], []);
    expect(result.surfaced).toHaveLength(1);
    expect(result.feedbackUpdates[0]!.consecutiveNonActions).toBe(0);
    expect(result.feedbackUpdates[0]!.suppressed).toBe(false);
  });

  it('resurfaces immediately when the evidence signature changed, resetting the counter', () => {
    const existing: RecommendationFeedbackState = {
      recommendationKey: recommendationKeyFor(rec()),
      consecutiveNonActions: 5,
      lastOutcome: 'surfaced',
      lastEvidenceSignature: 'old-evidence',
      suppressed: true,
    };
    const result = guardRecommendations([rec({ evidence: ['new-evidence'] })], [existing]);
    expect(result.surfaced).toHaveLength(1);
    expect(result.feedbackUpdates[0]!.consecutiveNonActions).toBe(0);
    expect(result.feedbackUpdates[0]!.suppressed).toBe(false);
  });

  it('still surfaces on the 1st, 2nd, and 3rd unchanged recurrence, but suppresses on the 4th', () => {
    let feedback: RecommendationFeedbackState[] = [];
    const recommendation = rec();

    // Calls 1-3: initial surfacing plus two unchanged recurrences — never suppressed yet.
    for (let i = 0; i < 3; i++) {
      const result = guardRecommendations([recommendation], feedback);
      expect(result.surfaced).toHaveLength(1);
      feedback = [
        {
          recommendationKey: recommendationKeyFor(recommendation),
          consecutiveNonActions: result.feedbackUpdates[0]!.consecutiveNonActions,
          lastOutcome: 'surfaced',
          lastEvidenceSignature: result.feedbackUpdates[0]!.evidenceSignature,
          suppressed: result.feedbackUpdates[0]!.suppressed,
        },
      ];
    }

    const fourthRun = guardRecommendations([recommendation], feedback);
    expect(fourthRun.surfaced).toHaveLength(0);
    expect(fourthRun.feedbackUpdates[0]!.suppressed).toBe(true);
    expect(fourthRun.feedbackUpdates[0]!.suppressedReason).toMatch(/no new evidence/i);
  });
});
