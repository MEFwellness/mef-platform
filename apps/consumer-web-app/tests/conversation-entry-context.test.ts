/**
 * Unit tests for lib/conversation-coach/entryContext.ts — pure builders
 * for the short, real-data-derived context string each member page hands
 * the floating "Ask Root" launcher (part 4). Confirms each
 * builder only ever surfaces real, already-computed data (never invents
 * anything) and stays short (part 4's "do not send the entire page or
 * unnecessary member history").
 */
import { describe, it, expect } from 'vitest';
import type { WellnessInsight } from '@mef/shared-types-contracts';
import {
  buildAssessmentEntryContext,
  buildCheckinEntryContext,
  buildDashboardEntryContext,
  buildProfileEntryContext,
  buildProgressEntryContext,
  buildTodayEntryContext,
} from '../lib/conversation-coach/entryContext';
import type { WellnessIndexResult, WellnessMetricScore } from '../lib/wellness/wellness-index';
import type { CoachingFocusDecision } from '../lib/brain/types';

function metricScore(overrides: Partial<WellnessMetricScore> = {}): WellnessMetricScore {
  return { key: 'sleep', label: 'Sleep', score: 70, status: 'good', ...overrides };
}

function wellnessIndex(overrides: Partial<WellnessIndexResult> = {}): WellnessIndexResult {
  return {
    score: 72,
    status: 'good',
    label: 'On Track',
    metrics: [metricScore()],
    priority: null,
    strongest: null,
    ...overrides,
  };
}

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

function insight(overrides: Partial<WellnessInsight> = {}): WellnessInsight {
  return {
    id: 'i1',
    member_id: 'u1',
    insight_type: 'trend',
    wellness_area: 'sleep',
    trend_state: 'declining',
    trend_strength: 'moderate',
    pattern_key: 'trend_sleep',
    title: 'Sleep has been declining',
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
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildDashboardEntryContext', () => {
  it('includes the real Wellness Index score and label', () => {
    const text = buildDashboardEntryContext(wellnessIndex({ score: 81, label: 'Excellent' }));
    expect(text).toContain('81');
    expect(text).toContain('Excellent');
  });

  it('is honest about no check-in yet when the index is null', () => {
    const text = buildDashboardEntryContext(null);
    expect(text).toMatch(/hasn't been calculated|no check-in/i);
  });
});

describe('buildTodayEntryContext', () => {
  it('includes the real focus label, mode, lesson title, and suggested action', () => {
    const text = buildTodayEntryContext(
      decision({ focusLabel: 'Movement', mode: 'challenge' }),
      'Why a short walk helps',
      'Take a 10-minute walk today'
    );
    expect(text).toContain('Movement');
    expect(text).toContain('challenge');
    expect(text).toContain('Why a short walk helps');
    expect(text).toContain('Take a 10-minute walk today');
  });

  it('degrades gracefully with no decision at all', () => {
    expect(buildTodayEntryContext(null, null, null)).toBe('Opened from the Today page.');
  });

  it('omits lesson/action lines when not yet available, never fabricating them', () => {
    const text = buildTodayEntryContext(decision(), null, null);
    expect(text).not.toContain('Lesson:');
    expect(text).not.toContain('Suggested action:');
  });
});

describe('buildCheckinEntryContext', () => {
  it('reflects whether today has already been logged', () => {
    expect(buildCheckinEntryContext(true)).toContain('already been logged');
    expect(buildCheckinEntryContext(false)).toContain('before');
  });
});

describe('buildProgressEntryContext', () => {
  it('lists only member-visible insight titles, capped at two', () => {
    const insights = [
      insight({ id: 'i1', title: 'Sleep declining', member_visible: true }),
      insight({ id: 'i2', title: 'Stress improving', member_visible: true }),
      insight({ id: 'i3', title: 'Coach-only insight', member_visible: false }),
      insight({ id: 'i4', title: 'A third visible one', member_visible: true }),
    ];
    const text = buildProgressEntryContext(insights);
    expect(text).toContain('Sleep declining');
    expect(text).toContain('Stress improving');
    expect(text).not.toContain('Coach-only insight');
    expect(text).not.toContain('A third visible one');
  });

  it('is honest about no patterns yet when there are none', () => {
    expect(buildProgressEntryContext([])).toMatch(/no wellness patterns/i);
  });
});

describe('buildProfileEntryContext', () => {
  it('is a short, generic, real statement with no fabricated data', () => {
    expect(buildProfileEntryContext()).toBe('Opened from the Profile page.');
  });
});

describe('buildAssessmentEntryContext', () => {
  it('distinguishes baseline from reassessment and includes the real submission date', () => {
    expect(buildAssessmentEntryContext('baseline', '2026-01-15')).toContain('Baseline Assessment');
    expect(buildAssessmentEntryContext('baseline', '2026-01-15')).toContain('2026-01-15');
    expect(buildAssessmentEntryContext('reassessment', '2026-05-01')).toContain('Reassessment');
  });
});
