/**
 * Engagement state, the rules. Pure, deterministic, no I/O.
 *
 * WHAT THIS IS. A description of whether a member is still using the app,
 * built from nothing but when she opened it. It is behavioral engagement
 * and nothing else. It is NOT a health score, NOT a wellness score, and NOT
 * a judgment about her. A member can be doing beautifully and be INACTIVE
 * here, and the reverse. What, if anything, to do about a state is a
 * decision for the coaching layer, which has the context this file
 * deliberately never sees.
 *
 * WHY SELF-COMPARISON FIRST. A member who has always opened the app twice a
 * week is not disengaging when she opens it twice this week. A member who
 * opened it daily for a month and has now gone four days without it may
 * well be. A single fixed threshold gets both of those wrong, so the first
 * question is always "compared with her own normal", and fixed numbers are
 * used only when there is not enough of her own history to have a normal.
 *
 * THE RULES, in the order they are applied.
 *
 *   0. NEVER ACTIVE. She has no meaningful activity at all.
 *      - Account created within the last 14 days: NEW. She has not had time
 *        to establish anything yet.
 *      - Older than that: INACTIVE. An account created months ago that has
 *        never been used is not new.
 *
 *   1. NEW. Her first activity was within the last 14 days. There is no
 *      such thing as a decline against three days of history, so she is
 *      described as new rather than measured against a baseline she has not
 *      had time to build.
 *
 *   2. SELF-COMPARISON, used when she has at least 42 days of history
 *      (14 recent + 28 baseline) AND was active on at least 4 days in the
 *      baseline window. Four days is the smallest number from which a
 *      "usual gap between visits" is meaningful rather than an accident.
 *      - Away longer than her own tolerance: INACTIVE. Her tolerance is
 *        three times her usual gap between visits, floored at 7 days, so a
 *        member who normally shows up weekly is not flagged for missing one
 *        week and a daily member is not ignored for a fortnight.
 *      - Recent visit rate has fallen to less than half her baseline rate:
 *        WATCH.
 *      - Otherwise: ACTIVE.
 *
 *   3. FIXED FALLBACK, used only when there is not enough of her own
 *      history for step 2. Deliberately blunt, and labelled as such in the
 *      basis field so nobody mistakes it for a personalized judgment.
 *      - Active within the last 7 days: ACTIVE
 *      - Last active 8 to 21 days ago: WATCH
 *      - Longer than that: INACTIVE
 *
 * Every threshold above is a named constant below. Changing one changes the
 * documented rule, the code, and the tests together.
 */

import type {
  EngagementBasis,
  EngagementState,
  MemberEngagement,
  MemberEngagementFacts,
} from './types';

/** Her first activity within this many days means she is still new, not declining. */
export const NEW_MEMBER_HISTORY_DAYS = 14;

/** An account this new that has never been used is NEW rather than INACTIVE. */
export const NEW_ACCOUNT_GRACE_DAYS = 14;

/** Days of history required before her own behavior can be a baseline. Recent window plus baseline window. */
export const MIN_HISTORY_DAYS_FOR_SELF_COMPARISON = 42;

/** Active days required inside the baseline window before "her normal" means anything. */
export const MIN_BASELINE_ACTIVE_DAYS_FOR_SELF_COMPARISON = 4;

/** Recent rate below this share of her baseline rate is a decline worth watching. */
export const DECLINE_RATIO = 0.5;

/** Her absence tolerance is this many of her own usual gaps. */
export const ABSENCE_GAP_MULTIPLIER = 3;

/** No member is called absent sooner than this, however tight her usual rhythm. */
export const MIN_ABSENCE_DAYS = 7;

/** Fixed fallback only: active within this many days is ACTIVE. */
export const FIXED_ACTIVE_MAX_DAYS = 7;

/** Fixed fallback only: beyond this many days is INACTIVE. */
export const FIXED_WATCH_MAX_DAYS = 21;

export type EngagementDecision = {
  state: EngagementState;
  basis: EngagementBasis;
  reason: string;
};

/** Her own tolerance for a gap, in days. Exported because the friction signals use the same number. */
export function absenceToleranceDays(facts: MemberEngagementFacts): number {
  const typical = facts.typicalGapDays;
  if (typical === null || !Number.isFinite(typical)) return MIN_ABSENCE_DAYS;
  return Math.max(MIN_ABSENCE_DAYS, Math.ceil(typical * ABSENCE_GAP_MULTIPLIER));
}

/** True when there is enough of her own history to compare her against herself. */
export function hasSelfComparisonBaseline(facts: MemberEngagementFacts): boolean {
  return (
    facts.historyDays !== null &&
    facts.historyDays >= MIN_HISTORY_DAYS_FOR_SELF_COMPARISON &&
    facts.baselineActiveDays >= MIN_BASELINE_ACTIVE_DAYS_FOR_SELF_COMPARISON
  );
}

/** Visits per day in each window, so a 14 day window and a 28 day window compare fairly. */
export function activityRates(facts: MemberEngagementFacts): { recent: number; baseline: number } {
  const recentWindow = Math.max(facts.recentWindowDays, 1);
  const baselineWindow = Math.max(facts.baselineWindowDays, 1);
  return {
    recent: facts.recentActiveDays / recentWindow,
    baseline: facts.baselineActiveDays / baselineWindow,
  };
}

export function classifyEngagementState(facts: MemberEngagementFacts): EngagementDecision {
  // 0. Never active.
  if (facts.lastActivityDate === null || facts.daysSinceLastActivity === null) {
    if (facts.daysSinceAccountCreated <= NEW_ACCOUNT_GRACE_DAYS) {
      return {
        state: 'NEW',
        basis: 'never_active',
        reason: `Account created ${facts.daysSinceAccountCreated} day${plural(facts.daysSinceAccountCreated)} ago and has not been used yet.`,
      };
    }
    return {
      state: 'INACTIVE',
      basis: 'never_active',
      reason: `Account created ${facts.daysSinceAccountCreated} days ago and has never been used.`,
    };
  }

  const daysSince = facts.daysSinceLastActivity;

  // 1. New.
  if (facts.historyDays !== null && facts.historyDays < NEW_MEMBER_HISTORY_DAYS) {
    return {
      state: 'NEW',
      basis: 'new_member',
      reason: `First used the app ${facts.historyDays} day${plural(facts.historyDays)} ago, on ${facts.lifetimeActiveDays} day${plural(facts.lifetimeActiveDays)} in total. Too early to compare against a normal pattern.`,
    };
  }

  // 2. Compared with her own history.
  if (hasSelfComparisonBaseline(facts)) {
    const tolerance = absenceToleranceDays(facts);
    if (daysSince > tolerance) {
      return {
        state: 'INACTIVE',
        basis: 'self_comparison',
        reason: `Last active ${daysSince} days ago. She usually returns every ${formatNumber(facts.typicalGapDays)} day${plural(facts.typicalGapDays ?? 0)}, so this gap is longer than her own pattern allows for.`,
      };
    }

    const rates = activityRates(facts);
    if (rates.baseline > 0 && rates.recent < rates.baseline * DECLINE_RATIO) {
      return {
        state: 'WATCH',
        basis: 'self_comparison',
        reason: `Active on ${facts.recentActiveDays} of the last ${facts.recentWindowDays} days, against ${facts.baselineActiveDays} of the ${facts.baselineWindowDays} days before that. That is less than half her own usual rate.`,
      };
    }

    return {
      state: 'ACTIVE',
      basis: 'self_comparison',
      reason: `Active on ${facts.recentActiveDays} of the last ${facts.recentWindowDays} days, in line with her own recent pattern. Last active ${daysSince} day${plural(daysSince)} ago.`,
    };
  }

  // 3. Fixed fallback.
  if (daysSince <= FIXED_ACTIVE_MAX_DAYS) {
    return {
      state: 'ACTIVE',
      basis: 'fixed_thresholds',
      reason: `Last active ${daysSince} day${plural(daysSince)} ago. Not enough history yet to compare her with her own pattern, so a fixed 7 day threshold was used.`,
    };
  }
  if (daysSince <= FIXED_WATCH_MAX_DAYS) {
    return {
      state: 'WATCH',
      basis: 'fixed_thresholds',
      reason: `Last active ${daysSince} days ago. Not enough history yet to compare her with her own pattern, so a fixed 8 to 21 day threshold was used.`,
    };
  }
  return {
    state: 'INACTIVE',
    basis: 'fixed_thresholds',
    reason: `Last active ${daysSince} days ago. Not enough history yet to compare her with her own pattern, so a fixed 21 day threshold was used.`,
  };
}

export function toMemberEngagement(facts: MemberEngagementFacts): MemberEngagement {
  const decision = classifyEngagementState(facts);
  return {
    memberId: facts.memberId,
    displayName: facts.displayName,
    state: decision.state,
    basis: decision.basis,
    reason: decision.reason,
    facts,
  };
}

function plural(count: number): string {
  return count === 1 ? '' : 's';
}

function formatNumber(value: number | null): string {
  if (value === null) return 'unknown';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
