/**
 * Admin Analytics, view 6: product insights.
 *
 * The agent-ready query group Prompt 1 shipped, made visible. Five questions
 * about the product, each answered by an existing entry point in
 * app/actions/analyticsAdmin.ts and rendered by the pure rules in
 * lib/analytics-dashboard/insightsView.ts. No new database function, no new
 * event type, no new tracking, no migration, and no LLM anywhere in the path.
 *
 * DETERMINISTIC. Every card is a count, a rate, or a named member read
 * straight out of a query result. The same window and the same test-account
 * toggle produce the same screen every time. Nothing is ranked by anything
 * except the numbers, and every threshold printed on a card is the service
 * layer's own exported constant, passed in here rather than restated, so this
 * screen cannot describe a rule that is not the rule that ran.
 *
 * PRIVACY. All five reads go through lib/analytics-service, which reads only
 * product_analytics_events, the view that excludes the wellness content event
 * types by construction (migration 146). This page opens no other data
 * source: no check-in, no questionnaire answer, no nutrition row, no health
 * field of any kind can reach it, and a test asserts its import list contains
 * no other data module.
 *
 * WHY THE MEMBER CARDS NAME MEMBERS. Two of the five questions are about
 * members rather than about the product, and answering "which members have
 * disengaged" without saying which members would make the card useless. What
 * is shown is a display name and behavioral counts, the same facts the member
 * table already shows, and each one links to that member's own timeline
 * rather than restating it here.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import type { Route } from 'next';
import { requireAnalyticsAdmin } from '../guard';
import {
  findDisengagedMembersAction,
  findFeaturesWithUnusualUsageDropsAction,
  findMembersWithIncompleteFlowsAction,
  findMembersWithReducedUsageAction,
  findWeakestFunnelStageAction,
} from '@/app/actions/analyticsAdmin';
import {
  DEFAULT_CHANGE_WINDOW_DAYS,
  ENGAGEMENT_DECLINE_RATIO,
  FEATURE_DECLINE_MINIMUM_BASELINE_EVENTS,
  REPEATED_START_MINIMUM,
} from '@/lib/analytics-service';
import { analyticsOptionsFor, parseDashboardView } from '@/lib/analytics-dashboard/viewState';
import type { SearchParams } from '@/lib/analytics-dashboard/viewState';
import {
  INSIGHTS_DETERMINISM_NOTE,
  INSIGHTS_EMPTY_COPY,
  INSIGHTS_INTRO,
  INSIGHTS_NOT_A_RECOMMENDATION,
  capRows,
  disengagedInsight,
  featureDeclineInsight,
  incompleteFlowInsight,
  reducedUsageInsight,
  unavailableInsight,
  weakestStageInsight,
} from '@/lib/analytics-dashboard/insightsView';
import type { ProductInsight } from '@/lib/analytics-dashboard/insightsView';
import { memberDetailHref } from '@/lib/analytics-dashboard/memberView';
import { AnalyticsChrome } from '@/components/admin/analytics/AnalyticsChrome';
import { EmptyState, Panel, ThinDataNote } from '@/components/admin/analytics/primitives';

export const metadata: Metadata = { title: 'Analytics product insights' };

const STATUS_CHIP: Record<ProductInsight['status'], { label: string; className: string }> = {
  finding: { label: 'Found', className: 'bg-[#C4A050]/20 text-[#1B3A2D]' },
  nothing_matched: { label: 'Nothing matched', className: 'bg-[#1B3A2D]/8 text-[#1B3A2D]/70' },
  unavailable: { label: 'Could not run', className: 'bg-[#8B2F2F]/12 text-[#8B2F2F]' },
};

export default async function AdminAnalyticsInsightsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  await requireAnalyticsAdmin();
  const view = parseDashboardView(searchParams);
  const options = analyticsOptionsFor(view);

  const [weakest, features, flows, disengaged, reduced] = await Promise.all([
    findWeakestFunnelStageAction(options),
    findFeaturesWithUnusualUsageDropsAction(options),
    findMembersWithIncompleteFlowsAction(options),
    findDisengagedMembersAction(options),
    findMembersWithReducedUsageAction(options),
  ]);

  // Each query answers for itself. One failing does not blank the screen, and
  // a failure is never rendered as "nothing found".
  const insights: ProductInsight[] = [
    weakest.ok
      ? weakestStageInsight(weakest.data)
      : unavailableInsight(
          'weakest_funnel_stage',
          'The stage losing the most members',
          'Between which two funnel stages does the platform lose the most members?',
          weakest.error
        ),
    features.ok
      ? featureDeclineInsight(features.data, {
          minimumBaselineEvents: FEATURE_DECLINE_MINIMUM_BASELINE_EVENTS,
          declineRatio: ENGAGEMENT_DECLINE_RATIO,
          windowDays: DEFAULT_CHANGE_WINDOW_DAYS,
        })
      : unavailableInsight(
          'feature_declines',
          'Features used less than before',
          'Which features are being used less than they were in the window before this one?',
          features.error
        ),
    flows.ok
      ? incompleteFlowInsight(flows.data, { repeatedStartMinimum: REPEATED_START_MINIMUM })
      : unavailableInsight(
          'incomplete_flows',
          'Started and not finished',
          'Which flows are members starting and not finishing?',
          flows.error
        ),
    disengaged.ok
      ? disengagedInsight(disengaged.data)
      : unavailableInsight(
          'disengaged',
          'Members who have disengaged',
          'Which members have stopped using the product?',
          disengaged.error
        ),
    reduced.ok
      ? reducedUsageInsight(reduced.data)
      : unavailableInsight(
          'reduced_usage',
          'Members below their own baseline',
          'Which members are doing noticeably less than they used to?',
          reduced.error
        ),
  ];

  const anyFinding = insights.some((insight) => insight.status === 'finding');

  return (
    <AnalyticsChrome
      current="/admin/analytics/insights"
      view={view}
      title="Product insights"
      intro={INSIGHTS_INTRO}
    >
      <div className="mb-5 space-y-2">
        <p className="text-[12.5px] leading-relaxed text-[#6B7A72]">{INSIGHTS_DETERMINISM_NOTE}</p>
        <p className="text-[12.5px] leading-relaxed text-[#6B7A72]">
          {INSIGHTS_NOT_A_RECOMMENDATION}
        </p>
      </div>

      {!anyFinding ? (
        <div className="mb-5">
          <EmptyState title={INSIGHTS_EMPTY_COPY.title} body={INSIGHTS_EMPTY_COPY.body} />
        </div>
      ) : null}

      <div className="space-y-5">
        {insights.map((insight) => {
          const chip = STATUS_CHIP[insight.status];
          const { shown, hiddenNote } = capRows(insight.rows);
          return (
            <Panel key={insight.key} title={insight.title} description={insight.question}>
              <div data-insight={insight.key} data-insight-status={insight.status}>
                <p className="flex flex-wrap items-center gap-2.5">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${chip.className}`}
                  >
                    {chip.label}
                  </span>
                  <span className="text-[14px] leading-relaxed text-[#1B3A2D]">
                    {insight.headline}
                  </span>
                </p>

                {insight.error ? (
                  <p className="mt-2 text-[12.5px] leading-relaxed text-[#8B2F2F]">
                    {insight.error}
                  </p>
                ) : null}

                {shown.length > 0 ? (
                  <ul className="mt-4 space-y-2">
                    {shown.map((row) => {
                      const content = (
                        <>
                          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                            <span className="text-[14px] text-[#1B3A2D]">{row.label}</span>
                            <span className="text-[12.5px] tabular-nums text-[#6B7A72]">
                              {row.value}
                            </span>
                          </div>
                          {row.detail ? (
                            <p className="mt-1 text-[12px] leading-relaxed text-[#6B7A72]">
                              {row.detail}
                            </p>
                          ) : null}
                        </>
                      );

                      return (
                        <li key={row.key}>
                          {row.memberId ? (
                            <Link
                              href={memberDetailHref(row.memberId, view) as Route}
                              data-insight-member={row.memberId}
                              className="mef-focus-ring block rounded-2xl bg-[#1B3A2D]/[0.035] px-4 py-3 transition-colors hover:bg-[#1B3A2D]/[0.06]"
                            >
                              {content}
                            </Link>
                          ) : (
                            <div className="rounded-2xl bg-[#1B3A2D]/[0.035] px-4 py-3">
                              {content}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}

                {hiddenNote ? (
                  <p className="mt-3">
                    <ThinDataNote>{hiddenNote}</ThinDataNote>
                  </p>
                ) : null}

                <p className="mt-4 border-t border-[#1B3A2D]/8 pt-3 text-[12px] leading-relaxed text-[#6B7A72]">
                  <span className="font-medium text-[#1B3A2D]/70">How this was decided.</span>{' '}
                  {insight.rule}
                </p>
              </div>
            </Panel>
          );
        })}
      </div>
    </AnalyticsChrome>
  );
}
