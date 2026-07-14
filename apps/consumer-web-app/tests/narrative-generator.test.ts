import { describe, it, expect } from 'vitest';
import {
  deriveStressSleepPattern,
  deriveFromWellnessInsights,
  deriveFromProgressComparison,
  deriveFromSafetyClassification,
  deriveStreakWin,
} from '../lib/narrative/generator';
import { pickCoachingReferenceSentence } from '../lib/narrative/coachingReference';
import type { DailyCheckin, NarrativeItem } from '@mef/shared-types-contracts';
import type { ProgressSummary, ComparisonMetric } from '../lib/onboarding/comparison';

function checkin(overrides: Partial<DailyCheckin> = {}, id = 'c1'): DailyCheckin {
  return {
    id,
    user_id: 'u1',
    timezone: 'America/New_York',
    local_date: '2026-01-01',
    recorded_at: '2026-01-01T08:00:00.000Z',
    checkin_version: 1,
    edited_at: null,
    sleep_observation_period_start: null,
    sleep_observation_period_end: null,
    created_at: '2026-01-01T08:00:00.000Z',
    mood_level: 3,
    sleep_quality: 3,
    sleep_duration: '6-7h',
    energy_level: 3,
    stress_level: 3,
    water_cups: 5,
    digestion_rating: 3,
    pain_discomfort_level: 1,
    movement_today: 'moderate',
    new_or_worsening_concern: false,
    optional_notes: null,
    ...overrides,
  };
}

describe('deriveStressSleepPattern — correlation, not fabrication', () => {
  it('returns null with insufficient data in either bucket', () => {
    const checkins = [
      checkin({ sleep_duration: '<5h', stress_level: 5 }, 'a'),
      checkin({ sleep_duration: '7-8h', stress_level: 2 }, 'b'),
    ];
    expect(deriveStressSleepPattern(checkins)).toBeNull();
  });

  it('returns null when both buckets have similar stress levels (no real pattern)', () => {
    const low = Array.from({ length: 4 }, (_, i) =>
      checkin({ sleep_duration: '<5h', stress_level: 3 }, `low${i}`)
    );
    const adequate = Array.from({ length: 4 }, (_, i) =>
      checkin({ sleep_duration: '7-8h', stress_level: 3 }, `adq${i}`)
    );
    expect(deriveStressSleepPattern([...low, ...adequate])).toBeNull();
  });

  it('emits a correlation-worded (never causal) pattern when low-sleep days show meaningfully higher stress', () => {
    const low = Array.from({ length: 4 }, (_, i) =>
      checkin({ sleep_duration: '5-6h', stress_level: 5 }, `low${i}`)
    );
    const adequate = Array.from({ length: 4 }, (_, i) =>
      checkin({ sleep_duration: '8h+', stress_level: 2 }, `adq${i}`)
    );
    const draft = deriveStressSleepPattern([...low, ...adequate]);
    expect(draft).not.toBeNull();
    expect(draft!.category).toBe('recurring_patterns');
    expect(draft!.provenance).toBe('inferred');
    expect(draft!.summary).not.toMatch(/because|causes|caused by/i);
    expect(draft!.summary).toMatch(/pattern/i);
    expect(draft!.confidence).toBeGreaterThan(0);
    expect(draft!.confidence).toBeLessThanOrEqual(1);
  });
});

describe('deriveFromWellnessInsights — evidence-linked, reuses real trend detection', () => {
  it('returns no drafts with too little history', () => {
    expect(deriveFromWellnessInsights([checkin()])).toEqual([]);
  });

  it('links every draft back to real check-in ids (source_refs)', () => {
    const checkins = [
      checkin({ stress_level: 2 }, 'd1'),
      checkin({ stress_level: 3 }, 'd2'),
      checkin({ stress_level: 4 }, 'd3'),
      checkin({ stress_level: 5 }, 'd4'),
    ];
    const drafts = deriveFromWellnessInsights(checkins);
    for (const draft of drafts) {
      expect(draft.sourceRefs.length).toBeGreaterThan(0);
      expect(draft.provenance).toBe('system_observed');
    }
  });
});

describe('deriveFromProgressComparison — reuses computed summary, never re-derives', () => {
  function metric(overrides: Partial<ComparisonMetric>): ComparisonMetric {
    return {
      key: 'stress',
      label: 'Stress',
      trackedByAssessment: true,
      baseline: { status: 'poor', displayValue: '5/5' },
      latest: { status: 'good', displayValue: '2/5' },
      direction: 'improved',
      ...overrides,
    };
  }

  it('produces a successful_interventions item for the biggest improvement', () => {
    const summary: ProgressSummary = {
      biggestImprovement: metric({}),
      needsAttention: null,
      stableAreas: [],
      suggestedFocusAction: null,
    };
    const drafts = deriveFromProgressComparison(summary, 'baseline-1', 'latest-1');
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.category).toBe('successful_interventions');
    expect(drafts[0]!.sourceRefs).toEqual([
      { type: 'onboarding_submission', id: 'baseline-1' },
      { type: 'onboarding_submission', id: 'latest-1' },
    ]);
  });

  it('produces an unresolved_concerns item for what still needs attention', () => {
    const summary: ProgressSummary = {
      biggestImprovement: null,
      needsAttention: metric({
        key: 'pain',
        label: 'Pain',
        direction: 'declined',
        latest: { status: 'poor', displayValue: 'Severe' },
      }),
      stableAreas: [],
      suggestedFocusAction: null,
    };
    const drafts = deriveFromProgressComparison(summary, null, 'latest-1');
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.category).toBe('unresolved_concerns');
  });

  it('produces nothing when there is no baseline/latest comparison at all', () => {
    const summary: ProgressSummary = {
      biggestImprovement: null,
      needsAttention: null,
      stableAreas: [],
      suggestedFocusAction: null,
    };
    expect(deriveFromProgressComparison(summary, null, null)).toEqual([]);
  });
});

describe('deriveFromSafetyClassification — Milestone 1 compatibility', () => {
  it('produces an active_restrictions item for a coach_review_required classification with restricted topics', () => {
    const draft = deriveFromSafetyClassification({
      id: 'cls-1',
      classification_level: 'coach_review_required',
      restricted_topics: ['medication'],
      created_at: '2026-01-01T00:00:00.000Z',
    });
    expect(draft).not.toBeNull();
    expect(draft!.category).toBe('active_restrictions');
    expect(draft!.sourceRefs).toEqual([{ type: 'safety_classification', id: 'cls-1' }]);
    expect(draft!.title).toContain('medication');
  });

  it('produces nothing for STANDARD_COACHING (no restriction to report)', () => {
    const draft = deriveFromSafetyClassification({
      id: 'cls-2',
      classification_level: 'standard_coaching',
      restricted_topics: [],
      created_at: '2026-01-01T00:00:00.000Z',
    });
    expect(draft).toBeNull();
  });
});

describe('deriveStreakWin', () => {
  it('produces a recent_wins item only on a real milestone', () => {
    expect(deriveStreakWin(7, 'c1')).not.toBeNull();
    expect(deriveStreakWin(5, 'c1')).toBeNull();
  });
});

describe('pickCoachingReferenceSentence — safe, non-invasive selection', () => {
  function narrativeItem(overrides: Partial<NarrativeItem>): NarrativeItem {
    return {
      id: 'n1',
      member_id: 'u1',
      category: 'barriers_to_adherence',
      title: 'Travel disrupts consistency',
      summary:
        'Travel has made consistency harder before, so today’s plan is intentionally lighter.',
      provenance: 'system_observed',
      confidence: 0.7,
      status: 'active',
      is_pinned: false,
      pinned_by: null,
      pinned_at: null,
      coach_protected: false,
      member_visible: true,
      source_refs: [],
      supersedes_id: null,
      superseded_by_id: null,
      created_by_actor_type: 'system',
      created_by_actor_id: null,
      valid_from: '2026-01-01T00:00:00.000Z',
      valid_until: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      ...overrides,
    };
  }

  it('returns null when nothing is relevant', () => {
    expect(pickCoachingReferenceSentence([], 'Stress')).toBeNull();
  });

  it('never surfaces a coach-only (member_visible=false) item', () => {
    const items = [narrativeItem({ member_visible: false, is_pinned: true })];
    expect(pickCoachingReferenceSentence(items, null)).toBeNull();
  });

  it('never surfaces an outdated/resolved item', () => {
    const items = [narrativeItem({ status: 'outdated', is_pinned: true })];
    expect(pickCoachingReferenceSentence(items, null)).toBeNull();
  });

  it('prefers a pinned item over a keyword match', () => {
    const items = [
      narrativeItem({ id: 'a', is_pinned: true, summary: 'Pinned insight.' }),
      narrativeItem({ id: 'b', title: 'Stress pattern', summary: 'Keyword match insight.' }),
    ];
    expect(pickCoachingReferenceSentence(items, 'Stress')).toBe('Pinned insight.');
  });

  it('falls back to a keyword-relevant item when nothing is pinned', () => {
    const items = [
      narrativeItem({ title: 'Stress and sleep pattern', summary: 'Relevant summary.' }),
    ];
    expect(pickCoachingReferenceSentence(items, 'Stress')).toBe('Relevant summary.');
  });
});
