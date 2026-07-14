/**
 * Unit tests for lib/intelligence-engine/hypotheses.ts — pure functions
 * only. Confirms every produced hypothesis separates known facts / likely
 * patterns / possible explanations, always carries at least one
 * alternative explanation, and is never generated from data that doesn't
 * support it (e.g. no paired-decline hypothesis when only one of the two
 * areas is actually declining).
 */
import { describe, it, expect } from 'vitest';
import { buildRootCauseHypotheses } from '../lib/intelligence-engine/hypotheses';
import type {
  LongitudinalTrend,
  MemberHealthProfile,
  PatternInsight,
} from '../lib/intelligence-engine/types';
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
    streak: {
      currentStreak: 0,
      longestStreak: 0,
      daysSinceLastCheckin: 0,
      checkedInToday: true,
      justRecovered: false,
      isLongestInWindow: false,
    } satisfies StreakInsight,
    adherence: { level: 'typical', rate: null, sampleSize: 0 } satisfies AdherenceInfo,
    restrictedTopics: [],
    openSafetyReviewCount: 0,
    coachNotesCount: 0,
    daysSinceLastReassessmentOrBaseline: null,
    registryEntries: [],
    ...overrides,
  };
}

function trend(overrides: Partial<LongitudinalTrend> = {}): LongitudinalTrend {
  return {
    area: 'stress',
    direction: 'stable',
    confidence: 0.7,
    points: [],
    evidenceRefs: [],
    trendState: 'stable',
    trendStrength: 'mild',
    ...overrides,
  };
}

function pattern(overrides: Partial<PatternInsight> = {}): PatternInsight {
  return {
    key: 'burnout_signal',
    kind: 'burnout_signal',
    label: 'Signs consistent with burnout',
    description: 'Stress, energy have been declining together.',
    confidence: 0.7,
    evidenceRefs: [],
    sourceInsightId: null,
    ...overrides,
  };
}

function expectWellFormed(hypothesis: {
  knownFacts: string[];
  likelyPatterns: string[];
  possibleExplanations: string[];
  alternativeExplanations: string[];
  recommendedCoachingDirection: string;
  confidence: number;
}) {
  expect(hypothesis.knownFacts.length).toBeGreaterThan(0);
  expect(hypothesis.likelyPatterns.length).toBeGreaterThan(0);
  expect(hypothesis.possibleExplanations.length).toBeGreaterThan(0);
  expect(hypothesis.alternativeExplanations.length).toBeGreaterThan(0);
  expect(hypothesis.recommendedCoachingDirection.length).toBeGreaterThan(0);
  expect(hypothesis.confidence).toBeGreaterThan(0);
  expect(hypothesis.confidence).toBeLessThanOrEqual(1);
}

describe('buildRootCauseHypotheses — paired decline', () => {
  it('generates a stress/sleep hypothesis when both are declining with enough confidence', () => {
    const trends = [
      trend({ area: 'stress', direction: 'declining', confidence: 0.7 }),
      trend({ area: 'sleep', direction: 'declining', confidence: 0.6 }),
    ];
    const hypotheses = buildRootCauseHypotheses(profile(), trends, []);
    const match = hypotheses.find((h) => h.id === 'paired_decline_stress_sleep');

    expect(match).toBeDefined();
    expectWellFormed(match!);
    // confidence is discounted below the weaker of the two trends
    expect(match!.confidence).toBeLessThan(0.6);
  });

  it('does not generate a paired hypothesis when only one of the two areas is declining', () => {
    const trends = [
      trend({ area: 'stress', direction: 'declining', confidence: 0.7 }),
      trend({ area: 'sleep', direction: 'stable', confidence: 0.6 }),
    ];
    const hypotheses = buildRootCauseHypotheses(profile(), trends, []);
    expect(hypotheses.find((h) => h.id === 'paired_decline_stress_sleep')).toBeUndefined();
  });

  it('suppresses a paired hypothesis whose discounted confidence falls below the surfacing floor', () => {
    const trends = [
      trend({ area: 'pain', direction: 'declining', confidence: 0.3 }),
      trend({ area: 'movement', direction: 'declining', confidence: 0.3 }),
    ];
    const hypotheses = buildRootCauseHypotheses(profile(), trends, []);
    expect(hypotheses.find((h) => h.id.startsWith('paired_decline_pain'))).toBeUndefined();
  });
});

describe('buildRootCauseHypotheses — pattern-derived hypotheses', () => {
  it('generates an overextension hypothesis from a burnout_signal pattern', () => {
    const hypotheses = buildRootCauseHypotheses(profile(), [], [pattern()]);
    const match = hypotheses.find((h) => h.id === 'possible_overextension');
    expect(match).toBeDefined();
    expectWellFormed(match!);
  });

  it('generates a plateau-strategy hypothesis from a plateau pattern', () => {
    const plateau = pattern({
      key: 'plateau_digestion',
      kind: 'plateau',
      label: 'Digestion has plateaued',
      description: 'Digestion has held steady at a level that still needs attention.',
      confidence: 0.6,
    });
    const hypotheses = buildRootCauseHypotheses(profile(), [], [plateau]);
    const match = hypotheses.find((h) => h.id === 'plateau_strategy_plateau_digestion');
    expect(match).toBeDefined();
    expectWellFormed(match!);
  });

  it('generates a consistency-barrier hypothesis when adherence is low, even without a repeating_barrier pattern', () => {
    const p = profile({ adherence: { level: 'low', rate: 0.2, sampleSize: 8 } });
    const hypotheses = buildRootCauseHypotheses(p, [], []);
    const match = hypotheses.find((h) => h.id === 'consistency_barrier');
    expect(match).toBeDefined();
    expectWellFormed(match!);
  });

  it('produces no hypotheses at all when nothing in the data supports one', () => {
    const hypotheses = buildRootCauseHypotheses(profile(), [], []);
    expect(hypotheses).toEqual([]);
  });
});
