/**
 * Admin Analytics dashboard, the parts that can be proved without a
 * database: what a URL means, what a trend against the previous period
 * says, and what an empty or thin view is allowed to claim.
 *
 * The screens themselves are React server components, which this repo
 * cannot render in a unit test (they await server actions that call
 * `cookies()` from next/headers, which throws outside a Next.js request
 * scope). So the rules the screens depend on live in
 * lib/analytics-dashboard/, are pure, and are tested directly here, and the
 * screens are checked structurally: every page really does call the guard,
 * really does pass the parsed view's options to the service layer, and
 * really does have an empty state.
 *
 * The access boundary itself is proved for real, against real RLS and the
 * real database functions, in admin-analytics-dashboard-access.test.ts.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_RANGE_KEY,
  analyticsOptionsFor,
  dashboardHref,
  parseDashboardView,
  previousAnalyticsOptionsFor,
  previousPeriodOf,
  rangeSummary,
} from '../lib/analytics-dashboard/viewState';
import { computeTrend, trendChip } from '../lib/analytics-dashboard/trend';
import {
  EMPTY_STATE_COPY,
  PRE_TRACKING_COHORT_COPY,
  TOO_FEW_TO_RATE_LABEL,
  cohortGapNotice,
  densifyDailySeries,
  formatAverage,
  formatCount,
  formatRate,
  funnelEmptyState,
  funnelStageComparison,
  isUnusedFeature,
  rateReadout,
} from '../lib/analytics-dashboard/presentation';

const TODAY = '2026-08-12';

const APP = path.resolve(__dirname, '..');
const PAGE_FILES = [
  'app/admin/analytics/page.tsx',
  'app/admin/analytics/funnel/page.tsx',
  'app/admin/analytics/features/page.tsx',
  'app/admin/analytics/drop-off/page.tsx',
];
const SECTION_FILES = [
  ...PAGE_FILES,
  'app/admin/analytics/layout.tsx',
  'app/admin/analytics/guard.ts',
  'components/admin/analytics/AnalyticsChrome.tsx',
  'components/admin/analytics/primitives.tsx',
  'lib/analytics-dashboard/viewState.ts',
  'lib/analytics-dashboard/trend.ts',
  'lib/analytics-dashboard/presentation.ts',
];

function source(relative: string): string {
  return readFileSync(path.join(APP, relative), 'utf-8');
}

// ---------------------------------------------------------------------
// Date range switching
// ---------------------------------------------------------------------

describe('date range switching', () => {
  it('defaults to 30 days when nothing is asked for', () => {
    const view = parseDashboardView(undefined, TODAY);
    expect(view.rangeKey).toBe(DEFAULT_RANGE_KEY);
    expect(view.days).toBe(30);
    expect(view.end).toBe(TODAY);
    expect(view.start).toBe('2026-07-14');
    expect(view.rangeNotice).toBeNull();
  });

  it('resolves each preset to the window the service layer would resolve', () => {
    expect(parseDashboardView({ range: '7d' }, TODAY)).toMatchObject({
      days: 7,
      start: '2026-08-06',
      end: TODAY,
    });
    expect(parseDashboardView({ range: '30d' }, TODAY)).toMatchObject({ days: 30 });
    expect(parseDashboardView({ range: '90d' }, TODAY)).toMatchObject({
      days: 90,
      start: '2026-05-15',
      end: TODAY,
    });
  });

  it('accepts a custom range and passes it through as explicit calendar days', () => {
    const view = parseDashboardView(
      { range: 'custom', from: '2026-06-01', to: '2026-06-30' },
      TODAY
    );
    expect(view.rangeKey).toBe('custom');
    expect(view.start).toBe('2026-06-01');
    expect(view.end).toBe('2026-06-30');
    expect(view.days).toBe(30);
    expect(analyticsOptionsFor(view).period).toEqual({ start: '2026-06-01', end: '2026-06-30' });
  });

  it('swaps a backwards custom range rather than showing nothing', () => {
    const view = parseDashboardView(
      { range: 'custom', from: '2026-06-30', to: '2026-06-01' },
      TODAY
    );
    expect(view.start).toBe('2026-06-01');
    expect(view.end).toBe('2026-06-30');
  });

  it('pulls a future end date back to today and says so', () => {
    const view = parseDashboardView(
      { range: 'custom', from: '2026-08-01', to: '2026-12-31' },
      TODAY
    );
    expect(view.end).toBe(TODAY);
    expect(view.rangeNotice).toContain('future');
    expect(view.rangeNotice).toContain(TODAY);
  });

  it('falls back to the default and says so when a custom range is unreadable', () => {
    const view = parseDashboardView({ range: 'custom', from: 'not-a-date' }, TODAY);
    expect(view.rangeKey).toBe(DEFAULT_RANGE_KEY);
    expect(view.days).toBe(30);
    expect(view.rangeNotice).toContain('last 30 days');
  });

  it('ignores a range key it does not offer', () => {
    expect(parseDashboardView({ range: 'all_time' }, TODAY).rangeKey).toBe(DEFAULT_RANGE_KEY);
  });

  it('describes the window it actually resolved, so a label cannot drift from its numbers', () => {
    const view = parseDashboardView({ range: '7d' }, TODAY);
    expect(rangeSummary(view)).toContain(view.start);
    expect(rangeSummary(view)).toContain(view.end);
  });

  it('carries the range across a link to another view', () => {
    const view = parseDashboardView({ range: '90d' }, TODAY);
    expect(dashboardHref('/admin/analytics/funnel', view)).toBe(
      '/admin/analytics/funnel?range=90d'
    );
  });

  it('carries a custom range through as explicit dates so another view resolves the same window', () => {
    const view = parseDashboardView(
      { range: 'custom', from: '2026-06-01', to: '2026-06-30' },
      TODAY
    );
    const href = dashboardHref('/admin/analytics/features', view);
    expect(href).toContain('range=custom');
    expect(href).toContain('from=2026-06-01');
    expect(href).toContain('to=2026-06-30');
  });
});

// ---------------------------------------------------------------------
// The previous equivalent period
// ---------------------------------------------------------------------

describe('the previous equivalent period', () => {
  it('is the same length and ends the day before this one starts', () => {
    const view = parseDashboardView({ range: '30d' }, TODAY);
    const previous = previousPeriodOf(view);
    expect(previous.days).toBe(30);
    expect(previous.end).toBe('2026-07-13');
    expect(previous.start).toBe('2026-06-14');
  });

  it('never shares a day with the current window, so nothing is counted on both sides', () => {
    const view = parseDashboardView({ range: '7d' }, TODAY);
    const previous = previousPeriodOf(view);
    expect(previous.end < view.start).toBe(true);
  });

  it('keeps the test-account toggle when it asks the service layer for the earlier window', () => {
    const view = parseDashboardView({ range: '7d', test: 'on' }, TODAY);
    expect(previousAnalyticsOptionsFor(view).includeTestAccounts).toBe(true);
    expect(previousAnalyticsOptionsFor(view).period).toEqual({
      start: '2026-07-30',
      end: '2026-08-05',
    });
  });
});

// ---------------------------------------------------------------------
// Trend
// ---------------------------------------------------------------------

describe('trend against the previous period', () => {
  it('gives a percentage when there is a real baseline', () => {
    const trend = computeTrend(12, 8, 'the previous 30 days');
    expect(trend.direction).toBe('up');
    expect(trend.percentChange).toBe(50);
    expect(trendChip(trend)).toBe('+50%');
  });

  it('reports a fall as a fall', () => {
    const trend = computeTrend(4, 8, 'the previous 30 days');
    expect(trend.direction).toBe('down');
    expect(trend.percentChange).toBe(-50);
    expect(trendChip(trend)).toBe('-50%');
  });

  it('refuses to invent a percentage when the earlier window was empty', () => {
    const trend = computeTrend(3, 0, 'the previous 7 days');
    expect(trend.direction).toBe('first');
    expect(trend.percentChange).toBeNull();
    expect(trend.description).toContain('the previous 7 days');
  });

  it('does not call two empty windows a flat trend', () => {
    const trend = computeTrend(0, 0, 'the previous 7 days');
    expect(trend.direction).toBe('none');
    expect(trend.percentChange).toBeNull();
    expect(trendChip(trend)).toBe('');
  });

  it('calls an unchanged number unchanged', () => {
    expect(computeTrend(5, 5).direction).toBe('flat');
    expect(trendChip(computeTrend(5, 5))).toBe('No change');
  });
});

// ---------------------------------------------------------------------
// The test-account toggle
// ---------------------------------------------------------------------

describe('the test-account toggle', () => {
  it('is off unless the URL asks for it', () => {
    expect(parseDashboardView(undefined, TODAY).includeTestAccounts).toBe(false);
    expect(parseDashboardView({ test: 'true' }, TODAY).includeTestAccounts).toBe(false);
    expect(parseDashboardView({ test: 'on' }, TODAY).includeTestAccounts).toBe(true);
  });

  it('reaches the service layer options for every view, not just the one that set it', () => {
    const view = parseDashboardView({ range: '90d', test: 'on' }, TODAY);
    expect(analyticsOptionsFor(view).includeTestAccounts).toBe(true);
  });

  it('is passed to the service layer as false, explicitly, when it is off', () => {
    const view = parseDashboardView({ range: '90d' }, TODAY);
    expect(analyticsOptionsFor(view).includeTestAccounts).toBe(false);
    expect(previousAnalyticsOptionsFor(view).includeTestAccounts).toBe(false);
  });

  it('turns on and off without losing the date range', () => {
    const off = parseDashboardView({ range: '7d' }, TODAY);
    const turnOn = dashboardHref('/admin/analytics', off, { includeTestAccounts: true });
    expect(turnOn).toContain('range=7d');
    expect(turnOn).toContain('test=on');

    const on = parseDashboardView({ range: '7d', test: 'on' }, TODAY);
    const turnOff = dashboardHref('/admin/analytics', on, { includeTestAccounts: false });
    expect(turnOff).toContain('range=7d');
    expect(turnOff).not.toContain('test=on');
  });

  it('stays on when the date range is changed', () => {
    const view = parseDashboardView({ range: '7d', test: 'on' }, TODAY);
    expect(dashboardHref('/admin/analytics', view, { rangeKey: '90d' })).toContain('test=on');
  });

  it('every view links to the others with the toggle intact', () => {
    const view = parseDashboardView({ range: '30d', test: 'on' }, TODAY);
    for (const target of [
      '/admin/analytics',
      '/admin/analytics/funnel',
      '/admin/analytics/features',
      '/admin/analytics/drop-off',
    ]) {
      expect(dashboardHref(target, view)).toContain('test=on');
    }
  });
});

// ---------------------------------------------------------------------
// Empty and thin data
// ---------------------------------------------------------------------

describe('empty and thin states', () => {
  it('shows raw counts and "too few to rate" instead of a rate when nothing was started', () => {
    const readout = rateReadout(null, 0, 0);
    expect(readout.rateText).toBeNull();
    expect(readout.tooFewToRate).toBe(true);
    expect(readout.basis).toBe('0 starts, 0 completed');
    expect(TOO_FEW_TO_RATE_LABEL).toBe('Too few to rate');
  });

  it('says "too few to rate" for a null rate even when the counts look fine, because the rate is the claim', () => {
    expect(rateReadout(null, 3, 1).tooFewToRate).toBe(true);
  });

  it('drops a plural noun to its singular and keeps a real value that would round to zero', () => {
    expect(formatAverage(1, 'sessions')).toBe('1 session');
    expect(formatAverage(2.44, 'sessions')).toBe('2.4 sessions');
    expect(formatAverage(0.011, 'per day')).toBe('0.01 per day');
    expect(formatAverage(0, 'sessions')).toBe('0 sessions');
    expect(formatAverage(null, 'sessions')).toBeNull();
  });

  it('shows the rate with the starts it rests on once there is a denominator', () => {
    const readout = rateReadout(50, 4, 2);
    expect(readout.rateText).toBe('50%');
    expect(readout.tooFewToRate).toBe(false);
    expect(readout.basis).toBe('2 of 4 starts');
  });

  it('never turns a null rate into a zero', () => {
    expect(formatRate(null)).toBeNull();
    expect(formatRate(0)).toBe('0%');
  });

  it('says a count is unavailable rather than printing a fabricated zero', () => {
    expect(formatCount(null)).toBe('Not available');
    expect(formatCount(0)).toBe('0');
    expect(formatCount(1234)).toBe('1,234');
  });

  it('says exactly why the funnel cohort is zero when the accounts predate the signup trigger', () => {
    const empty = funnelEmptyState(6);
    expect(empty.body).toContain(PRE_TRACKING_COHORT_COPY);
    expect(empty.body).toContain('sign up from today onward');
  });

  it('does not blame the signup trigger when no account was created at all', () => {
    expect(funnelEmptyState(0).body).not.toContain(PRE_TRACKING_COHORT_COPY);
  });

  it('names the gap between accounts created and recorded signups when both exist', () => {
    expect(cohortGapNotice(2, 6)).toContain('predate the signup trigger');
    expect(cohortGapNotice(6, 6)).toBeNull();
    expect(cohortGapNotice(0, 4)).toBe(PRE_TRACKING_COHORT_COPY);
  });

  it('every empty state says what will make it fill in', () => {
    for (const [key, copy] of Object.entries(EMPTY_STATE_COPY)) {
      expect(copy.body.length, key).toBeGreaterThan(40);
      expect(copy.body.toLowerCase(), key).toMatch(/fills in|listed|zeros/);
    }
  });

  it('does not let every funnel stage claim to be the first one', () => {
    const first = funnelStageComparison(
      { percentOfPreviousMeasurableStage: null, membersLostFromPreviousStage: null },
      true
    );
    const strandedByAnEmptyStageBefore = funnelStageComparison(
      { percentOfPreviousMeasurableStage: null, membersLostFromPreviousStage: 0 },
      false
    );
    expect(first).toContain('first measurable stage');
    expect(strandedByAnEmptyStageBefore).not.toContain('first measurable stage');
    expect(strandedByAnEmptyStageBefore).toContain('Nobody reached the previous measurable stage');
  });

  it('gives a funnel stage its percentage of the stage before, and who was lost', () => {
    const line = funnelStageComparison(
      { percentOfPreviousMeasurableStage: 50, membersLostFromPreviousStage: 1 },
      false
    );
    expect(line).toContain('50% of the previous measurable stage.');
    expect(line).toContain('1 member did not carry through');
  });

  it('labels a feature nobody touched as unused rather than dropping it', () => {
    expect(isUnusedFeature({ uniqueMembers: 0, totalEvents: 0 })).toBe(true);
    expect(isUnusedFeature({ uniqueMembers: 0, totalEvents: 3 })).toBe(false);
    expect(isUnusedFeature({ uniqueMembers: 1, totalEvents: 1 })).toBe(false);
  });

  it('fills the quiet days of a sparse daily series with real zeros', () => {
    const dense = densifyDailySeries(
      [{ localDate: '2026-08-11', members: 2 }],
      '2026-08-10',
      '2026-08-12'
    );
    expect(dense).toEqual([
      { localDate: '2026-08-10', members: 0 },
      { localDate: '2026-08-11', members: 2 },
      { localDate: '2026-08-12', members: 0 },
    ]);
  });
});

// ---------------------------------------------------------------------
// The screens themselves, checked structurally
// ---------------------------------------------------------------------

describe('the four screens', () => {
  it('each one calls the guard itself, not only the layout it happens to sit under', () => {
    // The call, not the import: a page that imported the guard and never
    // awaited it would still render for anybody.
    for (const file of PAGE_FILES) {
      expect(source(file), file).toContain('await requireAnalyticsAdmin()');
    }
    expect(source('app/admin/analytics/layout.tsx')).toContain('await requireAnalyticsAdmin()');
  });

  it('the guard checks the same role, through the same helper, as the API surface', () => {
    const guard = source('app/admin/analytics/guard.ts');
    const actions = source('app/actions/analyticsAdmin.ts');
    expect(guard).toContain("hasActiveRole(supabase, user.id, 'platform_administrator')");
    expect(actions).toContain("hasActiveRole(supabase, user.id, 'platform_administrator')");
    expect(guard).toContain('getCachedUser');
    expect(actions).toContain('getCachedUser');
  });

  it('refuses a signed-out visitor and a signed-in non-administrator differently, and neither with data', () => {
    const guard = source('app/admin/analytics/guard.ts');
    expect(guard).toContain("redirect('/login')");
    expect(guard).toContain("redirect('/dashboard')");
  });

  it('reads only through the authorized action layer, never the service layer directly', () => {
    for (const file of PAGE_FILES) {
      const text = source(file);
      expect(text, file).toContain("@/app/actions/analyticsAdmin");
      expect(text, file).not.toMatch(/from '@\/lib\/analytics-service\/(client|detections|queries)'/);
      expect(text, file).not.toContain('createClient(');
    }
  });

  it('passes the parsed view straight to the service layer, so the label and the query agree', () => {
    for (const file of PAGE_FILES) {
      expect(source(file), file).toContain('analyticsOptionsFor(view)');
    }
  });

  it('has an honest empty state on every view', () => {
    for (const file of PAGE_FILES) {
      expect(source(file), file).toContain('EmptyState');
    }
  });

  it('renders an unmeasurable thing with its reason, on the two views that have one', () => {
    expect(source('app/admin/analytics/page.tsx')).toContain('Unmeasurable');
    expect(source('app/admin/analytics/drop-off/page.tsx')).toContain('Unmeasurable');
    expect(source('app/admin/analytics/drop-off/page.tsx')).toContain('perQuestionDropOff.reason');
  });

  it('tells a refused query apart from an empty one', () => {
    for (const file of PAGE_FILES) {
      expect(source(file), file).toContain('ActionError');
    }
  });

  it('uses no LLM anywhere in the section: every number and label is deterministic', () => {
    for (const file of SECTION_FILES) {
      const imports = source(file)
        .split('\n')
        .filter((line) => line.includes('from \'') || line.includes('require('));
      for (const line of imports) {
        expect(line, `${file}: ${line}`).not.toMatch(/anthropic|openai|\/ai(-|\/)|ai-dispatcher/i);
      }
      expect(source(file), file).not.toMatch(/generateText\(|callModel\(|dispatchAi\(/);
    }
  });

  it('writes no em dash in any on-screen copy', () => {
    for (const file of SECTION_FILES) {
      expect(source(file), file).not.toContain('—');
    }
  });

  it('never loads raw event rows into the browser: nothing in the section is a client component', () => {
    for (const file of SECTION_FILES) {
      expect(source(file), file).not.toContain("'use client'");
    }
  });
});
