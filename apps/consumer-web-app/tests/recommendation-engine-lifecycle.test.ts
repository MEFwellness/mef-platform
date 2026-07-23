/**
 * Unit tests for the Recommendation Engine's read-time staleness
 * derivation (Prompt 11) — pure functions only. Mirrors
 * lifestyle-experiments-lifecycle.test.ts's shape.
 */
import { describe, it, expect } from 'vitest';
import { isRecommendationStale, deriveEffectiveStatus, RECOMMENDATION_STALE_DAYS } from '../lib/recommendation-engine/lifecycle';
import type { MemberRecommendationRow } from '../lib/recommendation-engine/types';

function row(overrides: Partial<MemberRecommendationRow> = {}): Pick<MemberRecommendationRow, 'status' | 'updatedAt'> {
  return {
    status: 'shown',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('isRecommendationStale / deriveEffectiveStatus', () => {
  it('is not stale well within the window', () => {
    const r = row({ updatedAt: '2026-06-01T00:00:00.000Z' });
    expect(isRecommendationStale(r, new Date('2026-06-10T00:00:00.000Z'))).toBe(false);
    expect(deriveEffectiveStatus(r, new Date('2026-06-10T00:00:00.000Z'))).toBe('shown');
  });

  it('becomes stale once past the staleness window', () => {
    const r = row({ updatedAt: '2026-06-01T00:00:00.000Z' });
    const past = new Date(new Date(r.updatedAt).getTime() + (RECOMMENDATION_STALE_DAYS + 1) * 24 * 60 * 60 * 1000);
    expect(isRecommendationStale(r, past)).toBe(true);
    expect(deriveEffectiveStatus(r, past)).toBe('expired');
  });

  it('never applies staleness to a completed or ignored recommendation', () => {
    const completed = row({ status: 'completed', updatedAt: '2000-01-01T00:00:00.000Z' });
    expect(isRecommendationStale(completed, new Date())).toBe(false);
    expect(deriveEffectiveStatus(completed, new Date())).toBe('completed');

    const ignored = row({ status: 'ignored', updatedAt: '2000-01-01T00:00:00.000Z' });
    expect(deriveEffectiveStatus(ignored, new Date())).toBe('ignored');
  });
});
