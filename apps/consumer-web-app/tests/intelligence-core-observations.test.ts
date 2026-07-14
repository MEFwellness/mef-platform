/**
 * Unit tests for lib/intelligence-core/observations.ts — pure functions
 * only, no Supabase client, same style as tests/intelligence-engine-
 * patterns.test.ts. Confirms every deriveX() honors its minimum-evidence
 * gate (no observation below threshold) and computes the correct
 * statement/confidence once enough real data supports it, and that the
 * two "re-wrap an existing pattern" derivations never re-detect anything.
 */
import { describe, it, expect } from 'vitest';
import type { DailyFeedItem, DailyCheckin, MefContentItem, NarrativeItem } from '@mef/shared-types-contracts';
import {
  deriveHabitAdherenceObservation,
  deriveTimeCommitmentObservation,
  deriveMovementResponseObservation,
  deriveSleepCorrelationObservation,
  derivePainCorrelationObservation,
  deriveEngagementRhythmObservation,
  deriveMotivationStyleObservation,
  deriveCoachingPreferenceObservation,
} from '../lib/intelligence-core/observations';
import type { FeedHistoryPair } from '../lib/feed/memory';
import type { MemberHealthProfile, MemberIntelligenceReport } from '../lib/intelligence-engine/types';
import { addDaysToLocalDate } from '../lib/feed/dateMath';

const AS_OF = '2026-06-30';

function checkin(localDate: string, overrides: Partial<DailyCheckin> = {}): DailyCheckin {
  return {
    id: `c-${localDate}`,
    user_id: 'u1',
    timezone: 'America/New_York',
    local_date: localDate,
    recorded_at: `${localDate}T08:00:00.000Z`,
    checkin_version: 1,
    edited_at: null,
    sleep_observation_period_start: null,
    sleep_observation_period_end: null,
    created_at: `${localDate}T08:00:00.000Z`,
    mood_level: 3,
    sleep_quality: 3,
    sleep_duration: '6-7h',
    energy_level: 3,
    stress_level: 3,
    water_cups: 6,
    digestion_rating: 3,
    pain_discomfort_level: 2,
    movement_today: 'light',
    new_or_worsening_concern: false,
    optional_notes: null,
    ...overrides,
  };
}

function contentItem(overrides: Partial<MefContentItem> = {}): MefContentItem {
  return {
    id: overrides.id ?? 'content-1',
    content_key: 'key-1',
    title: 'A lesson',
    summary: 'summary',
    body: 'body',
    estimated_reading_minutes: 5,
    four_doctors_category: 'doctor_movement',
    topics: [],
    symptoms_or_concerns: [],
    goals: [],
    safety_classification: 'standard_coaching',
    contraindication_tags: [],
    evidence_sources: [],
    author: 'MEF',
    reviewer: null,
    status: 'published',
    version: 1,
    publication_date: null,
    last_reviewed_date: null,
    content_format: 'lesson',
    difficulty_level: 'beginner',
    eligibility_rules: {},
    suggested_action: 'Do the thing.',
    reflection_prompt: 'How did it go?',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function feedPair(
  localDate: string,
  overrides: Partial<DailyFeedItem> = {},
  content: MefContentItem | null = contentItem()
): FeedHistoryPair {
  const feedItem: DailyFeedItem = {
    id: `feed-${localDate}`,
    member_id: 'u1',
    local_date: localDate,
    content_item_id: content?.id ?? 'content-1',
    focus_text: 'focus',
    why_text: 'why',
    selection_reasons: {},
    safety_classification_id: null,
    coach_assigned_by: null,
    coach_note: null,
    replaced_content_item_id: null,
    completed_at: null,
    saved_at: null,
    dismissed_at: null,
    reflection_response: null,
    reflection_submitted_at: null,
    helpful: null,
    created_at: `${localDate}T08:00:00.000Z`,
    updated_at: `${localDate}T08:00:00.000Z`,
    ...overrides,
  };
  return { feedItem, content };
}

describe('deriveHabitAdherenceObservation', () => {
  it('returns null with fewer than 3 observed streak breaks', () => {
    const pairs = [
      feedPair('2026-06-01', { completed_at: '2026-06-01T09:00:00.000Z' }),
      feedPair('2026-06-02', { completed_at: null }),
    ];
    expect(deriveHabitAdherenceObservation(pairs)).toBeNull();
  });

  it('computes the average streak-break length once 3+ breaks are observed', () => {
    const pairs: FeedHistoryPair[] = [];
    // Three 2-day streaks each ending in a miss.
    for (let block = 0; block < 3; block++) {
      const base = block * 3;
      pairs.push(feedPair(`2026-06-${String(base + 1).padStart(2, '0')}`, { completed_at: '2026-06-01T09:00:00.000Z' }));
      pairs.push(feedPair(`2026-06-${String(base + 2).padStart(2, '0')}`, { completed_at: '2026-06-01T09:00:00.000Z' }));
      pairs.push(feedPair(`2026-06-${String(base + 3).padStart(2, '0')}`, { completed_at: null }));
    }
    const draft = deriveHabitAdherenceObservation(pairs);
    expect(draft).not.toBeNull();
    expect(draft!.domain).toBe('habit_adherence');
    expect(draft!.statement).toContain('2 days');
    expect(draft!.evidenceCount).toBe(3);
  });

  it('never counts the still-open trailing run as a break', () => {
    const pairs: FeedHistoryPair[] = [];
    for (let block = 0; block < 3; block++) {
      const base = block * 3;
      pairs.push(feedPair(`2026-06-${String(base + 1).padStart(2, '0')}`, { completed_at: '2026-06-01T09:00:00.000Z' }));
      pairs.push(feedPair(`2026-06-${String(base + 2).padStart(2, '0')}`, { completed_at: '2026-06-01T09:00:00.000Z' }));
      pairs.push(feedPair(`2026-06-${String(base + 3).padStart(2, '0')}`, { completed_at: null }));
    }
    // Trailing open run — not yet a break, must not shift the average.
    pairs.push(feedPair('2026-06-10', { completed_at: '2026-06-01T09:00:00.000Z' }));
    const draft = deriveHabitAdherenceObservation(pairs);
    expect(draft!.evidenceCount).toBe(3);
  });
});

describe('deriveTimeCommitmentObservation', () => {
  it('returns null without at least 4 samples in both duration buckets', () => {
    const pairs = [
      feedPair('2026-06-01', { completed_at: '2026-06-01T09:00:00.000Z' }, contentItem({ estimated_reading_minutes: 5 })),
    ];
    expect(deriveTimeCommitmentObservation(pairs)).toBeNull();
  });

  it('flags a short-content preference when short-content completion beats long-content by 25+ points', () => {
    const shortContent = contentItem({ id: 'short', estimated_reading_minutes: 5 });
    const longContent = contentItem({ id: 'long', estimated_reading_minutes: 20 });
    const pairs: FeedHistoryPair[] = [
      ...Array.from({ length: 5 }, (_, i) =>
        feedPair(`2026-06-0${i + 1}`, { completed_at: '2026-06-01T09:00:00.000Z' }, shortContent)
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        feedPair(`2026-06-1${i + 1}`, { completed_at: null }, longContent)
      ),
    ];
    const draft = deriveTimeCommitmentObservation(pairs);
    expect(draft).not.toBeNull();
    expect(draft!.domain).toBe('time_commitment');
    expect(draft!.statement).toContain('10 minutes or less');
  });

  it('stays null when completion rates are similar across durations', () => {
    const shortContent = contentItem({ id: 'short', estimated_reading_minutes: 5 });
    const longContent = contentItem({ id: 'long', estimated_reading_minutes: 20 });
    const pairs: FeedHistoryPair[] = [
      ...Array.from({ length: 4 }, (_, i) =>
        feedPair(`2026-06-0${i + 1}`, { completed_at: '2026-06-01T09:00:00.000Z' }, shortContent)
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        feedPair(`2026-06-1${i + 1}`, { completed_at: '2026-06-01T09:00:00.000Z' }, longContent)
      ),
    ];
    expect(deriveTimeCommitmentObservation(pairs)).toBeNull();
  });
});

describe('deriveMovementResponseObservation', () => {
  it('returns null without at least 4 days in both movement buckets', () => {
    const checkins = [checkin('2026-06-01', { movement_today: 'none', mood_level: 2 })];
    expect(deriveMovementResponseObservation(checkins)).toBeNull();
  });

  it('flags a mood-lift pattern when moved-days average 0.6+ higher mood than rest days', () => {
    const checkins = [
      ...Array.from({ length: 5 }, (_, i) =>
        checkin(addDaysToLocalDate(AS_OF, -i), { movement_today: 'full_session', mood_level: 5 })
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        checkin(addDaysToLocalDate(AS_OF, -10 - i), { movement_today: 'none', mood_level: 3 })
      ),
    ];
    const draft = deriveMovementResponseObservation(checkins);
    expect(draft).not.toBeNull();
    expect(draft!.domain).toBe('movement_response');
  });
});

describe('deriveSleepCorrelationObservation', () => {
  it('flags stress-predicts-poor-sleep once 4+ consecutive-day pairs support it in each bucket', () => {
    const checkins: DailyCheckin[] = [];
    for (let i = 0; i < 4; i++) {
      const day1 = addDaysToLocalDate(AS_OF, -(i * 2 + 1));
      const day2 = addDaysToLocalDate(AS_OF, -(i * 2));
      checkins.push(checkin(day1, { stress_level: 5 }));
      checkins.push(checkin(day2, { sleep_quality: 1 }));
    }
    for (let i = 0; i < 4; i++) {
      const day1 = addDaysToLocalDate(AS_OF, -(20 + i * 2 + 1));
      const day2 = addDaysToLocalDate(AS_OF, -(20 + i * 2));
      checkins.push(checkin(day1, { stress_level: 1 }));
      checkins.push(checkin(day2, { sleep_quality: 5 }));
    }
    checkins.sort((a, b) => a.local_date.localeCompare(b.local_date));
    const draft = deriveSleepCorrelationObservation(checkins);
    expect(draft).not.toBeNull();
    expect(draft!.domain).toBe('sleep_correlation');
  });

  it('returns null when there are not enough consecutive-day pairs', () => {
    const checkins = [checkin('2026-06-01', { stress_level: 5 }), checkin('2026-06-02', { sleep_quality: 1 })];
    expect(deriveSleepCorrelationObservation(checkins)).toBeNull();
  });
});

describe('derivePainCorrelationObservation', () => {
  it('flags poor-sleep-predicts-pain once 4+ pairs support it in each bucket', () => {
    const checkins: DailyCheckin[] = [];
    for (let i = 0; i < 4; i++) {
      const day1 = addDaysToLocalDate(AS_OF, -(i * 2 + 1));
      const day2 = addDaysToLocalDate(AS_OF, -(i * 2));
      checkins.push(checkin(day1, { sleep_quality: 1 }));
      checkins.push(checkin(day2, { pain_discomfort_level: 4 }));
    }
    for (let i = 0; i < 4; i++) {
      const day1 = addDaysToLocalDate(AS_OF, -(20 + i * 2 + 1));
      const day2 = addDaysToLocalDate(AS_OF, -(20 + i * 2));
      checkins.push(checkin(day1, { sleep_quality: 5 }));
      checkins.push(checkin(day2, { pain_discomfort_level: 0 }));
    }
    checkins.sort((a, b) => a.local_date.localeCompare(b.local_date));
    const draft = derivePainCorrelationObservation(checkins);
    expect(draft).not.toBeNull();
    expect(draft!.domain).toBe('pain_correlation');
  });
});

function baseReport(overrides: Partial<MemberIntelligenceReport> = {}): MemberIntelligenceReport {
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

describe('deriveEngagementRhythmObservation and deriveMotivationStyleObservation — re-wrap, never re-detect', () => {
  it('returns null when the Intelligence Engine found no matching pattern', () => {
    expect(deriveEngagementRhythmObservation(baseReport())).toBeNull();
    expect(deriveMotivationStyleObservation(baseReport())).toBeNull();
  });

  it('wraps an existing weekend_adherence pattern verbatim, never re-deriving it', () => {
    const report = baseReport({
      patterns: [
        {
          key: 'weekend-1',
          kind: 'weekend_adherence',
          label: 'Weekend dip',
          description: 'Completion tends to drop on weekends.',
          confidence: 0.7,
          evidenceRefs: [{ type: 'daily_feed_item', id: 'x' }],
          sourceInsightId: null,
        },
      ],
    });
    const draft = deriveEngagementRhythmObservation(report);
    expect(draft).not.toBeNull();
    expect(draft!.statement).toBe('Completion tends to drop on weekends.');
    expect(draft!.confidence).toBe(0.7);
  });
});

describe('deriveCoachingPreferenceObservation', () => {
  function profile(overrides: Partial<MemberHealthProfile> = {}): MemberHealthProfile {
    return {
      memberId: 'u1',
      localDate: AS_OF,
      checkinsOldestFirst: [],
      baseline: null,
      latestReassessment: null,
      comparison: [],
      progressSummary: { biggestImprovement: null, needsAttention: null, stableAreas: [], suggestedFocusAction: null },
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
      streak: { currentStreak: 0, longestStreak: 0, daysSinceLastCheckin: 0, checkedInToday: true, justRecovered: false, isLongestInWindow: false },
      adherence: { level: 'typical', rate: null, sampleSize: 0 },
      restrictedTopics: [],
      openSafetyReviewCount: 0,
      coachNotesCount: 0,
      daysSinceLastReassessmentOrBaseline: null,
      registryEntries: [],
      ...overrides,
    };
  }

  function narrativeItem(overrides: Partial<NarrativeItem> = {}): NarrativeItem {
    return {
      id: 'n1',
      member_id: 'u1',
      category: 'coaching_preferences',
      title: 'Prefers encouragement',
      summary: 'Responds better to encouraging language than direct instruction.',
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
      valid_from: '2026-06-01T00:00:00.000Z',
      valid_until: null,
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
      ...overrides,
    };
  }

  it('returns null without any active coaching_preferences narrative item', () => {
    expect(deriveCoachingPreferenceObservation(profile(), [])).toBeNull();
  });

  it('surfaces the most recent narrative item verbatim as the member statement', () => {
    const draft = deriveCoachingPreferenceObservation(profile({ narrativeItems: [narrativeItem()] }), []);
    expect(draft).not.toBeNull();
    expect(draft!.statement).toBe('Responds better to encouraging language than direct instruction.');
  });

  it('ignores resolved/dismissed narrative items', () => {
    const draft = deriveCoachingPreferenceObservation(
      profile({ narrativeItems: [narrativeItem({ status: 'resolved' })] }),
      []
    );
    expect(draft).toBeNull();
  });
});
