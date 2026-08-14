/**
 * The privacy boundary for the two screens added in this build, proved the
 * same way the member screens' boundary already is: by deliberately writing
 * real health content into the same event stream, for the same member, in the
 * same window, and then asserting that none of it can reach either screen's
 * output.
 *
 * This is the equivalent of the existing test in
 * tests/admin-analytics-member-access.test.ts, extended to the new surfaces.
 * It is a separate file because it needs its own fixture era, and because the
 * two files must be able to fail independently: a regression on the insights
 * screen should not be masked by, or mistaken for, one on the member detail.
 *
 * WHAT IS BEING PROVED, precisely. Not that these screens choose not to show
 * health content, which would be a promise about rendering code. That the
 * data they read cannot contain it. Every read on both screens goes through
 * lib/analytics-service, which reads only product_analytics_events, the view
 * that excludes the wellness content event types by construction (migration
 * 146). So the assertion is made against the returned objects, before any
 * component is involved at all.
 *
 * The second half is structural: the insights page's own import list. A
 * future edit that reached past the service layer for "just one more number"
 * is exactly how a boundary like this is lost, and it would not be caught by
 * any data assertion, because the new import would bring its own data.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import {
  findDisengagedMembers,
  findFeaturesWithUnusualUsageDrops,
  findMembersWithIncompleteFlows,
  findMembersWithReducedUsage,
  findWeakestFunnelStage,
} from '../lib/analytics-service/queries';
import {
  DEFAULT_CHANGE_WINDOW_DAYS,
  ENGAGEMENT_DECLINE_RATIO,
  FEATURE_DECLINE_MINIMUM_BASELINE_EVENTS,
  REPEATED_START_MINIMUM,
} from '../lib/analytics-service';
import {
  disengagedInsight,
  featureDeclineInsight,
  incompleteFlowInsight,
  reducedUsageInsight,
  weakestStageInsight,
} from '../lib/analytics-dashboard/insightsView';

const ONE = TEST_USERS.memberOne.id;

/** A fixture era of this file's own, clear of every other analytics fixture. */
const WINDOW_START = '2025-04-01';
const WINDOW_END = '2025-05-30';
const OPTIONS = {
  period: { start: WINDOW_START, end: WINDOW_END },
  includeTestAccounts: true,
  today: WINDOW_END,
} as const;

/**
 * The health content that must never surface. Every string here is either a
 * value inside a health payload, the name of a health field, or the name of a
 * wellness event type. The event types themselves are the five that
 * product_analytics_events excludes.
 */
const FORBIDDEN = [
  'lower back',
  'sharp pain when standing',
  'painLocation',
  'sleepQuality',
  'energyLevel',
  'stressLevel',
  'digestionRating',
  'moodLevel',
  'concern_flagged',
  'morning_readiness_recorded',
  'evening_reflection_recorded',
  'hydration_logged',
  'my knee has been giving out',
  'reflectionNote',
];

function event(memberId: string, type: string, localDate: string, payload: object = {}) {
  return {
    member_id: memberId,
    event_type: type,
    occurred_at: `${localDate}T12:00:00Z`,
    timezone: 'America/New_York',
    local_date: localDate,
    payload,
    source: 'member',
  };
}

describe('no health content can reach the product insights screen', () => {
  let admin: SupabaseClient;
  let service: SupabaseClient;

  beforeAll(async () => {
    admin = await signInAs(TEST_USERS.adminOne);
    service = serviceRoleClient();

    await service
      .from('member_wellness_events')
      .delete()
      .eq('member_id', ONE)
      .gte('local_date', WINDOW_START)
      .lte('local_date', WINDOW_END);

    const rows = [
      // Behavioral activity, so the queries have something real to work with
      // and the test is not passing merely because everything is empty.
      event(ONE, 'session_started', '2025-04-02'),
      event(ONE, 'surface_viewed', '2025-04-02', { surface: 'home' }),
      event(ONE, 'daily_reset_started', '2025-04-03'),
      event(ONE, 'daily_reset_started', '2025-04-04'),
      event(ONE, 'daily_reset_started', '2025-04-05'),
      event(ONE, 'daily_reset_completed', '2025-04-05'),
      event(ONE, 'session_started', '2025-04-06'),

      // Real health content, written into the same table, for the same
      // member, inside the same window.
      event(ONE, 'concern_flagged', '2025-04-07', {
        painLocation: 'lower back',
        note: 'sharp pain when standing',
      }),
      event(ONE, 'morning_readiness_recorded', '2025-04-07', {
        sleepQuality: 2,
        energyLevel: 1,
        moodLevel: 2,
      }),
      event(ONE, 'evening_reflection_recorded', '2025-04-08', {
        stressLevel: 5,
        digestionRating: 1,
        reflectionNote: 'my knee has been giving out',
      }),
      event(ONE, 'hydration_logged', '2025-04-08', { moodLevel: 2 }),
    ];

    const { error } = await service.from('member_wellness_events').insert(rows);
    if (error) throw new Error(`fixture insert failed: ${error.message}`);
  });

  afterAll(async () => {
    await service
      .from('member_wellness_events')
      .delete()
      .eq('member_id', ONE)
      .gte('local_date', WINDOW_START)
      .lte('local_date', WINDOW_END);
  });

  it('the fixture really did write health content, so this test is not vacuous', async () => {
    const { data } = await service
      .from('member_wellness_events')
      .select('event_type')
      .eq('member_id', ONE)
      .eq('event_type', 'concern_flagged')
      .gte('local_date', WINDOW_START)
      .lte('local_date', WINDOW_END);
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  it('none of the five insight queries returns any health content', async () => {
    const results = await Promise.all([
      findWeakestFunnelStage(admin, OPTIONS),
      findFeaturesWithUnusualUsageDrops(admin, OPTIONS),
      findMembersWithIncompleteFlows(admin, OPTIONS),
      findDisengagedMembers(admin, OPTIONS),
      findMembersWithReducedUsage(admin, OPTIONS),
    ]);

    const serialized = JSON.stringify(results);
    for (const forbidden of FORBIDDEN) {
      expect(serialized, forbidden).not.toContain(forbidden);
    }
  });

  it('nothing health-related survives into what the screen actually renders', async () => {
    const [stage, features, flows, disengaged, reduced] = await Promise.all([
      findWeakestFunnelStage(admin, OPTIONS),
      findFeaturesWithUnusualUsageDrops(admin, OPTIONS),
      findMembersWithIncompleteFlows(admin, OPTIONS),
      findDisengagedMembers(admin, OPTIONS),
      findMembersWithReducedUsage(admin, OPTIONS),
    ]);

    // The exact objects the page maps over, built the exact way the page
    // builds them.
    const insights = [
      weakestStageInsight(stage),
      featureDeclineInsight(features, {
        minimumBaselineEvents: FEATURE_DECLINE_MINIMUM_BASELINE_EVENTS,
        declineRatio: ENGAGEMENT_DECLINE_RATIO,
        windowDays: DEFAULT_CHANGE_WINDOW_DAYS,
      }),
      incompleteFlowInsight(flows, { repeatedStartMinimum: REPEATED_START_MINIMUM }),
      disengagedInsight(disengaged),
      reducedUsageInsight(reduced),
    ];

    const serialized = JSON.stringify(insights);
    for (const forbidden of FORBIDDEN) {
      expect(serialized, forbidden).not.toContain(forbidden);
    }
  });

  it('the health event types are excluded by the view itself, not by the screen', async () => {
    // The events exist in the base table for this member in this window.
    const { data: base } = await service
      .from('member_wellness_events')
      .select('event_type')
      .eq('member_id', ONE)
      .gte('local_date', WINDOW_START)
      .lte('local_date', WINDOW_END);
    const baseTypes = new Set((base ?? []).map((row) => row.event_type as string));
    expect(baseTypes.has('concern_flagged')).toBe(true);
    expect(baseTypes.has('morning_readiness_recorded')).toBe(true);

    // And they are simply not present in the view every analytics read uses.
    const { data: view } = await service
      .from('product_analytics_events')
      .select('event_type')
      .eq('member_id', ONE)
      .gte('local_date', WINDOW_START)
      .lte('local_date', WINDOW_END);
    const viewTypes = new Set((view ?? []).map((row) => row.event_type as string));
    expect(viewTypes.has('concern_flagged')).toBe(false);
    expect(viewTypes.has('morning_readiness_recorded')).toBe(false);
    expect(viewTypes.has('evening_reflection_recorded')).toBe(false);
    expect(viewTypes.has('hydration_logged')).toBe(false);
    // The behavioral rows did come through, so the view is not simply empty.
    expect(viewTypes.has('session_started')).toBe(true);
  });
});

// ---------------------------------------------------------------------
// The structural half
// ---------------------------------------------------------------------

describe('the new screens open no data source but the analytics service layer', () => {
  const appDir = path.resolve(__dirname, '..');

  function importsOf(relativePath: string): string[] {
    const source = readFileSync(path.join(appDir, relativePath), 'utf-8');
    return [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]!);
  }

  /**
   * The only data modules either screen may import. Anything else with a
   * data layer behind it is a new path by which member-entered content could
   * arrive, which is exactly what this section exists to prevent.
   */
  const ALLOWED_DATA_IMPORTS = [
    '@/app/actions/analyticsAdmin',
    '@/lib/analytics-service',
    '@/lib/analytics-dashboard/viewState',
    '@/lib/analytics-dashboard/memberView',
    '@/lib/analytics-dashboard/insightsView',
    '@/lib/analytics-dashboard/presentation',
    '@/lib/analytics-dashboard/trend',
  ];

  /** Imports that carry no data at all: framework, components, the guard. */
  function isNonDataImport(specifier: string): boolean {
    if (!specifier.startsWith('@/') && !specifier.startsWith('.')) return true; // next, react
    if (specifier.startsWith('@/components/')) return true;
    if (specifier.startsWith('../guard') || specifier.endsWith('/guard')) return true;
    return false;
  }

  const SCREENS = [
    'app/admin/analytics/insights/page.tsx',
    'app/admin/analytics/members/page.tsx',
    'app/admin/analytics/members/[memberId]/page.tsx',
  ];

  for (const screen of SCREENS) {
    it(`${screen} imports no data module outside the analytics layer`, () => {
      for (const specifier of importsOf(screen)) {
        if (isNonDataImport(specifier)) continue;
        expect(ALLOWED_DATA_IMPORTS, `${screen} imports ${specifier}`).toContain(specifier);
      }
    });
  }

  it('the insights page names no health table, column or event type anywhere in its source', () => {
    const source = readFileSync(path.join(appDir, 'app/admin/analytics/insights/page.tsx'), 'utf-8');
    for (const forbidden of [
      'daily_checkins',
      'daily_checkin_probe_answers',
      'onboarding_submissions',
      'member_goal_selections',
      'food_logs',
      'conversation_messages',
      'concern_flagged',
      'morning_readiness_recorded',
    ]) {
      expect(source, forbidden).not.toContain(forbidden);
    }
  });

  it('every analytics page still calls its own guard, not merely imports it', () => {
    for (const screen of SCREENS) {
      const source = readFileSync(path.join(appDir, screen), 'utf-8');
      expect(source, screen).toContain('await requireAnalyticsAdmin()');
    }
  });
});
