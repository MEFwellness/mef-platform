/**
 * Admin Analytics: one member's engagement detail.
 *
 * Four things, in the order a coach would read them:
 *
 *   1. Her engagement state, with the plain-language reason the service
 *      layer gave and the basis it was decided on.
 *   2. Her friction signals, each as a card: what was observed, since when,
 *      the evidence counts, and how much behavior stood behind it.
 *   3. Her activity timeline: which days, which features, started versus
 *      completed.
 *   4. A before and after comparison around a date of the administrator's
 *      choosing, so a future coaching intervention's effect on behavior is
 *      visible.
 *
 * WHAT CANNOT APPEAR HERE, AND WHY IT IS NOT A MATTER OF CARE. There is no
 * health content on this page because there is none in the data it reads.
 * Every one of the three reports below comes through the same service layer,
 * which reads only product_analytics_events, a view that excludes the five
 * health-content wellness event types by construction (migration 146). No
 * check-in answer, pain location, sleep number, questionnaire response or
 * food detail can reach this file, and no other data source is opened here.
 *
 * WHAT THE SIGNALS MAY NEVER SAY. What was observed, never why it happened.
 * Every sentence on a signal card is the service layer's own, rendered
 * verbatim, and there is no recommendation, no interpretation and no
 * generated text anywhere on the page. The observation is the cue.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import type { Route } from 'next';
import { requireAnalyticsAdmin } from '../../guard';
import {
  getMemberActivityTimelineAction,
  getMemberFrictionSignalsAction,
  getMemberWindowComparisonAction,
} from '@/app/actions/analyticsAdmin';
import { analyticsOptionsFor, parseDashboardView } from '@/lib/analytics-dashboard/viewState';
import type { SearchParams } from '@/lib/analytics-dashboard/viewState';
import { formatCount } from '@/lib/analytics-dashboard/presentation';
import {
  COMPARISON_WINDOW_CHOICES,
  ENGAGEMENT_BASIS_MEANING,
  MEMBER_EMPTY_COPY,
  SUFFICIENCY_NOTE,
  afterWindowNotice,
  beforeAfterRows,
  daysAwayLabel,
  historyLabel,
  memberName,
  membersTableHref,
  orderSignals,
  parseComparisonControls,
  parseMemberStateFilter,
  rhythmLabel,
} from '@/lib/analytics-dashboard/memberView';
import { AnalyticsChrome } from '@/components/admin/analytics/AnalyticsChrome';
import type { AnalyticsSectionHref } from '@/components/admin/analytics/AnalyticsChrome';
import type { MemberWindowComparison } from '@/lib/analytics-service';
import {
  ActionError,
  EmptyState,
  Panel,
  StatLine,
  ThinDataNote,
} from '@/components/admin/analytics/primitives';
import {
  BasisChip,
  SignalCard,
  StateChip,
  TimelineDay,
} from '@/components/admin/analytics/memberPrimitives';

export const metadata: Metadata = { title: 'Analytics member detail' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminAnalyticsMemberDetailPage({
  params,
  searchParams,
}: {
  params: { memberId: string };
  searchParams?: SearchParams;
}) {
  await requireAnalyticsAdmin();

  const view = parseDashboardView(searchParams);
  const filter = parseMemberStateFilter(searchParams?.state);
  const options = analyticsOptionsFor(view);
  const memberId = params.memberId;
  const comparison = parseComparisonControls(searchParams, view);

  const backHref = membersTableHref(view, filter) as Route;
  const chrome = {
    current: `/admin/analytics/members/${memberId}` as AnalyticsSectionHref,
    view,
    title: 'Member detail',
    intro:
      'Behavioral engagement for one member: her state, the signals raised about how she is using the app, what she did on which days, and a before and after comparison around a date you choose. Nothing on this page is health information.',
  };

  // An id that is not a uuid cannot be a member. Said plainly, rather than
  // sent to the database to fail with a type error the screen would then
  // have to present as a query failure.
  if (!UUID.test(memberId)) {
    return (
      <AnalyticsChrome {...chrome}>
        <BackLink href={backHref} />
        <EmptyState
          title={MEMBER_EMPTY_COPY.notInScope.title}
          body={MEMBER_EMPTY_COPY.notInScope.body}
        />
      </AnalyticsChrome>
    );
  }

  const [frictionResult, timelineResult, comparisonResult] = await Promise.all([
    getMemberFrictionSignalsAction(memberId, options),
    getMemberActivityTimelineAction(memberId, options),
    getMemberWindowComparisonAction(memberId, comparison.referenceDate, {
      windowDays: comparison.windowDays,
      includeTestAccounts: view.includeTestAccounts,
    }),
  ]);

  if (!frictionResult.ok) {
    return (
      <AnalyticsChrome {...chrome}>
        <BackLink href={backHref} />
        <ActionError label="This member's engagement" error={frictionResult.error} />
      </AnalyticsChrome>
    );
  }

  const report = frictionResult.data;
  const engagement = report.engagement;
  const facts = engagement.facts;
  const inScope = timelineResult.ok ? timelineResult.data.inScope : true;
  const signals = orderSignals(report.signals);
  const name = memberName({ displayName: report.displayName, memberId });

  return (
    <AnalyticsChrome {...chrome}>
      <BackLink href={backHref} />

      {!inScope ? (
        <EmptyState
          title={MEMBER_EMPTY_COPY.notInScope.title}
          body={MEMBER_EMPTY_COPY.notInScope.body}
        />
      ) : null}

      <div className="space-y-6">
        {/* 1. The state, and how it was decided. */}
        <Panel
          title={name}
          description="Behavioral engagement only. This is not a health score, not a wellness score, and not a judgment about this member."
        >
          <div className="flex flex-wrap items-center gap-2.5">
            <StateChip state={engagement.state} />
            <BasisChip basis={engagement.basis} />
            {facts.isTestAccount ? <ThinDataNote>Test account</ThinDataNote> : null}
          </div>

          <p className="mt-3 text-[14.5px] leading-relaxed text-[#1B3A2D]">{engagement.reason}</p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-[#6B7A72]">
            How this was decided: {ENGAGEMENT_BASIS_MEANING[engagement.basis]}
          </p>

          <div className="mt-4 grid grid-cols-1 gap-x-8 sm:grid-cols-2">
            <div>
              <StatLine
                label="Last active"
                value={daysAwayLabel(facts)}
                detail={facts.lastActivityDate ?? 'No activity has ever been recorded'}
              />
              <StatLine
                label="Usual rhythm"
                value={rhythmLabel(facts)}
                detail="Her own typical gap between visits, where there have been enough visits to have one"
              />
              <StatLine
                label="Account created"
                value={`${formatCount(facts.daysSinceAccountCreated)} days ago`}
                detail={facts.accountCreatedDate}
              />
            </div>
            <div>
              <StatLine
                label="History"
                value={
                  facts.historyDays === null
                    ? 'None yet'
                    : `${formatCount(facts.historyDays)} days`
                }
                detail={historyLabel(facts)}
              />
              <StatLine
                label="Recent window"
                value={`${formatCount(facts.recentActiveDays)} of ${formatCount(facts.recentWindowDays)} days`}
                detail={`Days she opened the app in the ${facts.recentWindowDays} days ending ${facts.referenceDate}`}
              />
              <StatLine
                label="Baseline window"
                value={`${formatCount(facts.baselineActiveDays)} of ${formatCount(facts.baselineWindowDays)} days`}
                detail={`The ${facts.baselineWindowDays} days immediately before the recent window`}
              />
            </div>
          </div>
        </Panel>

        {/* 2 and 3. The signals, as coaching cues. */}
        <Panel
          title="Friction signals"
          description="What was observed, since when, and the counts behind it. Never why it happened: why is not in this data. Nothing here is a recommendation."
        >
          {signals.length === 0 ? (
            <EmptyState
              title={MEMBER_EMPTY_COPY.noSignals.title}
              body={MEMBER_EMPTY_COPY.noSignals.body}
            />
          ) : (
            <div className="space-y-3">
              {signals.map((signal) => (
                <SignalCard key={signal.type + signal.reason} signal={signal} range={report.range} />
              ))}
            </div>
          )}
          <p className="mt-4 text-[12px] leading-relaxed text-[#6B7A72]">{SUFFICIENCY_NOTE}</p>
        </Panel>

        {/* 4. The activity timeline. */}
        <Panel
          title="Activity timeline"
          description={`Which days she opened the app in this window, which features she used, and what she started and finished. ${view.start} to ${view.end}.`}
        >
          {!timelineResult.ok ? (
            <ActionError label="The activity timeline" error={timelineResult.error} />
          ) : timelineResult.data.days.length === 0 ? (
            <EmptyState
              title={MEMBER_EMPTY_COPY.noTimeline.title}
              body={MEMBER_EMPTY_COPY.noTimeline.body}
            />
          ) : (
            <>
              <p className="text-[13px] text-[#6B7A72]">
                {formatCount(timelineResult.data.activeDays)}{' '}
                {timelineResult.data.activeDays === 1 ? 'day' : 'days'} with activity,{' '}
                {formatCount(timelineResult.data.totalEvents)} recorded{' '}
                {timelineResult.data.totalEvents === 1 ? 'action' : 'actions'} in total. Quiet days
                are left out rather than drawn as rows of zeros.
              </p>
              {timelineResult.data.truncated ? (
                <p className="mt-2 rounded-2xl border border-[#C4A050]/45 bg-[#C4A050]/12 px-4 py-2.5 text-[12.5px] leading-relaxed text-[#1B3A2D]">
                  Only the most recent {formatCount(timelineResult.data.rowCap)} actions in this
                  range are shown. Days on and before {timelineResult.data.truncatedBefore} are not
                  included. Narrow the date range above to see them.
                </p>
              ) : null}
              <ol className="mt-4 space-y-2">
                {timelineResult.data.days.map((day) => (
                  <TimelineDay key={day.localDate} day={day} />
                ))}
              </ol>
            </>
          )}
        </Panel>

        {/* 5. Before and after. */}
        <Panel
          title="Before and after"
          description="Pick a date. Her behavior in the window before it sits next to her behavior in the window after it. The date itself belongs to neither window: it is the pivot, the day the thing being observed happened."
        >
          <form
            action={`/admin/analytics/members/${memberId}`}
            method="get"
            className="flex flex-wrap items-center gap-2"
          >
            <input type="hidden" name="range" value={view.rangeKey} />
            {view.rangeKey === 'custom' ? (
              <>
                <input type="hidden" name="from" value={view.start} />
                <input type="hidden" name="to" value={view.end} />
              </>
            ) : null}
            {view.includeTestAccounts ? <input type="hidden" name="test" value="on" /> : null}
            {filter !== 'all' ? <input type="hidden" name="state" value={filter} /> : null}

            <label className="text-[12px] text-[#1B3A2D]/55" htmlFor="comparison-ref">
              Reference date
            </label>
            <input
              id="comparison-ref"
              type="date"
              name="ref"
              max={view.end}
              defaultValue={comparison.referenceDate}
              className="mef-focus-ring rounded-xl border border-[#1B3A2D]/15 bg-white px-2.5 py-1.5 text-[12.5px] text-[#1B3A2D]"
            />
            <label className="text-[12px] text-[#1B3A2D]/55" htmlFor="comparison-window">
              Window
            </label>
            <select
              id="comparison-window"
              name="window"
              defaultValue={String(comparison.windowDays)}
              className="mef-focus-ring rounded-xl border border-[#1B3A2D]/15 bg-white px-2.5 py-1.5 text-[12.5px] text-[#1B3A2D]"
            >
              {COMPARISON_WINDOW_CHOICES.map((days) => (
                <option key={days} value={days}>
                  {days} days
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="mef-focus-ring rounded-full border border-[#1B3A2D]/20 px-3.5 py-1.5 text-[12.5px] text-[#1B3A2D] transition-colors hover:bg-[#1B3A2D] hover:text-[#F5F0E4]"
            >
              Compare
            </button>
          </form>

          {comparison.notice ? (
            <p className="mt-3 rounded-2xl border border-[#C4A050]/35 bg-[#C4A050]/10 px-4 py-2.5 text-[13px] text-[#1B3A2D]">
              {comparison.notice}
            </p>
          ) : null}

          <div className="mt-4">
            {!comparisonResult.ok ? (
              <ActionError label="The before and after comparison" error={comparisonResult.error} />
            ) : !comparisonResult.data.inScope ? (
              <EmptyState
                title={MEMBER_EMPTY_COPY.comparisonNotInScope.title}
                body={MEMBER_EMPTY_COPY.comparisonNotInScope.body}
              />
            ) : (
              <BeforeAfter comparison={comparisonResult.data} />
            )}
          </div>
        </Panel>
      </div>
    </AnalyticsChrome>
  );
}

function BackLink({ href }: { href: Route }) {
  return (
    <Link
      href={href}
      className="mef-focus-ring mb-5 inline-flex items-center gap-1.5 text-[13px] text-[#1B3A2D]/65 transition-colors hover:text-[#1B3A2D]"
    >
      <span aria-hidden="true">←</span> Back to member engagement
    </Link>
  );
}

function BeforeAfter({ comparison }: { comparison: MemberWindowComparison }) {
  const rows = beforeAfterRows(comparison);
  const notice = afterWindowNotice(comparison);

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-[#1B3A2D]/[0.035] px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#1B3A2D]/45">
            Before
          </p>
          <p className="mt-1 text-[12.5px] tabular-nums text-[#1B3A2D]">
            {comparison.before.window.start} to {comparison.before.window.end}
          </p>
          <p className="mt-0.5 text-[12px] text-[#6B7A72]">
            {comparison.before.window.days} days
          </p>
        </div>
        <div className="rounded-2xl bg-[#1B3A2D]/[0.035] px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#1B3A2D]/45">
            After
          </p>
          <p className="mt-1 text-[12.5px] tabular-nums text-[#1B3A2D]">
            {comparison.after.window.start} to {comparison.after.window.end}
          </p>
          <p className="mt-0.5 text-[12px] text-[#6B7A72]">
            {comparison.after.window.days} days,{' '}
            {comparison.daysOfAfterWindowElapsed} elapsed
          </p>
        </div>
      </div>

      {notice ? (
        <p
          data-after-window-incomplete="true"
          className="mt-3 rounded-2xl border border-[#C4A050]/45 bg-[#C4A050]/12 px-4 py-2.5 text-[12.5px] leading-relaxed text-[#1B3A2D]"
        >
          {notice}
        </p>
      ) : null}

      <ul className="mt-4">
        {rows.map((row) => (
          <li
            key={row.metric}
            data-comparison-metric={row.metric}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-[#1B3A2D]/6 py-2.5 last:border-b-0"
          >
            <p className="text-[13.5px] text-[#1B3A2D]">{row.label}</p>
            <p className="flex items-baseline gap-4 text-[12.5px] tabular-nums text-[#6B7A72]">
              <span>{row.before}</span>
              <span aria-hidden="true" className="text-[#1B3A2D]/25">
                to
              </span>
              <span className="text-[#1B3A2D]">{row.after}</span>
              {row.change ? (
                <span className="rounded-full bg-[#1B3A2D]/[0.05] px-2 py-[2px] text-[11.5px] text-[#1B3A2D]/70">
                  {row.change}
                </span>
              ) : null}
            </p>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[12px] leading-relaxed text-[#6B7A72]">
        The reference date {comparison.referenceDate} is in neither window. A rate with nothing to
        divide by reads as not measured rather than as zero, and going from nothing to something is
        said in those words rather than as a percentage.
      </p>
    </>
  );
}
