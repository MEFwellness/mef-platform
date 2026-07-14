/**
 * Unit tests for lib/intelligence-engine/summary.ts — pure functions only.
 * Confirms every field in the living Member Summary traces back to real,
 * already-computed data (a trend, a pattern, the Brain's own decision, a
 * real narrative item).
 */
import { describe, it, expect } from 'vitest';
import type { NarrativeItem } from '@mef/shared-types-contracts';
import { buildMemberSummary } from '../lib/intelligence-engine/summary';
import type {
  CoachingPriorities,
  LongitudinalTrend,
  MemberHealthProfile,
  PatternInsight,
  RootCauseHypothesis,
} from '../lib/intelligence-engine/types';
import type { CoachingFocusDecision, CoachingMode } from '../lib/brain/types';

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

function narrativeItem(overrides: Partial<NarrativeItem> = {}): NarrativeItem {
  return {
    id: 'n1',
    member_id: 'u1',
    category: 'recent_wins',
    title: 'Completed every check-in this week',
    summary: 'Seven days in a row of check-ins.',
    provenance: 'system_observed',
    confidence: 0.8,
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
    valid_from: '2026-06-01T00:00:00.000Z',
    valid_until: null,
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
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
    },
    adherence: { level: 'typical', rate: 0.65, sampleSize: 10 },
    restrictedTopics: [],
    openSafetyReviewCount: 0,
    coachNotesCount: 0,
    daysSinceLastReassessmentOrBaseline: null,
    registryEntries: [],
    ...overrides,
  };
}

function priorities(overrides: Partial<CoachingPriorities> = {}): CoachingPriorities {
  return {
    primaryPriority: null,
    secondaryPriority: null,
    areaToMaintain: null,
    emergingConcern: null,
    strongestCurrentArea: null,
    recommendedCoachAttentionLevel: 'none',
    coachAttentionReason: null,
    ...overrides,
  };
}

function trend(overrides: Partial<LongitudinalTrend> = {}): LongitudinalTrend {
  return {
    area: 'sleep',
    direction: 'stable',
    confidence: 0.6,
    points: [],
    evidenceRefs: [],
    trendState: 'stable',
    trendStrength: 'mild',
    ...overrides,
  };
}

const NO_PATTERNS: PatternInsight[] = [];
const NO_HYPOTHESES: RootCauseHypothesis[] = [];

describe('buildMemberSummary', () => {
  it('reflects the Brain decision for currentFocus, currentMotivation, and coaching style', () => {
    const modeMap: [CoachingMode, string][] = [
      ['encourage', 'Encouraging'],
      ['challenge', 'Challenge'],
      ['recover', 'Gentle'],
      ['celebrate', 'Celebratory'],
    ];
    for (const [mode, expectedWord] of modeMap) {
      const p = profile({
        brainDecision: decision({ mode, focusLabel: 'Movement', encouragement: 'Keep going.' }),
      });
      const summary = buildMemberSummary(p, [], NO_PATTERNS, NO_HYPOTHESES, priorities());
      expect(summary.currentFocus).toBe('Movement');
      expect(summary.currentMotivation).toBe('Keep going.');
      expect(summary.currentCoachingStyle).toContain(expectedWord);
    }
  });

  it('pulls recentWins from member-visible recent_wins narrative items only', () => {
    const p = profile({
      narrativeItems: [
        narrativeItem({
          id: 'n1',
          member_visible: true,
          category: 'recent_wins',
          summary: 'Win A',
        }),
        narrativeItem({
          id: 'n2',
          member_visible: false,
          category: 'recent_wins',
          summary: 'Win B (coach-only)',
        }),
        narrativeItem({
          id: 'n3',
          member_visible: true,
          category: 'unresolved_concerns',
          summary: 'Not a win',
        }),
      ],
    });
    const summary = buildMemberSummary(p, [], NO_PATTERNS, NO_HYPOTHESES, priorities());
    expect(summary.recentWins).toEqual(['Win A']);
  });

  it('picks the highest-confidence improving trend as mostImprovedArea', () => {
    const trends = [
      trend({ area: 'sleep', direction: 'improving', confidence: 0.5 }),
      trend({ area: 'stress', direction: 'improving', confidence: 0.8 }),
      trend({ area: 'mood', direction: 'declining', confidence: 0.9 }),
    ];
    const summary = buildMemberSummary(profile(), trends, NO_PATTERNS, NO_HYPOTHESES, priorities());
    expect(summary.mostImprovedArea).toBe('stress');
  });

  it('returns null for mostImprovedArea when nothing is improving', () => {
    const trends = [trend({ area: 'sleep', direction: 'stable' })];
    const summary = buildMemberSummary(profile(), trends, NO_PATTERNS, NO_HYPOTHESES, priorities());
    expect(summary.mostImprovedArea).toBeNull();
  });

  it('sets greatestOpportunity directly from the primary priority', () => {
    const summary = buildMemberSummary(
      profile(),
      [],
      NO_PATTERNS,
      NO_HYPOTHESES,
      priorities({ primaryPriority: 'stress' })
    );
    expect(summary.greatestOpportunity).toBe('stress');
  });

  it('uses the top hypothesis for recommendedNextDiscussion when one exists, falling back to the priority area', () => {
    const hypothesis: RootCauseHypothesis = {
      id: 'h1',
      statement: 'stmt',
      confidence: 0.6,
      knownFacts: [],
      likelyPatterns: [],
      possibleExplanations: [],
      supportingEvidence: [],
      alternativeExplanations: [],
      recommendedCoachingDirection: 'Talk about sleep and stress together.',
    };
    const withHypothesis = buildMemberSummary(
      profile(),
      [],
      NO_PATTERNS,
      [hypothesis],
      priorities()
    );
    expect(withHypothesis.recommendedNextDiscussion).toBe('Talk about sleep and stress together.');

    const withoutHypothesis = buildMemberSummary(
      profile(),
      [],
      NO_PATTERNS,
      NO_HYPOTHESES,
      priorities({ primaryPriority: 'hydration' })
    );
    expect(withoutHypothesis.recommendedNextDiscussion).toContain('hydration');
  });

  it('rounds adherenceScore to a whole percentage, and is null when there is no rate yet', () => {
    const withRate = buildMemberSummary(
      profile({ adherence: { level: 'typical', rate: 0.654, sampleSize: 10 } }),
      [],
      NO_PATTERNS,
      NO_HYPOTHESES,
      priorities()
    );
    expect(withRate.adherenceScore).toBe(65);

    const withoutRate = buildMemberSummary(
      profile({ adherence: { level: 'typical', rate: null, sampleSize: 0 } }),
      [],
      NO_PATTERNS,
      NO_HYPOTHESES,
      priorities()
    );
    expect(withoutRate.adherenceScore).toBeNull();
  });

  describe('wellnessTrajectory', () => {
    it('is insufficient_data when every trend lacks enough data', () => {
      const trends = [trend({ direction: 'insufficient_data' })];
      const summary = buildMemberSummary(
        profile(),
        trends,
        NO_PATTERNS,
        NO_HYPOTHESES,
        priorities()
      );
      expect(summary.wellnessTrajectory).toBe('insufficient_data');
    });

    it('is improving when more areas are improving than declining', () => {
      const trends = [
        trend({ area: 'sleep', direction: 'improving' }),
        trend({ area: 'stress', direction: 'improving' }),
        trend({ area: 'mood', direction: 'stable' }),
      ];
      const summary = buildMemberSummary(
        profile(),
        trends,
        NO_PATTERNS,
        NO_HYPOTHESES,
        priorities()
      );
      expect(summary.wellnessTrajectory).toBe('improving');
    });

    it('is declining when more areas are declining than improving', () => {
      const trends = [
        trend({ area: 'sleep', direction: 'declining' }),
        trend({ area: 'stress', direction: 'declining' }),
      ];
      const summary = buildMemberSummary(
        profile(),
        trends,
        NO_PATTERNS,
        NO_HYPOTHESES,
        priorities()
      );
      expect(summary.wellnessTrajectory).toBe('declining');
    });

    it('is mixed when improving and declining are roughly balanced', () => {
      const trends = [
        trend({ area: 'sleep', direction: 'improving' }),
        trend({ area: 'stress', direction: 'declining' }),
      ];
      const summary = buildMemberSummary(
        profile(),
        trends,
        NO_PATTERNS,
        NO_HYPOTHESES,
        priorities()
      );
      expect(summary.wellnessTrajectory).toBe('mixed');
    });

    it('is stable when nothing is improving or declining', () => {
      const trends = [trend({ area: 'sleep', direction: 'stable' })];
      const summary = buildMemberSummary(
        profile(),
        trends,
        NO_PATTERNS,
        NO_HYPOTHESES,
        priorities()
      );
      expect(summary.wellnessTrajectory).toBe('stable');
    });
  });
});
