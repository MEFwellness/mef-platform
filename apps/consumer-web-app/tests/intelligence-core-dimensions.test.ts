/**
 * Unit tests for lib/intelligence-core/dimensions.ts — pure functions
 * only, no Supabase client. Confirms each dimension reads
 * LongitudinalTrend/StreakInsight/AdherenceInfo/MemberSummary data the
 * Intelligence Engine already computed rather than re-deriving anything,
 * falls back to 'insufficient_data' below the sample-size gate, and that
 * the coaching-style dimension is a rollup of confidence, not "goodness."
 */
import { describe, it, expect } from 'vitest';
import {
  computeAllProfileDimensions,
  computeCoachingStyleDimension,
} from '../lib/intelligence-core/dimensions';
import type {
  LongitudinalTrend,
  MemberHealthProfile,
  MemberIntelligenceReport,
} from '../lib/intelligence-engine/types';
import type { CoachingStyleComputation } from '../lib/intelligence-core/types';

const AS_OF = '2026-06-30';

function trend(
  area: LongitudinalTrend['area'],
  overrides: Partial<LongitudinalTrend> = {}
): LongitudinalTrend {
  return {
    area,
    direction: 'stable',
    confidence: 0.7,
    points: [
      { window: 'last_30_days', averageScore: 80, sampleSize: 15, status: 'good' },
      { window: 'last_14_days', averageScore: 80, sampleSize: 8, status: 'good' },
      { window: 'last_7_days', averageScore: 80, sampleSize: 5, status: 'good' },
    ],
    evidenceRefs: [],
    trendState: 'stable',
    trendStrength: 'mild',
    ...overrides,
  };
}

function profile(overrides: Partial<MemberHealthProfile> = {}): MemberHealthProfile {
  return {
    memberId: 'u1',
    localDate: AS_OF,
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
    brainDecision: {
      localDate: AS_OF,
      focus: 'sleep',
      focusLabel: 'Sleep',
      reason: 'recent_checkins',
      reasonText: 'reason',
      mode: 'encourage',
      challengeLevel: 'standard',
      riskLevel: 'none',
      isCelebration: false,
      encouragement: 'x',
      coachInsight: null,
      wearableBrief: null,
      wearableSnapshot: null,
      generatedAt: '2026-06-30T00:00:00.000Z',
    },
    streak: {
      currentStreak: 5,
      longestStreak: 10,
      daysSinceLastCheckin: 0,
      checkedInToday: true,
      justRecovered: false,
      isLongestInWindow: false,
    },
    adherence: { level: 'typical', rate: 0.7, sampleSize: 10 },
    restrictedTopics: [],
    openSafetyReviewCount: 0,
    coachNotesCount: 0,
    daysSinceLastReassessmentOrBaseline: null,
    registryEntries: [],
    ...overrides,
  };
}

function report(overrides: Partial<MemberIntelligenceReport> = {}): MemberIntelligenceReport {
  return {
    memberId: 'u1',
    localDate: AS_OF,
    generatedAt: '2026-06-30T00:00:00.000Z',
    longitudinalTrends: [],
    patterns: [],
    hypotheses: [],
    priorities: {
      primaryPriority: null,
      secondaryPriority: null,
      areaToMaintain: null,
      emergingConcern: null,
      strongestCurrentArea: null,
      recommendedCoachAttentionLevel: 'none',
      coachAttentionReason: null,
    },
    recommendations: [],
    memberSummary: {
      currentFocus: null,
      biggestObstacle: null,
      recentWins: [],
      mostImprovedArea: null,
      greatestOpportunity: null,
      currentCoachingStyle: 'balanced',
      recommendedNextDiscussion: null,
      currentMotivation: 'steady',
      adherenceScore: null,
      wellnessTrajectory: 'insufficient_data',
    },
    alerts: [],
    ...overrides,
  };
}

describe('computeAllProfileDimensions', () => {
  it('returns insufficient_data for an area with no matching trend', () => {
    const dims = computeAllProfileDimensions(profile(), report({ longitudinalTrends: [] }));
    const sleep = dims.find((d) => d.dimension === 'sleep_stability')!;
    expect(sleep.level).toBe('insufficient_data');
    expect(sleep.score).toBeNull();
  });

  it('reads score/confidence/direction straight from the matching LongitudinalTrend, never re-deriving them', () => {
    const dims = computeAllProfileDimensions(
      profile(),
      report({ longitudinalTrends: [trend('sleep', { direction: 'improving', confidence: 0.82 })] })
    );
    const sleep = dims.find((d) => d.dimension === 'sleep_stability')!;
    expect(sleep.score).toBe(80);
    expect(sleep.confidence).toBe(0.82);
    expect(sleep.trendDirection).toBe('improving');
    expect(sleep.level).toBe('high');
  });

  it('nutrition_consistency reads the digestion trend as a documented proxy', () => {
    const dims = computeAllProfileDimensions(
      profile(),
      report({ longitudinalTrends: [trend('digestion', { direction: 'stable' })] })
    );
    const nutrition = dims.find((d) => d.dimension === 'nutrition_consistency')!;
    expect(nutrition.score).toBe(80);
    expect(nutrition.rationale).toMatch(/proxy|nutrition-tracking/i);
  });

  it('recovery_capacity blends energy and pain trends', () => {
    const dims = computeAllProfileDimensions(
      profile(),
      report({
        longitudinalTrends: [
          trend('energy', {
            points: [
              { window: 'last_30_days', averageScore: 60, sampleSize: 12, status: 'attention' },
            ],
          }),
          trend('pain', {
            points: [{ window: 'last_30_days', averageScore: 100, sampleSize: 12, status: 'good' }],
          }),
        ],
      })
    );
    const recovery = dims.find((d) => d.dimension === 'recovery_capacity')!;
    expect(recovery.score).toBe(80); // (60 + 100) / 2
  });

  it('lifestyle_consistency reads real feed adherence, insufficient_data with no rate yet', () => {
    const withRate = computeAllProfileDimensions(
      profile({ adherence: { level: 'high', rate: 0.9, sampleSize: 14 } }),
      report()
    );
    expect(withRate.find((d) => d.dimension === 'lifestyle_consistency')!.score).toBe(90);

    const withoutRate = computeAllProfileDimensions(
      profile({ adherence: { level: 'typical', rate: null, sampleSize: 0 } }),
      report()
    );
    expect(withoutRate.find((d) => d.dimension === 'lifestyle_consistency')!.level).toBe(
      'insufficient_data'
    );
  });

  it('habit_reliability blends current-vs-longest streak with adherence', () => {
    const dims = computeAllProfileDimensions(
      profile({
        streak: {
          currentStreak: 10,
          longestStreak: 10,
          daysSinceLastCheckin: 0,
          checkedInToday: true,
          justRecovered: false,
          isLongestInWindow: true,
        },
        adherence: { level: 'high', rate: 1, sampleSize: 10 },
      }),
      report()
    );
    expect(dims.find((d) => d.dimension === 'habit_reliability')!.score).toBe(100);
  });

  it('risk_awareness maps coach attention level inversely (priority = low score)', () => {
    const dims = computeAllProfileDimensions(
      profile(),
      report({
        longitudinalTrends: [trend('sleep')],
        priorities: {
          primaryPriority: 'sleep',
          secondaryPriority: null,
          areaToMaintain: null,
          emergingConcern: null,
          strongestCurrentArea: null,
          recommendedCoachAttentionLevel: 'priority',
          coachAttentionReason: 'Sleep needs direct coach attention.',
        },
      })
    );
    const risk = dims.find((d) => d.dimension === 'risk_awareness')!;
    expect(risk.score).toBe(20);
    expect(risk.rationale).toBe('Sleep needs direct coach attention.');
  });

  it('computes exactly 14 dimensions (everything except coaching_style_preference)', () => {
    const dims = computeAllProfileDimensions(profile(), report());
    expect(dims).toHaveLength(14);
    expect(dims.some((d) => d.dimension === 'coaching_style_preference')).toBe(false);
    expect(dims.some((d) => d.dimension === 'behavior_change_momentum')).toBe(true);
  });

  it('behavior_change_momentum aggregates already-classified trend directions into net momentum', () => {
    const dims = computeAllProfileDimensions(
      profile(),
      report({
        longitudinalTrends: [
          trend('sleep', { direction: 'improving' }),
          trend('energy', { direction: 'improving' }),
          trend('stress', { direction: 'declining' }),
        ],
      })
    );
    const momentum = dims.find((d) => d.dimension === 'behavior_change_momentum')!;
    expect(momentum.trendDirection).toBe('improving'); // 2 improving vs 1 declining
    expect(momentum.score).toBeGreaterThan(50);
  });
});

describe('computeCoachingStyleDimension', () => {
  function style(overrides: Partial<CoachingStyleComputation> = {}): CoachingStyleComputation {
    return {
      tonePreference: 'unclear',
      detailPreference: 'unclear',
      taskLoadPreference: 'unclear',
      timeCommitmentSweetSpotMinutes: null,
      confidence: 0,
      evidenceCount: 0,
      rationale: 'Not enough interaction history yet to infer a coaching style preference.',
      ...overrides,
    };
  }

  it('is a rollup of confidence (how well-understood), not a good/bad axis', () => {
    const highConfidence = computeCoachingStyleDimension(
      style({ confidence: 0.9, evidenceCount: 20 })
    );
    expect(highConfidence.score).toBe(90);
    expect(highConfidence.level).toBe('very_high');

    const noSignal = computeCoachingStyleDimension(style());
    expect(noSignal.score).toBe(0);
    expect(noSignal.trendDirection).toBe('insufficient_data');
  });
});
