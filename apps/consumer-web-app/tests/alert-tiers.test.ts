/**
 * Two tiers, and the proof that there is no third.
 *
 * The audit's finding (2.19): the coach-alert system ran a three-value scale
 * with no rule about what belonged where, so "possible burnout risk" and
 * "reassessment overdue" both landed on `notable` and the badge told a coach
 * nothing. The safety system was called the reference implementation and is
 * untouched.
 *
 * What is asserted here: every alert type resolves to exactly one of two
 * tiers, every alert the engine can actually produce resolves, the two
 * urgent ones are the two with a safety classification behind them, and
 * nothing renders the stored three-value severity any more.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  ALERT_TIERS,
  ALERT_TIER_BY_TYPE,
  ALERT_TIER_LABEL,
  ALERT_TIER_MEANING,
  alertTier,
  sortByTier,
  storedSeverityForTier,
} from '../lib/intelligence-engine/alertTiers';
import { buildCoachAlertDrafts } from '../lib/intelligence-engine/alerts';
import type {
  LongitudinalTrend,
  MemberHealthProfile,
  PatternInsight,
} from '../lib/intelligence-engine/types';

const ALL_ALERT_TYPES = Object.keys(ALERT_TIER_BY_TYPE);

describe('there are exactly two tiers', () => {
  it('two, named', () => {
    expect([...ALERT_TIERS].sort()).toEqual(['routine_follow_up', 'urgent_safety']);
  });

  it('every alert type resolves to one of them, and to exactly one', () => {
    for (const type of ALL_ALERT_TYPES) {
      const tier = alertTier(type);
      expect(ALERT_TIERS, type).toContain(tier);
      expect(ALERT_TIERS.filter((t) => t === tier), type).toHaveLength(1);
    }
  });

  it('an alert type nobody has heard of resolves to routine rather than to nothing', () => {
    // Dropping a coach's alert because its type is unrecognised is worse
    // than under-grading it.
    expect(alertTier('some_future_alert')).toBe('routine_follow_up');
  });

  it('both tiers have a label and a sentence saying what they ask of the coach', () => {
    for (const tier of ALERT_TIERS) {
      expect(ALERT_TIER_LABEL[tier].length).toBeGreaterThan(0);
      expect(ALERT_TIER_MEANING[tier].length).toBeGreaterThan(0);
    }
  });

  it('the routine tier says out loud that it is routine, so it cannot read as vaguely alarming', () => {
    expect(ALERT_TIER_LABEL.routine_follow_up.toLowerCase()).toContain('routine');
    expect(ALERT_TIER_MEANING.routine_follow_up.toLowerCase()).toContain('nothing here is urgent');
  });
});

describe('what is urgent, and what is not', () => {
  it('exactly the two alert types that carry a safety classification behind them are urgent', () => {
    const urgent = ALL_ALERT_TYPES.filter((t) => alertTier(t) === 'urgent_safety').sort();
    expect(urgent).toEqual(['medical_evaluation_recommended', 'repeated_safety_flags']);
  });

  it('a possible burnout signal and an overdue reassessment are both routine, and no longer share a tier with a safety event', () => {
    expect(alertTier('burnout_risk')).toBe('routine_follow_up');
    expect(alertTier('assessment_overdue')).toBe('routine_follow_up');
    expect(alertTier('burnout_risk')).toBe(alertTier('assessment_overdue'));
    expect(alertTier('burnout_risk')).not.toBe(alertTier('repeated_safety_flags'));
  });

  it('urgent alerts sort ahead of routine ones', () => {
    const sorted = sortByTier([
      { alertType: 'no_checkin' },
      { alertType: 'repeated_safety_flags' },
      { alertType: 'plateau' },
    ]);
    expect(sorted[0]!.alertType).toBe('repeated_safety_flags');
  });

  it('the stored severity column is derived from the tier and takes only its two legal values', () => {
    expect(storedSeverityForTier('urgent_safety')).toBe('important');
    expect(storedSeverityForTier('routine_follow_up')).toBe('notable');
  });
});

// ---------------------------------------------------------------------------
// Every draft the engine can actually produce, tiered.
// ---------------------------------------------------------------------------

function profile(overrides: Partial<MemberHealthProfile> = {}): MemberHealthProfile {
  return {
    memberId: 'm-1',
    localDate: '2026-08-17',
    wellnessInsights: [],
    registryEntries: [],
    openSafetyReviewCount: 0,
    daysSinceLastReassessmentOrBaseline: null,
    streak: {
      currentStreak: 0,
      longestStreak: 0,
      daysSinceLastCheckin: null,
      checkedInToday: false,
      justRecovered: false,
      isLongestInWindow: false,
    },
    adherence: { level: 'unknown', rate: null, sampleSize: 0 },
    ...overrides,
  } as MemberHealthProfile;
}

function trend(overrides: Partial<LongitudinalTrend>): LongitudinalTrend {
  return {
    area: 'pain',
    direction: 'declining',
    trendState: 'declining',
    trendStrength: 'strong',
    confidence: 0.8,
    evidenceRefs: [{ type: 'daily_checkin', id: 'c-1' }],
    ...overrides,
  } as LongitudinalTrend;
}

function pattern(overrides: Partial<PatternInsight>): PatternInsight {
  return {
    key: 'p-1',
    kind: 'burnout_signal',
    label: 'Burnout signal',
    description: 'Stress up and recovery down across the window.',
    confidence: 0.8,
    evidenceRefs: [],
    sourceInsightId: null,
    ...overrides,
  } as PatternInsight;
}

describe('every draft the engine produces carries a tier', () => {
  it('a full run, with every producer firing, tiers every single draft', () => {
    const drafts = buildCoachAlertDrafts(
      profile({
        openSafetyReviewCount: 3,
        daysSinceLastReassessmentOrBaseline: 400,
        streak: {
          currentStreak: 0,
          longestStreak: 0,
          daysSinceLastCheckin: 30,
          checkedInToday: false,
          justRecovered: false,
          isLongestInWindow: false,
        },
        adherence: { level: 'low', rate: 0.125, sampleSize: 8 },
      }),
      [
        trend({ area: 'pain', trendState: 'recurring_pattern', trendStrength: 'strong' }),
        trend({ area: 'digestion' }),
        trend({ area: 'mood', direction: 'improving', trendState: 'improving', trendStrength: 'strong' }),
      ],
      [pattern({}), pattern({ key: 'p-2', kind: 'plateau', label: 'Plateau' })]
    );

    expect(drafts.length).toBeGreaterThan(4);
    for (const draft of drafts) {
      const tier = alertTier(draft.alertType);
      expect(ALERT_TIERS, `${draft.alertType} (${draft.alertKey})`).toContain(tier);
      // And the stored severity always agrees with the tier, so the audit
      // column and the display can never tell two different stories.
      expect(draft.severity, draft.alertType).toBe(storedSeverityForTier(tier));
    }
  });

  it('no producer chooses its own severity any more', () => {
    const ROOT = path.resolve(__dirname, '..');
    const source = fs.readFileSync(path.join(ROOT, 'lib/intelligence-engine/alerts.ts'), 'utf8');
    // Every remaining severity assignment goes through the one helper.
    const assignments = source.match(/severity:\s*[^\n]+/g) ?? [];
    for (const assignment of assignments) {
      expect(assignment).toContain('severityForType(');
    }
  });

  it("the third tier's value is gone from the producers entirely", () => {
    const ROOT = path.resolve(__dirname, '..');
    const source = fs.readFileSync(path.join(ROOT, 'lib/intelligence-engine/alerts.ts'), 'utf8');
    expect(source).not.toContain("severity: 'info'");
    expect(source).not.toContain("'info' as const");
  });

  it('the coach panel renders the tier, not the stored severity', () => {
    const ROOT = path.resolve(__dirname, '..');
    const source = fs.readFileSync(
      path.join(ROOT, 'app/coach/clients/[id]/MemberIntelligencePanel.tsx'),
      'utf8'
    );
    expect(source).toContain('ALERT_TIER_LABEL[alertTier(alert.alert_type)]');
    expect(source).not.toContain('{alert.severity}');
  });
});
