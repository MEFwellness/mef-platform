/**
 * One member's own activity timeline: which features, on which days,
 * started versus completed.
 *
 * WHY THIS IS THE ONE THING IN THE LAYER THAT READS ROWS. Every other
 * function here hands a whole question to Postgres and receives a finished
 * summary, because every other question is asked across every member and
 * the whole event history. This one is asked about a single member over a
 * single bounded date range, and there is no per-day, per-feature database
 * function to ask, so it reads that member's rows through the same
 * product_analytics_events view every other query uses and groups them
 * here. No new database function, no new migration.
 *
 * THE ROWS NEVER LEAVE THE SERVER. What this returns is counts: a day, a
 * feature, how many events, how many were starts, how many were
 * completions. No payload, no event id, no timestamp beyond the calendar
 * day. The browser receives the summary, exactly as it does from every
 * other function in this layer.
 *
 * PRIVACY IS STRUCTURAL, NOT A MATTER OF CARE HERE. product_analytics_events
 * excludes the five health-content wellness event types by construction
 * (migration 146), so no check-in answer, pain location, sleep number,
 * questionnaire response or food detail can be in the rows this reads, let
 * alone in what it returns.
 *
 * AUTHORIZATION IS INHERITED, NOT REIMPLEMENTED. The first thing this does
 * is call analytics_member_engagement_facts for the member, which runs
 * analytics_assert_admin() and raises 42501 for anybody who is not a
 * platform administrator. A member or coach who reached this function is
 * refused there, with the same AnalyticsAccessDeniedError every other
 * function in this layer raises, before a single row is read. That call is
 * also what decides whether the member is in scope at all: the same
 * definition of "member", and the same test-account toggle, as everywhere
 * else. There is no second scope rule in this file.
 *
 * THE LABELS COME FROM THE DATABASE. analytics_feature_registry() and
 * analytics_flow_registry() are read over RPC rather than copied into
 * TypeScript, so a timeline can never label a feature differently from the
 * feature usage report or disagree about which events are a start and which
 * are a completion.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getMemberEngagementFacts } from './detections';
import { resolveAnalyticsRange, todayUtc } from './range';
import { AnalyticsQueryError } from './client';
import type { AnalyticsEnvelope, AnalyticsOptions } from './types';

/**
 * The most events one member's timeline will read for one range. Well above
 * anything a real member produces in ninety days, and low enough that this
 * can never become the query that pulls a meaningful share of an event table
 * designed to grow to tens of millions of rows. Hitting it is reported, never
 * silently truncated.
 */
export const TIMELINE_ROW_CAP = 2000;

export type TimelineFeatureCount = {
  featureKey: string;
  label: string;
  events: number;
  /** Events that are the start half of a flow that genuinely emits both halves. */
  started: number;
  /** Events that are the completion half of the same. */
  completed: number;
};

export type MemberTimelineDay = {
  localDate: string;
  totalEvents: number;
  started: number;
  completed: number;
  /** Most used first. */
  features: TimelineFeatureCount[];
};

export type MemberActivityTimeline = AnalyticsEnvelope & {
  memberId: string;
  displayName: string | null;
  /** False for an id that is not an in-scope member: a test account with the toggle off, a coach, an unknown id. */
  inScope: boolean;
  /** Days that had at least one behavioral event, most recent first. A quiet day is absent rather than invented as a row of zeros. */
  days: MemberTimelineDay[];
  totalEvents: number;
  activeDays: number;
  /** Whole-range totals per feature, most used first. */
  features: TimelineFeatureCount[];
  /** True when the row cap was reached, so the screen can say the timeline is partial instead of looking complete. */
  truncated: boolean;
  /** The oldest day fully included. Days before it were cut by the cap. Null when nothing was cut. */
  truncatedBefore: string | null;
  rowCap: number;
};

type RegistryFeature = {
  feature_key: string;
  label: string;
  event_type: string;
  payload_filter: Record<string, unknown> | null;
};

type RegistryFlow = {
  flow_key: string;
  feature_key: string;
  start_event_type: string;
  start_filter: Record<string, unknown> | null;
  complete_event_type: string;
  complete_filter: Record<string, unknown> | null;
  measurable: boolean;
};

type EventRow = {
  event_type: string;
  local_date: string;
  occurred_at: string;
  payload: Record<string, unknown> | null;
};

/** jsonb `@>` for the flat, one or two key filters both registries use. */
function payloadMatches(
  payload: Record<string, unknown> | null,
  filter: Record<string, unknown> | null
): boolean {
  if (!filter) return true;
  const keys = Object.keys(filter);
  if (keys.length === 0) return true;
  if (!payload) return false;
  return keys.every((key) => payload[key] === filter[key]);
}

/**
 * An event type with no registry entry still happened and still belongs on
 * the timeline. Sign-ins, signups, paywall views and tier changes are all
 * real behavior that the feature registry deliberately does not treat as a
 * feature. Rather than dropping them, which would make a member's timeline
 * quieter than her week actually was, or inventing a second registry of
 * labels, which would drift, the event type itself is the label, with its
 * underscores turned into spaces.
 */
function humanizeEventType(eventType: string): string {
  const words = eventType.replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

async function readRegistry<T>(supabase: SupabaseClient, fn: string): Promise<T[]> {
  const { data, error } = await supabase.rpc(fn);
  if (error) throw new AnalyticsQueryError(fn, error.message);
  return (data ?? []) as T[];
}

export async function getMemberActivityTimeline(
  supabase: SupabaseClient,
  memberId: string,
  options?: AnalyticsOptions
): Promise<MemberActivityTimeline> {
  const range = resolveAnalyticsRange(options?.period, options?.today ?? todayUtc());
  const start = range.start ?? range.end;
  const envelope: AnalyticsEnvelope = {
    range: { start, end: range.end },
    includeTestAccounts: options?.includeTestAccounts === true,
  };

  // Authorization and scope, both from the existing admin-guarded function.
  // A non-administrator is refused here, before any row is read.
  const facts = await getMemberEngagementFacts(supabase, { ...options, memberId });
  const member = facts[0];

  const empty = {
    ...envelope,
    memberId,
    days: [],
    totalEvents: 0,
    activeDays: 0,
    features: [],
    truncated: false,
    truncatedBefore: null,
    rowCap: TIMELINE_ROW_CAP,
  };

  if (!member) {
    return { ...empty, displayName: null, inScope: false };
  }

  const [features, flows] = await Promise.all([
    readRegistry<RegistryFeature>(supabase, 'analytics_feature_registry'),
    readRegistry<RegistryFlow>(supabase, 'analytics_flow_registry'),
  ]);

  const { data, error } = await supabase
    .from('product_analytics_events')
    .select('event_type, local_date, occurred_at, payload')
    .eq('member_id', memberId)
    .gte('local_date', start)
    .lte('local_date', range.end)
    .order('local_date', { ascending: false })
    .order('occurred_at', { ascending: false })
    .limit(TIMELINE_ROW_CAP + 1);

  if (error) throw new AnalyticsQueryError('product_analytics_events', error.message);

  const rows = (data ?? []) as EventRow[];
  const truncated = rows.length > TIMELINE_ROW_CAP;
  let kept = truncated ? rows.slice(0, TIMELINE_ROW_CAP) : rows;
  let truncatedBefore: string | null = null;

  if (truncated && kept.length > 0) {
    // The oldest day inside the cap is the only one that can be half read,
    // so it is dropped rather than shown as a smaller day than it was.
    const partialDay = kept[kept.length - 1]!.local_date;
    kept = kept.filter((row) => row.local_date !== partialDay);
    truncatedBefore = partialDay;
  }

  const measurableFlows = flows.filter((flow) => flow.measurable);
  const byDay = new Map<string, Map<string, TimelineFeatureCount>>();
  const byFeature = new Map<string, TimelineFeatureCount>();
  // Counted from rows, not from the feature buckets: one event can match
  // more than one registry entry, and a day's total has to be how many
  // things she did, not how many buckets they landed in.
  const dayTotals = new Map<string, { events: number; started: number; completed: number }>();

  for (const row of kept) {
    const matched = features.filter(
      (feature) =>
        feature.event_type === row.event_type && payloadMatches(row.payload, feature.payload_filter)
    );
    const buckets =
      matched.length > 0
        ? matched.map((feature) => ({ featureKey: feature.feature_key, label: feature.label }))
        : [{ featureKey: row.event_type, label: humanizeEventType(row.event_type) }];

    const isStart = measurableFlows.some(
      (flow) =>
        flow.start_event_type === row.event_type && payloadMatches(row.payload, flow.start_filter)
    );
    const isCompletion = measurableFlows.some(
      (flow) =>
        flow.complete_event_type === row.event_type &&
        payloadMatches(row.payload, flow.complete_filter)
    );

    let day = byDay.get(row.local_date);
    if (!day) {
      day = new Map();
      byDay.set(row.local_date, day);
    }

    const totals = dayTotals.get(row.local_date) ?? { events: 0, started: 0, completed: 0 };
    totals.events += 1;
    if (isStart) totals.started += 1;
    if (isCompletion) totals.completed += 1;
    dayTotals.set(row.local_date, totals);

    for (const bucket of buckets) {
      for (const [map, key] of [
        [day, bucket.featureKey],
        [byFeature, bucket.featureKey],
      ] as const) {
        const existing = map.get(key) ?? {
          featureKey: bucket.featureKey,
          label: bucket.label,
          events: 0,
          started: 0,
          completed: 0,
        };
        existing.events += 1;
        if (isStart) existing.started += 1;
        if (isCompletion) existing.completed += 1;
        map.set(key, existing);
      }
    }
  }

  const days: MemberTimelineDay[] = [...byDay.entries()]
    .map(([localDate, featureMap]) => {
      const list = [...featureMap.values()].sort(
        (a, b) => b.events - a.events || a.label.localeCompare(b.label)
      );
      const totals = dayTotals.get(localDate) ?? { events: 0, started: 0, completed: 0 };
      return {
        localDate,
        totalEvents: totals.events,
        started: totals.started,
        completed: totals.completed,
        features: list,
      };
    })
    .sort((a, b) => (a.localDate < b.localDate ? 1 : a.localDate > b.localDate ? -1 : 0));

  return {
    ...envelope,
    memberId,
    displayName: member.displayName,
    inScope: true,
    days,
    totalEvents: kept.length,
    activeDays: days.length,
    features: [...byFeature.values()].sort(
      (a, b) => b.events - a.events || a.label.localeCompare(b.label)
    ),
    truncated,
    truncatedBefore,
    rowCap: TIMELINE_ROW_CAP,
  };
}
