/**
 * Admin Analytics, view 3: feature usage.
 *
 * Every feature in the registry, ranked most to least used, from
 * analytics_feature_usage. Both counts are shown for each one: how many
 * members used it, and how many times it was used. They answer different
 * questions and neither substitutes for the other. One member scanning
 * thirty meals and thirty members scanning one each are the same total and
 * completely different facts.
 *
 * A feature nobody touched stays in the list, at the bottom, labelled
 * unused. Hiding it would turn "nobody has opened Movement" into something
 * invisible, which is the single most useful thing this screen can say.
 */

import type { Metadata } from 'next';
import { requireAnalyticsAdmin } from '../guard';
import { getFeatureUsageAction } from '@/app/actions/analyticsAdmin';
import { analyticsOptionsFor, parseDashboardView } from '@/lib/analytics-dashboard/viewState';
import type { SearchParams } from '@/lib/analytics-dashboard/viewState';
import {
  EMPTY_STATE_COPY,
  formatAverage,
  formatCount,
  formatRate,
  isUnusedFeature,
} from '@/lib/analytics-dashboard/presentation';
import { AnalyticsChrome } from '@/components/admin/analytics/AnalyticsChrome';
import {
  ActionError,
  EmptyState,
  Panel,
  ProportionBar,
  ThinDataNote,
} from '@/components/admin/analytics/primitives';
import type { FeatureUsage } from '@/lib/analytics-service';

export const metadata: Metadata = { title: 'Analytics feature usage' };

function FeatureRow({
  feature,
  rank,
  peakEvents,
  activeMembers,
}: {
  feature: FeatureUsage;
  rank: number | null;
  peakEvents: number;
  activeMembers: number;
}) {
  const unused = isUnusedFeature(feature);
  const share = formatRate(feature.percentOfActiveMembers);
  // The started/completed counts behind this rate live on the drop-off view,
  // not in this report's shape, so this shows the rate the service layer
  // computed or says plainly that there was nothing to compute it from.
  const completionRate =
    feature.completionMeasurable === true ? formatRate(feature.completionRate) : null;

  return (
    <li
      data-feature={feature.featureKey}
      data-unused={unused ? 'true' : 'false'}
      className={`rounded-2xl px-4 py-3.5 ${unused ? 'bg-[#1B3A2D]/[0.02]' : 'bg-[#1B3A2D]/[0.035]'}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="flex items-baseline gap-2.5">
          <span className="w-5 shrink-0 text-[12px] tabular-nums text-[#1B3A2D]/35">
            {rank === null ? '' : rank}
          </span>
          <span className="text-[14.5px] text-[#1B3A2D]">{feature.label}</span>
          {unused ? <ThinDataNote>Unused in this window</ThinDataNote> : null}
        </p>
        <p className="flex items-baseline gap-4 pl-7 sm:pl-0">
          <span className="text-[12.5px] text-[#6B7A72]">
            <span className="font-[family-name:var(--font-cormorant-garamond)] text-[1.35rem] leading-none text-[#1B3A2D]">
              {formatCount(feature.uniqueMembers)}
            </span>{' '}
            {feature.uniqueMembers === 1 ? 'member' : 'members'}
          </span>
          <span className="text-[12.5px] text-[#6B7A72]">
            <span className="font-[family-name:var(--font-cormorant-garamond)] text-[1.35rem] leading-none text-[#1B3A2D]">
              {formatCount(feature.totalEvents)}
            </span>{' '}
            {feature.totalEvents === 1 ? 'event' : 'events'}
          </span>
        </p>
      </div>

      <div className="mt-2.5 pl-7">
        <ProportionBar
          value={feature.totalEvents}
          total={peakEvents}
          tone={unused ? 'muted' : 'forest'}
        />
        <p className="mt-1.5 text-[12px] leading-relaxed text-[#6B7A72]">
          {unused
            ? 'No member opened or used this in the selected window.'
            : [
                share && activeMembers > 0 ? `${share} of active members` : null,
                feature.multiDayMembers > 0
                  ? `${formatCount(feature.multiDayMembers)} ${
                      feature.multiDayMembers === 1 ? 'member' : 'members'
                    } used it on more than one day`
                  : null,
                feature.repeatMembers > 0
                  ? `${formatCount(feature.repeatMembers)} ${
                      feature.repeatMembers === 1 ? 'member' : 'members'
                    } used it more than once`
                  : null,
                feature.averageEventsPerMember !== null
                  ? `${formatAverage(feature.averageEventsPerMember, 'events')} per member on average`
                  : null,
              ]
                .filter(Boolean)
                .join('. ') + '.'}
        </p>
        {feature.completionMeasurable === true ? (
          <p className="mt-1.5 text-[12px] text-[#6B7A72]">
            {completionRate
              ? `${feature.completionBasis} completion: ${completionRate}.`
              : `${feature.completionBasis}: nothing was started in this window, so there is no completion rate.`}
          </p>
        ) : null}
        {feature.completionMeasurable === false && feature.completionUnmeasurableReason ? (
          <p className="mt-1.5 border-t border-[#C4A050]/35 pt-1.5 text-[12px] leading-relaxed text-[#6B7A72]">
            Completion cannot be measured: {feature.completionUnmeasurableReason}
          </p>
        ) : null}
      </div>
    </li>
  );
}

export default async function AdminAnalyticsFeaturesPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  await requireAnalyticsAdmin();
  const view = parseDashboardView(searchParams);
  const result = await getFeatureUsageAction(analyticsOptionsFor(view));

  const chrome = {
    current: '/admin/analytics/features' as const,
    view,
    title: 'Feature usage',
    intro:
      'Every feature the instrumentation knows about, ranked by how many members used it. Member counts and event counts are both shown because they answer different questions. Features nobody touched are at the bottom, listed rather than hidden.',
  };

  if (!result.ok) {
    return (
      <AnalyticsChrome {...chrome}>
        <ActionError label="Feature usage" error={result.error} />
      </AnalyticsChrome>
    );
  }

  const report = result.data;
  const used = report.features.filter((feature) => !isUnusedFeature(feature));
  const unused = report.features.filter(isUnusedFeature);
  const peakEvents = used.reduce((max, feature) => Math.max(max, feature.totalEvents), 0);

  return (
    <AnalyticsChrome {...chrome}>
      {used.length === 0 ? (
        <div className="mb-4">
          <EmptyState
            title={EMPTY_STATE_COPY.featureUsage.title}
            body={EMPTY_STATE_COPY.featureUsage.body}
          />
        </div>
      ) : null}

      <Panel
        title="Ranked by members"
        description={`${formatCount(report.activeMembers)} ${report.activeMembers === 1 ? 'member was' : 'members were'} active in this window. Share of active members is measured against that number.`}
      >
        {used.length > 0 ? (
          <ol className="space-y-2">
            {used.map((feature, index) => (
              <FeatureRow
                key={feature.featureKey}
                feature={feature}
                rank={index + 1}
                peakEvents={peakEvents}
                activeMembers={report.activeMembers}
              />
            ))}
          </ol>
        ) : (
          <p className="text-[13px] text-[#6B7A72]">
            Nothing has been used in this window, so there is nothing to rank. Every feature is
            listed below with its real zero.
          </p>
        )}

        {unused.length > 0 ? (
          <div className="mt-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#1B3A2D]/45">
              Unused in this window ({unused.length})
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-[#6B7A72]">
              These are listed rather than hidden. A feature nobody opened is a real finding, and it
              disappears if the list only shows what was used.
            </p>
            <ol className="mt-3 space-y-2">
              {unused.map((feature) => (
                <FeatureRow
                  key={feature.featureKey}
                  feature={feature}
                  rank={null}
                  peakEvents={peakEvents}
                  activeMembers={report.activeMembers}
                />
              ))}
            </ol>
          </div>
        ) : null}
      </Panel>
    </AnalyticsChrome>
  );
}
