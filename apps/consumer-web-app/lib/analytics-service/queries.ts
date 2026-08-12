/**
 * Agent-ready queries. The questions an administrator, and later an
 * automated Engagement Agent, will actually ask.
 *
 * Every function here is a wrapper. None of them contain a detection of
 * their own: each one calls the same shared function in ./detections.ts
 * that the corresponding friction signal calls, or reads a group A to D
 * report. That is the point. "Has she disengaged" asked by a dashboard and
 * "has she disengaged" asked by a coaching prompt have to be the same
 * question with the same answer.
 *
 * WHAT IS DELIBERATELY NOT HERE. No messaging, no scheduling, no autonomous
 * agent, no LLM call, no decision about what any member should be told.
 * This file identifies where engagement is breaking down and stops there.
 * Deciding what support a member receives belongs to the coaching layer,
 * which can see the health context this layer never touches.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getIncompleteFlows,
  getMemberEngagementStates,
  getMemberFeatureChanges,
  getPlatformFeatureTrend,
} from './detections';
import { absenceToleranceDays } from './engagementState';
import { getFunnel } from './reports';
import {
  DECLINE_RATIO,
  FEATURE_DECLINE_MINIMUM_BASELINE_EVENTS,
  REPEATED_START_MINIMUM,
  getMemberFrictionSignals,
} from './friction';
import type {
  AnalyticsOptions,
  FeatureChangeDetection,
  IncompleteFlowDetection,
  MemberEngagement,
  MemberFollowUpCandidate,
  PlatformFeatureTrend,
  WeakestFunnelStage,
} from './types';

/**
 * Which members have disengaged. Engagement state INACTIVE, which is
 * decided against each member's own rhythm where she has enough history and
 * against a fixed 21 day threshold where she does not. Ordered by how long
 * she has been gone.
 */
export async function findDisengagedMembers(
  supabase: SupabaseClient,
  options?: AnalyticsOptions
): Promise<MemberEngagement[]> {
  const states = await getMemberEngagementStates(supabase, options);
  return states
    .filter((member) => member.state === 'INACTIVE')
    .sort((a, b) => (b.facts.daysSinceLastActivity ?? 0) - (a.facts.daysSinceLastActivity ?? 0));
}

/**
 * Which members have not returned recently. Distinct from disengaged: this
 * takes an explicit day threshold rather than each member's own tolerance,
 * so an administrator can ask "who has not been here in 10 days" without
 * arguing with the engagement rules. Members who have never been active are
 * included, with a null gap, because "never came back" is the extreme case
 * of the same question rather than a missing row.
 */
export async function findMembersNotReturnedRecently(
  supabase: SupabaseClient,
  thresholdDays: number,
  options?: AnalyticsOptions
): Promise<MemberEngagement[]> {
  const states = await getMemberEngagementStates(supabase, options);
  return states
    .filter((member) => {
      const days = member.facts.daysSinceLastActivity;
      return days === null || days >= thresholdDays;
    })
    .sort((a, b) => rank(b.facts.daysSinceLastActivity) - rank(a.facts.daysSinceLastActivity));
}

/** Never-active sorts above everyone, because it is the longest absence there is. */
function rank(days: number | null): number {
  return days === null ? Number.MAX_SAFE_INTEGER : days;
}

/**
 * Which members started something and did not finish it. The same detection
 * the repeated-incomplete-flow friction signal reads, with the same
 * threshold of at least 3 starts and fewer than half of them finished.
 * Onboarding is included at one start, because never finishing setup at all
 * is worth seeing immediately.
 */
export async function findMembersWithIncompleteFlows(
  supabase: SupabaseClient,
  options?: AnalyticsOptions
): Promise<IncompleteFlowDetection[]> {
  const rows = await getIncompleteFlows(supabase, options);
  return rows
    .filter((row) => {
      if (row.flowKey === 'onboarding') return row.completedEvents === 0 && row.startedEvents >= 1;
      if (row.startedEvents < REPEATED_START_MINIMUM) return false;
      return (row.completedEvents * 100) / row.startedEvents < 50;
    })
    .sort((a, b) => b.unfinishedEvents - a.unfinishedEvents);
}

/**
 * Which members have significantly reduced their normal usage. Overall
 * activity, judged against each member's own baseline, using the same
 * detection and the same halving rule the overall-decline friction signal
 * uses. Members without enough history to have a baseline are excluded
 * rather than counted as declining.
 */
export async function findMembersWithReducedUsage(
  supabase: SupabaseClient,
  options?: AnalyticsOptions
): Promise<MemberEngagement[]> {
  const states = await getMemberEngagementStates(supabase, options);
  return states
    .filter((member) => member.state === 'WATCH' && member.basis === 'self_comparison')
    .sort((a, b) => declineSeverity(a) - declineSeverity(b));
}

function declineSeverity(member: MemberEngagement): number {
  const recent = member.facts.recentActiveDays / Math.max(member.facts.recentWindowDays, 1);
  const baseline = member.facts.baselineActiveDays / Math.max(member.facts.baselineWindowDays, 1);
  return baseline > 0 ? recent / baseline : 1;
}

/**
 * Which features one member has stopped using. Per feature rather than
 * overall, so "she gave up on Food Lens" is visible even while her overall
 * activity holds steady.
 */
export async function findMemberFeatureDeclines(
  supabase: SupabaseClient,
  memberId: string,
  options?: AnalyticsOptions
): Promise<FeatureChangeDetection[]> {
  const rows = await getMemberFeatureChanges(supabase, { ...options, memberId });
  return rows
    .filter(
      (row) =>
        row.baselineEvents >= FEATURE_DECLINE_MINIMUM_BASELINE_EVENTS &&
        row.changeRatio !== null &&
        row.changeRatio < DECLINE_RATIO
    )
    .sort((a, b) => (a.changeRatio ?? 1) - (b.changeRatio ?? 1));
}

/**
 * Which features have unusual usage drops across everybody. A feature with
 * no baseline usage is excluded rather than reported as a drop: a feature
 * nobody has ever used has not declined.
 */
export async function findFeaturesWithUnusualUsageDrops(
  supabase: SupabaseClient,
  options?: AnalyticsOptions & { windowDays?: number; dropThreshold?: number }
): Promise<PlatformFeatureTrend[]> {
  const threshold = options?.dropThreshold ?? DECLINE_RATIO;
  const report = await getPlatformFeatureTrend(supabase, options);
  return report.features.filter(
    (feature) =>
      feature.baselineEvents >= FEATURE_DECLINE_MINIMUM_BASELINE_EVENTS &&
      feature.changeRatio !== null &&
      feature.changeRatio < threshold
  );
}

/**
 * Which funnel stage is losing the most members. Measured in members lost
 * between one measurable stage and the next, not in percentage: a stage
 * that loses 90 percent of two people is not the platform's biggest
 * problem. Unmeasurable stages are skipped rather than treated as total
 * loss.
 */
export async function findWeakestFunnelStage(
  supabase: SupabaseClient,
  options?: AnalyticsOptions
): Promise<WeakestFunnelStage> {
  const funnel = await getFunnel(supabase, options);

  if (funnel.cohortSize === 0) {
    return {
      stageKey: null,
      label: null,
      previousStageKey: null,
      membersLost: null,
      dropOffRate: null,
      reason:
        'No members signed up inside this period, so there is no cohort to follow through the funnel.',
    };
  }

  const measurable = funnel.stages.filter((stage) => stage.measurable && stage.members !== null);
  let worst: WeakestFunnelStage | null = null;

  for (let i = 1; i < measurable.length; i += 1) {
    const previous = measurable[i - 1]!;
    const stage = measurable[i]!;
    const lost = Math.max((previous.members ?? 0) - (stage.members ?? 0), 0);
    if (worst === null || lost > (worst.membersLost ?? 0)) {
      worst = {
        stageKey: stage.key,
        label: stage.label,
        previousStageKey: previous.key,
        membersLost: lost,
        dropOffRate:
          previous.members && previous.members > 0
            ? Math.round((lost * 1000) / previous.members) / 10
            : null,
        reason: `${lost} of ${previous.members} members did not go from "${previous.label}" to "${stage.label}".`,
      };
    }
  }

  if (worst === null || (worst.membersLost ?? 0) === 0) {
    return {
      stageKey: null,
      label: null,
      previousStageKey: null,
      membersLost: 0,
      dropOffRate: null,
      reason: 'No measurable funnel stage lost any members in this period.',
    };
  }

  return worst;
}

/**
 * Which members may deserve a coach follow-up.
 *
 * This is a shortlist for a human to look at, ordered by how many separate
 * behavioral things are true at once. It is NOT a recommendation, NOT a
 * priority ranking of who needs help most, and NOT informed by anything
 * about a member's health. A coach reading it decides what, if anything, to
 * do, with the clinical and coaching context this layer cannot see.
 *
 * The attention score is a deterministic count of reasons, nothing more:
 * two points for a disengaged member, one for a member being watched, and
 * one for each distinct friction signal that indicates something stuck.
 * Signals that are neutral or positive (a consistent habit, a return after
 * an absence) add nothing to it and are still listed, because a coach
 * seeing "she has been back three days running" alongside "she has not
 * finished onboarding" is reading the real situation.
 */
export async function findMembersForCoachFollowUp(
  supabase: SupabaseClient,
  options?: AnalyticsOptions & { limit?: number }
): Promise<MemberFollowUpCandidate[]> {
  const limit = options?.limit ?? 25;

  // Only members whose state already warrants a look get the extra per
  // member friction queries. Running them for every member on the platform
  // would be several queries per member for no gain.
  const shortlist = (await getMemberEngagementStates(supabase, options))
    .filter((member) => member.state === 'INACTIVE' || member.state === 'WATCH')
    .sort((a, b) => (b.facts.daysSinceLastActivity ?? 0) - (a.facts.daysSinceLastActivity ?? 0))
    .slice(0, limit);

  const candidates = await Promise.all(
    shortlist.map(async (member) => {
      const friction = await getMemberFrictionSignals(supabase, member.memberId, options);
      const stuckSignals = friction.signals.filter((signal) => STUCK_SIGNALS.has(signal.type));

      const reasons = [member.reason, ...stuckSignals.map((signal) => signal.reason)];
      const attentionScore =
        (member.state === 'INACTIVE' ? 2 : 1) + stuckSignals.length;

      return {
        memberId: member.memberId,
        displayName: member.displayName,
        state: member.state,
        basis: member.basis,
        attentionScore,
        reasons,
        signalTypes: friction.signals.map((signal) => signal.type),
        facts: member.facts,
      } satisfies MemberFollowUpCandidate;
    })
  );

  return candidates.sort(
    (a, b) =>
      b.attentionScore - a.attentionScore ||
      (b.facts.daysSinceLastActivity ?? 0) - (a.facts.daysSinceLastActivity ?? 0)
  );
}

/** Signal types that mean something is stuck, as opposed to neutral or positive context. */
const STUCK_SIGNALS = new Set([
  'repeated_incomplete_flow',
  'onboarding_not_completed',
  'viewed_without_engaging',
  'opened_once_not_revisited',
  'feature_use_declined',
  'overall_activity_declined',
  'long_absence',
]);

/** Re-exported so a caller does not have to know which module owns the absence rule. */
export { absenceToleranceDays };
