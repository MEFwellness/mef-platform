/**
 * Admin Analytics dashboard: the access boundary and the toggle, proved
 * against real local Supabase, real row level security and the real
 * aggregation functions.
 *
 * The four screens read exactly four things: analytics_overview,
 * analytics_funnel, analytics_feature_usage and analytics_drop_off, each
 * through app/actions/analyticsAdmin.ts. Those actions cannot be called
 * here (they use cookies() from next/headers, which throws outside a
 * Next.js request scope), so these tests call the same service layer
 * functions the actions call, as the real seeded users, which is what
 * actually proves the boundary: the database's own guard, not a wrapper
 * around it.
 *
 * That matters more than it sounds. If the action layer were bypassed
 * entirely by a bug, every assertion below would still have to hold,
 * because analytics_assert_admin() runs inside each function.
 *
 * The fixture window is deliberately separate from the one in
 * analytics-service-integration.test.ts so neither file's cleanup can
 * delete the other's rows.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { anonClient, signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import {
  getDropOff,
  getFeatureUsage,
  getFunnel,
  getOverviewMetrics,
} from '../lib/analytics-service/reports';
import { AnalyticsAccessDeniedError } from '../lib/analytics-service/client';
import {
  analyticsOptionsFor,
  parseDashboardView,
  previousAnalyticsOptionsFor,
} from '../lib/analytics-dashboard/viewState';
import { funnelEmptyState, rateReadout } from '../lib/analytics-dashboard/presentation';
import type { SupabaseClient } from '@supabase/supabase-js';

const TZ = 'America/New_York';
const ONE = TEST_USERS.memberOne.id;
const TWO = TEST_USERS.memberTwo.id;

/** Well before the other analytics fixture, which starts on 2026-03-01. */
const WINDOW_START = '2026-01-05';
const WINDOW_END = '2026-01-25';
const PERIOD = { start: WINDOW_START, end: WINDOW_END } as const;

/** A window inside the same era with nothing at all in it. */
const EMPTY_PERIOD = { start: '2026-02-01', end: '2026-02-10' } as const;

const ONE_DAYS = ['2026-01-06', '2026-01-08', '2026-01-12'];
const TWO_DAYS = ['2026-01-07', '2026-01-09'];

function event(
  memberId: string,
  eventType: string,
  localDate: string,
  payload: Record<string, unknown> = {}
) {
  return {
    member_id: memberId,
    event_type: eventType,
    local_date: localDate,
    occurred_at: `${localDate}T14:00:00.000Z`,
    timezone: TZ,
    payload,
    source: 'member',
  };
}

function buildFixture() {
  const rows = [];
  for (const day of ONE_DAYS) rows.push(event(ONE, 'surface_viewed', day, { surface: 'home' }));
  for (const day of TWO_DAYS) rows.push(event(TWO, 'surface_viewed', day, { surface: 'today' }));

  // Something started and only sometimes finished, so a completion rate exists.
  rows.push(event(ONE, 'daily_reset_started', '2026-01-06'));
  rows.push(event(ONE, 'daily_reset_started', '2026-01-08'));
  rows.push(event(ONE, 'daily_reset_completed', '2026-01-06'));

  // Test-account-only activity: Member Two is the one flipped to is_test below.
  rows.push(event(TWO, 'daily_reset_started', '2026-01-07'));
  rows.push(event(TWO, 'food_scan_performed', '2026-01-07', { source: 'camera' }));

  rows.push(event(ONE, 'signup_completed', '2026-01-06'));
  rows.push(event(ONE, 'onboarding_started', '2026-01-06'));
  return rows;
}

async function cleanup() {
  const service = serviceRoleClient();
  await service
    .from('member_wellness_events')
    .delete()
    .in('member_id', [ONE, TWO])
    .gte('local_date', WINDOW_START)
    .lte('local_date', EMPTY_PERIOD.end);
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

/** Exactly what the four screens read, in the order they appear in the navigation. */
const SCREEN_READS: Array<[string, (client: SupabaseClient) => Promise<unknown>]> = [
  ['Overview', (client) => getOverviewMetrics(client, { period: PERIOD })],
  ['Member funnel', (client) => getFunnel(client, { period: PERIOD })],
  ['Feature usage', (client) => getFeatureUsage(client, { period: PERIOD })],
  ['Drop-off', (client) => getDropOff(client, { period: PERIOD })],
];

// ---------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------

describe('who can read the four dashboard views', () => {
  it('a platform administrator is admitted to all four', async () => {
    for (const [label, read] of SCREEN_READS) {
      const result = await read(admin);
      expect(result, `${label} must return a report to an administrator`).toBeTruthy();
    }
  });

  it('a signed-in member is refused by all four, and refused distinctly from being given nothing', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    for (const [label, read] of SCREEN_READS) {
      await expect(read(member), `${label} must refuse a member`).rejects.toBeInstanceOf(
        AnalyticsAccessDeniedError
      );
    }
  });

  it('a signed-in coach is refused by all four: these are administrator screens', async () => {
    const coach = await signInAs(TEST_USERS.coachOne);
    for (const [label, read] of SCREEN_READS) {
      await expect(read(coach), `${label} must refuse a coach`).rejects.toBeInstanceOf(
        AnalyticsAccessDeniedError
      );
    }
  });

  it('a signed-out visitor is refused by all four', async () => {
    for (const [label, read] of SCREEN_READS) {
      await expect(read(anonClient()), `${label} must refuse a visitor`).rejects.toBeInstanceOf(
        AnalyticsAccessDeniedError
      );
    }
  });
});

// ---------------------------------------------------------------------
// The test-account toggle, end to end
// ---------------------------------------------------------------------

describe('the test-account toggle moves the numbers on every view', () => {
  it('excludes test accounts by default and includes them only when the URL asks', async () => {
    const service = serviceRoleClient();
    await service.from('profiles').update({ is_test: true }).eq('id', TWO);

    try {
      const off = parseDashboardView({ range: 'custom', from: WINDOW_START, to: WINDOW_END });
      const on = parseDashboardView({
        range: 'custom',
        from: WINDOW_START,
        to: WINDOW_END,
        test: 'on',
      });

      const overviewOff = await getOverviewMetrics(admin, analyticsOptionsFor(off));
      const overviewOn = await getOverviewMetrics(admin, analyticsOptionsFor(on));

      expect(overviewOff.includeTestAccounts).toBe(false);
      expect(overviewOn.includeTestAccounts).toBe(true);
      expect(overviewOff.activeMembers).toBe(1);
      expect(overviewOn.activeMembers).toBe(2);
      expect(overviewOn.sessions).toBeGreaterThan(overviewOff.sessions);

      const featuresOff = await getFeatureUsage(admin, analyticsOptionsFor(off));
      const featuresOn = await getFeatureUsage(admin, analyticsOptionsFor(on));
      const scansOff = featuresOff.features.find((f) => f.featureKey === 'food_scan');
      const scansOn = featuresOn.features.find((f) => f.featureKey === 'food_scan');
      // The only Food Lens scan in this window belongs to the test account.
      expect(scansOff?.totalEvents).toBe(0);
      expect(scansOn?.totalEvents).toBe(1);

      const dropOff = await getDropOff(admin, analyticsOptionsFor(off));
      const dropOn = await getDropOff(admin, analyticsOptionsFor(on));
      const resetOff = dropOff.flows.find((f) => f.flowKey === 'daily_reset');
      const resetOn = dropOn.flows.find((f) => f.flowKey === 'daily_reset');
      expect(resetOff?.startedEvents).toBe(2);
      expect(resetOn?.startedEvents).toBe(3);

      const funnelOff = await getFunnel(admin, analyticsOptionsFor(off));
      const funnelOn = await getFunnel(admin, analyticsOptionsFor(on));
      expect(funnelOff.includeTestAccounts).toBe(false);
      expect(funnelOn.includeTestAccounts).toBe(true);
    } finally {
      await service.from('profiles').update({ is_test: false }).eq('id', TWO);
    }
  });
});

// ---------------------------------------------------------------------
// Date range switching, end to end
// ---------------------------------------------------------------------

describe('date range switching reaches the database', () => {
  it('the window the screen labels is the window the query ran over', async () => {
    for (const key of ['7d', '30d', '90d'] as const) {
      const view = parseDashboardView({ range: key }, WINDOW_END);
      const overview = await getOverviewMetrics(admin, {
        ...analyticsOptionsFor(view),
        today: WINDOW_END,
      });
      expect(overview.range.start, key).toBe(view.start);
      expect(overview.range.end, key).toBe(view.end);
    }
  });

  it('a narrower range really sees less than a wider one', async () => {
    const wide = parseDashboardView({ range: 'custom', from: WINDOW_START, to: WINDOW_END });
    const narrow = parseDashboardView({
      range: 'custom',
      from: '2026-01-06',
      to: '2026-01-06',
    });

    const wideReport = await getOverviewMetrics(admin, analyticsOptionsFor(wide));
    const narrowReport = await getOverviewMetrics(admin, analyticsOptionsFor(narrow));
    expect(wideReport.sessions).toBeGreaterThan(narrowReport.sessions);
    expect(narrowReport.sessions).toBe(1);
  });

  it('the previous equivalent period is a real, separate query over the days before', async () => {
    const view = parseDashboardView({ range: 'custom', from: '2026-01-12', to: '2026-01-12' });
    const previous = await getOverviewMetrics(admin, previousAnalyticsOptionsFor(view));
    expect(previous.range.start).toBe('2026-01-11');
    expect(previous.range.end).toBe('2026-01-11');
    expect(previous.activeMembers).toBe(0);
  });
});

// ---------------------------------------------------------------------
// Empty states, against a genuinely empty window
// ---------------------------------------------------------------------

describe('a window with nothing in it', () => {
  it('reports no data rather than a set of zeros the screen would present as measured', async () => {
    const overview = await getOverviewMetrics(admin, { period: EMPTY_PERIOD });
    expect(overview.hasData).toBe(false);
    expect(overview.activeMembers).toBe(0);
    expect(overview.dailyReset.completionRate).toBeNull();
    expect(overview.onboarding.completionRate).toBeNull();
    expect(overview.averageSessionsPerActiveMember).toBeNull();
  });

  it('turns those nulls into raw counts and "too few to rate", never into zero percent', async () => {
    const overview = await getOverviewMetrics(admin, { period: EMPTY_PERIOD });
    const readout = rateReadout(
      overview.dailyReset.completionRate,
      overview.dailyReset.startedEvents,
      overview.dailyReset.completedEvents
    );
    expect(readout.rateText).toBeNull();
    expect(readout.tooFewToRate).toBe(true);
    expect(readout.basis).toBe('0 starts, 0 completed');
  });

  it('gives every drop-off flow a null rate rather than a fabricated one', async () => {
    const dropOff = await getDropOff(admin, { period: EMPTY_PERIOD });
    for (const flow of dropOff.flows.filter((f) => f.measurable)) {
      expect(flow.completionRate, flow.flowKey).toBeNull();
      expect(rateReadout(flow.completionRate, flow.startedEvents, flow.completedEvents).tooFewToRate)
        .toBe(true);
    }
  });

  it('still lists every feature, with real zeros, rather than returning an empty list', async () => {
    const features = await getFeatureUsage(admin, { period: EMPTY_PERIOD });
    expect(features.features.length).toBeGreaterThan(10);
    expect(features.features.every((f) => f.totalEvents === 0)).toBe(true);
  });

  it('still reports the flows it cannot measure, with their reasons', async () => {
    const dropOff = await getDropOff(admin, { period: EMPTY_PERIOD });
    const unmeasurable = dropOff.flows.filter((f) => !f.measurable);
    expect(unmeasurable.length).toBeGreaterThan(0);
    for (const flow of unmeasurable) {
      expect(flow.unmeasurableReason, flow.flowKey).toBeTruthy();
      expect(flow.startedEvents, flow.flowKey).toBeNull();
      expect(flow.completionRate, flow.flowKey).toBeNull();
    }
    expect(dropOff.perQuestionDropOff.measurable).toBe(false);
    expect(dropOff.perQuestionDropOff.reason.length).toBeGreaterThan(20);
  });

  it('has an empty funnel cohort, and the screen says why in the words the build requires', async () => {
    const funnel = await getFunnel(admin, { period: EMPTY_PERIOD });
    expect(funnel.cohortSize).toBe(0);
    const empty = funnelEmptyState(funnel.profilesCreatedInRange);
    expect(empty.title.length).toBeGreaterThan(5);
    expect(empty.body).toContain('fills in');
  });
});
