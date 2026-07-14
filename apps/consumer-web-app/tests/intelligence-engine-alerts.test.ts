/**
 * Unit tests for lib/intelligence-engine/alerts.ts — pure functions only.
 * Confirms every alert type fires under real, deterministic conditions
 * and that `reason` always explains WHY (never a bare label), per the
 * milestone's explicit requirement.
 */
import { describe, it, expect } from 'vitest';
import type { WellnessInsight } from '@mef/shared-types-contracts';
import { buildCoachAlertDrafts } from '../lib/intelligence-engine/alerts';
import type {
  LongitudinalTrend,
  MemberHealthProfile,
  PatternInsight,
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

function trend(overrides: Partial<LongitudinalTrend> = {}): LongitudinalTrend {
  return {
    area: 'pain',
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
    insight_type: 'trend',
    wellness_area: 'stress',
    trend_state: 'declining',
    trend_strength: 'strong',
    pattern_key: 'trend_stress',
    title: 'Stress has been declining',
    member_summary: 'summary',
    coach_detail: 'detail',
    confidence: 0.8,
    severity: 'important',
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

function pattern(overrides: Partial<PatternInsight> = {}): PatternInsight {
  return {
    key: 'burnout_signal',
    kind: 'burnout_signal',
    label: 'Signs consistent with burnout',
    description: 'description',
    confidence: 0.7,
    evidenceRefs: [],
    sourceInsightId: null,
    ...overrides,
  };
}

function expectExplained(alerts: { reason: string }[]) {
  for (const alert of alerts) {
    expect(alert.reason.length).toBeGreaterThan(10);
  }
}

describe('buildCoachAlertDrafts', () => {
  it('flags an important, unreviewed insight as needs_review', () => {
    const p = profile({ wellnessInsights: [wellnessInsight({ coach_reviewed_at: null })] });
    const alerts = buildCoachAlertDrafts(p, [], []);
    expect(alerts.some((a) => a.alertType === 'needs_review')).toBe(true);
    expectExplained(alerts);
  });

  it('does not flag an insight that a coach has already reviewed', () => {
    const p = profile({
      wellnessInsights: [wellnessInsight({ coach_reviewed_at: '2026-06-01T00:00:00.000Z' })],
    });
    const alerts = buildCoachAlertDrafts(p, [], []);
    expect(alerts.some((a) => a.alertType === 'needs_review')).toBe(false);
  });

  it('flags burnout_risk from a burnout_signal pattern', () => {
    const alerts = buildCoachAlertDrafts(profile(), [], [pattern()]);
    expect(alerts.some((a) => a.alertType === 'burnout_risk')).toBe(true);
  });

  it('flags assessment_overdue past the threshold, not before', () => {
    const overdue = buildCoachAlertDrafts(
      profile({ daysSinceLastReassessmentOrBaseline: 120 }),
      [],
      []
    );
    const current = buildCoachAlertDrafts(
      profile({ daysSinceLastReassessmentOrBaseline: 30 }),
      [],
      []
    );
    expect(overdue.some((a) => a.alertType === 'assessment_overdue')).toBe(true);
    expect(current.some((a) => a.alertType === 'assessment_overdue')).toBe(false);
  });

  it('flags no_checkin once the gap reaches the threshold, and escalates severity for a longer gap', () => {
    const short = buildCoachAlertDrafts(
      profile({
        streak: {
          currentStreak: 0,
          longestStreak: 0,
          daysSinceLastCheckin: 5,
          checkedInToday: false,
          justRecovered: false,
          isLongestInWindow: false,
        },
      }),
      [],
      []
    );
    const long = buildCoachAlertDrafts(
      profile({
        streak: {
          currentStreak: 0,
          longestStreak: 0,
          daysSinceLastCheckin: 12,
          checkedInToday: false,
          justRecovered: false,
          isLongestInWindow: false,
        },
      }),
      [],
      []
    );
    const shortAlert = short.find((a) => a.alertType === 'no_checkin')!;
    const longAlert = long.find((a) => a.alertType === 'no_checkin')!;
    expect(shortAlert.severity).toBe('notable');
    expect(longAlert.severity).toBe('important');
  });

  it('flags symptoms_worsening for a declining pain or digestion trend, not for other declining areas', () => {
    const trends = [
      trend({
        area: 'pain',
        direction: 'declining',
        trendState: 'declining',
        trendStrength: 'strong',
      }),
      trend({
        area: 'movement',
        direction: 'declining',
        trendState: 'declining',
        trendStrength: 'strong',
      }),
    ];
    const alerts = buildCoachAlertDrafts(profile(), trends, []);
    const symptomAlerts = alerts.filter((a) => a.alertType === 'symptoms_worsening');
    expect(symptomAlerts).toHaveLength(1);
    expect(symptomAlerts[0]!.alertKey).toBe('symptoms_worsening_pain');
  });

  it('flags rapid_improvement for a strong improving trend', () => {
    const trends = [trend({ area: 'mood', trendState: 'improving', trendStrength: 'strong' })];
    const alerts = buildCoachAlertDrafts(profile(), trends, []);
    expect(alerts.some((a) => a.alertType === 'rapid_improvement' && a.severity === 'info')).toBe(
      true
    );
  });

  it('flags plateau from a plateau pattern', () => {
    const plateau = pattern({
      key: 'plateau_digestion',
      kind: 'plateau',
      label: 'Digestion has plateaued',
    });
    const alerts = buildCoachAlertDrafts(profile(), [], [plateau]);
    expect(
      alerts.some((a) => a.alertType === 'plateau' && a.alertKey === 'plateau_digestion')
    ).toBe(true);
  });

  it('flags recurring_barriers from low adherence even without a matching pattern', () => {
    const p = profile({ adherence: { level: 'low', rate: 0.2, sampleSize: 8 } });
    const alerts = buildCoachAlertDrafts(p, [], []);
    expect(alerts.some((a) => a.alertType === 'recurring_barriers')).toBe(true);
  });

  it('flags repeated_safety_flags only once the open count reaches the minimum', () => {
    const one = buildCoachAlertDrafts(profile({ openSafetyReviewCount: 1 }), [], []);
    const two = buildCoachAlertDrafts(profile({ openSafetyReviewCount: 2 }), [], []);
    expect(one.some((a) => a.alertType === 'repeated_safety_flags')).toBe(false);
    expect(two.some((a) => a.alertType === 'repeated_safety_flags')).toBe(true);
  });

  it('flags medical_evaluation_recommended from a classified insight and from sustained strong pain', () => {
    const p = profile({
      wellnessInsights: [
        wellnessInsight({
          id: 'i2',
          safety_classification_level: 'medical_evaluation_recommended',
        }),
      ],
    });
    const trends = [
      trend({
        area: 'pain',
        trendState: 'recurring_pattern',
        trendStrength: 'strong',
        direction: 'declining',
      }),
    ];
    const alerts = buildCoachAlertDrafts(p, trends, []);
    const medicalAlerts = alerts.filter((a) => a.alertType === 'medical_evaluation_recommended');
    expect(medicalAlerts.length).toBe(2);
  });

  it('produces no alerts at all when nothing in the data warrants one', () => {
    const alerts = buildCoachAlertDrafts(profile(), [], []);
    expect(alerts).toEqual([]);
  });
});
