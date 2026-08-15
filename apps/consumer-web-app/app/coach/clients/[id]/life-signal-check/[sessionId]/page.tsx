/**
 * Coach detail view for one completed Life Signal Check session — all six
 * signal scores, the member's chosen signal, the duration answer, which
 * interpretation pattern fired, and whether their pick diverged from the
 * top score, per the build brief's "Coach Visibility" section. Gated
 * purely by the same coach_read_assigned_unified_assessment_sessions/
 * _answers and coach_read_assigned_cvs_experiment_daily_logs RLS policies
 * (migrations 99, 134) — no new permission added, mirrors Core Values
 * Snapshot's own coach detail route.
 */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { ChevronLeft } from 'lucide-react';
import { getClientLscSessionDetailAction } from '@/app/actions/lifeSignalCheck';
import { BODY_TEXT_LABEL, SIGNALS, SIGNAL_LABEL, TIME_OF_DAY_RAW_LABEL, type BodyText, type TimeOfDay } from '@/lib/life-signal-check/constants';
import { formatDisplayDate } from '@/lib/time/displayDate';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const PATTERN_LABEL: Record<string, string> = {
  one_loud: 'One loud signal',
  chorus: 'A chorus',
  quiet_body: 'Quiet body',
};

const DURATION_LABEL: Record<string, string> = {
  just_this_week: 'Just this week',
  a_few_weeks: 'A few weeks',
  months: 'Months',
  as_long_as_i_can_remember: 'As long as they can remember',
};

export default async function CoachLscSessionDetailPage({ params }: { params: { id: string; sessionId: string } }) {
  const detail = await getClientLscSessionDetailAction(params.sessionId);
  if (!detail || detail.session.memberId !== params.id || detail.session.status !== 'completed') {
    notFound();
  }

  const { session, scoring, timeToCompleteMinutes, experiment } = detail;
  const rankedSignals = [...SIGNALS].sort((a, b) => scoring.scores[b] - scoring.scores[a]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-3xl px-5 pb-safe-nav pt-safe-header sm:px-6 md:px-10 md:pl-28">
        <Link
          href={`/coach/clients/${params.id}` as Route}
          className="mef-focus-ring inline-flex items-center gap-1 rounded-lg text-sm font-medium text-[#6B7A72] transition hover:text-[#1B3A2D]"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Back to client
        </Link>

        <h1 className="mt-4 font-[family-name:var(--font-cormorant-garamond)] text-3xl text-[#1B3A2D]">Life Signal Check</h1>
        <p className="mt-1 text-sm text-[#6B7A72]">
          Completed {session.completedAt ? formatDisplayDate(session.completedAt, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}
          {timeToCompleteMinutes !== null ? ` · ${timeToCompleteMinutes} min to complete` : ''}
          {' · '}Version {session.assessmentVersion}
        </p>

        <div className="mt-6 space-y-5">
          <section className={`${CARD} p-6`}>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">What they actually said (Q1-Q3)</p>
            <div className="mt-3 space-y-1.5 text-sm text-[#1B3A2D]">
              <p>
                Feels most like themselves:{' '}
                <span className="font-medium">
                  {TIME_OF_DAY_RAW_LABEL[session.answers['lsc_q1'] as TimeOfDay] ?? 'Not answered'}
                </span>
              </p>
              <p>
                Day gets hardest:{' '}
                <span className="font-medium">
                  {TIME_OF_DAY_RAW_LABEL[session.answers['lsc_q2'] as TimeOfDay] ?? 'Not answered'}
                </span>
              </p>
              <p>
                If their body could send one text:{' '}
                <span className="font-medium">
                  {BODY_TEXT_LABEL[session.answers['lsc_q3'] as BodyText] ?? 'Not answered'}
                </span>
              </p>
            </div>
          </section>

          <section className={`${CARD} p-6`}>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">Signal scores</p>
            <ul className="mt-3 space-y-2">
              {rankedSignals.map((signal) => (
                <li key={signal} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-[#1B3A2D]">
                    {SIGNAL_LABEL[signal]}
                    {signal === scoring.loudestSignal && <span className="ml-2 text-xs font-medium text-[#4F7A63]">Loudest</span>}
                    {signal === scoring.chosenSignal && <span className="ml-2 text-xs font-medium text-[#9B7B3A]">Chosen</span>}
                  </span>
                  <span className="font-medium text-[#1B3A2D]">{scoring.scores[signal]} / 3</span>
                </li>
              ))}
            </ul>
          </section>

          <section className={`${CARD} p-6`}>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">Interpretation</p>
            <div className="mt-3 space-y-1.5 text-sm text-[#1B3A2D]">
              <p>Pattern: <span className="font-medium">{PATTERN_LABEL[scoring.pattern] ?? scoring.pattern}</span></p>
              <p>Pick diverged from top score: <span className="font-medium">{scoring.pickDivergedFromLoudest ? 'Yes' : 'No'}</span></p>
              <p>Duration answer: <span className="font-medium">{DURATION_LABEL[scoring.duration] ?? scoring.duration}</span></p>
              <p>Body-Value Echo fired: <span className="font-medium">{scoring.echoFires ? 'Yes' : 'No'}</span></p>
              <p>Surprise beat fired: <span className="font-medium">{scoring.surpriseFires ? 'Yes' : 'No'}</span></p>
            </div>
          </section>

          <section className={`${CARD} p-6`}>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">Weekly Experiment</p>
            {!experiment ? (
              <p className="mt-3 text-sm text-[#6B7A72]">Skipped: did not start the experiment.</p>
            ) : (
              <div className="mt-3 space-y-1.5 text-sm text-[#1B3A2D]">
                <p>Status: <span className="font-medium">{experiment.status.replace(/_/g, ' ')}</span></p>
                <p>Protecting: <span className="font-medium">{experiment.title}</span></p>
                <p>Started: <span className="font-medium">{experiment.startDate}</span></p>
                <p>
                  Daily streak: <span className="font-medium">{experiment.logs.filter((l) => l.completed === true).length}</span> yes ·{' '}
                  <span className="font-medium">{experiment.logs.filter((l) => l.completed === false).length}</span> not-today ·{' '}
                  <span className="font-medium">{experiment.logs.filter((l) => l.completed !== null).length}</span> of {experiment.durationDays} days logged
                </p>
                <p>
                  Day-3 response:{' '}
                  <span className="font-medium">
                    {experiment.logs.find((l) => l.day3Response !== null)?.day3Response?.replace(/_/g, ' ') ?? 'Not yet given'}
                  </span>
                </p>
                {experiment.outcome && <p>Outcome reflection: <span className="font-medium">{experiment.outcome.replace(/_/g, ' ')}</span></p>}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
