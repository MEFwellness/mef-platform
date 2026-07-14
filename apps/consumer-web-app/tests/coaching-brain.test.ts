/**
 * Unit tests for the Coaching Brain (lib/brain/*) — pure functions only,
 * no Supabase client, same style as tests/feed-selection.test.ts and
 * tests/coaching-memory.test.ts. Every fixture is a plain, minimal
 * CoachingSignals value; each test overrides only the fields relevant to
 * the rule under test.
 */
import { describe, it, expect } from 'vitest';
import type { NarrativeItem } from '@mef/shared-types-contracts';
import type { WellnessIndexResult, WellnessMetricScore } from '../lib/wellness/wellness-index';
import type { WellnessInsight } from '../lib/wellness/insights';
import type { StreakInsight } from '../lib/feed/streakIntelligence';
import type { CoachingSignals } from '../lib/brain/types';
import {
  pickPriority,
  matchMetricInText,
  isWellnessMetricFocus,
} from '../lib/brain/priorityEngine';
import { pickMode } from '../lib/brain/modeEngine';
import { pickChallengeLevel } from '../lib/brain/challengeEngine';
import { pickRiskLevel } from '../lib/brain/riskEngine';
import { pickCelebration } from '../lib/brain/celebrationEngine';
import { focusDisplayLabel, buildReasonText } from '../lib/brain/copy';
import { buildCoachingDecision } from '../lib/brain/decision';

function metricScore(overrides: Partial<WellnessMetricScore>): WellnessMetricScore {
  return { key: 'movement', label: 'Movement', score: 50, status: 'attention', ...overrides };
}

function wellnessIndex(overrides: Partial<WellnessIndexResult> = {}): WellnessIndexResult {
  return {
    score: 65,
    status: 'attention',
    label: 'Needs Attention',
    metrics: [metricScore({})],
    priority: null,
    strongest: null,
    ...overrides,
  };
}

function streak(overrides: Partial<StreakInsight> = {}): StreakInsight {
  return {
    currentStreak: 0,
    longestStreak: 0,
    daysSinceLastCheckin: 0,
    checkedInToday: true,
    justRecovered: false,
    isLongestInWindow: false,
    ...overrides,
  };
}

function narrativeItem(overrides: Partial<NarrativeItem> = {}): NarrativeItem {
  return {
    id: 'n1',
    member_id: 'u1',
    category: 'unresolved_concerns',
    title: 'Sleep still needs attention',
    summary: 'Sleep was short at your most recent reassessment.',
    provenance: 'system_observed',
    confidence: 0.75,
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
    valid_from: '2026-01-01T00:00:00.000Z',
    valid_until: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function insight(overrides: Partial<WellnessInsight>): WellnessInsight {
  return {
    key: 'stress',
    kind: 'trend',
    direction: 'declining',
    message: 'Stress has been increasing over recent check-ins.',
    ...overrides,
  };
}

function signals(overrides: Partial<CoachingSignals> = {}): CoachingSignals {
  return {
    localDate: '2026-01-07',
    dayOfWeek: 'wednesday',
    wellnessIndex: null,
    insights: [],
    adherence: { level: 'typical', rate: null, sampleSize: 0 },
    streak: streak(),
    hasSavedCarryover: false,
    hasActiveSafetyConcern: false,
    unresolvedAssessmentFocus: null,
    recentWin: null,
    confirmedLongTermConcern: null,
    wearableSnapshot: null,
    ...overrides,
  };
}

describe('priorityEngine — pickPriority', () => {
  it('always has a fallback: the weekly rhythm, when no other signal is present', () => {
    const result = pickPriority(signals({ dayOfWeek: 'wednesday' }));
    expect(result).toEqual({ focus: 'reflection', reason: 'weekly_rhythm', score: 10 });
  });

  it('safety overrides everything else, including a sustained concern', () => {
    const result = pickPriority(
      signals({
        hasActiveSafetyConcern: true,
        insights: [insight({ kind: 'sustained', key: 'hydration' })],
        wellnessIndex: wellnessIndex({ priority: metricScore({ key: 'stress', status: 'poor' }) }),
      })
    );
    expect(result.reason).toBe('safety_priority');
    expect(result.focus).toBe('stress');
  });

  it('a poor Daily Wellness Index priority metric outranks the weekly rhythm and a merely-improving trend', () => {
    const result = pickPriority(
      signals({
        wellnessIndex: wellnessIndex({ priority: metricScore({ key: 'sleep', status: 'poor' }) }),
        insights: [insight({ kind: 'trend', direction: 'improving', key: 'mood' })],
      })
    );
    expect(result).toEqual({ focus: 'sleep', reason: 'recent_checkins', score: 75 });
  });

  it('a sustained concern outranks an ordinary attention-level priority metric', () => {
    const result = pickPriority(
      signals({
        wellnessIndex: wellnessIndex({
          priority: metricScore({ key: 'digestion', status: 'attention' }),
        }),
        insights: [
          insight({
            kind: 'sustained',
            key: 'stress',
            message: 'Stress has been consistently high.',
          }),
        ],
      })
    );
    expect(result.reason).toBe('long_term_pattern');
    expect(result.focus).toBe('stress');
  });

  it('a real gap since the last check-in becomes a streak_recovery consistency focus', () => {
    const result = pickPriority(
      signals({ streak: streak({ daysSinceLastCheckin: 3, checkedInToday: false }) })
    );
    expect(result).toEqual({ focus: 'consistency', reason: 'streak_recovery', score: 80 });
  });

  it('low adherence to the daily feed becomes a consistency focus', () => {
    const result = pickPriority(signals({ adherence: { level: 'low', rate: 0.2, sampleSize: 7 } }));
    expect(result.reason).toBe('low_adherence');
    expect(result.focus).toBe('consistency');
  });

  it('an unresolved reassessment concern maps to its real metric', () => {
    const result = pickPriority(signals({ unresolvedAssessmentFocus: 'hydration' }));
    expect(result).toEqual({ focus: 'hydration', reason: 'recent_assessment', score: 65 });
  });

  it('a saved-but-not-completed lesson becomes an incomplete_habits consistency focus', () => {
    const result = pickPriority(signals({ hasSavedCarryover: true }));
    expect(result).toEqual({ focus: 'consistency', reason: 'incomplete_habits', score: 55 });
  });

  it('a confirmed long-term concern from the Wellness Intelligence Engine outranks the weekly rhythm but not real-time signals', () => {
    const belowRealTime = pickPriority(
      signals({
        confirmedLongTermConcern: 'digestion',
        wellnessIndex: wellnessIndex({ priority: metricScore({ key: 'sleep', status: 'poor' }) }),
      })
    );
    expect(belowRealTime).toEqual({ focus: 'sleep', reason: 'recent_checkins', score: 75 });

    const aboveFallback = pickPriority(signals({ confirmedLongTermConcern: 'digestion' }));
    expect(aboveFallback).toEqual({ focus: 'digestion', reason: 'long_term_pattern', score: 50 });
  });
});

describe('priorityEngine — matchMetricInText / isWellnessMetricFocus', () => {
  it('matches a real metric label in free text, case-insensitively', () => {
    expect(matchMetricInText('Hydration was low at your last visit')).toBe('hydration');
    expect(matchMetricInText('Nothing relevant here')).toBeNull();
  });

  it('distinguishes metric-driven focuses from consistency/reflection/education', () => {
    expect(isWellnessMetricFocus('sleep')).toBe(true);
    expect(isWellnessMetricFocus('consistency')).toBe(false);
  });
});

describe('modeEngine — pickMode', () => {
  const priority = { focus: 'sleep' as const, reason: 'recent_checkins' as const, score: 75 };

  it('an active safety concern always means Recover', () => {
    expect(pickMode(signals({ hasActiveSafetyConcern: true }), priority)).toBe('recover');
  });

  it('a 3+ day gap since the last check-in means Reset, not Recover', () => {
    expect(pickMode(signals({ streak: streak({ daysSinceLastCheckin: 4 }) }), priority)).toBe(
      'reset'
    );
  });

  it('a poor Daily Wellness Index means Recover', () => {
    expect(pickMode(signals({ wellnessIndex: wellnessIndex({ status: 'poor' }) }), priority)).toBe(
      'recover'
    );
  });

  it('a genuine win with no poor signal means Celebrate', () => {
    expect(pickMode(signals({ streak: streak({ isLongestInWindow: true }) }), priority)).toBe(
      'celebrate'
    );
  });

  it('high adherence with no poor signal means Challenge — recent success allows progression', () => {
    expect(
      pickMode(signals({ adherence: { level: 'high', rate: 0.9, sampleSize: 7 } }), priority)
    ).toBe('challenge');
  });

  it('low adherence means Encourage', () => {
    expect(
      pickMode(signals({ adherence: { level: 'low', rate: 0.2, sampleSize: 7 } }), priority)
    ).toBe('encourage');
  });

  it('no check-in data yet means Educate', () => {
    expect(pickMode(signals({ wellnessIndex: null }), priority)).toBe('educate');
  });

  it('a steady day with real data falls back to Maintain', () => {
    expect(pickMode(signals({ wellnessIndex: wellnessIndex({ status: 'good' }) }), priority)).toBe(
      'maintain'
    );
  });
});

describe('challengeEngine — pickChallengeLevel', () => {
  it('never punishes: Recover/Reset always means lighter, even with high adherence', () => {
    expect(pickChallengeLevel('high', 'recover')).toBe('lighter');
    expect(pickChallengeLevel('high', 'reset')).toBe('lighter');
  });

  it('low adherence means lighter', () => {
    expect(pickChallengeLevel('low', 'maintain')).toBe('lighter');
  });

  it('high adherence outside Encourage mode allows a stretch', () => {
    expect(pickChallengeLevel('high', 'challenge')).toBe('stretch');
  });

  it('high adherence in Encourage mode stays standard, not a stretch', () => {
    expect(pickChallengeLevel('high', 'encourage')).toBe('standard');
  });

  it('typical adherence in a neutral mode is standard', () => {
    expect(pickChallengeLevel('typical', 'maintain')).toBe('standard');
  });
});

describe('riskEngine — pickRiskLevel', () => {
  it('an active safety concern is always elevated, regardless of everything else', () => {
    expect(
      pickRiskLevel(
        signals({ hasActiveSafetyConcern: true, wellnessIndex: wellnessIndex({ status: 'good' }) })
      )
    ).toBe('elevated');
  });

  it('a poor wellness index without a safety concern is watch, not elevated', () => {
    expect(pickRiskLevel(signals({ wellnessIndex: wellnessIndex({ status: 'poor' }) }))).toBe(
      'watch'
    );
  });

  it('a sustained insight without a safety concern is watch', () => {
    expect(pickRiskLevel(signals({ insights: [insight({ kind: 'sustained' })] }))).toBe('watch');
  });

  it('a steady day is none', () => {
    expect(pickRiskLevel(signals({ wellnessIndex: wellnessIndex({ status: 'good' }) }))).toBe(
      'none'
    );
  });
});

describe('celebrationEngine — pickCelebration', () => {
  it('a longest-in-window streak celebrates with the real streak message', () => {
    const result = pickCelebration(
      signals({ streak: streak({ isLongestInWindow: true, currentStreak: 12 }) })
    );
    expect(result.isCelebration).toBe(true);
    expect(result.text).toContain('12');
  });

  it('an ordinary 3-day streak (not longest, not a recovery) does not force a celebration', () => {
    const result = pickCelebration(signals({ streak: streak({ currentStreak: 3 }) }));
    expect(result.isCelebration).toBe(false);
  });

  it('falls back to a real recent-win narrative item', () => {
    const win = narrativeItem({ category: 'recent_wins', summary: '30-day streak reached.' });
    const result = pickCelebration(signals({ recentWin: win }));
    expect(result).toEqual({ isCelebration: true, text: '30-day streak reached.' });
  });

  it('falls back to a real improving trend when nothing else fires', () => {
    const improving = insight({
      kind: 'trend',
      direction: 'improving',
      message: 'Mood is improving.',
    });
    const result = pickCelebration(signals({ insights: [improving] }));
    expect(result).toEqual({ isCelebration: true, text: 'Mood is improving.' });
  });

  it('is honest when there is nothing real to celebrate', () => {
    expect(pickCelebration(signals())).toEqual({ isCelebration: false, text: null });
  });
});

describe('copy — focusDisplayLabel / buildReasonText', () => {
  it('renders stress as Breathing specifically in Recover/Reset mode', () => {
    expect(focusDisplayLabel('stress', 'recover')).toBe('Breathing');
    expect(focusDisplayLabel('stress', 'reset')).toBe('Breathing');
    expect(focusDisplayLabel('stress', 'maintain')).toBe('Stress');
  });

  it('maps every focus area to a real, non-empty label', () => {
    const areas: Array<Parameters<typeof focusDisplayLabel>[0]> = [
      'sleep',
      'stress',
      'energy',
      'mood',
      'hydration',
      'digestion',
      'movement',
      'pain',
      'consistency',
      'reflection',
      'education',
    ];
    for (const area of areas) {
      expect(focusDisplayLabel(area, 'maintain').length).toBeGreaterThan(0);
    }
  });

  it('produces a distinct, templated sentence for every reason kind', () => {
    const reasons: Array<Parameters<typeof buildReasonText>[0]> = [
      'recent_checkins',
      'incomplete_habits',
      'low_adherence',
      'recent_improvement',
      'long_term_pattern',
      'coach_assignment',
      'recent_assessment',
      'streak_recovery',
      'weekly_rhythm',
      'safety_priority',
    ];
    const texts = reasons.map((reason) => buildReasonText(reason, 'sleep', 'maintain', signals()));
    expect(new Set(texts).size).toBe(reasons.length);
    for (const text of texts) expect(text.length).toBeGreaterThan(0);
  });
});

describe('decision — buildCoachingDecision (integration)', () => {
  it('assembles a full, internally-consistent decision for a genuinely rough day', () => {
    const decision = buildCoachingDecision(
      signals({
        hasActiveSafetyConcern: true,
        wellnessIndex: wellnessIndex({
          status: 'poor',
          priority: metricScore({ key: 'stress', status: 'poor' }),
        }),
      })
    );
    expect(decision.mode).toBe('recover');
    expect(decision.riskLevel).toBe('elevated');
    expect(decision.challengeLevel).toBe('lighter');
    expect(decision.reason).toBe('safety_priority');
    expect(decision.focusLabel).toBe('Breathing');
    expect(decision.coachInsight).toBeNull(); // attached by lib/brain/service.ts, not decision.ts
  });

  it('assembles a full, internally-consistent decision for a genuinely strong day', () => {
    const decision = buildCoachingDecision(
      signals({
        wellnessIndex: wellnessIndex({ status: 'good' }),
        adherence: { level: 'high', rate: 0.95, sampleSize: 10 },
        streak: streak({ isLongestInWindow: true, currentStreak: 21 }),
      })
    );
    expect(decision.mode).toBe('celebrate');
    expect(decision.riskLevel).toBe('none');
    expect(decision.isCelebration).toBe(true);
    expect(decision.encouragement).toContain('21');
  });

  it('falls back to the generic daily encouragement line when there is nothing to celebrate', () => {
    const decision = buildCoachingDecision(signals());
    expect(decision.isCelebration).toBe(false);
    expect(decision.encouragement.length).toBeGreaterThan(0);
  });
});
