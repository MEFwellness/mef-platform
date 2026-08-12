/**
 * Admin Analytics, view 2: the member funnel.
 *
 * Signup, through onboarding, through a first Daily Reset, through coming
 * back another day, exactly as analytics_funnel builds it. The stage list,
 * its order, and every percentage come from the service layer. This page
 * draws them and nothing else.
 *
 * TWO THINGS THIS SCREEN REFUSES TO HIDE.
 *
 * Accounts created and cohort size always appear together. The cohort is
 * everyone with a recorded signup event inside the window, and signup
 * events only exist from the day product analytics shipped. An account
 * created before that has no signup event and cannot be followed through a
 * funnel. Showing only the cohort would make that instrumentation gap look
 * like nobody signed up.
 *
 * An unmeasurable stage stays in the list, in its real position, with its
 * reason. It is not dropped and not drawn as a zero, because a stage nobody
 * can observe and a stage nobody reached are different facts.
 */

import type { Metadata } from 'next';
import { requireAnalyticsAdmin } from '../guard';
import { getFunnelAction } from '@/app/actions/analyticsAdmin';
import {
  analyticsOptionsFor,
  parseDashboardView,
} from '@/lib/analytics-dashboard/viewState';
import type { SearchParams } from '@/lib/analytics-dashboard/viewState';
import {
  cohortGapNotice,
  formatCount,
  formatRate,
  funnelEmptyState,
  funnelStageComparison,
} from '@/lib/analytics-dashboard/presentation';
import { AnalyticsChrome } from '@/components/admin/analytics/AnalyticsChrome';
import {
  ActionError,
  EmptyState,
  MetricCard,
  Panel,
  ProportionBar,
} from '@/components/admin/analytics/primitives';

export const metadata: Metadata = { title: 'Analytics member funnel' };

export default async function AdminAnalyticsFunnelPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  await requireAnalyticsAdmin();
  const view = parseDashboardView(searchParams);
  const result = await getFunnelAction(analyticsOptionsFor(view));

  const chrome = {
    current: '/admin/analytics/funnel' as const,
    view,
    title: 'Member funnel',
    intro:
      'Everyone whose signup was recorded inside this window, and how far each of them has since got. A later stage asks whether a member has ever reached it, not whether she did so inside the window, because someone who signed up on the last day has not had time to do anything else yet.',
  };

  if (!result.ok) {
    return (
      <AnalyticsChrome {...chrome}>
        <ActionError label="The funnel" error={result.error} />
      </AnalyticsChrome>
    );
  }

  const funnel = result.data;
  const gapNotice = cohortGapNotice(funnel.cohortSize, funnel.profilesCreatedInRange);
  const firstStage = funnel.stages.find((stage) => stage.measurable && stage.members !== null);
  const widest = Math.max(funnel.cohortSize, firstStage?.members ?? 0, 1);

  return (
    <AnalyticsChrome {...chrome}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <MetricCard
          label="Accounts created"
          value={formatCount(funnel.profilesCreatedInRange)}
          emphasis
          definition="Profiles whose creation date falls inside this window, whether or not a signup event was recorded for them."
        />
        <MetricCard
          label="Cohort size"
          value={formatCount(funnel.cohortSize)}
          emphasis
          definition={funnel.cohortBasis}
        />
      </div>

      {gapNotice ? (
        <p className="mt-4 rounded-2xl border border-[#1B3A2D]/12 bg-white/70 px-4 py-3 text-[13px] leading-relaxed text-[#1B3A2D]">
          {gapNotice}
        </p>
      ) : null}

      <div className="mt-6">
        {funnel.cohortSize === 0 ? (
          <EmptyState {...funnelEmptyState(funnel.profilesCreatedInRange)} />
        ) : (
          <Panel
            title="Stage by stage"
            description="Each bar is drawn to scale against the cohort. A percentage of the previous stage skips over any stage that cannot be measured rather than dividing by nothing."
          >
            <ol className="space-y-4">
              {funnel.stages.map((stage) => {
                if (!stage.measurable || stage.members === null) {
                  return (
                    <li
                      key={stage.key}
                      data-stage={stage.key}
                      data-measurable="false"
                      className="rounded-2xl border border-[#C4A050]/35 bg-[#C4A050]/[0.07] px-4 py-3"
                    >
                      <p className="text-[13.5px] font-medium text-[#1B3A2D]">
                        {stage.label}: cannot be measured yet
                      </p>
                      <p className="mt-1 text-[12.5px] leading-relaxed text-[#6B7A72]">
                        {stage.unmeasurableReason ??
                          'The service layer reports this stage as unmeasurable.'}
                      </p>
                    </li>
                  );
                }

                const percentOfCohort = formatRate(stage.percentOfCohort);

                return (
                  <li key={stage.key} data-stage={stage.key} data-measurable="true">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <p className="text-[14px] text-[#1B3A2D]">{stage.label}</p>
                      <p className="flex items-baseline gap-2">
                        <span className="font-[family-name:var(--font-cormorant-garamond)] text-[1.5rem] leading-none text-[#1B3A2D]">
                          {formatCount(stage.members)}
                        </span>
                        {percentOfCohort ? (
                          <span className="text-[12px] text-[#1B3A2D]/55">
                            {percentOfCohort} of cohort
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <div className="mt-2">
                      <ProportionBar value={stage.members} total={widest} />
                    </div>
                    <p className="mt-1.5 text-[12px] text-[#6B7A72]">
                      {funnelStageComparison(stage, stage.key === firstStage?.key)}
                    </p>
                  </li>
                );
              })}
            </ol>
          </Panel>
        )}
      </div>
    </AnalyticsChrome>
  );
}
