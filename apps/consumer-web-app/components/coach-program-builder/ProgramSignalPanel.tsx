'use client';

/**
 * "How the program is going." One panel per program a coach opens on a
 * member, and the answer to a question she used to have to reconstruct from
 * four screens.
 *
 * IT LEADS WITH SENTENCES, NOT CHARTS. The top of the panel is
 * lib/programs/signals/insights.ts's list: "She has skipped Dead Bug 3
 * times", "She reported pain on Bird Dog in week 2, this has not been
 * reviewed yet". Everything below it is the detail behind those sentences,
 * for the coach who wants it. A coach who reads only the top of this panel
 * has read the important part, which is the test a panel like this has to
 * pass.
 *
 * TWO THINGS SHE CAN DO FROM HERE, and both are the small ones: mark a pain
 * report reviewed, and let an avoided exercise back in. Everything larger
 * lives behind Open Review, because a decision about the next four weeks
 * deserves its own screen.
 *
 * NO NUMBER HERE REACHES A MEMBER. The load column is a suggestion on a
 * coach's screen; it becomes a prescription only when a coach approves a
 * draft on the review screen.
 *
 * NO EM DASHES, per the house rule.
 */

import { useState, useTransition } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Repeat,
  TrendingUp,
  Undo2,
} from 'lucide-react';
import type { ProgramSignalPanel as PanelData } from '@/app/actions/program-review';
import {
  releaseAvoidanceAction,
  resolveFeedbackReportAction,
} from '@/app/actions/program-review';
import { NO_INSIGHTS_YET, NO_LOGGED_WEIGHTS_YET } from '@/lib/programs/signals/insights';
import { describeSuggestion } from '@/lib/programs/progression/suggest';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const TONE_STYLE: Record<string, string> = {
  attention: 'border-l-2 border-red-400 bg-red-50/60 text-[#1B3A2D]',
  notice: 'border-l-2 border-[#F5B700] bg-[#F5B700]/[0.08] text-[#1B3A2D]',
  good: 'border-l-2 border-emerald-400 bg-emerald-50/60 text-[#1B3A2D]',
};

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">{children}</h4>
  );
}

export function ProgramSignalPanel({
  memberId,
  groupKey,
  programName,
  panel,
  reviewHref,
}: {
  memberId: string;
  groupKey: string;
  programName: string;
  panel: PanelData;
  reviewHref: string;
}) {
  const { signals, insights, loads, nudges } = panel;
  const [isPending, startTransition] = useTransition();
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());
  const [releasedIds, setReleasedIds] = useState<Set<string>>(new Set());
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  function resolveReport(feedbackId: string) {
    startTransition(async () => {
      const result = await resolveFeedbackReportAction({ feedbackId, memberId, note });
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setNoteFor(null);
      setNote('');
      setResolvedIds((current) => new Set(current).add(feedbackId));
    });
  }

  function release(avoidanceId: string) {
    startTransition(async () => {
      const result = await releaseAvoidanceAction({ avoidanceId, memberId });
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setReleasedIds((current) => new Set(current).add(avoidanceId));
    });
  }

  const activeAvoidance = signals.avoidance.filter(
    (entry) => entry.releasedAt === null && !releasedIds.has(entry.id)
  );

  return (
    <section className={`${CARD} p-5`} data-program-signal-panel={groupKey}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#3E5C46]">
            How the program is going
          </p>
          <h3 className="mt-1 font-[family-name:var(--font-cormorant-garamond)] text-2xl leading-tight text-[#1B3A2D]">
            {programName}
          </h3>
        </div>
        <Link
          href={reviewHref as Route}
          data-open-review={groupKey}
          className="mef-focus-ring inline-flex items-center gap-1.5 rounded-full bg-[#1B3A2D] px-4 py-2 text-sm font-medium text-white"
        >
          {panel.openReviewId ? 'Open review' : panel.phaseIsOver ? 'Review this phase' : 'Review early'}
          <ArrowUpRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </Link>
      </div>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      {/* 1. The sentences. */}
      <div className="mt-4 space-y-2">
        {insights.length === 0 ? (
          <p className="text-sm leading-relaxed text-[#6B7A72]">{NO_INSIGHTS_YET}</p>
        ) : (
          insights.map((insight, index) => (
            <p
              key={`${insight.kind}-${index}`}
              data-insight-tone={insight.tone}
              className={`rounded-r-xl px-3 py-2 text-sm leading-relaxed ${TONE_STYLE[insight.tone]}`}
            >
              {insight.tone === 'attention' && (
                <AlertTriangle
                  className="mr-1.5 inline h-3.5 w-3.5 -translate-y-px text-red-600"
                  strokeWidth={2}
                  aria-hidden="true"
                />
              )}
              {insight.text}
            </p>
          ))
        )}
      </div>

      {/* 2. Completion, week by week. */}
      <div className="mt-6">
        <SectionHeading>Completion</SectionHeading>
        <p className="mt-1.5 text-sm text-[#1B3A2D]">
          {signals.completedSessions} of {signals.totalSessions} sessions, {signals.completionPercent}%
        </p>
        {signals.weeks.length > 0 && (
          <ul className="mt-2 space-y-1">
            {signals.weeks.map((week) => (
              <li key={week.week} className="flex items-center gap-3 text-xs text-[#6B7A72]">
                <span className="w-14 shrink-0 font-medium text-[#3E5C46]">Week {week.week}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#1B3A2D]/[0.08]">
                  <span
                    className="block h-full rounded-full bg-[#3E5C46]"
                    style={{ width: `${week.completionPercent}%` }}
                  />
                </span>
                <span className="w-24 shrink-0 text-right">
                  {week.completedSessions} of {week.totalSessions}
                  {week.skippedSessions > 0 ? `, ${week.skippedSessions} skipped` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 3. Pain reports. Most prominent, and the only thing here with a
             button beside it. */}
      {signals.painReports.length > 0 && (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50/50 p-4">
          <SectionHeading>Pain reports</SectionHeading>
          <ul className="mt-2 space-y-3">
            {signals.painReports.map((report) => {
              const resolved = report.resolvedAt !== null || resolvedIds.has(report.feedbackId);
              return (
                <li key={report.feedbackId} data-pain-report={report.feedbackId}>
                  <p className="text-sm text-[#1B3A2D]">
                    {report.exerciseName}
                    {report.programWeek ? `, week ${report.programWeek}` : ''}
                  </p>
                  {report.otherText && (
                    <p className="mt-0.5 text-xs italic leading-relaxed text-[#6B7A72]">
                      “{report.otherText}”
                    </p>
                  )}
                  {resolved ? (
                    <p
                      data-pain-resolved={report.feedbackId}
                      className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-emerald-700"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                      Reviewed
                      {report.resolutionNote ? `: ${report.resolutionNote}` : ''}
                    </p>
                  ) : noteFor === report.feedbackId ? (
                    <div className="mt-2">
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={2}
                        placeholder="What did you decide? Optional, and she never sees it."
                        className="w-full rounded-xl border border-[#1B3A2D]/10 px-3 py-2 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
                      />
                      <div className="mt-1.5 flex gap-2">
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => resolveReport(report.feedbackId)}
                          className="rounded-full bg-[#1B3A2D] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                        >
                          Mark reviewed
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setNoteFor(null);
                            setNote('');
                          }}
                          className="rounded-full border border-[#1B3A2D]/15 px-3 py-1.5 text-xs font-medium text-[#6B7A72]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      data-resolve-pain={report.feedbackId}
                      onClick={() => setNoteFor(report.feedbackId)}
                      className="mt-1 rounded-full border border-[#1B3A2D]/15 px-3 py-1 text-xs font-medium text-[#1B3A2D]"
                    >
                      Mark reviewed
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* 4. Skips and stops. */}
      {(signals.skippedExercises.length > 0 || signals.stoppedExercises.length > 0) && (
        <div className="mt-6">
          <SectionHeading>Exercises she did not do</SectionHeading>
          <ul className="mt-1.5 space-y-1 text-sm text-[#1B3A2D]">
            {signals.skippedExercises.map((entry) => (
              <li key={`skip-${entry.externalId}`}>
                {entry.exerciseName}, skipped {entry.count} time{entry.count === 1 ? '' : 's'}
              </li>
            ))}
            {signals.stoppedExercises.map((entry) => (
              <li key={`stop-${entry.externalId}`}>
                {entry.exerciseName}, stopped {entry.count} time{entry.count === 1 ? '' : 's'}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 5. Swaps. */}
      {signals.swaps.length > 0 && (
        <div className="mt-6">
          <SectionHeading>Swaps she made</SectionHeading>
          <ul className="mt-1.5 space-y-1.5 text-sm text-[#1B3A2D]">
            {signals.swaps.map((swap, index) => (
              <li key={`swap-${index}`} className="flex items-start gap-2">
                <Repeat
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#6B7A72]"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <span>
                  {swap.fromExerciseName} to {swap.toExerciseName}, because of {swap.reasonLabel}
                  {swap.otherText ? `. She wrote: “${swap.otherText}”` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 6. Too easy and too difficult. */}
      {(signals.tooEasyFlags.length > 0 || signals.tooDifficultFlags.length > 0) && (
        <div className="mt-6">
          <SectionHeading>What she said about the effort</SectionHeading>
          <ul className="mt-1.5 space-y-1 text-sm text-[#1B3A2D]">
            {signals.tooEasyFlags.map((flag) => (
              <li key={`easy-${flag.feedbackId}`}>{flag.exerciseName}, too easy</li>
            ))}
            {signals.tooDifficultFlags.map((flag) => (
              <li key={`hard-${flag.feedbackId}`}>{flag.exerciseName}, too difficult</li>
            ))}
          </ul>
        </div>
      )}

      {/* 7. Ratings, as counts rather than a chart. */}
      {(signals.difficultyTrend.length > 0 || signals.comfortTrend.length > 0) && (
        <div className="mt-6">
          <SectionHeading>How she rated it, week by week</SectionHeading>
          <div className="mt-1.5 space-y-1 text-xs text-[#6B7A72]">
            {signals.difficultyTrend.map((point) => (
              <p key={`diff-${point.week}`}>
                Week {point.week} difficulty:{' '}
                {Object.entries(point.counts)
                  .map(([value, count]) => `${value.replace(/_/g, ' ')} x${count}`)
                  .join(', ')}
              </p>
            ))}
            {signals.comfortTrend.map((point) => (
              <p key={`comf-${point.week}`}>
                Week {point.week} comfort:{' '}
                {Object.entries(point.counts)
                  .map(([value, count]) => `${value.replace(/_/g, ' ')} x${count}`)
                  .join(', ')}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* 8. What she lifted, and what the rules would suggest next. */}
      <div className="mt-6">
        <SectionHeading>Weights she logged</SectionHeading>
        {loads.noLoggedWeights ? (
          <p className="mt-1.5 text-sm leading-relaxed text-[#6B7A72]" data-no-logged-weights="true">
            {NO_LOGGED_WEIGHTS_YET}
          </p>
        ) : (
          <>
            <ul className="mt-1.5 space-y-2">
              {signals.loadTrends.map((trend) => {
                const suggestion = loads.suggestions.find(
                  (s) => s.externalId === trend.externalId
                );
                return (
                  <li key={trend.externalId} data-load-trend={trend.externalId}>
                    <p className="text-sm text-[#1B3A2D]">
                      {trend.exerciseName}: {trend.line}
                    </p>
                    {suggestion && (
                      <p className="mt-0.5 text-xs text-[#6B7A72]">
                        {describeSuggestion(suggestion)} {suggestion.reason}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-xs leading-relaxed text-[#6B7A72]">
              {loads.modelReason} Nothing here has been given to her. You set the numbers on the
              review screen.
            </p>
          </>
        )}
      </div>

      {/* 9. The weekly nudge. */}
      {nudges.length > 0 && (
        <div className="mt-4 rounded-2xl bg-emerald-50/70 p-4">
          <ul className="space-y-1 text-sm text-[#1B3A2D]">
            {nudges.map((nudge, index) => (
              <li key={index} data-load-nudge={index} className="flex items-start gap-2">
                <TrendingUp
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <span>{nudge}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 10. The avoidance list, with the one control that empties it. */}
      <div className="mt-6">
        <SectionHeading>Exercises she is not offered</SectionHeading>
        <p className="mt-1 text-xs text-[#6B7A72]">
          This list is hers, not this program&apos;s, so it reads the same under every program she
          is on. Letting one back in lets it back in everywhere.
        </p>
        {activeAvoidance.length === 0 ? (
          <p className="mt-1.5 text-sm text-[#6B7A72]">
            Nothing on her list. Every exercise in the library is available to her.
          </p>
        ) : (
          <ul className="mt-1.5 space-y-2">
            {activeAvoidance.map((entry) => (
              <li
                key={entry.id}
                data-avoidance={entry.id}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <span className="text-sm text-[#1B3A2D]">
                  {entry.exerciseName}
                  <span className="ml-2 text-xs text-[#6B7A72]">
                    {entry.sourceLabel}, {entry.at.slice(0, 10)}
                  </span>
                </span>
                <button
                  type="button"
                  data-release-avoidance={entry.id}
                  disabled={isPending}
                  onClick={() => release(entry.id)}
                  className="inline-flex items-center gap-1 rounded-full border border-[#1B3A2D]/15 px-3 py-1 text-xs font-medium text-[#1B3A2D] disabled:opacity-50"
                >
                  <Undo2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                  Allow again
                </button>
              </li>
            ))}
          </ul>
        )}
        {signals.avoidance.some((entry) => entry.releasedAt !== null || releasedIds.has(entry.id)) && (
          <p className="mt-2 text-xs text-[#6B7A72]">
            Released:{' '}
            {signals.avoidance
              .filter((entry) => entry.releasedAt !== null || releasedIds.has(entry.id))
              .map((entry) => entry.exerciseName)
              .join(', ')}
          </p>
        )}
      </div>
    </section>
  );
}
