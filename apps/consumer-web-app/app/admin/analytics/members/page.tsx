/**
 * Admin Analytics, view 5: member engagement.
 *
 * Every in-scope member, with the engagement state the service layer
 * decided, how it decided it, how long she has been away, her own usual
 * rhythm where one is known, and how many friction signals are currently
 * raised. Most in need of attention first: Inactive, then Watch, then
 * Active, and inside each of those the longest away first.
 *
 * NOTHING ON THIS SCREEN IS A HEALTH JUDGMENT. These are behavioral
 * engagement states, built from nothing but when a member opened the app. A
 * member can be doing beautifully and be Inactive here. The screen says so
 * in its own words rather than relying on an administrator to remember it.
 *
 * WHERE EACH COLUMN COMES FROM. The states are
 * getEngagementStatesAction, which is analytics_member_engagement_facts
 * with the documented rules applied. The signal counts are
 * findMembersForCoachFollowUpAction, the existing entry point that runs the
 * per-member friction queries only for members already in a Watch or
 * Inactive state, because running five queries per member across the whole
 * platform would cost a great deal for no gain. A member outside that
 * shortlist shows "Not counted", never a zero: an uncounted member and a
 * member with nothing raised are different facts.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import type { Route } from 'next';
import { requireAnalyticsAdmin } from '../guard';
import {
  findMembersForCoachFollowUpAction,
  getEngagementStatesAction,
} from '@/app/actions/analyticsAdmin';
import { analyticsOptionsFor, parseDashboardView } from '@/lib/analytics-dashboard/viewState';
import type { SearchParams } from '@/lib/analytics-dashboard/viewState';
import { formatCount } from '@/lib/analytics-dashboard/presentation';
import {
  ENGAGEMENT_STATE_MEANING,
  ENGAGEMENT_STATE_ORDER,
  MEMBER_EMPTY_COPY,
  MEMBER_STATE_FILTERS,
  MEMBER_STATE_FILTER_LABEL,
  SIGNALS_NOT_COUNTED,
  SIGNAL_COUNT_NOTE,
  countMembersByState,
  daysAwayLabel,
  filterMembersByState,
  historyLabel,
  memberDetailHref,
  memberName,
  membersTableHref,
  parseMemberStateFilter,
  rhythmLabel,
  sortMembersByAttention,
} from '@/lib/analytics-dashboard/memberView';
import { AnalyticsChrome } from '@/components/admin/analytics/AnalyticsChrome';
import {
  ActionError,
  EmptyState,
  Panel,
  ThinDataNote,
} from '@/components/admin/analytics/primitives';
import { BasisChip, StateChip } from '@/components/admin/analytics/memberPrimitives';

export const metadata: Metadata = { title: 'Analytics member engagement' };

/** How many members get the per-member friction queries. Above the service layer's own default of 25, still bounded. */
const FOLLOW_UP_LIMIT = 50;

export default async function AdminAnalyticsMembersPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  await requireAnalyticsAdmin();
  const view = parseDashboardView(searchParams);
  const filter = parseMemberStateFilter(searchParams?.state);
  const options = analyticsOptionsFor(view);

  const [statesResult, followUpResult] = await Promise.all([
    getEngagementStatesAction(options),
    findMembersForCoachFollowUpAction({ ...options, limit: FOLLOW_UP_LIMIT }),
  ]);

  const chrome = {
    current: '/admin/analytics/members' as const,
    view,
    title: 'Member engagement',
    intro:
      'Behavioral engagement only, built from when each member opened the app and nothing else. These are not health scores and not a judgment about anyone: a member can be doing beautifully and be Inactive here. Most in need of attention first.',
  };

  if (!statesResult.ok) {
    return (
      <AnalyticsChrome {...chrome}>
        <ActionError label="Member engagement" error={statesResult.error} />
      </AnalyticsChrome>
    );
  }

  const members = sortMembersByAttention(statesResult.data);
  const counts = countMembersByState(members);
  const shown = filterMembersByState(members, filter);

  // Signal counts exist only for the members the follow-up shortlist ran
  // over. Everyone else is "not counted", never a zero.
  const signalCounts = new Map<string, number>();
  if (followUpResult.ok) {
    for (const candidate of followUpResult.data) {
      signalCounts.set(candidate.memberId, candidate.signalTypes.length);
    }
  }
  const shortlistSize = counts.INACTIVE + counts.WATCH;

  return (
    <AnalyticsChrome {...chrome}>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {MEMBER_STATE_FILTERS.map((key) => {
          const selected = key === filter;
          return (
            <Link
              key={key}
              href={membersTableHref(view, key) as Route}
              aria-current={selected ? 'true' : undefined}
              data-state-filter={key}
              data-selected={selected ? 'true' : 'false'}
              className={`mef-focus-ring inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12.5px] transition-colors ${
                selected
                  ? 'bg-[#1B3A2D] font-medium text-[#F5F0E4]'
                  : 'bg-white/70 text-[#1B3A2D]/65 hover:text-[#1B3A2D]'
              }`}
            >
              {MEMBER_STATE_FILTER_LABEL[key]}
              <span className="tabular-nums opacity-70">{formatCount(counts[key])}</span>
            </Link>
          );
        })}
      </div>

      {members.length === 0 ? (
        <EmptyState
          title={MEMBER_EMPTY_COPY.noMembers.title}
          body={MEMBER_EMPTY_COPY.noMembers.body}
        />
      ) : (
        <Panel
          title={filter === 'all' ? 'Every member in scope' : `${MEMBER_STATE_FILTER_LABEL[filter]} members`}
          description={`${formatCount(members.length)} ${members.length === 1 ? 'member is' : 'members are'} in scope: every account that is not a test account and holds no coach, administrator or clinician role. Each state was decided against the reference date ${view.end}.`}
        >
          {shown.length === 0 ? (
            <EmptyState
              title={MEMBER_EMPTY_COPY.noneInState.title}
              body={MEMBER_EMPTY_COPY.noneInState.body}
            />
          ) : (
            <ol className="space-y-2">
              {shown.map((member) => {
                const counted = signalCounts.has(member.memberId);
                const signals = signalCounts.get(member.memberId) ?? 0;
                return (
                  <li key={member.memberId}>
                    <Link
                      href={memberDetailHref(member.memberId, view, { state: filter }) as Route}
                      data-member-row={member.memberId}
                      data-member-state={member.state}
                      className="mef-focus-ring block rounded-2xl bg-[#1B3A2D]/[0.035] px-4 py-3.5 transition-colors hover:bg-[#1B3A2D]/[0.06]"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
                        <p className="flex flex-wrap items-center gap-2.5">
                          <span className="text-[14.5px] text-[#1B3A2D]">{memberName(member)}</span>
                          <StateChip state={member.state} />
                          <BasisChip basis={member.basis} />
                          {member.facts.isTestAccount ? (
                            <ThinDataNote>Test account</ThinDataNote>
                          ) : null}
                        </p>
                        <p className="flex items-baseline gap-4 text-[12.5px] text-[#6B7A72]">
                          <span>
                            <span className="font-[family-name:var(--font-cormorant-garamond)] text-[1.35rem] leading-none text-[#1B3A2D]">
                              {daysAwayLabel(member.facts)}
                            </span>
                            {member.facts.daysSinceLastActivity !== null &&
                            member.facts.daysSinceLastActivity > 0
                              ? ' since last active'
                              : ''}
                          </span>
                        </p>
                      </div>

                      <p className="mt-2 text-[13px] leading-relaxed text-[#1B3A2D]/75">
                        {member.reason}
                      </p>

                      <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[12px] text-[#6B7A72]">
                        <span>Usual rhythm: {rhythmLabel(member.facts)}</span>
                        <span data-signal-count={counted ? signals : 'not-counted'}>
                          Friction signals:{' '}
                          {counted
                            ? `${formatCount(signals)} raised`
                            : SIGNALS_NOT_COUNTED}
                        </span>
                        <span>{historyLabel(member.facts)}</span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}

          <div className="mt-6 space-y-2 border-t border-[#1B3A2D]/8 pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#1B3A2D]/45">
              What the states mean
            </p>
            <dl className="space-y-1">
              {ENGAGEMENT_STATE_ORDER.map((state) => (
                <div key={state} className="flex flex-wrap items-baseline gap-2">
                  <dt>
                    <StateChip state={state} />
                  </dt>
                  <dd className="text-[12px] leading-relaxed text-[#6B7A72]">
                    {ENGAGEMENT_STATE_MEANING[state]}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="pt-1 text-[12px] leading-relaxed text-[#6B7A72]">{SIGNAL_COUNT_NOTE}</p>
            {!followUpResult.ok ? (
              <p className="text-[12px] leading-relaxed text-[#6B7A72]">
                The signal counts could not be loaded, so every member reads as not counted.{' '}
                {followUpResult.error}
              </p>
            ) : null}
            {shortlistSize > FOLLOW_UP_LIMIT ? (
              <p className="text-[12px] leading-relaxed text-[#6B7A72]">
                {formatCount(shortlistSize)} members are in a Watch or Inactive state and the first{' '}
                {FOLLOW_UP_LIMIT} of them were checked for signals. The rest show their count when
                you open them.
              </p>
            ) : null}
          </div>
        </Panel>
      )}
    </AnalyticsChrome>
  );
}
