/**
 * The product insights view's rules, in one pure module.
 *
 * No I/O, no Supabase client, no React, no LLM, and nothing generated. This
 * screen is the last of the six and it is deliberately the least clever one:
 * every question on it was already asked and answered by
 * lib/analytics-service/queries.ts, the agent-ready query group Prompt 1
 * shipped. This module only decides how those answers are ordered, worded and
 * qualified.
 *
 * THE RULES THIS FILE EXISTS TO HOLD.
 *
 * 1. DETERMINISTIC MEANS REPRODUCIBLE. Every insight on the screen is a
 *    count, a rate, or a named member, read straight out of a query result.
 *    The same window and the same toggle produce the same screen, every time,
 *    with no model in the path and no ranking that depends on anything but
 *    the numbers. Where an insight has a threshold, the threshold is the
 *    service layer's own exported constant, printed on the screen, never
 *    re-declared here.
 *
 * 2. AN INSIGHT DESCRIBES, IT DOES NOT DIAGNOSE. Each card says what was
 *    observed and what would have to be true for it to mean something. It
 *    never says why a member behaved that way and never says what to do
 *    about it. "Why" is not in behavioral event data, and the coaching layer
 *    that can see health context is the only place a recommendation belongs.
 *
 * 3. AN EMPTY INSIGHT IS A RESULT. "No feature declined" and "this query
 *    could not run" are different facts and are never collapsed into one
 *    blank card. Where a query returns nothing, the card says nothing
 *    matched; where it failed, the card says it failed.
 *
 * 4. NOTHING HEALTH-RELATED CAN REACH THIS SCREEN. Every reader is a
 *    lib/analytics-service function over product_analytics_events, the view
 *    that excludes the wellness content event types by construction
 *    (migration 146). This module adds no other source, and its only member
 *    facts are a display name and behavioral counts.
 */

import type {
  IncompleteFlowDetection,
  MemberEngagement,
  PlatformFeatureTrend,
  WeakestFunnelStage,
} from '@/lib/analytics-service';
import { formatCount } from './presentation';
import { dashboardHref } from './viewState';
import type { DashboardView } from './viewState';

export const INSIGHTS_PATH = '/admin/analytics/insights';

export function insightsHref(view: DashboardView): string {
  return dashboardHref(INSIGHTS_PATH, view);
}

/**
 * The threshold an administrator has to know to read a card, printed on the
 * card itself. Each value is passed in from the service layer's own exported
 * constant at the call site rather than restated here, so this module cannot
 * drift from the rule that actually ran.
 */
export function thresholdNote(parts: string[]): string {
  return parts.join(' ');
}

// ---------------------------------------------------------------------
// The insight envelope
// ---------------------------------------------------------------------

/**
 * Every card on the screen is one of these. `status` is what separates the
 * three outcomes that must never look alike: something was found, nothing
 * matched, or the query did not run.
 */
export type InsightStatus = 'finding' | 'nothing_matched' | 'unavailable';

export type ProductInsight = {
  key: string;
  title: string;
  /** What the query asks, in one sentence, before any result is shown. */
  question: string;
  status: InsightStatus;
  /** The result in one sentence. Always present, including when nothing matched. */
  headline: string;
  /** The rule that decided the result, in the service layer's own numbers. */
  rule: string;
  /** Rows behind the headline. Empty when nothing matched. */
  rows: InsightRow[];
  /** Set only when status is 'unavailable'. */
  error?: string;
};

export type InsightRow = {
  key: string;
  label: string;
  value: string;
  /** A second line of plain fact under the row. Never an interpretation. */
  detail?: string;
  /** Set when the row is one member, so the screen can link to her timeline. */
  memberId?: string;
};

/** A query that failed is reported as failed, never as an empty result. */
export function unavailableInsight(
  key: string,
  title: string,
  question: string,
  error: string
): ProductInsight {
  return {
    key,
    title,
    question,
    status: 'unavailable',
    headline: 'This query could not be run, so this is not a result of "nothing found".',
    rule: 'Nothing was measured.',
    rows: [],
    error,
  };
}

/** How many rows a card shows before it says how many it is holding back. */
export const INSIGHT_ROW_LIMIT = 8;

/**
 * Caps a card's rows and says what was left out. A silently truncated list
 * reads as a complete one, which would make a big problem look small.
 */
export function capRows(rows: InsightRow[], limit = INSIGHT_ROW_LIMIT): {
  shown: InsightRow[];
  hiddenNote: string | null;
} {
  if (rows.length <= limit) return { shown: rows, hiddenNote: null };
  const hidden = rows.length - limit;
  return {
    shown: rows.slice(0, limit),
    hiddenNote: `Showing the first ${limit} of ${formatCount(rows.length)}. ${formatCount(hidden)} more ${
      hidden === 1 ? 'is' : 'are'
    } not listed here.`,
  };
}

function memberLabel(member: { displayName: string | null; memberId: string }): string {
  const name = member.displayName?.trim();
  return name ? name : `Member ${member.memberId.slice(0, 8)}`;
}

function daysAway(member: MemberEngagement): string {
  const days = member.facts.daysSinceLastActivity;
  if (days === null) return 'Never active';
  if (days === 0) return 'Active today';
  if (days === 1) return '1 day since last active';
  return `${formatCount(days)} days since last active`;
}

// ---------------------------------------------------------------------
// The five insights
// ---------------------------------------------------------------------

/**
 * INSIGHT 1: where the funnel loses the most members.
 *
 * Measured in members lost between one measurable stage and the next, not in
 * percentage, because a stage that loses 90 percent of two people is not the
 * platform's biggest problem. The service layer already made that choice; this
 * only renders its answer and its own stated reason.
 */
export function weakestStageInsight(stage: WeakestFunnelStage): ProductInsight {
  const question = 'Between which two funnel stages does the platform lose the most members?';
  const base = {
    key: 'weakest_funnel_stage',
    title: 'The stage losing the most members',
    question,
    rule: 'Measured in members lost between one measurable stage and the next. Stages that cannot be measured are skipped rather than counted as total loss.',
  };

  if (stage.stageKey === null || stage.label === null || (stage.membersLost ?? 0) === 0) {
    return {
      ...base,
      status: 'nothing_matched',
      headline: stage.reason,
      rows: [],
    };
  }

  const rows: InsightRow[] = [
    {
      key: 'lost',
      label: 'Members lost at this step',
      value: formatCount(stage.membersLost),
    },
  ];
  if (stage.dropOffRate !== null) {
    rows.push({
      key: 'rate',
      label: 'Share of the previous stage lost',
      value: `${stage.dropOffRate}%`,
      detail: 'Of the members who reached the previous stage inside this window.',
    });
  }

  return {
    ...base,
    status: 'finding',
    headline: stage.reason,
    rows,
  };
}

/**
 * INSIGHT 2: features being used less than they were.
 *
 * A feature nobody ever used has not declined, so the service layer excludes
 * anything below its minimum baseline. That exclusion is printed rather than
 * left implicit, because "no feature declined" means something different when
 * most features were never eligible to be counted.
 */
export function featureDeclineInsight(
  features: PlatformFeatureTrend[],
  options: { minimumBaselineEvents: number; declineRatio: number; windowDays: number }
): ProductInsight {
  const question = 'Which features are being used less than they were in the window before this one?';
  const rule = thresholdNote([
    `A feature counts as declining when its recent ${options.windowDays} days fall below ${Math.round(
      options.declineRatio * 100
    )} percent of its own earlier baseline.`,
    `Features with fewer than ${options.minimumBaselineEvents} baseline events are excluded, because a feature nobody used has not declined.`,
  ]);
  const base = {
    key: 'feature_declines',
    title: 'Features used less than before',
    question,
    rule,
  };

  if (features.length === 0) {
    return {
      ...base,
      status: 'nothing_matched',
      headline:
        'No feature met the decline rule in this window. That includes features that were never used enough to be eligible.',
      rows: [],
    };
  }

  return {
    ...base,
    status: 'finding',
    headline: `${formatCount(features.length)} ${
      features.length === 1 ? 'feature is' : 'features are'
    } being used less than in the window before.`,
    rows: features.map((feature) => ({
      key: feature.featureKey,
      label: feature.label,
      value:
        feature.changeRatio === null
          ? 'Not measured'
          : `${Math.round(feature.changeRatio * 100)}% of baseline`,
      detail: `${formatCount(feature.recentEvents)} recent events against ${formatCount(
        feature.baselineEvents
      )} in the baseline window.`,
    })),
  };
}

/**
 * INSIGHT 3: flows members start and do not finish.
 *
 * Grouped by flow rather than by member, because the product question is
 * which flow is losing people, not who. The per-member view of the same
 * detection already exists on the member detail screen.
 */
export function incompleteFlowInsight(
  rows: IncompleteFlowDetection[],
  options: { repeatedStartMinimum: number }
): ProductInsight {
  const question = 'Which flows are members starting and not finishing?';
  const rule = thresholdNote([
    `A flow counts when a member started it at least ${options.repeatedStartMinimum} times and finished fewer than half of those.`,
    'Onboarding counts at a single unfinished start, because never finishing setup at all is worth seeing immediately.',
  ]);
  const base = { key: 'incomplete_flows', title: 'Started and not finished', question, rule };

  if (rows.length === 0) {
    return {
      ...base,
      status: 'nothing_matched',
      headline: 'No member met the unfinished-flow rule in this window.',
      rows: [],
    };
  }

  // One row per flow, with how many members and how many unfinished starts.
  const byFlow = new Map<
    string,
    { flowKey: string; label: string; members: Set<string>; unfinished: number; started: number }
  >();
  for (const row of rows) {
    const existing = byFlow.get(row.flowKey) ?? {
      flowKey: row.flowKey,
      // The registry's own label, so a flow cannot be named one thing here
      // and another on the drop-off screen.
      label: row.label,
      members: new Set<string>(),
      unfinished: 0,
      started: 0,
    };
    existing.members.add(row.memberId);
    existing.unfinished += row.unfinishedEvents;
    existing.started += row.startedEvents;
    byFlow.set(row.flowKey, existing);
  }

  const flows = [...byFlow.values()].sort(
    (a, b) => b.unfinished - a.unfinished || a.flowKey.localeCompare(b.flowKey)
  );

  return {
    ...base,
    status: 'finding',
    headline: `${formatCount(flows.length)} ${flows.length === 1 ? 'flow is' : 'flows are'} being started and left unfinished, across ${formatCount(
      new Set(rows.map((row) => row.memberId)).size
    )} ${new Set(rows.map((row) => row.memberId)).size === 1 ? 'member' : 'members'}.`,
    rows: flows.map((flow) => ({
      key: flow.flowKey,
      label: flow.label,
      value: `${formatCount(flow.unfinished)} unfinished`,
      detail: `${formatCount(flow.started)} starts by ${formatCount(flow.members.size)} ${
        flow.members.size === 1 ? 'member' : 'members'
      }.`,
    })),
  };
}

/**
 * INSIGHT 4: members who have disengaged.
 *
 * The engagement state the rest of the section already uses, so this cannot
 * disagree with the member table about who has stopped.
 */
export function disengagedInsight(members: MemberEngagement[]): ProductInsight {
  const question = 'Which members have stopped using the product?';
  const base = {
    key: 'disengaged',
    title: 'Members who have disengaged',
    question,
    rule: 'Engagement state Inactive, decided against the rhythm each member has established where she has 42 or more days of history, and against a fixed 21 day threshold where she does not. The basis is shown per member on the member table.',
  };

  if (members.length === 0) {
    return {
      ...base,
      status: 'nothing_matched',
      headline: 'No member is in an Inactive state in this window.',
      rows: [],
    };
  }

  return {
    ...base,
    status: 'finding',
    headline: `${formatCount(members.length)} ${
      members.length === 1 ? 'member is' : 'members are'
    } Inactive, longest away first.`,
    rows: members.map((member) => ({
      key: member.memberId,
      memberId: member.memberId,
      label: memberLabel(member),
      value: daysAway(member),
      detail: member.reason,
    })),
  };
}

/**
 * INSIGHT 5: members doing noticeably less than they used to.
 *
 * Deliberately only members with a real baseline: a member without 42 days of
 * history has nothing to have declined from, and counting her here would be
 * the single easiest way to manufacture a crisis out of thin data.
 */
export function reducedUsageInsight(members: MemberEngagement[]): ProductInsight {
  const question = 'Which members are doing noticeably less than they used to?';
  const base = {
    key: 'reduced_usage',
    title: 'Members below their own baseline',
    question,
    rule: 'Engagement state Watch, decided by self comparison only. A member without enough history to have a baseline is excluded rather than counted as declining.',
  };

  if (members.length === 0) {
    return {
      ...base,
      status: 'nothing_matched',
      headline:
        'No member met this rule in this window. With little history on the platform, most members do not yet have a baseline to be compared against.',
      rows: [],
    };
  }

  return {
    ...base,
    status: 'finding',
    headline: `${formatCount(members.length)} ${
      members.length === 1 ? 'member is' : 'members are'
    } visiting less than her own baseline.`,
    rows: members.map((member) => ({
      key: member.memberId,
      memberId: member.memberId,
      label: memberLabel(member),
      value: `${formatCount(member.facts.recentActiveDays)} active days recently against ${formatCount(
        member.facts.baselineActiveDays
      )} in her baseline`,
      detail: member.reason,
    })),
  };
}

/**
 * A flow or feature key, made readable. The same mechanical transform
 * memberView.ts uses on evidence keys, and for the same reason: a
 * hand-written table of prettier names drifts the first time a flow is added,
 * and a wrong label on a number is worse than a plain one.
 */
export function readableKey(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]/g, ' ')
    .toLowerCase()
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// ---------------------------------------------------------------------
// Screen copy
// ---------------------------------------------------------------------

export const INSIGHTS_INTRO =
  'Five questions about the product, each answered by the same service layer the rest of this section uses. Every answer is a count or a named member read straight out of a query: the same window and the same toggle produce the same screen every time. Nothing here is generated, and nothing here says why.';

export const INSIGHTS_DETERMINISM_NOTE =
  'Each card names the rule that decided it, in the numbers the service layer itself used. Where a rule has a minimum, members or features below that minimum are excluded rather than counted as a problem, and the card says so.';

export const INSIGHTS_NOT_A_RECOMMENDATION =
  'These describe what happened. They do not say why it happened and they are not instructions. A member appears here because of what she did in the product, never because of anything she reported about her health, which this layer cannot read at all.';

export const INSIGHTS_EMPTY_COPY = {
  title: 'Nothing matched in this window',
  body: 'Every query ran and none of them found anything. That is a real result, not a missing one. Widen the date range above to look further back, or turn on test accounts to see the shape of a populated screen.',
} as const;
