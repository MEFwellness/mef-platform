/**
 * The pieces the two member views are built from.
 *
 * All server components, like everything else in this section, so no event
 * row and no member detail ever reaches a browser as data. What renders here
 * is what the service layer already decided, formatted by
 * lib/analytics-dashboard/memberView.ts.
 *
 * Nothing in this file interprets anything. A signal card shows the service
 * layer's own sentence, the counts behind it, the period it covers and how
 * much behavior stood behind it. There is no recommendation, no severity
 * ranking, and no generated text anywhere in the section.
 *
 * Gold stays rare, as on the first four screens: the state chip for Inactive
 * and the hairline above an evidence-sufficiency note. Everything else is
 * forest on cream.
 */

import type { EngagementBasis, EngagementState, FrictionSignal } from '@/lib/analytics-service';
import {
  ENGAGEMENT_BASIS_LABEL,
  ENGAGEMENT_BASIS_MEANING,
  ENGAGEMENT_STATE_LABEL,
  INSUFFICIENT_HISTORY_LABEL,
  SIGNAL_TITLE,
  SIGNAL_TONE,
  SUFFICIENCY_LABEL,
  evidenceEntries,
  evidenceLabel,
  evidenceValue,
  isInsufficientHistory,
  signalPeriodLabel,
} from '@/lib/analytics-dashboard/memberView';
import { CARD, formatCount } from './primitives';

const STATE_TONE: Record<EngagementState, string> = {
  INACTIVE: 'bg-[#C4A050]/18 text-[#7A5E1E] ring-1 ring-[#C4A050]/45',
  WATCH: 'bg-[#1B3A2D]/10 text-[#1B3A2D] ring-1 ring-[#1B3A2D]/12',
  ACTIVE: 'bg-[#1B3A2D] text-[#F5F0E4]',
  NEW: 'bg-[#1B3A2D]/[0.05] text-[#1B3A2D]/70 ring-1 ring-[#1B3A2D]/10',
};

export function StateChip({ state }: { state: EngagementState }) {
  return (
    <span
      data-engagement-state={state}
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-[3px] text-[11px] font-semibold uppercase tracking-[0.08em] ${STATE_TONE[state]}`}
    >
      {ENGAGEMENT_STATE_LABEL[state]}
    </span>
  );
}

/**
 * How the state was decided, in the service layer's own token, with the
 * plain-language expansion as the title so hovering or reading it aloud says
 * the same thing. A state decided on fixed thresholds is a much weaker claim
 * than one decided against a member's own baseline, and hiding which is
 * which would let the two be read as the same.
 */
export function BasisChip({ basis }: { basis: EngagementBasis }) {
  return (
    <span
      data-engagement-basis={basis}
      title={ENGAGEMENT_BASIS_MEANING[basis]}
      className="inline-flex shrink-0 items-center rounded-full bg-[#1B3A2D]/[0.05] px-2.5 py-[3px] font-mono text-[10.5px] tracking-tight text-[#1B3A2D]/65"
    >
      {ENGAGEMENT_BASIS_LABEL[basis]}
    </span>
  );
}

export function SufficiencyChip({ level }: { level: 'low' | 'moderate' | 'strong' }) {
  const tone =
    level === 'strong'
      ? 'bg-[#1B3A2D]/10 text-[#1B3A2D]'
      : level === 'moderate'
        ? 'bg-[#1B3A2D]/[0.06] text-[#1B3A2D]/75'
        : 'bg-[#1B3A2D]/[0.04] text-[#1B3A2D]/55';
  return (
    <span
      data-evidence-sufficiency={level}
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-[3px] text-[11px] font-medium ${tone}`}
    >
      {SUFFICIENCY_LABEL[level]}
    </span>
  );
}

/**
 * One friction signal, as a card a coach can act on.
 *
 * Four things, in this order: what was observed (the service layer's own
 * sentence, verbatim), since when, the evidence counts, and how much
 * behavior stood behind it. The observation is the cue. There is deliberately
 * no suggested action, no priority, and no interpretation of why.
 */
export function SignalCard({
  signal,
  range,
}: {
  signal: FrictionSignal;
  range: { start: string; end: string };
}) {
  const thin = isInsufficientHistory(signal);
  const period = signalPeriodLabel(signal, range);
  const evidence = evidenceEntries(signal);
  const friction = SIGNAL_TONE[signal.type] === 'friction';

  return (
    <article
      data-signal={signal.type}
      data-signal-tone={SIGNAL_TONE[signal.type]}
      className={`${CARD} p-5 ${thin ? 'bg-[#1B3A2D]/[0.02]' : ''}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <h3 className="font-[family-name:var(--font-cormorant-garamond)] text-[1.35rem] leading-tight text-[#1B3A2D]">
          {thin ? INSUFFICIENT_HISTORY_LABEL : SIGNAL_TITLE[signal.type]}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {!thin && !friction ? (
            <span className="inline-flex items-center rounded-full bg-[#1B3A2D]/[0.05] px-2.5 py-[3px] text-[11px] font-medium text-[#1B3A2D]/60">
              Context, not friction
            </span>
          ) : null}
          <SufficiencyChip level={signal.evidenceSufficiency} />
        </div>
      </div>

      <p className="mt-2.5 text-[14px] leading-relaxed text-[#1B3A2D]">{signal.reason}</p>

      <p className="mt-3 text-[12.5px] leading-relaxed text-[#6B7A72]">
        <span className="font-medium text-[#1B3A2D]/70">{period.label}:</span> {period.detail}
      </p>

      {evidence.length > 0 ? (
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {evidence.map(([key, value]) => (
            <div key={key} className="flex items-baseline justify-between gap-3 border-b border-[#1B3A2D]/6 pb-1">
              <dt className="text-[12px] text-[#6B7A72]">{evidenceLabel(key)}</dt>
              <dd className="shrink-0 text-[12.5px] tabular-nums text-[#1B3A2D]">
                {evidenceValue(value)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      <p className="mt-3 border-t border-[#C4A050]/35 pt-2.5 text-[11.5px] leading-relaxed text-[#1B3A2D]/50">
        {signal.evidenceSufficiencyReason}
      </p>
    </article>
  );
}

/**
 * One day of one member's activity: which features, how many times, and how
 * many of those were a start and how many a completion.
 *
 * A day with nothing on it is absent rather than drawn as an empty row. This
 * is a record of what happened, not a calendar, and inventing rows of zeros
 * would make a quiet fortnight look like fourteen observations.
 */
export function TimelineDay({
  day,
}: {
  day: {
    localDate: string;
    totalEvents: number;
    started: number;
    completed: number;
    features: Array<{ featureKey: string; label: string; events: number; started: number; completed: number }>;
  };
}) {
  return (
    <li data-timeline-day={day.localDate} className="rounded-2xl bg-[#1B3A2D]/[0.035] px-4 py-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[13.5px] font-medium tabular-nums text-[#1B3A2D]">{day.localDate}</p>
        <p className="text-[12px] text-[#6B7A72]">
          {formatCount(day.totalEvents)} {day.totalEvents === 1 ? 'action' : 'actions'}
          {day.started > 0 ? `, ${formatCount(day.started)} started` : ''}
          {day.completed > 0 ? `, ${formatCount(day.completed)} completed` : ''}
        </p>
      </div>
      <ul className="mt-2 space-y-1">
        {day.features.map((feature) => (
          <li
            key={feature.featureKey}
            data-timeline-feature={feature.featureKey}
            className="flex flex-wrap items-baseline justify-between gap-x-3 text-[12.5px]"
          >
            <span className="text-[#1B3A2D]">{feature.label}</span>
            <span className="tabular-nums text-[#6B7A72]">
              {formatCount(feature.events)}
              {feature.started > 0 || feature.completed > 0
                ? ` (${formatCount(feature.started)} started, ${formatCount(feature.completed)} completed)`
                : ''}
            </span>
          </li>
        ))}
      </ul>
    </li>
  );
}
