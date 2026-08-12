/**
 * Engagement state rules. Pure, no database.
 *
 * Every branch of the documented rule set is exercised here, including both
 * paths the brief calls out by name: the self-comparison path (a member
 * judged against her own history) and the insufficient-history fallback (a
 * member judged against fixed thresholds, and told so).
 *
 * These states describe behavioral engagement only. Nothing here is a
 * health or wellness judgment, and no test asserts one.
 */
import { describe, it, expect } from 'vitest';
import {
  ABSENCE_GAP_MULTIPLIER,
  DECLINE_RATIO,
  FIXED_ACTIVE_MAX_DAYS,
  FIXED_WATCH_MAX_DAYS,
  MIN_ABSENCE_DAYS,
  MIN_BASELINE_ACTIVE_DAYS_FOR_SELF_COMPARISON,
  MIN_HISTORY_DAYS_FOR_SELF_COMPARISON,
  NEW_ACCOUNT_GRACE_DAYS,
  NEW_MEMBER_HISTORY_DAYS,
  absenceToleranceDays,
  activityRates,
  classifyEngagementState,
  hasSelfComparisonBaseline,
  toMemberEngagement,
} from '../lib/analytics-service/engagementState';
import type { MemberEngagementFacts } from '../lib/analytics-service/types';

const REFERENCE = '2026-06-30';

function facts(overrides: Partial<MemberEngagementFacts> = {}): MemberEngagementFacts {
  return {
    memberId: '00000000-0000-0000-0000-0000000000aa',
    displayName: 'Test Member',
    accountCreatedDate: '2026-01-01',
    isTestAccount: false,
    referenceDate: REFERENCE,
    firstActivityDate: '2026-01-02',
    lastActivityDate: '2026-06-29',
    daysSinceLastActivity: 1,
    daysSinceAccountCreated: 180,
    historyDays: 180,
    lifetimeActiveDays: 60,
    recentActiveDays: 7,
    recentWindowDays: 14,
    baselineActiveDays: 14,
    baselineWindowDays: 28,
    typicalGapDays: 2,
    longestGapDays: 5,
    latestGapDays: 2,
    ...overrides,
  };
}

describe('never active', () => {
  it('a brand new account with no activity yet is NEW, not disengaged', () => {
    const decision = classifyEngagementState(
      facts({
        firstActivityDate: null,
        lastActivityDate: null,
        daysSinceLastActivity: null,
        historyDays: null,
        lifetimeActiveDays: 0,
        recentActiveDays: 0,
        baselineActiveDays: 0,
        typicalGapDays: null,
        latestGapDays: null,
        daysSinceAccountCreated: 3,
      })
    );
    expect(decision.state).toBe('NEW');
    expect(decision.basis).toBe('never_active');
    expect(decision.reason).toContain('has not been used yet');
  });

  it('an old account that has never been used is INACTIVE, not NEW', () => {
    const decision = classifyEngagementState(
      facts({
        firstActivityDate: null,
        lastActivityDate: null,
        daysSinceLastActivity: null,
        historyDays: null,
        lifetimeActiveDays: 0,
        recentActiveDays: 0,
        baselineActiveDays: 0,
        typicalGapDays: null,
        latestGapDays: null,
        daysSinceAccountCreated: NEW_ACCOUNT_GRACE_DAYS + 1,
      })
    );
    expect(decision.state).toBe('INACTIVE');
    expect(decision.basis).toBe('never_active');
  });

  it('the grace boundary is inclusive on the new side', () => {
    const base = {
      firstActivityDate: null,
      lastActivityDate: null,
      daysSinceLastActivity: null,
      historyDays: null,
      lifetimeActiveDays: 0,
      baselineActiveDays: 0,
    };
    expect(
      classifyEngagementState(facts({ ...base, daysSinceAccountCreated: NEW_ACCOUNT_GRACE_DAYS }))
        .state
    ).toBe('NEW');
    expect(
      classifyEngagementState(
        facts({ ...base, daysSinceAccountCreated: NEW_ACCOUNT_GRACE_DAYS + 1 })
      ).state
    ).toBe('INACTIVE');
  });
});

describe('NEW members', () => {
  it('a member whose first activity was inside the new window is NEW whatever her rate looks like', () => {
    const decision = classifyEngagementState(
      facts({
        historyDays: 3,
        lifetimeActiveDays: 1,
        recentActiveDays: 1,
        baselineActiveDays: 0,
        daysSinceLastActivity: 2,
        typicalGapDays: null,
        latestGapDays: null,
      })
    );
    expect(decision.state).toBe('NEW');
    expect(decision.basis).toBe('new_member');
    expect(decision.reason).toContain('Too early to compare');
  });

  it('stops being NEW the moment there is enough history for a real reading', () => {
    const justNew = classifyEngagementState(
      facts({ historyDays: NEW_MEMBER_HISTORY_DAYS - 1, baselineActiveDays: 0, daysSinceLastActivity: 1 })
    );
    const noLongerNew = classifyEngagementState(
      facts({ historyDays: NEW_MEMBER_HISTORY_DAYS, baselineActiveDays: 0, daysSinceLastActivity: 1 })
    );
    expect(justNew.state).toBe('NEW');
    expect(noLongerNew.state).not.toBe('NEW');
  });
});

describe('self-comparison path', () => {
  it('is used only when there is both enough history and enough baseline activity', () => {
    expect(hasSelfComparisonBaseline(facts())).toBe(true);
    expect(
      hasSelfComparisonBaseline(facts({ historyDays: MIN_HISTORY_DAYS_FOR_SELF_COMPARISON - 1 }))
    ).toBe(false);
    expect(
      hasSelfComparisonBaseline(
        facts({ baselineActiveDays: MIN_BASELINE_ACTIVE_DAYS_FOR_SELF_COMPARISON - 1 })
      )
    ).toBe(false);
    expect(hasSelfComparisonBaseline(facts({ historyDays: null }))).toBe(false);
  });

  it('a steady member is ACTIVE and says so against her own pattern', () => {
    const decision = classifyEngagementState(
      facts({ recentActiveDays: 7, baselineActiveDays: 14, daysSinceLastActivity: 1 })
    );
    expect(decision.state).toBe('ACTIVE');
    expect(decision.basis).toBe('self_comparison');
  });

  it('a member doing less than half her own rate is WATCH', () => {
    const decision = classifyEngagementState(
      facts({ recentActiveDays: 2, baselineActiveDays: 14, daysSinceLastActivity: 3 })
    );
    expect(decision.state).toBe('WATCH');
    expect(decision.basis).toBe('self_comparison');
    expect(decision.reason).toContain('less than half her own usual rate');
  });

  it('the decline boundary is exactly the documented ratio, not approximately', () => {
    // Baseline 14 of 28 days is a rate of 0.5. Half of that is 0.25, which
    // over a 14 day recent window is 3.5 days, so 3 active days declines and
    // 4 does not.
    expect(
      classifyEngagementState(facts({ recentActiveDays: 3, baselineActiveDays: 14 })).state
    ).toBe('WATCH');
    expect(
      classifyEngagementState(facts({ recentActiveDays: 4, baselineActiveDays: 14 })).state
    ).toBe('ACTIVE');
    const rates = activityRates(facts({ recentActiveDays: 4, baselineActiveDays: 14 }));
    expect(rates.recent).toBeGreaterThanOrEqual(rates.baseline * DECLINE_RATIO);
  });

  it('a sporadic member is not called absent for a gap she has always had', () => {
    // She normally returns every 7 days. Three of her own gaps is 21 days.
    const weekly = facts({
      typicalGapDays: 7,
      daysSinceLastActivity: 14,
      recentActiveDays: 2,
      baselineActiveDays: 4,
    });
    expect(absenceToleranceDays(weekly)).toBe(21);
    expect(classifyEngagementState(weekly).state).not.toBe('INACTIVE');
  });

  it('a daily member IS called absent after a gap a weekly member would survive', () => {
    const daily = facts({
      typicalGapDays: 1,
      daysSinceLastActivity: 8,
      recentActiveDays: 5,
      baselineActiveDays: 26,
    });
    expect(absenceToleranceDays(daily)).toBe(MIN_ABSENCE_DAYS);
    const decision = classifyEngagementState(daily);
    expect(decision.state).toBe('INACTIVE');
    expect(decision.basis).toBe('self_comparison');
    expect(decision.reason).toContain('longer than her own pattern');
  });

  it('absence outranks decline: a member who is both gone and slowing is INACTIVE', () => {
    const decision = classifyEngagementState(
      facts({ typicalGapDays: 1, daysSinceLastActivity: 20, recentActiveDays: 1, baselineActiveDays: 20 })
    );
    expect(decision.state).toBe('INACTIVE');
  });

  it('the absence tolerance never drops below the floor however tight her rhythm', () => {
    expect(absenceToleranceDays(facts({ typicalGapDays: 0 }))).toBe(MIN_ABSENCE_DAYS);
    expect(absenceToleranceDays(facts({ typicalGapDays: null }))).toBe(MIN_ABSENCE_DAYS);
    expect(absenceToleranceDays(facts({ typicalGapDays: 4 }))).toBe(4 * ABSENCE_GAP_MULTIPLIER);
  });
});

describe('insufficient-history fallback', () => {
  const thin = (daysSince: number) =>
    facts({
      historyDays: 20,
      lifetimeActiveDays: 3,
      recentActiveDays: 1,
      baselineActiveDays: 0,
      typicalGapDays: null,
      daysSinceLastActivity: daysSince,
    });

  it('uses fixed thresholds and says so, so nobody reads it as a personalized judgment', () => {
    const decision = classifyEngagementState(thin(2));
    expect(decision.state).toBe('ACTIVE');
    expect(decision.basis).toBe('fixed_thresholds');
    expect(decision.reason).toContain('Not enough history');
  });

  it('walks ACTIVE, WATCH, INACTIVE across the documented boundaries', () => {
    expect(classifyEngagementState(thin(FIXED_ACTIVE_MAX_DAYS)).state).toBe('ACTIVE');
    expect(classifyEngagementState(thin(FIXED_ACTIVE_MAX_DAYS + 1)).state).toBe('WATCH');
    expect(classifyEngagementState(thin(FIXED_WATCH_MAX_DAYS)).state).toBe('WATCH');
    expect(classifyEngagementState(thin(FIXED_WATCH_MAX_DAYS + 1)).state).toBe('INACTIVE');
  });

  it('a member with plenty of days but almost no baseline activity still falls back', () => {
    const decision = classifyEngagementState(
      facts({ historyDays: 300, baselineActiveDays: 1, daysSinceLastActivity: 2 })
    );
    expect(decision.basis).toBe('fixed_thresholds');
  });
});

describe('the decision is deterministic and carries its evidence', () => {
  it('the same facts always produce the same state', () => {
    const input = facts({ recentActiveDays: 2, baselineActiveDays: 14 });
    const first = classifyEngagementState(input);
    for (let i = 0; i < 20; i += 1) {
      expect(classifyEngagementState(input)).toEqual(first);
    }
  });

  it('toMemberEngagement keeps the facts attached so a reader can check the reasoning', () => {
    const input = facts();
    const engagement = toMemberEngagement(input);
    expect(engagement.memberId).toBe(input.memberId);
    expect(engagement.facts).toEqual(input);
    expect(['ACTIVE', 'WATCH', 'INACTIVE', 'NEW']).toContain(engagement.state);
  });

  it('no reason line interprets why the member behaved as she did', () => {
    const cases = [
      facts(),
      facts({ recentActiveDays: 1, baselineActiveDays: 20 }),
      facts({ typicalGapDays: 1, daysSinceLastActivity: 30 }),
      facts({ historyDays: 3, baselineActiveDays: 0 }),
      facts({ lastActivityDate: null, daysSinceLastActivity: null, historyDays: null }),
    ];
    const forbidden = [
      'motivat',
      'lazy',
      'struggl',
      'overwhelm',
      'give up',
      'gave up',
      'does not care',
      'stress',
      'pain',
      'sleep',
      'symptom',
    ];
    for (const input of cases) {
      const reason = classifyEngagementState(input).reason.toLowerCase();
      for (const word of forbidden) {
        expect(reason, `"${reason}" should not interpret or contain health content`).not.toContain(
          word
        );
      }
    }
  });
});
