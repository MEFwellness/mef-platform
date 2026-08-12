/**
 * Admin Analytics, view 4: drop-off.
 *
 * Started versus completed for every flow analytics_drop_off measures: the
 * Daily Reset, onboarding, a Today's Focus item, Reset Plan setup and the
 * Priority Card. Worst drop-off first, in the order the service layer
 * returns them.
 *
 * THE RATE RULE. A completion rate appears only when the service layer
 * returned one, which it does only when something was actually started. It
 * defines that minimum, not this page: a stricter threshold invented in the
 * UI would put the label and the number out of step with every other
 * consumer of the same function. Below the minimum, the raw counts are
 * shown with "too few to rate" and no percentage at all.
 *
 * The two things that cannot be measured, an experience's start and
 * completion and per-question drop-off inside a flow, are rendered with the
 * service layer's own reason. Neither is ever drawn as a zero, and a
 * structural absence of instrumentation must never be readable as a 100
 * percent drop-off.
 */

import type { Metadata } from 'next';
import { requireAnalyticsAdmin } from '../guard';
import { getDropOffAction } from '@/app/actions/analyticsAdmin';
import { analyticsOptionsFor, parseDashboardView } from '@/lib/analytics-dashboard/viewState';
import type { SearchParams } from '@/lib/analytics-dashboard/viewState';
import {
  EMPTY_STATE_COPY,
  TOO_FEW_TO_RATE_LABEL,
  formatCount,
  formatRate,
  rateReadout,
} from '@/lib/analytics-dashboard/presentation';
import { AnalyticsChrome } from '@/components/admin/analytics/AnalyticsChrome';
import {
  ActionError,
  EmptyState,
  Panel,
  ProportionBar,
  ThinDataNote,
  Unmeasurable,
} from '@/components/admin/analytics/primitives';

export const metadata: Metadata = { title: 'Analytics drop-off' };

export default async function AdminAnalyticsDropOffPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  await requireAnalyticsAdmin();
  const view = parseDashboardView(searchParams);
  const result = await getDropOffAction(analyticsOptionsFor(view));

  const chrome = {
    current: '/admin/analytics/drop-off' as const,
    view,
    title: 'Drop-off',
    intro:
      'How many times each flow was started and how many times it was finished, worst drop-off first. A completion rate is shown only when something was started. Where it was not, the raw counts stand alone rather than becoming a zero percent that never happened.',
  };

  if (!result.ok) {
    return (
      <AnalyticsChrome {...chrome}>
        <ActionError label="Drop-off" error={result.error} />
      </AnalyticsChrome>
    );
  }

  const report = result.data;
  const measurable = report.flows.filter((flow) => flow.measurable);
  const unmeasurable = report.flows.filter((flow) => !flow.measurable);
  const anythingStarted = measurable.some((flow) => (flow.startedEvents ?? 0) > 0);

  return (
    <AnalyticsChrome {...chrome}>
      {!anythingStarted ? (
        <div className="mb-4">
          <EmptyState
            title={EMPTY_STATE_COPY.dropOff.title}
            body={EMPTY_STATE_COPY.dropOff.body}
          />
        </div>
      ) : null}

      <Panel
        title="Started and completed"
        description="Event counts, not member counts, so a member who started the Daily Reset three times and finished it once shows as three starts and one completion. Member counts are given underneath each flow."
      >
        <ol className="space-y-3">
          {measurable.map((flow) => {
            const readout = rateReadout(
              flow.completionRate,
              flow.startedEvents,
              flow.completedEvents
            );
            const dropOff = formatRate(flow.dropOffRate);
            const memberRate = formatRate(flow.memberCompletionRate);

            return (
              <li
                key={flow.flowKey}
                data-flow={flow.flowKey}
                data-too-few={readout.tooFewToRate ? 'true' : 'false'}
                className="rounded-2xl bg-[#1B3A2D]/[0.035] px-4 py-3.5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="flex flex-wrap items-baseline gap-2.5">
                    <span className="text-[14.5px] text-[#1B3A2D]">{flow.label}</span>
                    {readout.tooFewToRate ? <ThinDataNote>{TOO_FEW_TO_RATE_LABEL}</ThinDataNote> : null}
                  </p>
                  <p className="flex items-baseline gap-2">
                    <span className="font-[family-name:var(--font-cormorant-garamond)] text-[1.6rem] leading-none text-[#1B3A2D]">
                      {readout.rateText ?? `${formatCount(flow.startedEvents)}`}
                    </span>
                    <span className="text-[12px] text-[#1B3A2D]/55">
                      {readout.rateText ? 'completed' : 'started'}
                    </span>
                  </p>
                </div>

                <div className="mt-2.5">
                  <ProportionBar
                    value={flow.completedEvents ?? 0}
                    total={Math.max(flow.startedEvents ?? 0, 1)}
                  />
                </div>

                <p className="mt-1.5 text-[12px] leading-relaxed text-[#6B7A72]">
                  {readout.basis}
                  {readout.tooFewToRate ? '' : `, ${dropOff ?? '0%'} did not finish`}.{' '}
                  {(flow.startedMembers ?? 0) === 0
                    ? 'No member started this in the selected window.'
                    : `${formatCount(flow.completedMembers)} of ${formatCount(flow.startedMembers)} ${
                        flow.startedMembers === 1 ? 'member' : 'members'
                      } who started finished at least once${memberRate ? ` (${memberRate})` : ''}.`}
                </p>
              </li>
            );
          })}
        </ol>
      </Panel>

      <div className="mt-4">
        <Panel
          title="What cannot be measured"
          description="Not zeros, and not failures. These are places where no event is written at all, so no rate exists to report."
        >
          <div className="space-y-4">
            {unmeasurable.map((flow) => (
              <Unmeasurable
                key={flow.flowKey}
                label={`${flow.label} start and completion`}
                reason={
                  flow.unmeasurableReason ??
                  'The service layer reports this flow as unmeasurable and gave no further reason.'
                }
              />
            ))}
            <Unmeasurable
              label="Drop-off inside a flow, per question"
              reason={report.perQuestionDropOff.reason}
            />
          </div>
        </Panel>
      </div>
    </AnalyticsChrome>
  );
}
