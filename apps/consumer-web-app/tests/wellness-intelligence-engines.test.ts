/**
 * Unit tests for the Personal Wellness Intelligence Engine's pure
 * detectors (lib/intelligence/*) — no Supabase client, same style as
 * tests/coaching-brain.test.ts and tests/feed-selection.test.ts. Every
 * fixture is a minimal, real-shaped DailyCheckin/DailyFeedItem/
 * MefContentItem; each test only sets the fields relevant to the rule
 * under test.
 */
import { describe, it, expect } from 'vitest';
import type { DailyCheckin, DailyFeedItem, MefContentItem } from '@mef/shared-types-contracts';
import { addDaysToLocalDate } from '../lib/feed/dateMath';
import type { FeedHistoryPair } from '../lib/feed/memory';
import { classifyMetricTrend, classifyAllMetricTrends } from '../lib/intelligence/trendEngine';
import {
  checkinWeekdayPattern,
  categoryWeekdayDipPattern,
  repeatedSavedNotCompletedPattern,
  disruptionRecoveryPattern,
  repeatedInterventionSuccessPattern,
  categoryEngagementImbalancePattern,
  divergencePattern,
  contentFollowedByMetricImprovementPattern,
} from '../lib/intelligence/patternEngine';
import {
  strongestAreaInsight,
  mostImprovedAreaInsight,
  longestConsistencyInsight,
  sustainableHabitInsight,
} from '../lib/intelligence/strengthEngine';
import { computePriorityIntelligence } from '../lib/intelligence/priorityIntelligence';
import { gateDraftForSafety, isSeriousPattern } from '../lib/intelligence/safety';
import { confidenceFromSample, strengthFromDelta, average } from '../lib/intelligence/confidence';
import { windowRange, sliceByLocalDate, checkinRangeEvidence } from '../lib/intelligence/windows';
import { maybeReframeAsResolved, isMeaningfullyDifferent } from '../lib/intelligence/service';
import { sinceBaselineInsights } from '../lib/intelligence/baselineEngine';
import type { WellnessInsightDraft } from '../lib/intelligence/types';
import type { ComparisonMetric, ProgressSummary } from '../lib/onboarding/comparison';
import type { WellnessInsight } from '@mef/shared-types-contracts';

const AS_OF = '2024-03-31'; // a fixed "today" for every test in this file

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
    water_cups: 5,
    digestion_rating: 3,
    pain_discomfort_level: 1,
    movement_today: 'moderate',
    new_or_worsening_concern: false,
    optional_notes: null,
    ...overrides,
  };
}

function contentItem(overrides: Partial<MefContentItem> = {}): MefContentItem {
  return {
    id: overrides.id ?? 'content-1',
    content_key: 'test-content',
    title: 'Test Lesson',
    summary: 'A test lesson summary.',
    body: 'Full lesson body.',
    estimated_reading_minutes: 2,
    four_doctors_category: 'doctor_movement',
    topics: [],
    symptoms_or_concerns: [],
    goals: [],
    safety_classification: 'standard_coaching',
    contraindication_tags: [],
    evidence_sources: [],
    author: 'MEF Wellness Team',
    reviewer: null,
    status: 'published',
    version: 1,
    publication_date: '2024-01-01',
    last_reviewed_date: '2024-01-01',
    content_format: 'lesson',
    difficulty_level: 'beginner',
    eligibility_rules: {},
    suggested_action: 'Do the thing.',
    reflection_prompt: 'How did it go?',
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function feedItem(localDate: string, overrides: Partial<DailyFeedItem> = {}): DailyFeedItem {
  return {
    id: `f-${localDate}`,
    member_id: 'u1',
    local_date: localDate,
    content_item_id: 'content-1',
    focus_text: 'Focus.',
    why_text: 'Why.',
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
}

/** Every date from `daysAgoStart` down to `daysAgoEnd` (inclusive), oldest first. */
function dateRange(daysAgoStart: number, daysAgoEnd: number): string[] {
  const dates: string[] = [];
  for (let d = daysAgoStart; d >= daysAgoEnd; d--) {
    dates.push(addDaysToLocalDate(AS_OF, -d));
  }
  return dates;
}

function insightRow(overrides: Partial<WellnessInsight> = {}): WellnessInsight {
  return {
    id: 'insight-1',
    member_id: 'u1',
    insight_type: 'trend',
    wellness_area: 'digestion',
    trend_state: 'declining',
    trend_strength: 'moderate',
    pattern_key: 'trend_digestion',
    title: 'Digestion has been declining',
    member_summary: 'summary',
    coach_detail: 'detail',
    confidence: 0.7,
    severity: 'notable',
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
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function draft(overrides: Partial<WellnessInsightDraft> = {}): WellnessInsightDraft {
  return {
    insightType: 'trend',
    wellnessArea: 'stress',
    trendState: 'declining',
    trendStrength: 'moderate',
    patternKey: 'trend_stress',
    title: 'Stress has been declining',
    memberSummary: 'member summary',
    coachDetail: 'coach detail',
    confidence: 0.7,
    severity: 'notable',
    timeWindow: 'last_30_days',
    evidenceRefs: [],
    reasoningCodes: [],
    recommendedCoachingResponse: null,
    recommendedCoachAction: null,
    memberVisible: true,
    ...overrides,
  };
}

describe('confidence / windows helpers', () => {
  it('confidenceFromSample grows with sample size but never exceeds the cap', () => {
    expect(confidenceFromSample(0)).toBeCloseTo(0.5);
    expect(confidenceFromSample(300, 0.5, 30, 0.9)).toBe(0.9);
  });

  it('strengthFromDelta bands magnitude correctly', () => {
    expect(strengthFromDelta(5)).toBe('mild');
    expect(strengthFromDelta(12)).toBe('moderate');
    expect(strengthFromDelta(25)).toBe('strong');
  });

  it('average returns null for an empty array', () => {
    expect(average([])).toBeNull();
    expect(average([10, 20])).toBe(15);
  });

  it('windowRange anchors every fixed window relative to asOfLocalDate', () => {
    expect(windowRange(AS_OF, 'last_7_days')).toEqual({ start: '2024-03-25', end: AS_OF });
    expect(windowRange(AS_OF, 'previous_30_days').end).toBe(addDaysToLocalDate(AS_OF, -30));
  });

  it('sliceByLocalDate and checkinRangeEvidence only include items inside the range', () => {
    const items = [checkin('2024-03-01'), checkin('2024-03-15'), checkin('2024-04-01')];
    const sliced = sliceByLocalDate(items, { start: '2024-03-01', end: '2024-03-31' });
    expect(sliced).toHaveLength(2);
    expect(checkinRangeEvidence(sliced)[0]!.note).toContain('2');
    expect(checkinRangeEvidence([])).toEqual([]);
  });
});

describe('trendEngine — classifyMetricTrend', () => {
  it('returns null (insufficient_data) when there are too few check-ins in either window', () => {
    const checkins = dateRange(5, 0).map((d) => checkin(d));
    expect(classifyMetricTrend(checkins, AS_OF, 'stress')).toBeNull();
  });

  it('classifies a genuine decline: stress much worse in the last 30 days than the 30 before that', () => {
    const prev30 = dateRange(59, 30).map((d) => checkin(d, { stress_level: 1 })); // score 100, good
    const last30 = dateRange(29, 0).map((d) => checkin(d, { stress_level: 5 })); // score 0, poor
    const result = classifyMetricTrend([...prev30, ...last30], AS_OF, 'stress');
    expect(result?.trendState).toBe('declining');
    expect(result?.wellnessArea).toBe('stress');
  });

  it('classifies a genuine improvement: stress much better in the last 30 days', () => {
    const prev30 = dateRange(59, 30).map((d) => checkin(d, { stress_level: 5 })); // score 0, poor
    const last30 = dateRange(29, 0).map((d) => checkin(d, { stress_level: 1 })); // score 100, good
    const result = classifyMetricTrend([...prev30, ...last30], AS_OF, 'stress');
    expect(result?.trendState).toBe('improving');
  });

  it('classifies a stable trend when nothing meaningfully changed', () => {
    const prev30 = dateRange(59, 30).map((d) => checkin(d, { stress_level: 2 })); // score 75, good
    const last30 = dateRange(29, 0).map((d) => checkin(d, { stress_level: 2 }));
    const result = classifyMetricTrend([...prev30, ...last30], AS_OF, 'stress');
    expect(result?.trendState).toBe('stable');
  });

  it('classifies a recurring_pattern when both the last 30 and previous 30 days are poor', () => {
    const prev30 = dateRange(59, 30).map((d) => checkin(d, { stress_level: 5 })); // score 0, poor
    const last30 = dateRange(29, 0).map((d) => checkin(d, { stress_level: 5 })); // score 0, poor
    const result = classifyMetricTrend([...prev30, ...last30], AS_OF, 'stress');
    expect(result?.trendState).toBe('recurring_pattern');
  });

  it('classifies newly_emerging when only the most recent 7 days have dropped', () => {
    const prev30 = dateRange(59, 30).map((d) => checkin(d, { stress_level: 1 })); // score 100, good
    const restOfLast30 = dateRange(29, 7).map((d) => checkin(d, { stress_level: 1 })); // score 100, good
    const last7 = dateRange(6, 0).map((d) => checkin(d, { stress_level: 4 })); // score 25, poor
    const result = classifyMetricTrend([...prev30, ...restOfLast30, ...last7], AS_OF, 'stress');
    expect(result?.trendState).toBe('newly_emerging');
  });

  it('classifies inconsistent when the last 30 days have a real mix of good and poor days with no net direction', () => {
    // Alternating stress_level 1 (score 100, good) / 4 (score 25, poor) -> avg 62.5, 'attention' band, 50/50 split.
    const alternating = (d: string, i: number) => checkin(d, { stress_level: i % 2 === 0 ? 1 : 4 });
    const prev30 = dateRange(59, 30).map((d, i) => alternating(d, i));
    const last30 = dateRange(29, 0).map((d, i) => alternating(d, i));
    const result = classifyMetricTrend([...prev30, ...last30], AS_OF, 'stress');
    expect(result?.trendState).toBe('inconsistent');
  });

  it('classifyAllMetricTrends filters out every null (insufficient-data) result', () => {
    const checkins = dateRange(5, 0).map((d) => checkin(d));
    const results = classifyAllMetricTrends(checkins, AS_OF, ['stress', 'sleep']);
    expect(results).toEqual([]);
  });
});

describe('patternEngine', () => {
  it('checkinWeekdayPattern surfaces the strongest weekday when there is a real gap', () => {
    // Every Monday in the last 90 days has a check-in; every other day is sparse.
    const checkins: DailyCheckin[] = [];
    for (let d = 89; d >= 0; d--) {
      const localDate = addDaysToLocalDate(AS_OF, -d);
      const dow = new Date(`${localDate}T00:00:00Z`).getUTCDay();
      if (dow === 1 || d % 5 === 0) checkins.push(checkin(localDate));
    }
    const result = checkinWeekdayPattern(checkins, AS_OF);
    expect(result?.patternKey).toBe('checkin_weekday_strength');
  });

  it('returns null when there is no meaningfully strongest weekday', () => {
    const checkins = dateRange(89, 0).map((d) => checkin(d)); // check in every single day — no weekday stands out
    expect(checkinWeekdayPattern(checkins, AS_OF)).toBeNull();
  });

  it('categoryWeekdayDipPattern flags a real weekend dip for a specific Four Doctors category', () => {
    const pairs: FeedHistoryPair[] = [];
    for (let d = 89; d >= 0; d--) {
      const localDate = addDaysToLocalDate(AS_OF, -d);
      const dow = new Date(`${localDate}T00:00:00Z`).getUTCDay();
      const isWeekend = dow === 0 || dow === 6;
      pairs.push({
        feedItem: feedItem(localDate, {
          completed_at: isWeekend ? null : `${localDate}T10:00:00.000Z`,
        }),
        content: contentItem({ four_doctors_category: 'doctor_movement' }),
      });
    }
    const result = categoryWeekdayDipPattern(pairs, AS_OF, 'doctor_movement');
    expect(result?.patternKey).toBe('category_weekday_dip_doctor_movement');
    expect(result?.title.toLowerCase()).toContain('weekend');
  });

  it('repeatedSavedNotCompletedPattern requires at least 2 saved-but-incomplete items', () => {
    const onePair: FeedHistoryPair[] = [
      {
        feedItem: feedItem('2024-01-01', { saved_at: '2024-01-01T00:00:00Z', completed_at: null }),
        content: contentItem(),
      },
    ];
    expect(repeatedSavedNotCompletedPattern(onePair)).toBeNull();

    const twoPairs: FeedHistoryPair[] = [
      {
        feedItem: feedItem('2024-01-01', { saved_at: '2024-01-01T00:00:00Z', completed_at: null }),
        content: contentItem({ title: 'A' }),
      },
      {
        feedItem: feedItem('2024-01-02', { saved_at: '2024-01-02T00:00:00Z', completed_at: null }),
        content: contentItem({ title: 'B' }),
      },
    ];
    const result = repeatedSavedNotCompletedPattern(twoPairs);
    expect(result?.patternKey).toBe('repeated_saved_not_completed');
  });

  it('disruptionRecoveryPattern requires at least 2 real multi-day gaps', () => {
    const single = [
      checkin('2024-01-01'),
      checkin('2024-01-10'),
      ...dateRange(20, 0).map((d) => checkin(d)),
    ];
    expect(disruptionRecoveryPattern(single, AS_OF)).toBeNull();

    const withTwoGaps = [
      checkin('2024-01-01'),
      checkin('2024-01-10'), // gap 1: 9 days
      checkin('2024-01-11'),
      checkin('2024-01-20'), // gap 2: 9 days
      ...dateRange(30, 0).map((d) => checkin(d)),
    ];
    const result = disruptionRecoveryPattern(withTwoGaps, AS_OF);
    expect(result?.patternKey).toBe('disruption_recovery');
  });

  it('repeatedInterventionSuccessPattern finds a lesson completed multiple times and never rated unhelpful', () => {
    const pairs: FeedHistoryPair[] = [
      {
        feedItem: feedItem('2024-01-01', { completed_at: '2024-01-01T00:00:00Z', helpful: true }),
        content: contentItem({ id: 'c1', title: 'Breathing' }),
      },
      {
        feedItem: feedItem('2024-02-01', { completed_at: '2024-02-01T00:00:00Z', helpful: true }),
        content: contentItem({ id: 'c1', title: 'Breathing' }),
      },
    ];
    const result = repeatedInterventionSuccessPattern(pairs);
    expect(result?.patternKey).toBe('repeated_success_c1');
    expect(result?.title).toContain('Breathing');
  });

  it('repeatedInterventionSuccessPattern ignores a lesson rated unhelpful', () => {
    const pairs: FeedHistoryPair[] = [
      {
        feedItem: feedItem('2024-01-01', { completed_at: '2024-01-01T00:00:00Z', helpful: false }),
        content: contentItem({ id: 'c1' }),
      },
      {
        feedItem: feedItem('2024-02-01', { completed_at: '2024-02-01T00:00:00Z', helpful: true }),
        content: contentItem({ id: 'c1' }),
      },
    ];
    expect(repeatedInterventionSuccessPattern(pairs)).toBeNull();
  });

  it('categoryEngagementImbalancePattern only fires when overall wellness is good/improving', () => {
    const pairs: FeedHistoryPair[] = [];
    for (let d = 29; d >= 0; d--) {
      const localDate = addDaysToLocalDate(AS_OF, -d);
      const category = d % 4 === 0 ? 'doctor_movement' : 'doctor_diet';
      pairs.push({
        feedItem: feedItem(localDate, {
          completed_at: category === 'doctor_movement' ? null : `${localDate}T00:00:00Z`,
        }),
        content: contentItem({ four_doctors_category: category }),
      });
    }
    expect(categoryEngagementImbalancePattern(pairs, AS_OF, false)).toBeNull();
    const result = categoryEngagementImbalancePattern(pairs, AS_OF, true);
    expect(result?.patternKey).toBe('category_neglect_doctor_movement');
  });

  it('divergencePattern flags stress remaining stuck while sleep improves, and nothing otherwise', () => {
    const trends = new Map([
      ['sleep', 'improving'],
      ['stress', 'declining'],
    ]);
    const results = divergencePattern(trends as never);
    expect(results.some((r) => r.patternKey === 'divergence_sleep_stress')).toBe(true);

    const noDivergence = divergencePattern(new Map([['sleep', 'stable']]) as never);
    expect(noDivergence).toEqual([]);
  });

  it('contentFollowedByMetricImprovementPattern requires a real, consistent next-day improvement', () => {
    const checkins: DailyCheckin[] = [];
    const pairs: FeedHistoryPair[] = [];
    for (let i = 0; i < 5; i++) {
      const day = addDaysToLocalDate(AS_OF, -(i * 3));
      const nextDay = addDaysToLocalDate(day, 1);
      checkins.push(checkin(day, { stress_level: 4 })); // score 25
      checkins.push(checkin(nextDay, { stress_level: 1 })); // score 100 — improved
      pairs.push({
        feedItem: feedItem(day, { completed_at: `${day}T00:00:00Z` }),
        content: contentItem({ four_doctors_category: 'doctor_quiet' }),
      });
    }
    const result = contentFollowedByMetricImprovementPattern(
      pairs,
      checkins,
      'doctor_quiet',
      'stress'
    );
    expect(result?.patternKey).toBe('content_followed_by_doctor_quiet_stress');
  });
});

describe('strengthEngine', () => {
  it('strongestAreaInsight requires a genuinely strong (>=70) average, not merely the best of a bad bunch', () => {
    const weakEverywhere = dateRange(29, 0).map((d) =>
      checkin(d, { stress_level: 4, energy_level: 2 })
    );
    expect(strongestAreaInsight(weakEverywhere, AS_OF, ['stress', 'energy'])).toBeNull();

    const oneStrong = dateRange(29, 0).map((d) => checkin(d, { stress_level: 1, energy_level: 2 }));
    const result = strongestAreaInsight(oneStrong, AS_OF, ['stress', 'energy']);
    expect(result?.wellnessArea).toBe('stress');
  });

  it('mostImprovedAreaInsight requires at least a +10 point 30-day swing', () => {
    const prev30 = dateRange(59, 30).map((d) => checkin(d, { energy_level: 1 }));
    const last30 = dateRange(29, 0).map((d) => checkin(d, { energy_level: 5 }));
    const result = mostImprovedAreaInsight([...prev30, ...last30], AS_OF, ['energy', 'stress']);
    expect(result?.wellnessArea).toBe('energy');
  });

  it('longestConsistencyInsight only fires for a real 7+ day streak', () => {
    const shortHistory = dateRange(2, 0).map((d) => checkin(d));
    expect(longestConsistencyInsight(shortHistory, AS_OF)).toBeNull();

    const longStreak = dateRange(9, 0).map((d) => checkin(d));
    const result = longestConsistencyInsight(longStreak, AS_OF);
    expect(result?.patternKey).toBe('longest_consistency_streak');
  });

  it('sustainableHabitInsight requires >=75% completion sustained across two full months', () => {
    const pairs: FeedHistoryPair[] = [];
    for (let d = 59; d >= 0; d--) {
      const localDate = addDaysToLocalDate(AS_OF, -d);
      pairs.push({
        feedItem: feedItem(localDate, { completed_at: `${localDate}T00:00:00Z` }),
        content: contentItem({ four_doctors_category: 'doctor_diet' }),
      });
    }
    const result = sustainableHabitInsight(pairs, AS_OF);
    expect(result?.patternKey).toBe('sustainable_habit_doctor_diet');
  });
});

describe('priorityIntelligence — computePriorityIntelligence', () => {
  it('picks the highest-severity concern as primary and a genuine strength as strongestCurrentArea', () => {
    const trends: WellnessInsightDraft[] = [
      draft({
        wellnessArea: 'digestion',
        trendState: 'recurring_pattern',
        severity: 'important',
        confidence: 0.8,
      }),
      draft({
        wellnessArea: 'sleep',
        trendState: 'declining',
        severity: 'notable',
        confidence: 0.7,
      }),
      draft({ wellnessArea: 'mood', trendState: 'improving', severity: 'info', confidence: 0.6 }),
    ];
    const strengths: WellnessInsightDraft[] = [
      draft({
        insightType: 'strength',
        wellnessArea: 'movement',
        patternKey: 'strongest_area_movement',
      }),
    ];
    const result = computePriorityIntelligence(trends, strengths);
    expect(result.primaryPriority).toBe('digestion');
    expect(result.secondaryPriority).toBe('sleep');
    expect(result.strongestCurrentArea).toBe('movement');
    expect(result.recommendedCoachAttentionLevel).toBe('priority');
  });

  it('returns "none" attention and null priorities when nothing concerning is present', () => {
    const result = computePriorityIntelligence([], []);
    expect(result).toEqual({
      primaryPriority: null,
      secondaryPriority: null,
      areaToMaintain: null,
      emergingConcern: null,
      strongestCurrentArea: null,
      recommendedCoachAttentionLevel: 'none',
    });
  });
});

describe('safety gating', () => {
  it('leaves a draft untouched when the member has no active restriction', () => {
    const d = draft({ severity: 'important' });
    expect(gateDraftForSafety(d, [])).toEqual(d);
  });

  it('downgrades an important-severity draft to coach-only when ANY restriction is open (blanket rule)', () => {
    const d = draft({ severity: 'important', memberVisible: true });
    const gated = gateDraftForSafety(d, ['medication']);
    expect(gated.memberVisible).toBe(false);
  });

  it('downgrades a pain-area draft when pain_severity is specifically restricted, even at low severity', () => {
    const d = draft({ wellnessArea: 'pain', severity: 'info', memberVisible: true });
    const gated = gateDraftForSafety(d, ['pain_severity']);
    expect(gated.memberVisible).toBe(false);
  });

  it('leaves a low-severity, unrelated-area draft visible when a restriction exists but does not apply', () => {
    const d = draft({ wellnessArea: 'sleep', severity: 'info', memberVisible: true });
    const gated = gateDraftForSafety(d, ['medication']);
    expect(gated.memberVisible).toBe(true);
  });

  it('isSeriousPattern requires important severity, a recurring_pattern trend state, and high confidence', () => {
    expect(
      isSeriousPattern(
        draft({ severity: 'important', trendState: 'recurring_pattern', confidence: 0.8 })
      )
    ).toBe(true);
    expect(
      isSeriousPattern(
        draft({ severity: 'notable', trendState: 'recurring_pattern', confidence: 0.8 })
      )
    ).toBe(false);
    expect(
      isSeriousPattern(draft({ severity: 'important', trendState: 'declining', confidence: 0.8 }))
    ).toBe(false);
    expect(
      isSeriousPattern(
        draft({ severity: 'important', trendState: 'recurring_pattern', confidence: 0.5 })
      )
    ).toBe(false);
  });
});

describe('service — maybeReframeAsResolved / isMeaningfullyDifferent', () => {
  it('reframes a fresh improving/stable trend as resolved_or_inactive when it follows a declining/recurring insight for the same area', () => {
    const previous = insightRow({ trend_state: 'recurring_pattern' });
    const fresh = draft({ trendState: 'improving', title: 'Digestion has been improving' });
    const reframed = maybeReframeAsResolved(fresh, previous);
    expect(reframed.trendState).toBe('resolved_or_inactive');
    expect(reframed.memberSummary).toContain('had been a concern before');
  });

  it('does not reframe when there is no previous concerning insight', () => {
    const fresh = draft({ trendState: 'improving' });
    expect(maybeReframeAsResolved(fresh, null)).toEqual(fresh);
  });

  it('does not reframe a decline following a decline (not a resolution)', () => {
    const previous = insightRow({ trend_state: 'declining' });
    const fresh = draft({ trendState: 'declining' });
    expect(maybeReframeAsResolved(fresh, previous).trendState).toBe('declining');
  });

  it('isMeaningfullyDifferent is false only when both trend_state and title are unchanged', () => {
    const previous = insightRow({ trend_state: 'declining', title: 'Same title' });
    expect(
      isMeaningfullyDifferent(draft({ trendState: 'declining', title: 'Same title' }), previous)
    ).toBe(false);
    expect(
      isMeaningfullyDifferent(draft({ trendState: 'improving', title: 'Same title' }), previous)
    ).toBe(true);
    expect(
      isMeaningfullyDifferent(draft({ trendState: 'declining', title: 'Different' }), previous)
    ).toBe(true);
  });
});

describe('baselineEngine — sinceBaselineInsights', () => {
  function comparisonMetric(overrides: Partial<ComparisonMetric>): ComparisonMetric {
    return {
      key: 'sleep',
      label: 'Sleep',
      trackedByAssessment: true,
      baseline: { status: 'poor', displayValue: '1 / 5' },
      latest: { status: 'good', displayValue: '4 / 5' },
      direction: 'improved',
      ...overrides,
    };
  }

  it('returns nothing when there is no baseline or no reassessment yet', () => {
    const summary: ProgressSummary = {
      biggestImprovement: comparisonMetric({}),
      needsAttention: null,
      stableAreas: [],
      suggestedFocusAction: null,
    };
    expect(sinceBaselineInsights(summary, null, 'sub-2')).toEqual([]);
    expect(sinceBaselineInsights(summary, 'sub-1', null)).toEqual([]);
  });

  it('produces an improvement and a needs-attention insight from real comparison data', () => {
    const summary: ProgressSummary = {
      biggestImprovement: comparisonMetric({ key: 'sleep', direction: 'improved' }),
      needsAttention: comparisonMetric({
        key: 'stress',
        label: 'Stress',
        latest: { status: 'poor', displayValue: '5 / 5' },
        direction: 'declined',
      }),
      stableAreas: [],
      suggestedFocusAction: null,
    };
    const results = sinceBaselineInsights(summary, 'sub-1', 'sub-2');
    expect(results).toHaveLength(2);
    expect(results[0]!.timeWindow).toBe('since_baseline');
    expect(results[1]!.timeWindow).toBe('since_reassessment');
    expect(results[0]!.evidenceRefs).toEqual([
      { type: 'onboarding_submission', id: 'sub-1', note: 'baseline' },
      { type: 'onboarding_submission', id: 'sub-2', note: 'latest reassessment' },
    ]);
  });
});
