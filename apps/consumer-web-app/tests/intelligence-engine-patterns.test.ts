/**
 * Unit tests for lib/intelligence-engine/patterns.ts — pure functions
 * only, no Supabase client. Confirms existing Personal Wellness
 * Intelligence Engine pattern-shaped insights are re-shaped (never
 * re-derived), and that the two genuinely new detectors (burnout signal,
 * plateau) fire only under real, deterministic conditions.
 */
import { describe, it, expect } from 'vitest';
import type { WellnessInsight } from '@mef/shared-types-contracts';
import { buildPatternInsights } from '../lib/intelligence-engine/patterns';
import type { LongitudinalTrend, MemberHealthProfile } from '../lib/intelligence-engine/types';
import type { CoachingFocusDecision } from '../lib/brain/types';
import type { StreakInsight } from '../lib/feed/streakIntelligence';
import type { AdherenceInfo } from '../lib/feed/adaptiveDifficulty';

function decision(overrides: Partial<CoachingFocusDecision> = {}): CoachingFocusDecision {
  return {
    localDate: '2026-06-30',
    focus: 'sleep',
    focusLabel: 'Sleep',
    reason: 'recent_checkins',
    reasonText: 'Sleep has been inconsistent.',
    mode: 'encourage',
    challengeLevel: 'standard',
    riskLevel: 'none',
    isCelebration: false,
    encouragement: 'Small steps still count.',
    coachInsight: null,
    wearableBrief: null,
    wearableSnapshot: null,
    generatedAt: '2026-06-30T08:00:00.000Z',
    ...overrides,
  };
}

function streak(overrides: Partial<StreakInsight> = {}): StreakInsight {
  return {
    currentStreak: 0,
    longestStreak: 0,
    daysSinceLastCheckin: 0,
    checkedInToday: true,
    justRecovered: false,
    isLongestInWindow: false,
    ...overrides,
  };
}

function adherence(overrides: Partial<AdherenceInfo> = {}): AdherenceInfo {
  return { level: 'typical', rate: null, sampleSize: 0, ...overrides };
}

function profile(overrides: Partial<MemberHealthProfile> = {}): MemberHealthProfile {
  return {
    memberId: 'u1',
    localDate: '2026-06-30',
    checkinsOldestFirst: [],
    baseline: null,
    latestReassessment: null,
    comparison: [],
    progressSummary: {
      biggestImprovement: null,
      needsAttention: null,
      stableAreas: [],
      suggestedFocusAction: null,
    },
    narrativeItems: [],
    wellnessInsights: [],
    feedHistoryPairs: [],
    brainDecision: decision(),
    streak: streak(),
    adherence: adherence(),
    restrictedTopics: [],
    openSafetyReviewCount: 0,
    coachNotesCount: 0,
    daysSinceLastReassessmentOrBaseline: null,
    registryEntries: [],
    ...overrides,
  };
}

function wellnessInsight(overrides: Partial<WellnessInsight> = {}): WellnessInsight {
  return {
    id: 'i1',
    member_id: 'u1',
    insight_type: 'pattern',
    wellness_area: 'stress',
    trend_state: null,
    trend_strength: null,
    pattern_key: 'disruption_recovery',
    title: 'Bounces back after a rough day',
    member_summary: 'You tend to recover quickly after a tough day.',
    coach_detail: 'detail',
    confidence: 0.7,
    severity: 'info',
    time_window: 'last_30_days',
    evidence_refs: [],
    reasoning_codes: [],
    recommended_coaching_response: null,
    recommended_coach_action: null,
    safety_classification_level: 'standard_coaching',
    safety_classification_id: null,
    status: 'active',
    is_pinned: false,
    pinned_by: null,
    pinned_at: null,
    coach_context: null,
    coach_reviewed_by: null,
    coach_reviewed_at: null,
    member_visible: true,
    supersedes_id: null,
    superseded_by_id: null,
    last_confirmed_at: null,
    expires_at: null,
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function trend(overrides: Partial<LongitudinalTrend> = {}): LongitudinalTrend {
  return {
    area: 'stress',
    direction: 'stable',
    confidence: 0.6,
    points: [
      { window: 'last_7_days', averageScore: 70, sampleSize: 7, status: 'good' },
      { window: 'last_14_days', averageScore: 70, sampleSize: 14, status: 'good' },
      { window: 'last_30_days', averageScore: 70, sampleSize: 30, status: 'good' },
      { window: 'last_90_days', averageScore: 70, sampleSize: 90, status: 'good' },
      { window: 'since_baseline', averageScore: null, sampleSize: 0, status: null },
      { window: 'since_reassessment', averageScore: null, sampleSize: 0, status: null },
    ],
    evidenceRefs: [],
    trendState: 'stable',
    trendStrength: 'mild',
    ...overrides,
  };
}

describe('buildPatternInsights — existing pattern pass-through', () => {
  it('re-shapes a pattern-type wellness_insight rather than re-deriving it', () => {
    const p = profile({
      wellnessInsights: [wellnessInsight({ pattern_key: 'disruption_recovery' })],
    });
    const patterns = buildPatternInsights(p, []);
    const match = patterns.find((x) => x.key === 'disruption_recovery');

    expect(match).toBeDefined();
    expect(match!.kind).toBe('recovery_after_setback');
    expect(match!.sourceInsightId).toBe('i1');
  });

  it('includes since_baseline_* rows even though their insight_type is "trend"', () => {
    const p = profile({
      wellnessInsights: [
        wellnessInsight({
          id: 'i2',
          insight_type: 'trend',
          pattern_key: 'since_baseline_sleep',
          time_window: 'since_baseline',
        }),
      ],
    });
    const patterns = buildPatternInsights(p, []);
    const match = patterns.find((x) => x.key === 'since_baseline_sleep');

    expect(match).toBeDefined();
    expect(match!.kind).toBe('post_reassessment_change');
  });

  it('excludes strength-type and unrelated trend-type insights', () => {
    const p = profile({
      wellnessInsights: [
        wellnessInsight({
          id: 'i3',
          insight_type: 'strength',
          pattern_key: 'strongest_area_sleep',
        }),
        wellnessInsight({ id: 'i4', insight_type: 'trend', pattern_key: 'trend_sleep' }),
      ],
    });
    const patterns = buildPatternInsights(p, []);
    expect(patterns.find((x) => x.key === 'strongest_area_sleep')).toBeUndefined();
    expect(patterns.find((x) => x.key === 'trend_sleep')).toBeUndefined();
  });
});

describe('buildPatternInsights — burnout signal (new detector)', () => {
  it('fires when at least two burnout-relevant areas are concurrently declining', () => {
    const trends = [
      trend({ area: 'stress', direction: 'declining', confidence: 0.7 }),
      trend({ area: 'energy', direction: 'declining', confidence: 0.6 }),
    ];
    const patterns = buildPatternInsights(profile(), trends);
    const burnout = patterns.find((p) => p.kind === 'burnout_signal');

    expect(burnout).toBeDefined();
    expect(burnout!.confidence).toBeGreaterThan(0);
    expect(burnout!.confidence).toBeLessThanOrEqual(0.85);
  });

  it('does not fire from a single declining area with normal adherence', () => {
    const trends = [trend({ area: 'stress', direction: 'declining', confidence: 0.7 })];
    const patterns = buildPatternInsights(profile(), trends);
    expect(patterns.find((p) => p.kind === 'burnout_signal')).toBeUndefined();
  });

  it('fires when adherence has dropped and check-ins have gone quiet, even with only one declining area', () => {
    const p = profile({
      adherence: adherence({ level: 'low', sampleSize: 6, rate: 0.2 }),
      streak: streak({ daysSinceLastCheckin: 5 }),
    });
    const trends = [trend({ area: 'mood', direction: 'declining', confidence: 0.5 })];
    const patterns = buildPatternInsights(p, trends);
    expect(patterns.find((pattern) => pattern.kind === 'burnout_signal')).toBeDefined();
  });
});

describe('buildPatternInsights — plateau (new detector)', () => {
  it('flags an area that is stable but stuck in attention/poor at both 30 and 90 days', () => {
    const trends = [
      trend({
        area: 'digestion',
        direction: 'stable',
        points: [
          { window: 'last_7_days', averageScore: 60, sampleSize: 7, status: 'attention' },
          { window: 'last_14_days', averageScore: 60, sampleSize: 14, status: 'attention' },
          { window: 'last_30_days', averageScore: 60, sampleSize: 30, status: 'attention' },
          { window: 'last_90_days', averageScore: 60, sampleSize: 90, status: 'attention' },
          { window: 'since_baseline', averageScore: null, sampleSize: 0, status: null },
          { window: 'since_reassessment', averageScore: null, sampleSize: 0, status: null },
        ],
      }),
    ];
    const patterns = buildPatternInsights(profile(), trends);
    const plateau = patterns.find((p) => p.kind === 'plateau');
    expect(plateau).toBeDefined();
    expect(plateau!.key).toBe('plateau_digestion');
  });

  it('does not flag a stable area that is already in the good band', () => {
    const trends = [trend({ area: 'digestion', direction: 'stable' })]; // default fixture points are all 'good'
    const patterns = buildPatternInsights(profile(), trends);
    expect(patterns.find((p) => p.kind === 'plateau')).toBeUndefined();
  });

  it('does not flag an area that is actively declining (not stable)', () => {
    const trends = [
      trend({
        area: 'pain',
        direction: 'declining',
        points: [
          { window: 'last_7_days', averageScore: 40, sampleSize: 7, status: 'poor' },
          { window: 'last_14_days', averageScore: 40, sampleSize: 14, status: 'poor' },
          { window: 'last_30_days', averageScore: 40, sampleSize: 30, status: 'poor' },
          { window: 'last_90_days', averageScore: 40, sampleSize: 90, status: 'poor' },
          { window: 'since_baseline', averageScore: null, sampleSize: 0, status: null },
          { window: 'since_reassessment', averageScore: null, sampleSize: 0, status: null },
        ],
      }),
    ];
    const patterns = buildPatternInsights(profile(), trends);
    expect(patterns.find((p) => p.kind === 'plateau')).toBeUndefined();
  });
});
