/**
 * Behavioral friction signals: where a member appears to be getting stuck,
 * judged only by what she did and did not do in the app.
 *
 * WHAT THIS IS NOT.
 *   - Not a coaching engine. It never decides what she should be told.
 *   - Not an LLM. Every signal here is a deterministic comparison of counts
 *     and dates. The same inputs always produce the same signals.
 *   - Not an interpretation. It may say "the Daily Reset was started five
 *     times and finished once in the last seven days". It may never say
 *     "she lacks motivation", "she is overwhelmed", or anything else about
 *     why. The why is not in the data, and inventing it is the failure this
 *     file is written to avoid.
 *   - Not health information. Nothing here reads or returns a check-in
 *     answer, a pain location, a sleep number, a questionnaire response, or
 *     a food detail.
 *
 * WHERE THE SIGNALS COME FROM. Every one is built from the shared detection
 * functions in ./detections.ts. Where an agent-ready query in ./queries.ts
 * asks the same question (started but did not finish, reduced usage, long
 * absence), it calls the same detection, so the two can never disagree.
 * Nothing here re-derives a condition for itself.
 *
 * EVIDENCE SUFFICIENCY, not confidence in a diagnosis. Each signal carries
 * how much behavior stood behind it: how many observations and over how
 * long. It says nothing about the member's health and nothing about how
 * certain we are that she has a problem. It answers one question: how much
 * did we actually see before saying this.
 *
 * The coaching layer that eventually reads these will combine them with the
 * things this layer cannot see: driver states, Today's Focus, the Reset
 * Plan, correlation findings, check-in history, her timeline, her goals.
 * Deciding what support she receives is that layer's job, with that
 * context. Analytics only says where engagement is breaking down.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getConsistentFeatureUse,
  getIncompleteFlows,
  getMemberEngagementFacts,
  getMemberFeatureChanges,
  getViewsWithoutEngagement,
} from './detections';
import { absenceToleranceDays, hasSelfComparisonBaseline, toMemberEngagement } from './engagementState';
import { resolveAnalyticsRange, todayUtc } from './range';
import type {
  AnalyticsOptions,
  ConsistentUseDetection,
  EvidenceSufficiency,
  FeatureChangeDetection,
  FrictionSignal,
  IncompleteFlowDetection,
  MemberEngagementFacts,
  MemberFrictionReport,
  ViewWithoutEngagementDetection,
} from './types';

// ---------------------------------------------------------------------
// Thresholds. Every one is named, and every one is documented as a rule
// above the function that applies it.
// ---------------------------------------------------------------------

/** Starts required before "started and did not finish" is a pattern rather than one bad day. */
export const REPEATED_START_MINIMUM = 3;

/** A flow finished less often than this is treated as repeatedly unfinished. */
export const INCOMPLETE_COMPLETION_RATE = 50;

/** Views required before "looked at it and never touched it" means anything. */
export const VIEW_WITHOUT_ENGAGEMENT_MINIMUM_VIEWS = 3;

/** Days after a single visit to a feature before "opened once and never went back" is fair. */
export const NOT_REVISITED_AFTER_DAYS = 7;

/** Baseline events required before a feature decline is a decline rather than noise. */
export const FEATURE_DECLINE_MINIMUM_BASELINE_EVENTS = 3;

/** Recent rate below this share of the baseline rate counts as a meaningful decline. */
export const DECLINE_RATIO = 0.5;

/** A closed gap this long, followed by a return, is a return after an absence. */
export const RETURN_AFTER_ABSENCE_GAP_DAYS = 14;

/** Her return has to be this recent for the return itself to be the news. */
export const RETURN_RECENCY_DAYS = 7;

/** Share of her active days a feature has to appear on before it is a consistent habit. */
export const CONSISTENT_USE_SHARE = 60;

/** Active days required before consistency means anything. */
export const CONSISTENT_USE_MINIMUM_DAYS = 5;

/** Below this much history, no friction pattern is claimed at all. */
export const MINIMUM_HISTORY_DAYS_FOR_ANY_SIGNAL = 7;

// ---------------------------------------------------------------------
// Evidence sufficiency
// ---------------------------------------------------------------------

/**
 * How much behavior stood behind a signal. Two inputs only: how many
 * relevant observations there were, and over how many days of history. No
 * health input, no severity, no certainty about the member.
 *
 *   strong   at least 10 observations across at least 21 days of history
 *   moderate at least 4 observations across at least 10 days of history
 *   low      anything less
 */
export function evidenceSufficiency(
  observations: number,
  historyDays: number | null
): { level: EvidenceSufficiency; reason: string } {
  const days = historyDays ?? 0;
  if (observations >= 10 && days >= 21) {
    return {
      level: 'strong',
      reason: `Based on ${observations} recorded actions across ${days} days of app history.`,
    };
  }
  if (observations >= 4 && days >= 10) {
    return {
      level: 'moderate',
      reason: `Based on ${observations} recorded actions across ${days} days of app history.`,
    };
  }
  return {
    level: 'low',
    reason: `Based on only ${observations} recorded action${observations === 1 ? '' : 's'} across ${days} day${days === 1 ? '' : 's'} of app history.`,
  };
}

// ---------------------------------------------------------------------
// The individual signal builders. Pure: detection rows in, signals out.
// ---------------------------------------------------------------------

/**
 * RULE: a flow started at least 3 times inside the period and finished less
 * than half of those times. Onboarding is reported under its own signal
 * type, because "never finished setting up" is a different situation from
 * "keeps abandoning a daily habit".
 */
export function incompleteFlowSignals(
  rows: IncompleteFlowDetection[],
  facts: MemberEngagementFacts
): FrictionSignal[] {
  const signals: FrictionSignal[] = [];

  for (const row of rows) {
    const rate = row.startedEvents > 0 ? (row.completedEvents * 100) / row.startedEvents : 0;

    if (row.flowKey === 'onboarding') {
      if (row.startedEvents >= 1 && row.completedEvents === 0) {
        signals.push({
          type: 'onboarding_not_completed',
          reason: `Onboarding was started ${countPhrase(row.startedEvents, 'time')} and has never been completed. The most recent start was ${row.lastStartedDate}.`,
          evidence: {
            flowKey: row.flowKey,
            startedEvents: row.startedEvents,
            completedEvents: row.completedEvents,
            lastStartedDate: row.lastStartedDate,
          },
          comparisonPeriod: null,
          ...sufficiency(row.startedEvents, facts),
        });
      }
      continue;
    }

    if (row.startedEvents >= REPEATED_START_MINIMUM && rate < INCOMPLETE_COMPLETION_RATE) {
      signals.push({
        type: 'repeated_incomplete_flow',
        reason: `${row.label} was started ${countPhrase(row.startedEvents, 'time')} and completed ${countPhrase(row.completedEvents, 'time')} in this period.`,
        evidence: {
          flowKey: row.flowKey,
          featureKey: row.featureKey,
          startedEvents: row.startedEvents,
          completedEvents: row.completedEvents,
          startedDays: row.startedDays,
          completionRate: row.completionRate,
          lastStartedDate: row.lastStartedDate,
          lastCompletedDate: row.lastCompletedDate,
        },
        comparisonPeriod: null,
        ...sufficiency(row.startedEvents, facts),
      });
    }
  }

  return signals;
}

/**
 * RULE: a feature was opened at least 3 times in the period and nothing was
 * done inside it even once.
 */
export function viewWithoutEngagementSignals(
  rows: ViewWithoutEngagementDetection[],
  facts: MemberEngagementFacts
): FrictionSignal[] {
  return rows
    .filter(
      (row) => row.views >= VIEW_WITHOUT_ENGAGEMENT_MINIMUM_VIEWS && row.engagements === 0
    )
    .map((row) => ({
      type: 'viewed_without_engaging' as const,
      reason: `${row.label} was opened ${countPhrase(row.views, 'time')} across ${countPhrase(row.viewDays, 'day')} in this period, with nothing done inside it.`,
      evidence: {
        featureKey: row.featureKey,
        views: row.views,
        viewDays: row.viewDays,
        engagements: row.engagements,
        firstViewDate: row.firstViewDate,
        lastViewDate: row.lastViewDate,
      },
      comparisonPeriod: null,
      ...sufficiency(row.views, facts),
    }));
}

/**
 * RULE: a feature was opened on exactly one day, that day was at least 7
 * days ago, and she has used the app since. The last condition is what
 * separates "opened it once and never went back" from "opened it once and
 * has not been back at all", which is a different signal entirely.
 */
export function notRevisitedSignals(
  rows: ViewWithoutEngagementDetection[],
  facts: MemberEngagementFacts,
  referenceDate: string
): FrictionSignal[] {
  return rows
    .filter((row) => {
      if (row.viewDays !== 1 || row.lastViewDate === null) return false;
      const daysSinceView = daysBetween(row.lastViewDate, referenceDate);
      if (daysSinceView < NOT_REVISITED_AFTER_DAYS) return false;
      // She has been in the app since that single visit.
      return facts.lastActivityDate !== null && facts.lastActivityDate > row.lastViewDate;
    })
    .map((row) => ({
      type: 'opened_once_not_revisited' as const,
      reason: `${row.label} was opened on one day only, ${row.lastViewDate}, and has not been opened again in ${countPhrase(daysBetween(row.lastViewDate!, referenceDate), 'day')} of continued app use.`,
      evidence: {
        featureKey: row.featureKey,
        views: row.views,
        viewDays: row.viewDays,
        lastViewDate: row.lastViewDate,
        daysSinceLastView: daysBetween(row.lastViewDate!, referenceDate),
        lastActivityDate: facts.lastActivityDate,
      },
      comparisonPeriod: null,
      ...sufficiency(row.views, facts),
    }));
}

/**
 * RULE: a feature she used at least 3 times in her baseline window is now
 * being used at less than half that daily rate. The baseline window is
 * twice the recent one and sits immediately before it, so one quiet week
 * inside a normal rhythm is not a decline.
 */
export function featureDeclineSignals(
  rows: FeatureChangeDetection[],
  facts: MemberEngagementFacts
): FrictionSignal[] {
  return rows
    .filter(
      (row) =>
        row.baselineEvents >= FEATURE_DECLINE_MINIMUM_BASELINE_EVENTS &&
        row.changeRatio !== null &&
        row.changeRatio < DECLINE_RATIO
    )
    .map((row) => ({
      type: 'feature_use_declined' as const,
      reason: `${row.label} was used ${countPhrase(row.recentEvents, 'time')} in the last ${row.recentWindow.days} days, against ${countPhrase(row.baselineEvents, 'time')} in the ${row.baselineWindow.days} days before that. That is a lower rate than her own recent normal.`,
      evidence: {
        featureKey: row.featureKey,
        recentEvents: row.recentEvents,
        baselineEvents: row.baselineEvents,
        recentRatePerDay: row.recentRatePerDay,
        baselineRatePerDay: row.baselineRatePerDay,
        changeRatio: row.changeRatio,
        lastUsedDate: row.lastUsedDate,
      },
      comparisonPeriod: { recent: row.recentWindow, baseline: row.baselineWindow },
      ...sufficiency(row.recentEvents + row.baselineEvents, facts),
    }));
}

/**
 * RULE: her overall visit rate in the last 14 days is less than half her own
 * rate across the 28 days before that. Only applied when she has enough of
 * her own history to have a normal (see hasSelfComparisonBaseline), because
 * a decline against no baseline is not a decline.
 */
export function overallDeclineSignals(facts: MemberEngagementFacts): FrictionSignal[] {
  if (!hasSelfComparisonBaseline(facts)) return [];

  const recentRate = facts.recentActiveDays / Math.max(facts.recentWindowDays, 1);
  const baselineRate = facts.baselineActiveDays / Math.max(facts.baselineWindowDays, 1);
  if (baselineRate <= 0 || recentRate >= baselineRate * DECLINE_RATIO) return [];

  const recentEnd = facts.referenceDate;
  const recentStart = shift(recentEnd, -(facts.recentWindowDays - 1));
  const baselineEnd = shift(recentStart, -1);
  const baselineStart = shift(baselineEnd, -(facts.baselineWindowDays - 1));

  return [
    {
      type: 'overall_activity_declined',
      reason: `She opened the app on ${countPhrase(facts.recentActiveDays, 'day')} in the last ${facts.recentWindowDays} days, against ${countPhrase(facts.baselineActiveDays, 'day')} in the ${facts.baselineWindowDays} days before that.`,
      evidence: {
        recentActiveDays: facts.recentActiveDays,
        recentWindowDays: facts.recentWindowDays,
        baselineActiveDays: facts.baselineActiveDays,
        baselineWindowDays: facts.baselineWindowDays,
        recentRatePerDay: round3(recentRate),
        baselineRatePerDay: round3(baselineRate),
        lastActivityDate: facts.lastActivityDate,
      },
      comparisonPeriod: {
        recent: { start: recentStart, end: recentEnd, days: facts.recentWindowDays },
        baseline: { start: baselineStart, end: baselineEnd, days: facts.baselineWindowDays },
      },
      ...sufficiency(facts.recentActiveDays + facts.baselineActiveDays, facts),
    },
  ];
}

/**
 * RULE: she has been away longer than her own tolerance, which is three
 * times her usual gap between visits with a floor of 7 days. When there is
 * not enough history to know her usual gap, the floor is used on its own,
 * and the signal says so.
 */
export function longAbsenceSignals(facts: MemberEngagementFacts): FrictionSignal[] {
  if (facts.daysSinceLastActivity === null || facts.lastActivityDate === null) return [];
  const tolerance = absenceToleranceDays(facts);
  if (facts.daysSinceLastActivity <= tolerance) return [];

  const personalized = facts.typicalGapDays !== null && hasSelfComparisonBaseline(facts);

  return [
    {
      type: 'long_absence',
      reason: personalized
        ? `Last active ${countPhrase(facts.daysSinceLastActivity, 'day')} ago, on ${facts.lastActivityDate}. She usually returns every ${formatNumber(facts.typicalGapDays)} days.`
        : `Last active ${countPhrase(facts.daysSinceLastActivity, 'day')} ago, on ${facts.lastActivityDate}. There is not enough history to know her usual rhythm, so a fixed ${tolerance} day threshold was used.`,
      evidence: {
        daysSinceLastActivity: facts.daysSinceLastActivity,
        lastActivityDate: facts.lastActivityDate,
        typicalGapDays: facts.typicalGapDays,
        toleranceDays: tolerance,
        comparisonBasis: personalized ? 'her own usual gap' : 'fixed threshold',
      },
      comparisonPeriod: null,
      ...sufficiency(facts.lifetimeActiveDays, facts),
    },
  ];
}

/**
 * RULE: the gap her most recent visit closed was at least 14 days, and that
 * visit was within the last 7 days. Reported because a member who has just
 * come back is a different situation from one who never left, not because
 * it is a problem.
 */
export function returnedAfterAbsenceSignals(facts: MemberEngagementFacts): FrictionSignal[] {
  if (
    facts.latestGapDays === null ||
    facts.daysSinceLastActivity === null ||
    facts.lastActivityDate === null
  ) {
    return [];
  }
  if (facts.latestGapDays < RETURN_AFTER_ABSENCE_GAP_DAYS) return [];
  if (facts.daysSinceLastActivity > RETURN_RECENCY_DAYS) return [];

  return [
    {
      type: 'returned_after_absence',
      reason: `She came back on ${facts.lastActivityDate} after ${countPhrase(facts.latestGapDays, 'day')} away.`,
      evidence: {
        latestGapDays: facts.latestGapDays,
        lastActivityDate: facts.lastActivityDate,
        daysSinceLastActivity: facts.daysSinceLastActivity,
        recentActiveDays: facts.recentActiveDays,
      },
      comparisonPeriod: null,
      ...sufficiency(facts.lifetimeActiveDays, facts),
    },
  ];
}

/**
 * RULE: a feature appears on at least 60 percent of her active days, across
 * at least 5 active days. Not friction. Named for the same reason friction
 * is: what is already working is context a coaching layer needs before it
 * suggests anything.
 */
export function consistentUseSignals(
  rows: ConsistentUseDetection[],
  facts: MemberEngagementFacts
): FrictionSignal[] {
  return rows
    .filter(
      (row) =>
        row.memberActiveDays >= CONSISTENT_USE_MINIMUM_DAYS &&
        row.shareOfActiveDays !== null &&
        row.shareOfActiveDays >= CONSISTENT_USE_SHARE
    )
    .map((row) => ({
      type: 'consistent_feature_use' as const,
      reason: `${row.label} was used on ${countPhrase(row.usedDays, 'day')} of the ${countPhrase(row.memberActiveDays, 'day')} she opened the app in this period.`,
      evidence: {
        featureKey: row.featureKey,
        usedDays: row.usedDays,
        memberActiveDays: row.memberActiveDays,
        shareOfActiveDays: row.shareOfActiveDays,
        events: row.events,
      },
      comparisonPeriod: null,
      ...sufficiency(row.usedDays, facts),
    }));
}

/**
 * RULE: fewer than 7 days of history, or no activity at all. Returned as an
 * explicit signal rather than as an empty list, because "we do not know
 * yet" and "we looked and there is nothing wrong" are different answers and
 * a caller must be able to tell them apart.
 */
export function insufficientHistorySignal(facts: MemberEngagementFacts): FrictionSignal | null {
  if (facts.lastActivityDate === null) {
    return {
      type: 'insufficient_behavioral_history',
      reason: `No app activity has been recorded for this member yet. The account was created ${countPhrase(facts.daysSinceAccountCreated, 'day')} ago.`,
      evidence: {
        lifetimeActiveDays: 0,
        daysSinceAccountCreated: facts.daysSinceAccountCreated,
        accountCreatedDate: facts.accountCreatedDate,
      },
      comparisonPeriod: null,
      evidenceSufficiency: 'low',
      evidenceSufficiencyReason: 'No behavioral events exist for this member.',
    };
  }

  if (facts.historyDays !== null && facts.historyDays < MINIMUM_HISTORY_DAYS_FOR_ANY_SIGNAL) {
    return {
      type: 'insufficient_behavioral_history',
      reason: `Only ${countPhrase(facts.historyDays, 'day')} of app history exists, across ${countPhrase(facts.lifetimeActiveDays, 'active day')}. That is not enough to tell a pattern from a normal week.`,
      evidence: {
        historyDays: facts.historyDays,
        lifetimeActiveDays: facts.lifetimeActiveDays,
        firstActivityDate: facts.firstActivityDate,
        lastActivityDate: facts.lastActivityDate,
      },
      comparisonPeriod: null,
      evidenceSufficiency: 'low',
      evidenceSufficiencyReason: `Only ${countPhrase(facts.historyDays, 'day')} of history, below the ${MINIMUM_HISTORY_DAYS_FOR_ANY_SIGNAL} day minimum for any pattern claim.`,
    };
  }

  return null;
}

// ---------------------------------------------------------------------
// The orchestrator
// ---------------------------------------------------------------------

/**
 * Every friction signal for one member over one period.
 *
 * When there is not enough history for any pattern claim, the report
 * contains exactly one signal saying so, and no others. Returning a
 * half-confident decline signal alongside "we do not have enough data" would
 * be contradicting itself.
 */
export async function getMemberFrictionSignals(
  supabase: SupabaseClient,
  memberId: string,
  options?: AnalyticsOptions
): Promise<MemberFrictionReport> {
  const range = resolveAnalyticsRange(options?.period, options?.today ?? todayUtc());
  const scoped = { ...options, memberId };

  const [factsRows, incomplete, views, featureChanges, consistent] = await Promise.all([
    getMemberEngagementFacts(supabase, scoped),
    getIncompleteFlows(supabase, scoped),
    getViewsWithoutEngagement(supabase, scoped),
    getMemberFeatureChanges(supabase, scoped),
    getConsistentFeatureUse(supabase, scoped),
  ]);

  const facts = factsRows[0];
  const envelope = {
    range: { start: range.start ?? range.end, end: range.end },
    includeTestAccounts: options?.includeTestAccounts === true,
  };

  if (!facts) {
    // Not an in-scope member: an unknown id, a coach, or a test account
    // while the toggle is off. An empty report with a stated reason, never
    // an invented member.
    return {
      ...envelope,
      memberId,
      displayName: null,
      signals: [
        {
          type: 'insufficient_behavioral_history',
          reason:
            'No member record is in scope for this id. It may be a test account while test accounts are excluded, a coach or administrator account, or an id that does not exist.',
          evidence: { memberId },
          comparisonPeriod: null,
          evidenceSufficiency: 'low',
          evidenceSufficiencyReason: 'No behavioral data could be read for this id.',
        },
      ],
      engagement: {
        memberId,
        displayName: null,
        state: 'INACTIVE',
        basis: 'never_active',
        reason: 'No member record is in scope for this id.',
        facts: emptyFacts(memberId, range.end),
      },
    };
  }

  const engagement = toMemberEngagement(facts);
  const insufficient = insufficientHistorySignal(facts);
  if (insufficient) {
    return { ...envelope, memberId, displayName: facts.displayName, signals: [insufficient], engagement };
  }

  const signals: FrictionSignal[] = [
    ...incompleteFlowSignals(incomplete, facts),
    ...viewWithoutEngagementSignals(views, facts),
    ...notRevisitedSignals(views, facts, range.end),
    ...featureDeclineSignals(featureChanges, facts),
    ...overallDeclineSignals(facts),
    ...longAbsenceSignals(facts),
    ...returnedAfterAbsenceSignals(facts),
    ...consistentUseSignals(consistent, facts),
  ];

  return { ...envelope, memberId, displayName: facts.displayName, signals, engagement };
}

// ---------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------

function sufficiency(
  observations: number,
  facts: MemberEngagementFacts
): { evidenceSufficiency: EvidenceSufficiency; evidenceSufficiencyReason: string } {
  const { level, reason } = evidenceSufficiency(observations, facts.historyDays);
  return { evidenceSufficiency: level, evidenceSufficiencyReason: reason };
}

function countPhrase(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00.000Z`).getTime();
  const b = new Date(`${to}T00:00:00.000Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

function shift(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function formatNumber(value: number | null): string {
  if (value === null) return 'an unknown number of';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function emptyFacts(memberId: string, referenceDate: string): MemberEngagementFacts {
  return {
    memberId,
    displayName: null,
    accountCreatedDate: referenceDate,
    isTestAccount: false,
    referenceDate,
    firstActivityDate: null,
    lastActivityDate: null,
    daysSinceLastActivity: null,
    daysSinceAccountCreated: 0,
    historyDays: null,
    lifetimeActiveDays: 0,
    recentActiveDays: 0,
    recentWindowDays: 14,
    baselineActiveDays: 0,
    baselineWindowDays: 28,
    typicalGapDays: null,
    longestGapDays: null,
    latestGapDays: null,
  };
}
