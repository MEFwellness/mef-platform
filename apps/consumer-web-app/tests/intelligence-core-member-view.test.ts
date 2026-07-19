/**
 * Unit tests for lib/intelligence-core/memberView.ts — pure functions
 * only, no Supabase client. Confirms the member-facing sanitizer strips
 * confidence/evidence/domain codes down to plain statements, applies the
 * minimum-confidence floor, hides non-active/coach-only rows, and caps
 * the count (section "MEMBER EXPERIENCE": "never see technical scoring").
 */
import { describe, it, expect } from 'vitest';
import type { WellnessIdentityObservation } from '@mef/shared-types-contracts';
import { toMemberWellnessHighlights } from '../lib/intelligence-core/memberView';

function observation(
  overrides: Partial<WellnessIdentityObservation> = {}
): WellnessIdentityObservation {
  return {
    id: 'o1',
    member_id: 'u1',
    domain: 'movement_response',
    observation_key: 'movement_response_mood_lift',
    statement: 'Your mood tends to be better on days you move.',
    coach_detail: 'Avg mood on movement days: 4.2/5 vs 3.1/5 on rest days.',
    confidence: 0.75,
    evidence_count: 12,
    trend_direction: 'stable',
    status: 'active',
    evidence_refs: [],
    member_visible: true,
    coach_context: null,
    coach_reviewed_by: null,
    coach_reviewed_at: null,
    supersedes_id: null,
    superseded_by_id: null,
    first_observed_at: '2026-05-01T00:00:00.000Z',
    last_observed_at: '2026-06-01T00:00:00.000Z',
    resolved_at: null,
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('toMemberWellnessHighlights', () => {
  it('returns only id and statement — no confidence, evidence, or domain code', () => {
    const highlights = toMemberWellnessHighlights([observation()]);
    expect(highlights).toEqual([
      { id: 'o1', statement: 'Your mood tends to be better on days you move.' },
    ]);
  });

  it('excludes observations below the member confidence floor', () => {
    expect(toMemberWellnessHighlights([observation({ confidence: 0.4 })])).toEqual([]);
  });

  it('excludes non-active (superseded/resolved) observations', () => {
    expect(toMemberWellnessHighlights([observation({ status: 'superseded' })])).toEqual([]);
    expect(toMemberWellnessHighlights([observation({ status: 'resolved' })])).toEqual([]);
  });

  it('excludes coach-only (member_visible: false) observations, even at high confidence', () => {
    expect(
      toMemberWellnessHighlights([observation({ member_visible: false, confidence: 0.95 })])
    ).toEqual([]);
  });

  it('caps output at 4, highest confidence first', () => {
    const observations = Array.from({ length: 6 }, (_, i) =>
      observation({ id: `o${i}`, confidence: 0.6 + i * 0.05 })
    );
    const highlights = toMemberWellnessHighlights(observations);
    expect(highlights).toHaveLength(4);
    expect(highlights[0]!.id).toBe('o5'); // highest confidence (0.85) first
  });
});
