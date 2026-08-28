/**
 * The coach's first screen, rendered.
 *
 * Six sections, in the order the target asks for them, and nothing else.
 * Every section renders in its empty state too, worded honestly, because a
 * coach must be able to tell "nothing here" apart from "this section is
 * broken". No raw stored value reaches this file: everything arrives
 * already named by lib/coach-dashboard/build.ts.
 *
 * A pure presentational component, so the whole screen is testable against
 * real HTML without a database.
 */

import Link from 'next/link';
import type { Route } from 'next';
import {
  ArrowUpRight,
  ChevronRight,
  HelpCircle,
  ListChecks,
  Shapes,
  ShieldAlert,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { ALERT_TIER_MEANING } from '@/lib/intelligence-engine/alertTiers';
import type { CoachDashboard } from '@/lib/coach-dashboard/types';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

function SectionHeading({
  icon: Icon,
  children,
}: {
  icon: typeof TrendingUp;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 text-[#854D0E]">
      <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
      <p className="text-sm font-semibold uppercase tracking-wider">{children}</p>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-sm leading-relaxed text-[#6B7A72]">{children}</p>;
}

/**
 * The tier label, every time a finding is shown. Never a number, and never
 * on its own without the finding it belongs to.
 */
function TierPill({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-[#1B3A2D]/[0.06] px-2.5 py-1 text-[11px] font-medium text-[#1B3A2D]/70">
      {label}
    </span>
  );
}

function FindingRow({
  label,
  statement,
  tierLabel,
  domainLabel,
  coachOnly,
}: {
  label: string;
  statement: string;
  tierLabel: string;
  domainLabel: string | null;
  coachOnly: boolean;
}) {
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-medium text-[#1B3A2D]">{label}</span>
        <TierPill label={tierLabel} />
        {coachOnly && (
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
            Coach only, she does not see this
          </span>
        )}
      </div>
      <p className="mt-1 text-sm leading-relaxed text-[#1B3A2D]/80">{statement}</p>
      {domainLabel && <p className="mt-0.5 text-xs text-[#6B7A72]">{domainLabel}</p>}
    </li>
  );
}

export function CoachDashboardView({
  dashboard,
  memberId,
}: {
  dashboard: CoachDashboard;
  memberId: string;
}) {
  const her = dashboard.memberFirstName;

  return (
    <div className="space-y-5" data-coach-dashboard="true">
      {/* Safety, first and separate, always. Not a badge on a card in a
          list of cards: the audit found the Safety Review Queue rendered as
          one more tile in the same stack as the Program Library. */}
      {dashboard.safetyActive && (
        <section className={`${CARD} border-2 border-red-200 p-6`} data-section="safety">
          <SectionHeading icon={ShieldAlert}>Safety case open</SectionHeading>
          <p className="mt-2 text-sm leading-relaxed text-[#1B3A2D]">
            Something is open for {her} in the review queue. Coaching detail is paused on that topic
            for her too, so start here.
          </p>
          <Link
            href={'/coach/review-queue' as Route}
            className="mef-focus-ring mt-3 inline-flex items-center gap-1 text-sm font-semibold text-red-700"
          >
            Open the review queue
            <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </Link>
        </section>
      )}

      {/* 1. WHAT IS IMPROVING */}
      <section className={`${CARD} p-6`} data-section="improving">
        <SectionHeading icon={TrendingUp}>What is improving</SectionHeading>
        {dashboard.improving.length > 0 ? (
          <ul className="mt-1 divide-y divide-[#1B3A2D]/5">
            {dashboard.improving.map((f) => (
              <FindingRow key={f.sourceKey} {...f} />
            ))}
          </ul>
        ) : (
          <Empty>
            Nothing has moved in a better direction yet. That is not the same as nothing improving,
            it means nothing has enough behind it to say so.
          </Empty>
        )}
      </section>

      {/* 2. WHAT NEEDS ATTENTION. Urgent safety alerts sit apart from the
          routine ones rather than above them in one sorted list, which is
          the distinction the safety system already draws and the coach
          alert system did not. */}
      <section className={`${CARD} p-6`} data-section="needs-attention">
        <SectionHeading icon={ShieldAlert}>What needs attention</SectionHeading>

        {dashboard.urgentAlerts.length > 0 && (
          <div className="mt-3 rounded-2xl bg-red-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-red-700">
              Needs a response today
            </p>
            <p className="mt-1 text-xs leading-relaxed text-red-700/80">
              {ALERT_TIER_MEANING.urgent_safety}
            </p>
            <ul className="mt-2 space-y-2">
              {dashboard.urgentAlerts.map((a) => (
                <li key={a.alertKey}>
                  <p className="text-sm font-medium text-[#1B3A2D]">{a.title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-[#1B3A2D]/80">{a.reason}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {dashboard.routineAlerts.length > 0 && (
          <div className="mt-3 rounded-2xl bg-[#FAFAF8] p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
              Routine follow-up
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[#6B7A72]">
              {ALERT_TIER_MEANING.routine_follow_up}
            </p>
            <ul className="mt-2 space-y-2">
              {dashboard.routineAlerts.map((a) => (
                <li key={a.alertKey}>
                  <p className="text-sm font-medium text-[#1B3A2D]">{a.title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-[#1B3A2D]/80">{a.reason}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {dashboard.needsAttention.length > 0 ? (
          <ul className="mt-1 divide-y divide-[#1B3A2D]/5">
            {dashboard.needsAttention.map((f) => (
              <FindingRow key={f.sourceKey} {...f} />
            ))}
          </ul>
        ) : (
          dashboard.urgentAlerts.length === 0 &&
          dashboard.routineAlerts.length === 0 && (
            <Empty>Nothing is asking for attention right now.</Empty>
          )
        )}
      </section>

      {/* 3. HOW RELIABLE EACH FINDING IS. The four tier labels, never a
          percentage and never a number. */}
      <section className={`${CARD} p-6`} data-section="reliability">
        <SectionHeading icon={Shapes}>How much is behind each one</SectionHeading>
        {dashboard.dataFloorStatement && (
          <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">
            {dashboard.dataFloorStatement}
          </p>
        )}
        {dashboard.reliability.length > 0 ? (
          <div className="mt-3 space-y-4">
            {dashboard.reliability.map((group) => (
              <div key={group.tier}>
                <div className="flex flex-wrap items-center gap-2">
                  <TierPill label={group.tierLabel} />
                  <span className="text-xs text-[#6B7A72]">{group.meaning}</span>
                </div>
                <ul className="mt-1.5 space-y-1">
                  {group.findings.map((f) => (
                    <li key={f.sourceKey} className="text-sm text-[#1B3A2D]/85">
                      {f.label}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <Empty>
            {her} has checked in on {dashboard.loggedDays} day
            {dashboard.loggedDays === 1 ? '' : 's'} in the last {dashboard.loggedDaysWindow} days
            and nothing has been found yet.
          </Empty>
        )}
      </section>

      {/* 4. WHAT SHE IS WORKING ON, and her friction answer in her own words. */}
      <section className={`${CARD} p-6`} data-section="working-on">
        <SectionHeading icon={ListChecks}>What {her} is working on</SectionHeading>
        {dashboard.workingOn ? (
          <div className="mt-3">
            <p className="text-base leading-relaxed text-[#1B3A2D]">{dashboard.workingOn.title}</p>
            {dashboard.workingOn.help && (
              <p className="mt-1 text-sm leading-relaxed text-[#1B3A2D]/80">
                {dashboard.workingOn.help}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-[#1B3A2D]/[0.06] px-2.5 py-1 text-[11px] font-medium text-[#1B3A2D]/70">
                {dashboard.workingOn.status === 'done'
                  ? 'Done today'
                  : dashboard.workingOn.status === 'saved'
                    ? 'Set aside for later'
                    : 'Open today'}
              </span>
              <span className="rounded-full bg-[#FAFAF8] px-2.5 py-1 text-[11px] text-[#6B7A72]">
                {dashboard.workingOn.ruleLabel}
              </span>
            </div>

            {dashboard.workingOn.friction && !dashboard.workingOn.friction.unanswered && (
              <div className="mt-3 rounded-2xl bg-[#FAFAF8] p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
                  What she said got in the way
                </p>
                <p className="mt-1 text-sm text-[#1B3A2D]">
                  {dashboard.workingOn.friction.reasonLabel}
                </p>
                {/* Her words, verbatim. Nothing here summarises, trims or
                    interprets them. */}
                {dashboard.workingOn.friction.note && (
                  <p className="mt-1.5 text-sm italic leading-relaxed text-[#1B3A2D]/85">
                    &ldquo;{dashboard.workingOn.friction.note}&rdquo;
                  </p>
                )}
                <p className="mt-1.5 text-xs text-[#6B7A72]">
                  Her own answer, {dashboard.workingOn.friction.localDate}
                </p>
              </div>
            )}
          </div>
        ) : (
          <Empty>Root has not set a priority for {her} today yet.</Empty>
        )}
      </section>

      {/* 5. WHAT MAY BE GETTING IN THE WAY */}
      <section className={`${CARD} p-6`} data-section="in-the-way">
        <SectionHeading icon={Sparkles}>What may be getting in the way</SectionHeading>
        {dashboard.inTheWay.length > 0 ? (
          <ul className="mt-3 space-y-2.5">
            {dashboard.inTheWay.map((item) => (
              <li key={item.key}>
                <p className="text-sm leading-relaxed text-[#1B3A2D]">{item.statement}</p>
                <p className="mt-0.5 text-xs text-[#6B7A72]">From {item.source}</p>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Nothing is showing up as an obstacle right now.</Empty>
        )}
      </section>

      {/* 6. WHAT TO ASK NEXT */}
      <section className={`${CARD} p-6`} data-section="ask-next">
        <SectionHeading icon={HelpCircle}>What to ask next</SectionHeading>
        {dashboard.askNext.length > 0 ? (
          <ul className="mt-3 space-y-3">
            {dashboard.askNext.map((item) => (
              <li key={item.key}>
                <p className="text-sm leading-relaxed text-[#1B3A2D]">{item.question}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-[#6B7A72]">{item.because}</p>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>
            Nothing specific to ask about today. This list only fills from real state, so an empty
            one means there is genuinely nothing waiting.
          </Empty>
        )}
      </section>

      {/* Everything else, one tap away. Nothing was deleted. */}
      <Link
        href={`/coach/clients/${memberId}/detail` as Route}
        data-detail-link="true"
        className={`mef-focus-ring ${CARD} flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-[#1B3A2D]/[0.03]`}
      >
        <span>
          <span className="block text-sm font-semibold uppercase tracking-wider text-[#3E5C46]">
            Everything else about {her}
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-[#6B7A72]">
            Her trackers, trends, assessments, programs, notes, and what her app contains. All of it,
            unchanged.
          </span>
        </span>
        <ArrowUpRight className="h-5 w-5 shrink-0 text-[#6B7A72]" strokeWidth={1.75} aria-hidden="true" />
      </Link>
    </div>
  );
}
