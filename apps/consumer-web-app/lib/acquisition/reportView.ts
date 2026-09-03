/**
 * What the acquisition report's URL means.
 *
 * REUSES THE ANALYTICS DASHBOARD'S VIEW STATE RATHER THAN INVENTING A
 * SECOND ONE. The date range rules, the custom range validation, the
 * future-date correction and the test-account toggle are already written
 * once in lib/analytics-dashboard/viewState.ts and already tested there.
 * Two screens with two ideas of what "?range=30d&test=on" means is exactly
 * the kind of drift the standing "one source of truth per number" rule is
 * about, so this adds ONE thing that dashboard does not have, the grouping
 * dimension, and takes everything else as it stands.
 *
 * Pure. No I/O, no React, no Supabase client.
 */

import {
  dashboardHref,
  parseDashboardView,
  type DashboardRangeKey,
  type DashboardView,
  type SearchParams,
} from '@/lib/analytics-dashboard/viewState';
import { todayUtc } from '@/lib/analytics-service';
import { ACQUISITION_GROUP_BY, type AcquisitionGroupBy } from './report';

export const ACQUISITION_REPORT_PATH = '/admin/acquisition';

export const DEFAULT_GROUP_BY: AcquisitionGroupBy = 'source';

export interface AcquisitionReportView extends DashboardView {
  groupBy: AcquisitionGroupBy;
}

function firstValue(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function isGroupBy(value: string | undefined): value is AcquisitionGroupBy {
  return value !== undefined && (ACQUISITION_GROUP_BY as string[]).includes(value);
}

/** The URL as a view. An unknown grouping falls back to source, which is the question the experiment is actually for. */
export function parseAcquisitionView(
  searchParams: SearchParams | undefined,
  today: string = todayUtc()
): AcquisitionReportView {
  const params = searchParams ?? {};
  const requested = firstValue(params, 'group');
  return {
    ...parseDashboardView(params, today),
    groupBy: isGroupBy(requested) ? requested : DEFAULT_GROUP_BY,
  };
}

/**
 * A URL for the same report with one thing changed, carrying everything
 * else over. Changing the grouping never resets the window, and changing
 * the window never resets the grouping.
 */
export function acquisitionHref(
  view: AcquisitionReportView,
  overrides: Partial<{
    rangeKey: DashboardRangeKey;
    from: string;
    to: string;
    includeTestAccounts: boolean;
    groupBy: AcquisitionGroupBy;
  }> = {}
): string {
  const base = dashboardHref(ACQUISITION_REPORT_PATH, view, overrides);
  const groupBy = overrides.groupBy ?? view.groupBy;
  return groupBy === DEFAULT_GROUP_BY ? base : `${base}&group=${groupBy}`;
}
