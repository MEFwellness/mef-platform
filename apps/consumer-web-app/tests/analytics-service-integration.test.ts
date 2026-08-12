/**
 * Admin Analytics service layer, integration tests against real local
 * Supabase, real RLS and the real aggregation functions (migration 149).
 *
 * Why real, not mocked: every number this layer produces is computed in
 * SQL. A mocked client would prove the TypeScript wrappers pass arguments
 * around and nothing about whether the arithmetic is right, which is the
 * only part that matters.
 *
 * The fixture is one deliberately shaped member history, built so each
 * assertion below has one obviously correct answer that can be counted by
 * hand from the constants at the top of this file.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { anonClient, signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import {
  getDropOff,
  getFeatureUsage,
  getFunnel,
  getOverviewMetrics,
} from '../lib/analytics-service/reports';
import {
  getConsistentFeatureUse,
  getIncompleteFlows,
  getMemberEngagementFacts,
  getMemberEngagementStates,
  getMemberFeatureChanges,
  getPlatformFeatureTrend,
  getViewsWithoutEngagement,
} from '../lib/analytics-service/detections';
import { compareWindows, getMemberWindowComparison } from '../lib/analytics-service/comparison';
import { getMemberFrictionSignals } from '../lib/analytics-service/friction';
import {
  findDisengagedMembers,
  findMembersForCoachFollowUp,
  findMembersNotReturnedRecently,
  findMembersWithIncompleteFlows,
  findMembersWithReducedUsage,
  findWeakestFunnelStage,
} from '../lib/analytics-service/queries';
import { AnalyticsAccessDeniedError } from '../lib/analytics-service/client';
import { todayUtc } from '../lib/analytics-service/range';
import type { SupabaseClient } from '@supabase/supabase-js';

const TZ = 'America/New_York';

/** A fixed "today" so every assertion is deterministic whenever the suite runs. */
const TODAY = '2026-06-30';

/** The whole fixture lives inside this window. Nothing else in the database does. */
const FIXTURE_START = '2026-03-01';
const FIXTURE_END = '2026-07-31';
const PERIOD = { start: '2026-04-01', end: TODAY } as const;

const ONE = TEST_USERS.memberOne.id;
const TWO = TEST_USERS.memberTwo.id;

/**
 * Member One's shape, counted by hand:
 *   baseline window (2026-05-20 to 2026-06-16, 28 days): active on 14 days
 *   recent window   (2026-06-17 to 2026-06-30, 14 days): active on 2 days
 * which is a rate of 0.5 falling to 0.143, less than half. She is a decline
 * against her own history, not against a fixed number.
 */
const ONE_BASELINE_DAYS = [
  '2026-05-20',
  '2026-05-22',
  '2026-05-24',
  '2026-05-26',
  '2026-05-28',
  '2026-05-30',
  '2026-06-01',
  '2026-06-03',
  '2026-06-05',
  '2026-06-07',
  '2026-06-09',
  '2026-06-11',
  '2026-06-13',
  '2026-06-15',
];
const ONE_RECENT_DAYS = ['2026-06-19', '2026-06-25'];
const ONE_ACTIVE_DAYS = [...ONE_BASELINE_DAYS, ...ONE_RECENT_DAYS];

/** Member Two opened the app twice in April and never came back. */
const TWO_ACTIVE_DAYS = ['2026-04-01', '2026-04-02'];

/** The Reset Plan: opened on four separate days, never acted on. */
const ONE_RESET_PLAN_VIEW_DAYS = ['2026-05-20', '2026-05-22', '2026-05-24', '2026-05-26'];

/** Food logging: a real habit in the baseline, all but gone in the recent window. */
const ONE_FOOD_BASELINE_EVENTS = 20;
const ONE_FOOD_RECENT_EVENTS = 1;

/** The Daily Reset: started five times, finished once. */
const ONE_RESET_STARTS: string[] = [
  '2026-06-19',
  '2026-06-19',
  '2026-06-19',
  '2026-06-25',
  '2026-06-25',
];
const ONE_RESET_COMPLETIONS = ['2026-06-25'];

/** The event a member's real health answers arrive on. Written to prove analytics can never reach it. */
const HEALTH_CONTENT = 'my left knee has been hurting and I only slept four hours';

type EventRow = {
  member_id: string;
  event_type: string;
  local_date: string;
  occurred_at: string;
  timezone: string;
  payload: Record<string, unknown>;
  /** Always set explicitly: a bulk insert normalizes columns across rows, so one row carrying it and the rest not would send null for the rest. */
  source: string;
};

function event(
  memberId: string,
  eventType: string,
  localDate: string,
  payload: Record<string, unknown> = {},
  occurredAt?: string
): EventRow {
  return {
    member_id: memberId,
    event_type: eventType,
    local_date: localDate,
    // Matches how the app writes it: the member's wall clock stamped as UTC.
    occurred_at: occurredAt ?? `${localDate}T14:00:00.000Z`,
    timezone: TZ,
    payload,
    source: 'member',
  };
}

function buildFixture(): EventRow[] {
  const rows: EventRow[] = [];

  for (const day of ONE_ACTIVE_DAYS) rows.push(event(ONE, 'surface_viewed', day, { surface: 'home' }));
  for (const day of TWO_ACTIVE_DAYS) rows.push(event(TWO, 'surface_viewed', day, { surface: 'today' }));

  for (const day of ONE_RESET_PLAN_VIEW_DAYS) {
    rows.push(event(ONE, 'surface_viewed', day, { surface: 'reset_plan' }));
  }

  for (let i = 0; i < ONE_FOOD_BASELINE_EVENTS; i += 1) {
    rows.push(
      event(ONE, 'food_entry_logged', ONE_BASELINE_DAYS[i % ONE_BASELINE_DAYS.length]!, {
        entryType: 'manual',
      })
    );
  }
  for (let i = 0; i < ONE_FOOD_RECENT_EVENTS; i += 1) {
    rows.push(event(ONE, 'food_entry_logged', '2026-06-19', { entryType: 'manual' }));
  }

  for (const day of ONE_RESET_STARTS) rows.push(event(ONE, 'daily_reset_started', day));
  for (const day of ONE_RESET_COMPLETIONS) rows.push(event(ONE, 'daily_reset_completed', day));

  rows.push(event(ONE, 'session_started', '2026-06-19', { method: 'password' }));
  rows.push(event(ONE, 'paywall_viewed', '2026-06-19', { feature: 'four-doctors', lockReason: 'membership' }));

  // The funnel cohort, and one unfinished onboarding.
  rows.push(event(ONE, 'signup_completed', '2026-05-20', {}));
  rows.push(event(TWO, 'signup_completed', '2026-04-01', {}));
  rows.push(event(ONE, 'onboarding_started', '2026-05-20'));

  // THE CALENDAR-DAY RULE, made testable. This event's local_date is the
  // 10th, its occurred_at is late on the 11th in UTC. A query that filtered
  // on occurred_at would put it on the wrong day. A query that filters on
  // local_date, as every function in this layer does, puts it on the 10th.
  rows.push(event(ONE, 'surface_viewed', '2026-03-10', { surface: 'progress' }, '2026-03-11T23:30:00.000Z'));

  // Real health content, of the pre-existing wellness kind. Analytics must
  // never be able to see this.
  rows.push(event(ONE, 'concern_flagged', '2026-06-19', { text: HEALTH_CONTENT }));

  return rows;
}

async function cleanup() {
  const service = serviceRoleClient();
  await service
    .from('member_wellness_events')
    .delete()
    .in('member_id', [ONE, TWO])
    .gte('local_date', FIXTURE_START)
    .lte('local_date', FIXTURE_END);
  await service.from('profiles').update({ is_test: false }).in('id', [ONE, TWO]);
}

let admin: SupabaseClient;

beforeAll(async () => {
  await cleanup();
  const service = serviceRoleClient();
  const { error } = await service.from('member_wellness_events').insert(buildFixture());
  if (error) throw new Error(`fixture insert failed: ${error.message}`);
  admin = await signInAs(TEST_USERS.adminOne);
});

afterAll(cleanup);

// ---------------------------------------------------------------------
// Group A
// ---------------------------------------------------------------------

describe('overview metrics', () => {
  it('counts active members, sessions and returning members from real events', async () => {
    const overview = await getOverviewMetrics(admin, { period: PERIOD, today: TODAY });

    expect(overview.hasData).toBe(true);
    expect(overview.activeMembers).toBe(2);
    // One session means one active member-day: 16 for her, 2 for the other.
    expect(overview.sessions).toBe(ONE_ACTIVE_DAYS.length + TWO_ACTIVE_DAYS.length);
    expect(overview.returningMembers).toBe(2);
    expect(overview.averageSessionsPerActiveMember).toBe(9);
    // Only Member One was active in the last seven days of the range.
    expect(overview.weeklyActiveMembers).toBe(1);
    expect(overview.dailyActiveLatest).toBe(0);
  });

  it('reports sign-ins separately from sessions, because they are not the same thing', async () => {
    const overview = await getOverviewMetrics(admin, { period: PERIOD, today: TODAY });
    expect(overview.signIns).toBe(1);
    expect(overview.sessions).toBeGreaterThan(overview.signIns);
  });

  it('computes the Daily Reset completion rate from the real started and completed events', async () => {
    const overview = await getOverviewMetrics(admin, { period: PERIOD, today: TODAY });
    expect(overview.dailyReset.startedEvents).toBe(ONE_RESET_STARTS.length);
    expect(overview.dailyReset.completedEvents).toBe(ONE_RESET_COMPLETIONS.length);
    expect(overview.dailyReset.completionRate).toBe(20);
    expect(overview.dailyReset.startedMembers).toBe(1);
  });

  it('counts nutrition, Reset Plan and paywall usage', async () => {
    const overview = await getOverviewMetrics(admin, { period: PERIOD, today: TODAY });
    expect(overview.membersUsingNutrition).toBe(1);
    expect(overview.membersViewingResetPlan).toBe(1);
    // Nobody engaged with the Reset Plan, only opened it.
    expect(overview.membersUsingResetPlan).toBe(0);
    expect(overview.paywallViews).toEqual({ events: 1, members: 1 });
    expect(overview.membersViewingToday).toBe(1);
  });

  it('returns a daily active series with one point per day that actually had activity', async () => {
    const overview = await getOverviewMetrics(admin, { period: PERIOD, today: TODAY });
    const dates = overview.dailyActiveSeries.map((point) => point.localDate);
    expect(dates).toEqual([...dates].sort());
    expect(dates).toContain('2026-06-19');
    expect(dates).not.toContain('2026-06-20');
    expect(overview.dailyActiveSeries.find((p) => p.localDate === '2026-04-01')?.members).toBe(1);
  });

  it('never reports a rate when there is nothing to divide by', async () => {
    const empty = await getOverviewMetrics(admin, {
      period: { start: '2026-02-01', end: '2026-02-28' },
      today: TODAY,
    });
    expect(empty.activeMembers).toBe(0);
    expect(empty.sessions).toBe(0);
    expect(empty.dailyReset.completionRate).toBeNull();
    expect(empty.onboarding.completionRate).toBeNull();
    expect(empty.averageSessionsPerActiveMember).toBeNull();
    expect(empty.averageDaysBetweenVisits).toBeNull();
    // Not an error, not a fabricated zero percent: an honest empty report.
    expect(empty.dailyActiveSeries).toEqual([]);
  });

  it('says plainly that purchases cannot be measured rather than reporting zero', async () => {
    const overview = await getOverviewMetrics(admin, { period: PERIOD, today: TODAY });
    expect(overview.purchases.measurable).toBe(false);
    expect(overview.purchases.reason).toContain('No billing integration');
  });

  it('counts total members as of the end of the range', async () => {
    const overview = await getOverviewMetrics(admin, {
      period: { preset: 'all_time' },
      today: todayUtc(),
    });
    expect(overview.totalMembers).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------
// The calendar-day rule
// ---------------------------------------------------------------------

describe('day filtering uses local_date, never occurred_at', () => {
  it('an event stamped late on the 11th in UTC but belonging to the 10th is counted on the 10th', async () => {
    const onTheTenth = await getOverviewMetrics(admin, {
      period: { start: '2026-03-10', end: '2026-03-10' },
      today: TODAY,
    });
    expect(onTheTenth.activeMembers).toBe(1);
    expect(onTheTenth.sessions).toBe(1);
  });

  it('and is NOT counted on the 11th, which is what its raw timestamp would have said', async () => {
    const onTheEleventh = await getOverviewMetrics(admin, {
      period: { start: '2026-03-11', end: '2026-03-11' },
      today: TODAY,
    });
    expect(onTheEleventh.activeMembers).toBe(0);
    expect(onTheEleventh.sessions).toBe(0);
  });

  it('a range boundary is inclusive on both ends', async () => {
    const firstDayOnly = await getOverviewMetrics(admin, {
      period: { start: '2026-04-01', end: '2026-04-01' },
      today: TODAY,
    });
    expect(firstDayOnly.activeMembers).toBe(1);

    const beforeIt = await getOverviewMetrics(admin, {
      period: { start: '2026-03-20', end: '2026-03-31' },
      today: TODAY,
    });
    expect(beforeIt.activeMembers).toBe(0);
  });
});

// ---------------------------------------------------------------------
// Test-account exclusion
// ---------------------------------------------------------------------

describe('test accounts', () => {
  it('are excluded by default and appear only when explicitly asked for', async () => {
    const service = serviceRoleClient();
    await service.from('profiles').update({ is_test: true }).eq('id', TWO);

    try {
      const excluded = await getOverviewMetrics(admin, { period: PERIOD, today: TODAY });
      expect(excluded.activeMembers).toBe(1);
      expect(excluded.includeTestAccounts).toBe(false);

      const included = await getOverviewMetrics(admin, {
        period: PERIOD,
        today: TODAY,
        includeTestAccounts: true,
      });
      expect(included.activeMembers).toBe(2);
      expect(included.includeTestAccounts).toBe(true);
      expect(included.sessions).toBeGreaterThan(excluded.sessions);
    } finally {
      await service.from('profiles').update({ is_test: false }).eq('id', TWO);
    }
  });

  it('the exclusion reaches the per-member functions too, not only the aggregates', async () => {
    const service = serviceRoleClient();
    await service.from('profiles').update({ is_test: true }).eq('id', TWO);

    try {
      const withoutTest = await getMemberEngagementFacts(admin, { today: TODAY });
      expect(withoutTest.map((row) => row.memberId)).not.toContain(TWO);

      const withTest = await getMemberEngagementFacts(admin, {
        today: TODAY,
        includeTestAccounts: true,
      });
      expect(withTest.map((row) => row.memberId)).toContain(TWO);
      expect(withTest.find((row) => row.memberId === TWO)?.isTestAccount).toBe(true);
    } finally {
      await service.from('profiles').update({ is_test: false }).eq('id', TWO);
    }
  });
});

// ---------------------------------------------------------------------
// Group B
// ---------------------------------------------------------------------

describe('funnel', () => {
  it('builds a cohort from real signup events and counts each stage', async () => {
    const funnel = await getFunnel(admin, { period: PERIOD, today: TODAY });
    const byKey = Object.fromEntries(funnel.stages.map((stage) => [stage.key, stage]));

    expect(funnel.cohortSize).toBe(2);
    expect(byKey.account_created!.members).toBe(2);
    expect(byKey.onboarding_started!.members).toBe(1);
    expect(byKey.onboarding_completed!.members).toBe(0);
    expect(byKey.first_meaningful_use!.members).toBe(2);
    expect(byKey.first_daily_reset_started!.members).toBe(1);
    expect(byKey.first_daily_reset_completed!.members).toBe(1);
    expect(byKey.returned_another_day!.members).toBe(2);
    expect(byKey.used_another_major_feature!.members).toBe(2);
    expect(byKey.viewed_premium_locked_feature!.members).toBe(1);
  });

  it('percentages are of the cohort and of the previous measurable stage', async () => {
    const funnel = await getFunnel(admin, { period: PERIOD, today: TODAY });
    const byKey = Object.fromEntries(funnel.stages.map((stage) => [stage.key, stage]));

    expect(byKey.account_created!.percentOfCohort).toBe(100);
    expect(byKey.onboarding_started!.percentOfCohort).toBe(50);
    expect(byKey.onboarding_started!.percentOfPreviousMeasurableStage).toBe(50);
    expect(byKey.onboarding_started!.membersLostFromPreviousStage).toBe(1);
    expect(byKey.onboarding_completed!.percentOfPreviousMeasurableStage).toBe(0);
  });

  it('flags the purchase stage as unmeasurable with a reason, and gives it no count at all', async () => {
    const funnel = await getFunnel(admin, { period: PERIOD, today: TODAY });
    const purchase = funnel.stages.find((stage) => stage.key === 'completed_a_purchase')!;

    expect(purchase.measurable).toBe(false);
    expect(purchase.members).toBeNull();
    expect(purchase.percentOfCohort).toBeNull();
    expect(purchase.percentOfPreviousMeasurableStage).toBeNull();
    expect(purchase.unmeasurableReason).toContain('outside this application');
  });

  it('shows the instrumentation gap instead of hiding it', async () => {
    const funnel = await getFunnel(admin, { period: PERIOD, today: TODAY });
    // Signup events are the cohort basis; profiles.created_at is reported
    // beside it so an admin can see when the two disagree.
    expect(typeof funnel.profilesCreatedInRange).toBe('number');
    expect(funnel.cohortBasis).toContain('signup_completed');
  });

  it('an empty period produces a zero cohort, not an error and not invented percentages', async () => {
    const funnel = await getFunnel(admin, {
      period: { start: '2026-02-01', end: '2026-02-28' },
      today: TODAY,
    });
    expect(funnel.cohortSize).toBe(0);
    for (const stage of funnel.stages) {
      expect(stage.percentOfCohort).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------
// Group C
// ---------------------------------------------------------------------

describe('feature usage', () => {
  it('ranks features most to least used and counts unique members and events', async () => {
    const report = await getFeatureUsage(admin, { period: PERIOD, today: TODAY });
    const byKey = Object.fromEntries(report.features.map((feature) => [feature.featureKey, feature]));

    expect(byKey.home!.uniqueMembers).toBe(1);
    expect(byKey.home!.totalEvents).toBe(ONE_ACTIVE_DAYS.length);
    expect(byKey.food_logging!.totalEvents).toBe(
      ONE_FOOD_BASELINE_EVENTS + ONE_FOOD_RECENT_EVENTS
    );
    expect(byKey.reset_plan!.totalEvents).toBe(ONE_RESET_PLAN_VIEW_DAYS.length);
    expect(byKey.today!.uniqueMembers).toBe(1);

    const members = report.features.map((feature) => feature.uniqueMembers);
    expect(members).toEqual([...members].sort((a, b) => b - a));
  });

  it('includes features nobody used, as honest zeros rather than missing rows', async () => {
    const report = await getFeatureUsage(admin, { period: PERIOD, today: TODAY });
    const movement = report.features.find((feature) => feature.featureKey === 'movement')!;
    expect(movement.uniqueMembers).toBe(0);
    expect(movement.totalEvents).toBe(0);
    expect(movement.percentOfActiveMembers).toBe(0);
    expect(movement.averageEventsPerMember).toBeNull();
  });

  it('reports repeat usage and the share of active members', async () => {
    const report = await getFeatureUsage(admin, { period: PERIOD, today: TODAY });
    const home = report.features.find((feature) => feature.featureKey === 'home')!;
    expect(report.activeMembers).toBe(2);
    expect(home.percentOfActiveMembers).toBe(50);
    expect(home.repeatMembers).toBe(1);
    expect(home.multiDayMembers).toBe(1);
    expect(home.averageEventsPerMember).toBe(ONE_ACTIVE_DAYS.length);
  });

  it('carries a completion rate only where a real started/completed pair exists', async () => {
    const report = await getFeatureUsage(admin, { period: PERIOD, today: TODAY });
    const reset = report.features.find((feature) => feature.featureKey === 'daily_reset_flow')!;
    const home = report.features.find((feature) => feature.featureKey === 'home')!;

    expect(reset.completionRate).toBe(20);
    expect(reset.completionBasis).toBe('Daily Reset');
    expect(home.completionRate).toBeNull();
    expect(home.completionBasis).toBeNull();
  });
});

// ---------------------------------------------------------------------
// Group D
// ---------------------------------------------------------------------

describe('drop-off', () => {
  it('reports started, completed and drop-off for every measurable flow', async () => {
    const report = await getDropOff(admin, { period: PERIOD, today: TODAY });
    const byKey = Object.fromEntries(report.flows.map((flow) => [flow.flowKey, flow]));

    expect(byKey.daily_reset!.startedEvents).toBe(5);
    expect(byKey.daily_reset!.completedEvents).toBe(1);
    expect(byKey.daily_reset!.completionRate).toBe(20);
    expect(byKey.daily_reset!.dropOffRate).toBe(80);
    expect(byKey.daily_reset!.memberCompletionRate).toBe(100);

    expect(byKey.onboarding!.startedEvents).toBe(1);
    expect(byKey.onboarding!.completedEvents).toBe(0);
    expect(byKey.onboarding!.dropOffRate).toBe(100);
  });

  it('flags a flow whose events have no emitter, rather than showing it as a total loss', async () => {
    const report = await getDropOff(admin, { period: PERIOD, today: TODAY });
    const experience = report.flows.find((flow) => flow.flowKey === 'experience')!;

    expect(experience.measurable).toBe(false);
    expect(experience.startedEvents).toBeNull();
    expect(experience.completedEvents).toBeNull();
    expect(experience.dropOffRate).toBeNull();
    expect(experience.unmeasurableReason).toContain('No call site emits');
  });

  it('says out loud that per-question drop-off is not instrumented', async () => {
    const report = await getDropOff(admin, { period: PERIOD, today: TODAY });
    expect(report.perQuestionDropOff.measurable).toBe(false);
    expect(report.perQuestionDropOff.reason).toContain('per-question');
  });

  it('orders the worst drop-off first', async () => {
    const report = await getDropOff(admin, { period: PERIOD, today: TODAY });
    const measurable = report.flows.filter((flow) => flow.measurable && flow.dropOffRate !== null);
    const rates = measurable.map((flow) => flow.dropOffRate!);
    expect(rates).toEqual([...rates].sort((a, b) => b - a));
  });
});

// ---------------------------------------------------------------------
// Group E
// ---------------------------------------------------------------------

describe('engagement states against real history', () => {
  it('judges a declining member against her own baseline, and says that is what it did', async () => {
    const states = await getMemberEngagementStates(admin, { today: TODAY });
    const one = states.find((member) => member.memberId === ONE)!;

    expect(one.facts.recentActiveDays).toBe(ONE_RECENT_DAYS.length);
    expect(one.facts.baselineActiveDays).toBe(ONE_BASELINE_DAYS.length);
    // Her first ever activity is the 2026-03-10 event written for the
    // calendar-day test, so her history runs from then to the reference
    // date: 2026-03-10 to 2026-06-30 inclusive is 113 days.
    expect(one.facts.firstActivityDate).toBe('2026-03-10');
    expect(one.facts.historyDays).toBe(113);
    // Her usual gap is still two days: one 71 day gap does not move a median.
    expect(one.facts.typicalGapDays).toBe(2);
    expect(one.facts.lastActivityDate).toBe('2026-06-25');
    expect(one.facts.daysSinceLastActivity).toBe(5);
    expect(one.state).toBe('WATCH');
    expect(one.basis).toBe('self_comparison');
  });

  it('falls back to fixed thresholds for a member with no usable baseline, and says so', async () => {
    const states = await getMemberEngagementStates(admin, { today: TODAY });
    const two = states.find((member) => member.memberId === TWO)!;

    expect(two.facts.baselineActiveDays).toBe(0);
    expect(two.facts.daysSinceLastActivity).toBe(89);
    expect(two.state).toBe('INACTIVE');
    expect(two.basis).toBe('fixed_thresholds');
    expect(two.reason).toContain('Not enough history');
  });

  it('includes members with no activity at all rather than dropping them', async () => {
    const states = await getMemberEngagementStates(admin, { today: TODAY });
    expect(states.length).toBeGreaterThanOrEqual(2);
    for (const member of states) {
      expect(['ACTIVE', 'WATCH', 'INACTIVE', 'NEW']).toContain(member.state);
    }
  });

  it('excludes coach and administrator accounts from member analytics entirely', async () => {
    const states = await getMemberEngagementStates(admin, { today: TODAY });
    const ids = states.map((member) => member.memberId);
    expect(ids).not.toContain(TEST_USERS.coachOne.id);
    expect(ids).not.toContain(TEST_USERS.adminOne.id);
  });
});

// ---------------------------------------------------------------------
// Detections, and the one-source-of-truth rule
// ---------------------------------------------------------------------

describe('detections', () => {
  it('finds the started-but-not-finished Daily Reset', async () => {
    const rows = await getIncompleteFlows(admin, { period: PERIOD, today: TODAY });
    const reset = rows.find((row) => row.memberId === ONE && row.flowKey === 'daily_reset')!;

    expect(reset.startedEvents).toBe(5);
    expect(reset.completedEvents).toBe(1);
    expect(reset.unfinishedEvents).toBe(4);
    expect(reset.startedDays).toBe(2);
  });

  it('finds the feature she used to use and has stopped', async () => {
    const rows = await getMemberFeatureChanges(admin, { today: TODAY, memberId: ONE });
    const food = rows.find((row) => row.featureKey === 'food_logging')!;

    expect(food.recentEvents).toBe(ONE_FOOD_RECENT_EVENTS);
    expect(food.baselineEvents).toBe(ONE_FOOD_BASELINE_EVENTS);
    expect(food.changeRatio).not.toBeNull();
    expect(food.changeRatio!).toBeLessThan(0.5);
  });

  it('finds the feature opened repeatedly and never acted on', async () => {
    const rows = await getViewsWithoutEngagement(admin, { period: PERIOD, today: TODAY });
    const plan = rows.find((row) => row.memberId === ONE && row.featureKey === 'reset_plan')!;

    expect(plan.views).toBe(ONE_RESET_PLAN_VIEW_DAYS.length);
    expect(plan.engagements).toBe(0);
    expect(plan.engagementRate).toBe(0);
  });

  it('finds the habit that is working', async () => {
    const rows = await getConsistentFeatureUse(admin, { period: PERIOD, today: TODAY });
    const home = rows.find((row) => row.memberId === ONE && row.featureKey === 'home')!;

    expect(home.usedDays).toBe(ONE_ACTIVE_DAYS.length);
    expect(home.memberActiveDays).toBe(ONE_ACTIVE_DAYS.length);
    expect(home.shareOfActiveDays).toBe(100);
  });

  it('reports platform level feature trends with the steepest decline first', async () => {
    const report = await getPlatformFeatureTrend(admin, { today: TODAY, windowDays: 14 });
    const ratios = report.features
      .map((feature) => feature.changeRatio)
      .filter((ratio): ratio is number => ratio !== null);
    expect(ratios).toEqual([...ratios].sort((a, b) => a - b));
  });

  it('scoping to one member returns only that member, never another memberrows', async () => {
    const rows = await getMemberEngagementFacts(admin, { today: TODAY, memberId: ONE });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.memberId).toBe(ONE);
  });
});

describe('one detection, two consumers', () => {
  it('the agent query and the friction signal read the same incomplete-flow numbers', async () => {
    const [detection, agentQuery, friction] = await Promise.all([
      getIncompleteFlows(admin, { period: PERIOD, today: TODAY, memberId: ONE }),
      findMembersWithIncompleteFlows(admin, { period: PERIOD, today: TODAY }),
      getMemberFrictionSignals(admin, ONE, { period: PERIOD, today: TODAY }),
    ]);

    const detected = detection.find((row) => row.flowKey === 'daily_reset')!;
    const queried = agentQuery.find((row) => row.memberId === ONE && row.flowKey === 'daily_reset')!;
    const signal = friction.signals.find((s) => s.type === 'repeated_incomplete_flow')!;

    expect(queried.startedEvents).toBe(detected.startedEvents);
    expect(queried.completedEvents).toBe(detected.completedEvents);
    expect(signal.evidence.startedEvents).toBe(detected.startedEvents);
    expect(signal.evidence.completedEvents).toBe(detected.completedEvents);
  });

  it('the engagement state and the friction report agree about absence and decline', async () => {
    const [states, friction] = await Promise.all([
      getMemberEngagementStates(admin, { today: TODAY }),
      getMemberFrictionSignals(admin, ONE, { period: PERIOD, today: TODAY }),
    ]);
    const one = states.find((member) => member.memberId === ONE)!;
    expect(friction.engagement.state).toBe(one.state);
    expect(friction.engagement.facts.daysSinceLastActivity).toBe(
      one.facts.daysSinceLastActivity
    );
  });
});

// ---------------------------------------------------------------------
// Friction signals against real data
// ---------------------------------------------------------------------

describe('friction signals', () => {
  it('produces several explainable signals for a member whose behavior supports them', async () => {
    const report = await getMemberFrictionSignals(admin, ONE, { period: PERIOD, today: TODAY });
    const types = report.signals.map((signal) => signal.type);

    expect(types).toContain('repeated_incomplete_flow');
    expect(types).toContain('onboarding_not_completed');
    expect(types).toContain('viewed_without_engaging');
    expect(types).toContain('feature_use_declined');
    expect(types).toContain('overall_activity_declined');
    expect(types).toContain('consistent_feature_use');

    for (const signal of report.signals) {
      expect(signal.reason.length).toBeGreaterThan(0);
      expect(Object.keys(signal.evidence).length).toBeGreaterThan(0);
      expect(['low', 'moderate', 'strong']).toContain(signal.evidenceSufficiency);
    }
  });

  it('returns only an insufficient-history signal for a member with almost no history', async () => {
    const service = serviceRoleClient();
    const email = `analytics-thin-${Date.now()}@example.test`;
    const { data: created } = await service.auth.admin.createUser({
      email,
      password: 'DevPassword123!',
      email_confirm: true,
      user_metadata: { timezone: TZ },
    });
    const thinId = created!.user!.id;

    try {
      await service
        .from('member_wellness_events')
        .insert([event(thinId, 'surface_viewed', '2026-06-29', { surface: 'home' })]);

      const report = await getMemberFrictionSignals(admin, thinId, {
        period: PERIOD,
        today: TODAY,
      });
      expect(report.signals).toHaveLength(1);
      expect(report.signals[0]!.type).toBe('insufficient_behavioral_history');
      expect(report.signals[0]!.evidenceSufficiency).toBe('low');
    } finally {
      await service.auth.admin.deleteUser(thinId);
    }
  });

  it('returns a stated reason, not an invented member, for an id that is not in scope', async () => {
    const report = await getMemberFrictionSignals(admin, '00000000-0000-0000-0000-00000000dead', {
      period: PERIOD,
      today: TODAY,
    });
    expect(report.signals).toHaveLength(1);
    expect(report.signals[0]!.type).toBe('insufficient_behavioral_history');
    expect(report.signals[0]!.reason).toContain('No member record is in scope');
  });
});

// ---------------------------------------------------------------------
// The before/after primitive
// ---------------------------------------------------------------------

describe('before and after a reference date', () => {
  it('measures the same things on both sides, with the reference day in neither', async () => {
    const comparison = await getMemberWindowComparison(admin, ONE, '2026-06-16', {
      windowDays: 14,
    });

    expect(comparison.inScope).toBe(true);
    expect(comparison.before.window).toEqual({ start: '2026-06-02', end: '2026-06-15', days: 14 });
    expect(comparison.after.window).toEqual({ start: '2026-06-17', end: '2026-06-30', days: 14 });

    // Seven active days before (June 3, 5, 7, 9, 11, 13, 15), two after.
    expect(comparison.before.activeDays).toBe(7);
    expect(comparison.after.activeDays).toBe(ONE_RECENT_DAYS.length);
  });

  it('the deltas are plain arithmetic, and never divide by a zero before window', async () => {
    const comparison = await getMemberWindowComparison(admin, ONE, '2026-06-16', {
      windowDays: 14,
    });
    const deltas = Object.fromEntries(compareWindows(comparison).map((d) => [d.metric, d]));

    expect(deltas.activeDays!.before).toBe(7);
    expect(deltas.activeDays!.after).toBe(2);
    expect(deltas.activeDays!.change).toBe(-5);
    expect(deltas.dailyResetStarted!.before).toBe(0);
    expect(deltas.dailyResetStarted!.after).toBe(5);
    // Zero to five is a real observation; expressing it as an infinite
    // increase is not.
    expect(deltas.dailyResetStarted!.changeRatio).toBeNull();
  });

  it('says when the after window has not finished elapsing yet', async () => {
    const stillRunning = await getMemberWindowComparison(admin, ONE, todayUtc(), {
      windowDays: 14,
    });
    expect(stillRunning.afterWindowComplete).toBe(false);
    expect(stillRunning.daysOfAfterWindowElapsed).toBeLessThan(14);

    const finished = await getMemberWindowComparison(admin, ONE, '2026-06-16', { windowDays: 14 });
    expect(finished.afterWindowComplete).toBe(true);
  });

  it('reports out of scope rather than pretending an unknown id is an empty member', async () => {
    const comparison = await getMemberWindowComparison(
      admin,
      '00000000-0000-0000-0000-00000000dead',
      '2026-06-16'
    );
    expect(comparison.inScope).toBe(false);
    expect(comparison.before.activeDays).toBe(0);
    expect(comparison.after.activeDays).toBe(0);
  });
});

// ---------------------------------------------------------------------
// Group F
// ---------------------------------------------------------------------

describe('agent-ready queries', () => {
  it('finds disengaged members, longest absence first', async () => {
    const disengaged = await findDisengagedMembers(admin, { today: TODAY });
    expect(disengaged.map((member) => member.memberId)).toContain(TWO);
    const gaps = disengaged.map((member) => member.facts.daysSinceLastActivity ?? 0);
    expect(gaps).toEqual([...gaps].sort((a, b) => b - a));
  });

  it('finds members who have not returned within an explicit threshold', async () => {
    const stale = await findMembersNotReturnedRecently(admin, 30, { today: TODAY });
    const ids = stale.map((member) => member.memberId);
    expect(ids).toContain(TWO);
    expect(ids).not.toContain(ONE);
  });

  it('finds members who have reduced their own usage', async () => {
    const reduced = await findMembersWithReducedUsage(admin, { today: TODAY });
    expect(reduced.map((member) => member.memberId)).toContain(ONE);
    for (const member of reduced) {
      expect(member.basis).toBe('self_comparison');
    }
  });

  it('names the funnel stage that lost the most members', async () => {
    const weakest = await findWeakestFunnelStage(admin, { period: PERIOD, today: TODAY });
    expect(weakest.stageKey).toBe('onboarding_started');
    expect(weakest.membersLost).toBe(1);
    expect(weakest.reason).toContain('Account created');
  });

  it('says there is no cohort rather than naming a stage when nobody signed up', async () => {
    const weakest = await findWeakestFunnelStage(admin, {
      period: { start: '2026-02-01', end: '2026-02-28' },
      today: TODAY,
    });
    expect(weakest.stageKey).toBeNull();
    expect(weakest.reason).toContain('No members signed up');
  });

  it('shortlists members for a coach to look at, with the reasons attached', async () => {
    const candidates = await findMembersForCoachFollowUp(admin, { period: PERIOD, today: TODAY });
    const ids = candidates.map((candidate) => candidate.memberId);
    expect(ids).toContain(ONE);
    expect(ids).toContain(TWO);

    const one = candidates.find((candidate) => candidate.memberId === ONE)!;
    expect(one.reasons.length).toBeGreaterThan(1);
    expect(one.attentionScore).toBeGreaterThan(0);

    const scores = candidates.map((candidate) => candidate.attentionScore);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });
});

// ---------------------------------------------------------------------
// Privacy
// ---------------------------------------------------------------------

describe('no health content can reach any analytics output', () => {
  const FORBIDDEN_KEYS = [
    'answer',
    'answers',
    'response',
    'responses',
    'painlocation',
    'pain_location',
    'sleepquality',
    'sleep_quality',
    'sleephours',
    'symptoms',
    'symptoms_or_changes',
    'reflection',
    'notes',
    'text',
    'daytime_stress',
    'overall_day_rating',
    'checkin',
    'nutrition',
    'calories',
    'macros',
    'concern',
  ];

  function collectKeys(value: unknown, into: Set<string>): void {
    if (Array.isArray(value)) {
      for (const item of value) collectKeys(item, into);
      return;
    }
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        into.add(key.toLowerCase());
        collectKeys(child, into);
      }
    }
  }

  it('the health-content event really is in the database, so this test is not vacuous', async () => {
    const { data } = await serviceRoleClient()
      .from('member_wellness_events')
      .select('payload')
      .eq('member_id', ONE)
      .eq('event_type', 'concern_flagged')
      .eq('local_date', '2026-06-19');

    expect(data?.length).toBe(1);
    expect(JSON.stringify(data)).toContain('knee');
  });

  it('no service output contains that content, or any health-answer field name', async () => {
    const outputs = await Promise.all([
      getOverviewMetrics(admin, { period: PERIOD, today: TODAY }),
      getFunnel(admin, { period: PERIOD, today: TODAY }),
      getFeatureUsage(admin, { period: PERIOD, today: TODAY }),
      getDropOff(admin, { period: PERIOD, today: TODAY }),
      getMemberEngagementStates(admin, { today: TODAY }),
      getIncompleteFlows(admin, { period: PERIOD, today: TODAY }),
      getMemberFeatureChanges(admin, { today: TODAY }),
      getViewsWithoutEngagement(admin, { period: PERIOD, today: TODAY }),
      getConsistentFeatureUse(admin, { period: PERIOD, today: TODAY }),
      getPlatformFeatureTrend(admin, { today: TODAY }),
      getMemberFrictionSignals(admin, ONE, { period: PERIOD, today: TODAY }),
      getMemberWindowComparison(admin, ONE, '2026-06-16'),
      findMembersForCoachFollowUp(admin, { period: PERIOD, today: TODAY }),
      findDisengagedMembers(admin, { today: TODAY }),
      findMembersWithIncompleteFlows(admin, { period: PERIOD, today: TODAY }),
    ]);

    const serialized = JSON.stringify(outputs).toLowerCase();
    expect(serialized.length).toBeGreaterThan(500);

    for (const fragment of ['knee', 'hurting', 'slept', 'four hours']) {
      expect(serialized, `analytics output must never contain "${fragment}"`).not.toContain(
        fragment
      );
    }

    const keys = new Set<string>();
    collectKeys(outputs, keys);
    for (const forbidden of FORBIDDEN_KEYS) {
      expect(keys, `analytics output must have no "${forbidden}" field`).not.toContain(forbidden);
    }
  });

  it('the analytics read surface itself excludes the health-content event types', async () => {
    const { data } = await admin
      .from('product_analytics_events')
      .select('event_type')
      .eq('member_id', ONE)
      .eq('local_date', '2026-06-19');

    const types = new Set((data ?? []).map((row) => row.event_type));
    expect(types.has('concern_flagged')).toBe(false);
    expect(types.has('surface_viewed')).toBe(true);
  });
});

// ---------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------

describe('authorization', () => {
  it('a platform administrator can read the analytics functions', async () => {
    const overview = await getOverviewMetrics(admin, { period: PERIOD, today: TODAY });
    expect(overview.activeMembers).toBeGreaterThan(0);
  });

  it('an ordinary member is refused, and refused distinctly from being given empty data', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    await expect(
      getOverviewMetrics(member, { period: PERIOD, today: TODAY })
    ).rejects.toBeInstanceOf(AnalyticsAccessDeniedError);
  });

  it('a member is refused by every analytics entry point, not only the overview', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    // Thunks, not eagerly created promises: a rejected promise sitting in an
    // array before it is awaited is an unhandled rejection.
    const attempts: Array<[string, () => Promise<unknown>]> = [
      ['funnel', () => getFunnel(member, { period: PERIOD, today: TODAY })],
      ['featureUsage', () => getFeatureUsage(member, { period: PERIOD, today: TODAY })],
      ['dropOff', () => getDropOff(member, { period: PERIOD, today: TODAY })],
      ['engagementFacts', () => getMemberEngagementFacts(member, { today: TODAY })],
      ['incompleteFlows', () => getIncompleteFlows(member, { period: PERIOD, today: TODAY })],
      ['featureChange', () => getMemberFeatureChanges(member, { today: TODAY })],
      ['featureTrend', () => getPlatformFeatureTrend(member, { today: TODAY })],
      [
        'viewsWithoutEngagement',
        () => getViewsWithoutEngagement(member, { period: PERIOD, today: TODAY }),
      ],
      ['consistentUse', () => getConsistentFeatureUse(member, { period: PERIOD, today: TODAY })],
      ['windowComparison', () => getMemberWindowComparison(member, ONE, '2026-06-16')],
    ];

    for (const [label, attempt] of attempts) {
      await expect(attempt(), `${label} must refuse a member`).rejects.toBeInstanceOf(
        AnalyticsAccessDeniedError
      );
    }
  });

  it('a coach is refused too: these are platform administrator functions', async () => {
    const coach = await signInAs(TEST_USERS.coachOne);
    await expect(getOverviewMetrics(coach, { today: TODAY })).rejects.toBeInstanceOf(
      AnalyticsAccessDeniedError
    );
  });

  it('a signed-out visitor is refused', async () => {
    await expect(getOverviewMetrics(anonClient(), { today: TODAY })).rejects.toBeInstanceOf(
      AnalyticsAccessDeniedError
    );
  });

  it('a member cannot reach another member rows even through the helper functions', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    const { data, error } = await member.rpc('analytics_scoped_events', {
      p_start: PERIOD.start,
      p_end: PERIOD.end,
      p_include_test: false,
    });

    // The helpers carry no privilege of their own: row level security is
    // still what decides which rows exist for this caller.
    expect(error).toBeNull();
    const ids = new Set((data ?? []).map((row: { member_id: string }) => row.member_id));
    expect(ids.has(TWO)).toBe(false);
  });
});

// ---------------------------------------------------------------------
// The server action entry points
// ---------------------------------------------------------------------

/**
 * Source scan, not a runtime test. Server actions use next/headers and
 * cannot be invoked from vitest here, so the way to prove the guard is
 * present on every one of them is to read the file. Same convention as
 * tests/product-analytics-events.test.ts's own call-site scan.
 */
describe('every analytics server action is behind the admin guard', () => {
  const source = readFileSync(
    path.join(path.resolve(__dirname, '..'), 'app/actions/analyticsAdmin.ts'),
    'utf-8'
  );

  it('the scan finds the exported actions at all, so it is not vacuous', () => {
    const exported = [...source.matchAll(/export async function (\w+Action)\(/g)].map((m) => m[1]);
    expect(exported.length).toBeGreaterThanOrEqual(13);
  });

  it('every exported action routes through the guarded wrapper', () => {
    const bodies = source.split(/export async function /).slice(1);
    for (const body of bodies) {
      const name = body.slice(0, body.indexOf('('));
      if (!name.endsWith('Action')) continue;
      expect(body, `${name} must call guarded()`).toContain('guarded(');
    }
  });

  it('the guard itself checks the platform administrator role the same way the rest of the app does', () => {
    expect(source).toContain("hasActiveRole(supabase, user.id, 'platform_administrator')");
    expect(source).toContain("return { ok: false, error: 'Admin access required.' }");
  });
});
