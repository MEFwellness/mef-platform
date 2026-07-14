/**
 * Unit tests for lib/intelligence-engine/recommendations.ts — pure
 * functions only. Confirms recommendations are only ever generated when
 * real evidence supports them (a declining/priority area, an overdue
 * assessment, low adherence, etc.), and that every domain the milestone
 * lists can be produced under the right conditions.
 */
import { describe, it, expect } from 'vitest';
import type { WellnessInsight } from '@mef/shared-types-contracts';
import { buildRecommendations } from '../lib/intelligence-engine/recommendations';
import type {
  CoachingPriorities,
  LongitudinalTrend,
  MemberHealthProfile,
  PatternInsight,
  RootCauseHypothesis,
} from '../lib/intelligence-engine/types';
import type { CoachingFocusDecision } from '../lib/brain/types';

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
    },
    adherence: { level: 'typical', rate: null, sampleSize: 0 },
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

function wellnessInsight(overrides: Partial<WellnessInsight> = {}): WellnessInsight {
  return {
    id: 'i1',
    member_id: 'u1',
    insight_type: 'pattern',
    wellness_area: 'reflections',
    trend_state: null,
    trend_strength: null,
    pattern_key: 'reflection_engagement',
    title: 'Reflections have been light lately',
    member_summary: 'summary',
    coach_detail: 'detail',
    confidence: 0.6,
    severity: 'notable',
    time_window: 'last_30_days',
    evidence_refs: [],
    reasoning_codes: [],
    recommended_coaching_response: 'Prompt a short reflection today.',
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

const NO_HYPOTHESES: RootCauseHypothesis[] = [];
const NO_PATTERNS: PatternInsight[] = [];

describe('buildRecommendations — area-driven domains', () => {
  it('recommends the sleep domain for a declining sleep trend', () => {
    const trends = [trend({ area: 'sleep', direction: 'declining' })];
    const recs = buildRecommendations(profile(), trends, NO_PATTERNS, NO_HYPOTHESES, priorities());
    expect(recs.some((r) => r.domain === 'sleep')).toBe(true);
  });

  it('recommends both stress and breathing domains for a declining stress trend', () => {
    const trends = [trend({ area: 'stress', direction: 'declining' })];
    const recs = buildRecommendations(profile(), trends, NO_PATTERNS, NO_HYPOTHESES, priorities());
    expect(recs.some((r) => r.domain === 'stress')).toBe(true);
    expect(recs.some((r) => r.domain === 'breathing')).toBe(true);
  });

  it('marks the primary priority area as high priority', () => {
    const trends = [trend({ area: 'sleep', direction: 'declining' })];
    const recs = buildRecommendations(
      profile(),
      trends,
      NO_PATTERNS,
      NO_HYPOTHESES,
      priorities({ primaryPriority: 'sleep' })
    );
    const sleepRec = recs.find((r) => r.domain === 'sleep')!;
    expect(sleepRec.priority).toBe('high');
  });

  it('does not recommend anything for an area that is simply stable and not a priority', () => {
    const trends = [trend({ area: 'sleep', direction: 'stable' })];
    const recs = buildRecommendations(profile(), trends, NO_PATTERNS, NO_HYPOTHESES, priorities());
    expect(recs.some((r) => r.domain === 'sleep')).toBe(false);
  });
});

describe('buildRecommendations — non-area domains', () => {
  it('recommends reflection when a reflections-area wellness insight exists', () => {
    const p = profile({ wellnessInsights: [wellnessInsight()] });
    const recs = buildRecommendations(p, [], NO_PATTERNS, NO_HYPOTHESES, priorities());
    expect(recs.some((r) => r.domain === 'reflection')).toBe(true);
  });

  it('recommends education for a newly_emerging trend', () => {
    const trends = [trend({ area: 'mood', trendState: 'newly_emerging', direction: 'declining' })];
    const recs = buildRecommendations(profile(), trends, NO_PATTERNS, NO_HYPOTHESES, priorities());
    expect(recs.some((r) => r.domain === 'education')).toBe(true);
  });

  it('recommends requesting a reassessment when overdue past the threshold', () => {
    const p = profile({ daysSinceLastReassessmentOrBaseline: 120 });
    const recs = buildRecommendations(p, [], NO_PATTERNS, NO_HYPOTHESES, priorities());
    expect(recs.some((r) => r.domain === 'assessments')).toBe(true);
  });

  it('does not recommend a reassessment when comfortably within the window', () => {
    const p = profile({ daysSinceLastReassessmentOrBaseline: 20 });
    const recs = buildRecommendations(p, [], NO_PATTERNS, NO_HYPOTHESES, priorities());
    expect(recs.some((r) => r.domain === 'assessments')).toBe(false);
  });

  it('recommends coach follow-up when the attention level is priority or discuss', () => {
    const recs = buildRecommendations(
      profile(),
      [],
      NO_PATTERNS,
      NO_HYPOTHESES,
      priorities({ recommendedCoachAttentionLevel: 'priority', primaryPriority: 'stress' })
    );
    const rec = recs.find((r) => r.domain === 'coach_follow_up');
    expect(rec).toBeDefined();
    expect(rec!.priority).toBe('high');
  });

  it('always includes a daily_coaching recommendation reflecting the Brain decision', () => {
    const recs = buildRecommendations(profile(), [], NO_PATTERNS, NO_HYPOTHESES, priorities());
    const rec = recs.find((r) => r.domain === 'daily_coaching');
    expect(rec).toBeDefined();
    expect(rec!.title).toContain('Sleep');
  });

  it('bases the conversation prompt on the top hypothesis when one exists', () => {
    const hypothesis: RootCauseHypothesis = {
      id: 'h1',
      statement: 'Stress may be affecting sleep.',
      confidence: 0.6,
      knownFacts: ['fact'],
      likelyPatterns: ['pattern'],
      possibleExplanations: ['explanation'],
      supportingEvidence: [],
      alternativeExplanations: ['alt'],
      recommendedCoachingDirection: 'Discuss stress and sleep together.',
    };
    const recs = buildRecommendations(profile(), [], NO_PATTERNS, [hypothesis], priorities());
    const rec = recs.find((r) => r.domain === 'conversation_prompts');
    expect(rec).toBeDefined();
    expect(rec!.detail).toContain('Discuss stress and sleep together.');
  });

  it('recommends automation only when adherence is genuinely low with enough sample', () => {
    const lowAdherence = profile({ adherence: { level: 'low', rate: 0.2, sampleSize: 8 } });
    const typicalAdherence = profile({ adherence: { level: 'typical', rate: 0.7, sampleSize: 8 } });

    expect(
      buildRecommendations(lowAdherence, [], NO_PATTERNS, NO_HYPOTHESES, priorities()).some(
        (r) => r.domain === 'automation'
      )
    ).toBe(true);
    expect(
      buildRecommendations(typicalAdherence, [], NO_PATTERNS, NO_HYPOTHESES, priorities()).some(
        (r) => r.domain === 'automation'
      )
    ).toBe(false);
  });

  it('recommends a notification when a burnout signal pattern is present', () => {
    const burnout: PatternInsight = {
      key: 'burnout_signal',
      kind: 'burnout_signal',
      label: 'Signs consistent with burnout',
      description: 'description',
      confidence: 0.7,
      evidenceRefs: [],
      sourceInsightId: null,
    };
    const recs = buildRecommendations(profile(), [], [burnout], NO_HYPOTHESES, priorities());
    expect(recs.some((r) => r.domain === 'notifications')).toBe(true);
  });

  it('every recommendation carries at least one piece of evidence', () => {
    const trends = [trend({ area: 'sleep', direction: 'declining' })];
    const recs = buildRecommendations(
      profile({ daysSinceLastReassessmentOrBaseline: 120 }),
      trends,
      NO_PATTERNS,
      NO_HYPOTHESES,
      priorities({ recommendedCoachAttentionLevel: 'discuss', primaryPriority: 'sleep' })
    );
    for (const rec of recs) {
      expect(rec.evidence.length).toBeGreaterThan(0);
    }
  });
});
