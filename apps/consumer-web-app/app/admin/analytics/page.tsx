/**
 * Admin Analytics, view 1: Overview.
 *
 * The headline numbers for a chosen window, each with its trend against the
 * equally long window immediately before it. Everything on this page comes
 * from app/actions/analyticsAdmin.ts, which is the only authorized entry
 * point into the service layer. No aggregation happens here and no event
 * row is ever loaded: each action returns one already-summarised object
 * computed in Postgres.
 *
 * Six calls, three windows' worth: the overview and the feature usage
 * report for this window and for the previous one (feature usage is where
 * Food Lens scans are counted), plus the drop-off report, which is where
 * the two unmeasurable things that are not purchases come from. Anything
 * the service layer says cannot be measured is rendered with its reason,
 * never as a zero and never as a dash.
 */

import type { Metadata } from 'next';
import { requireAnalyticsAdmin } from './guard';
import {
  getDropOffAction,
  getFeatureUsageAction,
  getOverviewMetricsAction,
} from '@/app/actions/analyticsAdmin';
import { SESSION_DEFINITION } from '@/lib/analytics-service';
import type { FeatureUsageReport } from '@/lib/analytics-service';
import {
  analyticsOptionsFor,
  parseDashboardView,
  previousAnalyticsOptionsFor,
  previousPeriodLabel,
} from '@/lib/analytics-dashboard/viewState';
import type { SearchParams } from '@/lib/analytics-dashboard/viewState';
import { computeTrend } from '@/lib/analytics-dashboard/trend';
import {
  EMPTY_STATE_COPY,
  TOO_FEW_TO_RATE_LABEL,
  cohortGapNotice,
  countNoun,
  densifyDailySeries,
  formatAverage,
  formatCount,
  rateReadout,
} from '@/lib/analytics-dashboard/presentation';
import { AnalyticsChrome } from '@/components/admin/analytics/AnalyticsChrome';
import {
  ActionError,
  EmptyState,
  MetricCard,
  Panel,
  StatLine,
  ThinDataNote,
  Unmeasurable,
} from '@/components/admin/analytics/primitives';

export const metadata: Metadata = { title: 'Analytics overview' };

const FOOD_SCAN_FEATURE = 'food_scan';

function foodScans(report: FeatureUsageReport | null): { events: number; members: number } {
  const row = report?.features.find((feature) => feature.featureKey === FOOD_SCAN_FEATURE);
  return { events: row?.totalEvents ?? 0, members: row?.uniqueMembers ?? 0 };
}

export default async function AdminAnalyticsOverviewPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  await requireAnalyticsAdmin();
  const view = parseDashboardView(searchParams);
  const previousLabel = previousPeriodLabel(view);

  const [current, previous, features, previousFeatures, dropOff] = await Promise.all([
    getOverviewMetricsAction(analyticsOptionsFor(view)),
    getOverviewMetricsAction(previousAnalyticsOptionsFor(view)),
    getFeatureUsageAction(analyticsOptionsFor(view)),
    getFeatureUsageAction(previousAnalyticsOptionsFor(view)),
    getDropOffAction(analyticsOptionsFor(view)),
  ]);

  const chrome = {
    current: '/admin/analytics' as const,
    view,
    title: 'Overview',
    intro:
      'The headline numbers for the window you have selected, each compared with the equally long window before it. Every figure is counted in the database from behavioral events only. Nothing here reads a check-in answer or any other health content.',
  };

  if (!current.ok) {
    return (
      <AnalyticsChrome {...chrome}>
        <ActionError label="The overview" error={current.error} />
      </AnalyticsChrome>
    );
  }

  const metrics = current.data;
  const before = previous.ok ? previous.data : null;
  const scans = foodScans(features.ok ? features.data : null);
  const previousScans = foodScans(previousFeatures.ok ? previousFeatures.data : null);

  const trendFor = (currentValue: number, previousValue: number | null) =>
    previousValue === null ? undefined : computeTrend(currentValue, previousValue, previousLabel);

  const resetRate = rateReadout(
    metrics.dailyReset.completionRate,
    metrics.dailyReset.startedEvents,
    metrics.dailyReset.completedEvents
  );
  const onboardingRate = rateReadout(
    metrics.onboarding.completionRate,
    metrics.onboarding.startedMembers,
    metrics.onboarding.completedMembers,
    'members started'
  );
  const signupGap = cohortGapNotice(metrics.newMembers, metrics.profilesCreatedInRange);
  const series = densifyDailySeries(metrics.dailyActiveSeries, view.start, view.end);
  const seriesPeak = series.reduce((max, point) => Math.max(max, point.members), 0);

  return (
    <AnalyticsChrome {...chrome}>
      {metrics.hasData ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <MetricCard
              label="Active members"
              value={formatCount(metrics.activeMembers)}
              emphasis
              trend={trendFor(metrics.activeMembers, before?.activeMembers ?? null)}
              definition="A member counts as active if she did at least one thing in the app on at least one day in this window."
            />
            <MetricCard
              label="Sessions"
              value={formatCount(metrics.sessions)}
              emphasis
              trend={trendFor(metrics.sessions, before?.sessions ?? null)}
              definition={SESSION_DEFINITION}
            />
            <MetricCard
              label="Sign-ins"
              value={formatCount(metrics.signIns)}
              emphasis
              trend={trendFor(metrics.signIns, before?.signIns ?? null)}
              definition="Completed sign-ins only. Reported separately from sessions because members stay signed in for weeks at a time."
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Daily Reset starts"
              value={formatCount(metrics.dailyReset.startedEvents)}
              trend={trendFor(
                metrics.dailyReset.startedEvents,
                before?.dailyReset.startedEvents ?? null
              )}
              footnote={`${countNoun(metrics.dailyReset.startedMembers, 'member')} started at least one.`}
            />
            <MetricCard
              label="Daily Reset completions"
              value={formatCount(metrics.dailyReset.completedEvents)}
              trend={trendFor(
                metrics.dailyReset.completedEvents,
                before?.dailyReset.completedEvents ?? null
              )}
              footnote={`${countNoun(metrics.dailyReset.completedMembers, 'member')} finished at least one.`}
            />
            <MetricCard
              label="Food Lens scans"
              value={features.ok ? formatCount(scans.events) : 'Not available'}
              trend={
                features.ok && previousFeatures.ok
                  ? computeTrend(scans.events, previousScans.events, previousLabel)
                  : undefined
              }
              footnote={
                features.ok
                  ? `${countNoun(scans.members, 'member')} scanned something.`
                  : 'The feature usage report could not be loaded for this window.'
              }
            />
            <MetricCard
              label="Paywall views"
              value={formatCount(metrics.paywallViews.events)}
              trend={trendFor(metrics.paywallViews.events, before?.paywallViews.events ?? null)}
              footnote={`${countNoun(metrics.paywallViews.members, 'member')} saw a premium or locked feature.`}
            />
          </div>

          {!previous.ok ? (
            <p className="mt-3 text-[12.5px] text-[#6B7A72]">
              Trends are not shown: {previousLabel} could not be loaded.
            </p>
          ) : null}

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel
              title="Who is here"
              description="Membership counts for this window. Accounts created and recorded signups are shown side by side, so the gap for accounts that predate signup tracking stays visible."
            >
              <StatLine
                label="Total members"
                value={formatCount(metrics.totalMembers)}
                detail="Every in-scope member on the platform, not only the active ones."
              />
              <StatLine
                label="Recorded signups"
                value={formatCount(metrics.newMembers)}
                detail="Members with a signup event inside this window."
              />
              <StatLine
                label="Accounts created"
                value={formatCount(metrics.profilesCreatedInRange)}
                detail="Profiles whose creation date falls inside this window."
              />
              <StatLine
                label="Returning members"
                value={formatCount(metrics.returningMembers)}
                detail="Active on two or more separate days in this window."
              />
              <StatLine
                label="Weekly active members"
                value={formatCount(metrics.weeklyActiveMembers)}
                detail="Active in the last seven days of this window."
              />
              {signupGap ? (
                <p className="mt-3 text-[12.5px] leading-relaxed text-[#6B7A72]">{signupGap}</p>
              ) : null}
            </Panel>

            <Panel
              title="Rhythm"
              description="How often members come back, and what a day looks like. Averages are left blank rather than shown as zero when there is nothing to divide by."
            >
              <StatLine
                label="Average sessions per active member"
                value={formatAverage(metrics.averageSessionsPerActiveMember, 'sessions') ?? 'Not yet'}
                detail={
                  metrics.averageSessionsPerActiveMember === null
                    ? 'No member was active in this window, so there is nothing to average.'
                    : 'Active days per active member across this window.'
                }
              />
              <StatLine
                label="Average days between visits"
                value={formatAverage(metrics.averageDaysBetweenVisits, 'days') ?? 'Not yet'}
                detail={
                  metrics.averageDaysBetweenVisits === null
                    ? 'A gap needs two visits. No member has visited twice in this window.'
                    : 'Measured across every member who visited more than once.'
                }
              />
              <StatLine
                label="Active on the last day"
                value={formatCount(metrics.dailyActiveLatest)}
                detail={`Members active on ${view.end}.`}
              />
              <StatLine
                label="Average active members per day"
                value={formatAverage(metrics.dailyActiveAverage, 'per day') ?? 'Not yet'}
                detail="Total active member-days divided by the days in this window."
              />

              <div className="mt-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#1B3A2D]/45">
                  Active members by day
                </p>
                {seriesPeak > 0 ? (
                  <>
                    <div
                      className="mt-2 flex h-16 items-end gap-[2px]"
                      role="img"
                      aria-label={`Active members per day from ${view.start} to ${view.end}, peaking at ${seriesPeak}.`}
                    >
                      {series.map((point) => (
                        <div
                          key={point.localDate}
                          title={`${point.localDate}: ${point.members}`}
                          className="flex-1 rounded-t-[2px] bg-[#1B3A2D]/70"
                          style={{
                            height: `${Math.max((point.members / seriesPeak) * 100, point.members > 0 ? 8 : 2)}%`,
                            opacity: point.members > 0 ? 1 : 0.18,
                          }}
                        />
                      ))}
                    </div>
                    <p className="mt-1.5 flex justify-between text-[11px] text-[#1B3A2D]/45">
                      <span>{view.start}</span>
                      <span>peak {seriesPeak}</span>
                      <span>{view.end}</span>
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-[12.5px] leading-relaxed text-[#6B7A72]">
                    No day in this window had an active member. This fills in the first time someone
                    opens the app.
                  </p>
                )}
              </div>
            </Panel>
          </div>

          <div className="mt-4">
            <Panel
              title="Finishing what was started"
              description="Completion rates for the two flows the overview reports. A rate is shown only when something was actually started. Below that, the raw counts stand on their own."
            >
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#1B3A2D]/45">
                    Daily Reset
                  </p>
                  <p className="mt-1.5 font-[family-name:var(--font-cormorant-garamond)] text-[2.2rem] leading-none text-[#1B3A2D]">
                    {resetRate.rateText ?? formatCount(metrics.dailyReset.startedEvents)}
                  </p>
                  <p className="mt-2 text-[12.5px] text-[#6B7A72]">{resetRate.basis}.</p>
                  {resetRate.tooFewToRate ? (
                    <p className="mt-2">
                      <ThinDataNote>{TOO_FEW_TO_RATE_LABEL}</ThinDataNote>
                    </p>
                  ) : null}
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#1B3A2D]/45">
                    Onboarding
                  </p>
                  <p className="mt-1.5 font-[family-name:var(--font-cormorant-garamond)] text-[2.2rem] leading-none text-[#1B3A2D]">
                    {onboardingRate.rateText ?? formatCount(metrics.onboarding.startedMembers)}
                  </p>
                  <p className="mt-2 text-[12.5px] text-[#6B7A72]">{onboardingRate.basis}.</p>
                  {onboardingRate.tooFewToRate ? (
                    <p className="mt-2">
                      <ThinDataNote>{TOO_FEW_TO_RATE_LABEL}</ThinDataNote>
                    </p>
                  ) : null}
                </div>
              </div>
            </Panel>
          </div>
        </>
      ) : (
        <EmptyState title={EMPTY_STATE_COPY.overview.title} body={EMPTY_STATE_COPY.overview.body} />
      )}

      <div className="mt-4">
        <Panel
          title="What cannot be measured yet"
          description="These are not zeros and not failures. Each one is something the instrumentation genuinely does not record, reported with the reason rather than guessed at."
        >
          <div className="space-y-4">
            <Unmeasurable label="Purchases and revenue" reason={metrics.purchases.reason} />
            {dropOff.ok ? (
              <>
                {dropOff.data.flows
                  .filter((flow) => !flow.measurable && flow.unmeasurableReason)
                  .map((flow) => (
                    <Unmeasurable
                      key={flow.flowKey}
                      label={`${flow.label} start and completion`}
                      reason={flow.unmeasurableReason as string}
                    />
                  ))}
                <Unmeasurable
                  label="Drop-off inside a flow, per question"
                  reason={dropOff.data.perQuestionDropOff.reason}
                />
              </>
            ) : (
              <p className="text-[12.5px] text-[#6B7A72]">
                The rest of this list could not be loaded: {dropOff.error}
              </p>
            )}
          </div>
        </Panel>
      </div>
    </AnalyticsChrome>
  );
}
