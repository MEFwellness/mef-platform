/**
 * Unit tests for the Root Proactive Coaching Engine's Morning Brief
 * composer (lib/coaching-engine/morningBrief.ts + habitSelection.ts) —
 * pure functions only, no Supabase client, same style as
 * tests/coaching-brain.test.ts. Every fixture is a plain, minimal value;
 * each test overrides only the fields relevant to the case under test.
 */
import { describe, it, expect } from 'vitest';
import type { DailyCheckin, Habit } from '@mef/shared-types-contracts';
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

function signals(overrides: Partial<MorningBriefSignals> = {}): MorningBriefSignals {
  return {
    firstName: 'Jordan',
    localDate: '2026-01-05',
    decision: decision(),
    recentCheckins: [checkin()],
    activeHabits: [habit()],
    habitLogsToday: {},
    currentStreak: 1,
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
});
