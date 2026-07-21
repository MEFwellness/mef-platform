/**
 * Unit tests for lib/intelligence-engine/crossAssessmentCorrelations.ts —
 * pure functions only, no Supabase client.
 */
import { describe, it, expect } from 'vitest';
import type { RegistryEntry } from '@mef/shared-types-contracts';
import { buildCrossAssessmentCorrelations } from '../lib/intelligence-engine/crossAssessmentCorrelations';
import type { LongitudinalTrend, MemberHealthProfile } from '../lib/intelligence-engine/types';
import type { CoachingFocusDecision } from '../lib/brain/types';
import type { StreakInsight } from '../lib/feed/streakIntelligence';
import type { AdherenceInfo } from '../lib/feed/adaptiveDifficulty';

function registryEntry(overrides: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    id: 'e1',
    member_id: 'u1',
    entry_kind: 'finding',
    domain: 'sleep',
    code: 'poor_sleep_quality',
    label: 'Poor Sleep Quality',
    severity: 'moderate',
    numeric_value: null,
    unit: null,
    confidence: 0.6,
    narrative: null,
    evidence_refs: [],
    source_feature: 'onboarding_baseline_finding',
    source_record_id: 'r1',
    status: 'active',
    trend_status: 'new',
    member_visible: true,
    coach_context: null,
    coach_reviewed_by: null,
    coach_reviewed_at: null,
    supersedes_id: null,
    superseded_by_id: null,
    recorded_at: '2026-01-01T00:00:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function decision(): CoachingFocusDecision {
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
  };
}

function streak(): StreakInsight {
  return {
    currentStreak: 0,
    longestStreak: 0,
    daysSinceLastCheckin: 0,
    checkedInToday: true,
    justRecovered: false,
    isLongestInWindow: false,
  };
}

function adherence(): AdherenceInfo {
  return { level: 'typical', rate: null, sampleSize: 0 };
}

function profile(registryEntries: RegistryEntry[]): MemberHealthProfile {
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
    registryEntries,
  };
}

describe('buildCrossAssessmentCorrelations', () => {
  it('fires when both sides of a known pair have an active finding', () => {
    const entries = [
      registryEntry({ id: 'a', domain: 'sleep', code: 'poor_sleep_quality', confidence: 0.6 }),
      registryEntry({ id: 'b', domain: 'stress', code: 'elevated_stress', confidence: 0.7 }),
    ];
    const result = buildCrossAssessmentCorrelations(profile(entries), []);
    const match = result.find((r) => r.key === 'correlation_poor_sleep_high_stress');
    expect(match).toBeDefined();
    expect(match!.kind).toBe('cross_assessment_correlation');
    expect(match!.evidenceRefs).toHaveLength(2);
  });

  it('does not fire when only one side is present', () => {
    const entries = [registryEntry({ id: 'a', domain: 'sleep', code: 'poor_sleep_quality' })];
    const result = buildCrossAssessmentCorrelations(profile(entries), []);
    expect(result.find((r) => r.key === 'correlation_poor_sleep_high_stress')).toBeUndefined();
  });

  it('ignores a matching-code finding that is not active', () => {
    const entries = [
      registryEntry({ id: 'a', domain: 'sleep', code: 'poor_sleep_quality', status: 'resolved' }),
      registryEntry({ id: 'b', domain: 'stress', code: 'elevated_stress' }),
    ];
    const result = buildCrossAssessmentCorrelations(profile(entries), []);
    expect(result.find((r) => r.key === 'correlation_poor_sleep_high_stress')).toBeUndefined();
  });

  it('correlates a movement finding with a declining movement trend', () => {
    const entries = [
      registryEntry({ id: 'a', domain: 'movement', code: 'movement_deficiency', confidence: 0.6 }),
    ];
    const trends: LongitudinalTrend[] = [
      {
        area: 'movement',
        direction: 'declining',
        confidence: 0.6,
        points: [],
        evidenceRefs: [],
        trendState: null,
        trendStrength: null,
      },
    ];
    const result = buildCrossAssessmentCorrelations(profile(entries), trends);
    expect(result.find((r) => r.key === 'correlation_movement_readiness')).toBeDefined();
  });
});
