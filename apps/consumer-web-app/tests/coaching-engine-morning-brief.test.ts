/**
 * Unit tests for the Root Proactive Coaching Engine's Morning Brief
 * composer (lib/coaching-engine/morningBrief.ts + habitSelection.ts) —
 * pure functions only, no Supabase client, same style as
 * tests/coaching-brain.test.ts. Every fixture is a plain, minimal value;
 * each test overrides only the fields relevant to the case under test.
 */
import { describe, it, expect } from 'vitest';
import type { DailyCheckin, Habit, WellnessInsight } from '@mef/shared-types-contracts';
import type { CoachingFocusDecision } from '../lib/brain/types';
import type { MorningBriefSignals } from '../lib/coaching-engine/types';
import { composeMorningBrief } from '../lib/coaching-engine/morningBrief';
import { selectHabitToPrioritize } from '../lib/coaching-engine/habitSelection';

function checkin(overrides: Partial<DailyCheckin> = {}): DailyCheckin {
  return {
    id: 'c1',
    user_id: 'u1',
    recorded_at: '2026-01-05T08:00:00.000Z',
    local_date: '2026-01-05',
    timezone: 'America/New_York',
    checkin_version: 1,
    edited_at: null,
    mood_level: 4,
    sleep_quality: 4,
    sleep_duration: '7-8h',
    sleep_observation_period_start: null,
    sleep_observation_period_end: null,
    energy_level: 4,
    stress_level: 2,
    water_cups: 6,
    digestion_rating: 4,
    pain_discomfort_level: 0,
    movement_today: 'moderate',
    new_or_worsening_concern: false,
    optional_notes: null,
    actual_bedtime: null,
    actual_wake_time: null,
    night_waking_count: null,
    night_sweats: null,
    morning_soreness: null,
    bowel_movement_status: null,
    created_at: '2026-01-05T08:00:00.000Z',
    ...overrides,
  };
}

function habit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 'h1',
    user_id: 'u1',
    title: 'Evening walk',
    domain: 'movement',
    target_frequency: 'daily',
    active: true,
    assigned_by: null,
    assigned_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function decision(overrides: Partial<CoachingFocusDecision> = {}): CoachingFocusDecision {
  return {
    localDate: '2026-01-05',
    focus: 'movement',
    focusLabel: 'Movement',
    reason: 'recent_checkins',
    reasonText: 'Movement has been light this week.',
    mode: 'encourage',
    challengeLevel: 'standard',
    riskLevel: 'none',
    isCelebration: false,
    encouragement: "You're doing great — keep it up.",
    coachInsight: 'A short walk today would build on yesterday.',
    wearableBrief: null,
    wearableSnapshot: null,
    generatedAt: '2026-01-05T08:00:00.000Z',
    ...overrides,
  };
}

function wellnessInsight(overrides: Partial<WellnessInsight> = {}): WellnessInsight {
  return {
    id: 'insight-1',
    member_id: 'u1',
    insight_type: 'trend',
    wellness_area: 'sleep',
    trend_state: 'declining',
    trend_strength: 'moderate',
    pattern_key: 'trend_sleep',
    title: 'Sleep has been declining',
    member_summary:
      'Sleep has been trending downward over the last month compared to the month before.',
    coach_detail: 'coach detail',
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
    created_at: '2026-01-05T08:00:00.000Z',
    updated_at: '2026-01-05T08:00:00.000Z',
    ...overrides,
  };
}

function signals(overrides: Partial<MorningBriefSignals> = {}): MorningBriefSignals {
  return {
    firstName: 'Jordan',
    localDate: '2026-01-05',
    decision: decision(),
    recentCheckins: [checkin()],
    activeHabits: [habit()],
    habitLogsToday: {},
    currentStreak: 1,
    activeTrendInsights: [],
    continuitySentence: null,
    ...overrides,
  };
}

describe('selectHabitToPrioritize', () => {
  it('returns null when there are no active habits', () => {
    expect(selectHabitToPrioritize([], {}, 'sleep')).toBeNull();
  });

  it('returns null when every active habit is already logged today', () => {
    const h = habit();
    expect(selectHabitToPrioritize([h], { [h.id]: true }, 'sleep')).toBeNull();
  });

  it("prefers an incomplete habit whose domain matches today's focus", () => {
    const sleepHabit = habit({ id: 'h-sleep', domain: 'sleep' });
    const movementHabit = habit({ id: 'h-move', domain: 'movement' });
    const result = selectHabitToPrioritize([movementHabit, sleepHabit], {}, 'sleep');
    expect(result?.id).toBe('h-sleep');
  });

  it('falls back to the first incomplete habit when none match the focus area', () => {
    const nutritionHabit = habit({ id: 'h-nutrition', domain: 'nutrition' });
    const result = selectHabitToPrioritize([nutritionHabit], {}, 'sleep');
    expect(result?.id).toBe('h-nutrition');
  });
});

describe('composeMorningBrief', () => {
  it('never fabricates recovery/sleep/stress text when there is no wearable and no check-in data', () => {
    const brief = composeMorningBrief(
      signals({
        recentCheckins: [],
        decision: decision({ wearableBrief: null }),
      })
    );
    expect(brief.recoverySummary).toBeNull();
    expect(brief.sleepSummary).toBeNull();
    expect(brief.stressSummary).toBeNull();
  });

  it('falls back to check-in-derived sleep/stress summaries when no wearable is connected', () => {
    const brief = composeMorningBrief(
      signals({
        recentCheckins: [checkin({ sleep_quality: 5, stress_level: 1 })],
        decision: decision({ wearableBrief: null }),
      })
    );
    expect(brief.sleepSummary).toMatch(/good/i);
    expect(brief.stressSummary).toMatch(/good/i);
    expect(brief.recoverySummary).toBeNull(); // recovery has no check-in-based fallback — wearable-only
  });

  it('prefers the wearable brief over check-in-derived text when a wearable is connected', () => {
    const brief = composeMorningBrief(
      signals({
        decision: decision({
          wearableBrief: {
            recoveryStatus: 'Your recovery looks strong today.',
            movementRecommendation: null,
            stressRecommendation: 'Stress looks well managed.',
            sleepRecommendation: 'You slept well last night.',
          },
        }),
      })
    );
    expect(brief.recoverySummary).toBe('Your recovery looks strong today.');
    expect(brief.sleepSummary).toBe('You slept well last night.');
    expect(brief.stressSummary).toBe('Stress looks well managed.');
  });

  it('surfaces a real streak in the encouraging message once it is meaningful (3+ days)', () => {
    const brief = composeMorningBrief(signals({ currentStreak: 5 }));
    expect(brief.encouragingMessage).toMatch(/5 days in a row/);
  });

  it("falls back to the Brain's own encouragement line when there is no meaningful streak yet", () => {
    const brief = composeMorningBrief(
      signals({ currentStreak: 1, decision: decision({ encouragement: 'One step at a time.' }) })
    );
    expect(brief.encouragingMessage).toBe('One step at a time.');
  });

  it("carries the Brain's focus/coachInsight through verbatim", () => {
    const brief = composeMorningBrief(
      signals({
        decision: decision({
          focus: 'sleep',
          focusLabel: 'Sleep',
          coachInsight: 'Try winding down 30 minutes earlier tonight.',
        }),
      })
    );
    expect(brief.focusArea).toBe('sleep');
    expect(brief.focusLabel).toBe('Sleep');
    expect(brief.coachingRecommendation).toBe('Try winding down 30 minutes earlier tonight.');
  });

  it('falls back to reasonText when the Brain has no coachInsight', () => {
    const brief = composeMorningBrief(
      signals({ decision: decision({ coachInsight: null, reasonText: 'Because X happened.' }) })
    );
    expect(brief.coachingRecommendation).toBe('Because X happened.');
  });

  it('omits habitToPrioritize when every habit is already done today', () => {
    const h = habit();
    const brief = composeMorningBrief(
      signals({ activeHabits: [h], habitLogsToday: { [h.id]: true } })
    );
    expect(brief.habitToPrioritize).toBeNull();
  });

  it('names the selected habit when one is still incomplete', () => {
    const h = habit({ title: 'Morning stretch' });
    const brief = composeMorningBrief(signals({ activeHabits: [h], habitLogsToday: {} }));
    expect(brief.habitToPrioritize).toBe('Morning stretch');
  });

  it('prefers a real, longitudinal trend insight over a same-night check-in snapshot for sleep', () => {
    const trend = wellnessInsight({
      wellness_area: 'sleep',
      trend_state: 'declining',
      member_summary:
        'Sleep has been trending downward over the last month compared to the month before.',
    });
    const brief = composeMorningBrief(
      signals({
        recentCheckins: [checkin({ sleep_quality: 5 })], // would otherwise say "good" tonight
        activeTrendInsights: [trend],
      })
    );
    expect(brief.sleepSummary).toBe(
      'Sleep has been trending downward over the last month compared to the month before.'
    );
  });

  it('prefers a real stress trend over the wearable brief', () => {
    const trend = wellnessInsight({
      wellness_area: 'stress',
      trend_state: 'declining',
      member_summary:
        'Stress has been trending upward over the last month compared to the month before.',
    });
    const brief = composeMorningBrief(
      signals({
        decision: decision({
          wearableBrief: {
            recoveryStatus: null,
            movementRecommendation: null,
            stressRecommendation: 'Your stress levels look calm today.',
            sleepRecommendation: null,
          },
        }),
        activeTrendInsights: [trend],
      })
    );
    expect(brief.stressSummary).toBe(
      'Stress has been trending upward over the last month compared to the month before.'
    );
  });

  it('ignores a stable/inconsistent trend row — only a meaningful trend state overrides the snapshot', () => {
    const stable = wellnessInsight({ wellness_area: 'sleep', trend_state: 'stable' });
    const brief = composeMorningBrief(
      signals({
        recentCheckins: [checkin({ sleep_quality: 5 })],
        activeTrendInsights: [stable],
      })
    );
    expect(brief.sleepSummary).toMatch(/good/i); // falls through to the check-in snapshot
  });

  it('surfaces a notable pattern for an area outside sleep/stress/recovery (e.g. digestion)', () => {
    const digestionTrend = wellnessInsight({
      wellness_area: 'digestion',
      trend_state: 'improving',
      title: 'Digestion has been improving',
      member_summary:
        'Digestion has been trending upward over the last month compared to the month before.',
    });
    const brief = composeMorningBrief(signals({ activeTrendInsights: [digestionTrend] }));
    expect(brief.notablePatternTitle).toBe('Digestion has been improving');
    expect(brief.notablePatternSummary).toBe(
      'Digestion has been trending upward over the last month compared to the month before.'
    );
  });

  it('never surfaces a notable pattern when there is no meaningful trend outside sleep/stress/recovery', () => {
    const brief = composeMorningBrief(signals({ activeTrendInsights: [] }));
    expect(brief.notablePatternTitle).toBeNull();
    expect(brief.notablePatternSummary).toBeNull();
  });

  it('passes through a real incomplete-recommendation sentence when one exists', () => {
    const brief = composeMorningBrief(
      signals({
        continuitySentence: 'You saved "Box breathing" for later — let\'s pick that back up today.',
      })
    );
    expect(brief.incompleteRecommendation).toBe(
      'You saved "Box breathing" for later — let\'s pick that back up today.'
    );
  });

  it('leaves incompleteRecommendation null rather than inventing one', () => {
    const brief = composeMorningBrief(signals({ continuitySentence: null }));
    expect(brief.incompleteRecommendation).toBeNull();
  });
});
