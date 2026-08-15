/**
 * Coach detail view for one completed Readiness Pulse session — raw
 * answers to all nine questions, the derived pattern, her Question 9
 * pick, and highlighted coaching style + biggest obstacle, per the build
 * brief's own "Coach View" section. Gated purely by the same
 * coach_read_assigned_unified_assessment_sessions/_answers and
 * coach_read_assigned_cvs_experiment_daily_logs RLS policies (migrations
 * 99, 134) — no new permission, mirrors Life Signal Check's own coach
 * detail route.
 */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { ChevronLeft } from 'lucide-react';
import { getClientRplSessionDetailAction } from '@/app/actions/readinessPulse';
import { SIGNAL_LABEL } from '@/lib/life-signal-check/constants';
import { READINESS_PATTERN_LABEL } from '@/lib/readiness-pulse/constants';
import { RPL_COACHING_STYLE_LABEL, RPL_OBSTACLE_LABEL, RPL_WILLINGNESS_BAND_LABEL, RPL_CAPACITY_BAND_LABEL } from '@/lib/readiness-pulse/copy';
import { formatDisplayDate } from '@/lib/time/displayDate';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const Q1_LABEL: Record<string, string> = {
  first_real_try: 'This is my first real try',
  a_few_tries: 'A few tries',
  more_than_i_can_count: 'More times than I can count',
  never_started: 'I have thought about it but never started',
};

const Q3_LABEL: Record<string, string> = {
  overdue: 'Overdue',
  appealing_but_exhausting: 'Appealing but exhausting',
  a_little_scary: 'A little scary',
  curious: 'Something I am curious about',
};

const Q4_LABEL: Record<string, string> = {
  room_if_protect: 'Room if I protect it',
  small_pockets: 'Small pockets here and there',
  almost_none: 'Almost none right now',
  genuinely_open: 'Genuinely open',
};

const Q7_LABEL: Record<string, string> = {
  easily_doable: 'Easily doable',
  doable_good_days: 'Doable on good days',
  sounds_small_know_myself: 'Sounds small but I know myself',
  even_that_heavy: 'Honestly, even that feels heavy',
};

const Q2_LABEL: Record<string, string> = {
  life_got_busy: 'Life got busy',
  motivation_faded: 'Motivation faded',
  results_too_slow: 'Results came too slow',
  nobody_noticed: 'Nobody noticed I was trying',
  never_right_time: 'Never felt like the right time',
  didnt_know_where: 'Did not know where to start',
  afraid_wouldnt_stick: 'Afraid it would not stick',
  nothing_forced_me: 'Honestly, nothing forced me to',
};

export default async function CoachRplSessionDetailPage({ params }: { params: { id: string; sessionId: string } }) {
  const detail = await getClientRplSessionDetailAction(params.sessionId);
  if (!detail || detail.session.memberId !== params.id || detail.session.status !== 'completed') {
    notFound();
  }

  const { session, scoring, timeToCompleteMinutes, experiment } = detail;

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

        <h1 className="mt-4 font-[family-name:var(--font-cormorant-garamond)] text-3xl text-[#1B3A2D]">Readiness Pulse</h1>
        <p className="mt-1 text-sm text-[#6B7A72]">
          Completed {session.completedAt ? formatDisplayDate(session.completedAt, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}
          {timeToCompleteMinutes !== null ? ` · ${timeToCompleteMinutes} min to complete` : ''}
          {' · '}Version {session.assessmentVersion}
        </p>

        <div className="mt-6 space-y-5">
          <section className={`${CARD} p-6`}>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">What they actually said (Q1-Q9)</p>
            <div className="mt-3 space-y-1.5 text-sm text-[#1B3A2D]">
              <p>Q1, tried before: <span className="font-medium">{Q1_LABEL[scoring.q1] ?? scoring.q1}</span></p>
              <p>Q2, {scoring.triedBranch === 'never_started' ? 'kept it at thinking stage' : 'what got in the way'}: <span className="font-medium">{scoring.q2 ? (Q2_LABEL[scoring.q2] ?? scoring.q2) : 'Not answered'}</span></p>
              <p>Q3, change feels: <span className="font-medium">{Q3_LABEL[scoring.q3] ?? scoring.q3}</span></p>
              <p>Q4, room next month: <span className="font-medium">{Q4_LABEL[scoring.q4] ?? scoring.q4}</span></p>
              <p>Q5, coaching hypothetical: <span className="font-medium">{RPL_COACHING_STYLE_LABEL[scoring.q5]}</span></p>
              <p>Q6, what would sink this: <span className="font-medium">{RPL_OBSTACLE_LABEL[scoring.q6]}</span></p>
              <p>Q7, five minutes lands as: <span className="font-medium">{Q7_LABEL[scoring.q7] ?? scoring.q7}</span></p>
              <p>Q8, one thing she&apos;d change: <span className="font-medium">{SIGNAL_LABEL[scoring.q8Signal]}</span></p>
              <p>Q9, ready or deciding: <span className="font-medium">{READINESS_PATTERN_LABEL[scoring.q9]}</span></p>
            </div>
          </section>

          <section className={`${CARD} p-6`}>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">Derived formula</p>
            <div className="mt-3 space-y-1.5 text-sm text-[#1B3A2D]">
              <p>Willingness: <span className="font-medium">{RPL_WILLINGNESS_BAND_LABEL[scoring.willingnessBand]}</span> (score {scoring.willingnessScore})</p>
              <p>Capacity: <span className="font-medium">{RPL_CAPACITY_BAND_LABEL[scoring.capacityBand]}</span> (score {scoring.capacityScore})</p>
              <p>Derived pattern: <span className="font-medium">{READINESS_PATTERN_LABEL[scoring.derivedPattern]}</span></p>
              <p>Her Q9 pick: <span className="font-medium">{READINESS_PATTERN_LABEL[scoring.finalPattern]}</span> {scoring.pickDivergedFromDerived && <span className="ml-1 text-xs font-medium text-[#9B7B3A]">Pick overrode derived</span>}</p>
              <p>Q8 vs. Life Signal Check comparison: <span className="font-medium">{scoring.q8Comparison ?? 'No comparison (no loud signal or no session)'}</span></p>
              <p>Target signal for experiment: <span className="font-medium">{SIGNAL_LABEL[scoring.targetSignal]}</span></p>
              <p>Surprise beat (Q3 vs Q9 contradiction) fired: <span className="font-medium">{scoring.surpriseFires ? 'Yes' : 'No'}</span></p>
            </div>
          </section>

          <section className={`${CARD} p-6`} style={{ borderTop: '3px solid #C4A050' }}>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#854D0E]">Highlighted for coaching</p>
            <div className="mt-3 space-y-1.5 text-sm text-[#1B3A2D]">
              <p>Coaching style, stated directly: <span className="font-medium">{RPL_COACHING_STYLE_LABEL[scoring.q5]}</span></p>
              <p>What would sink this first: <span className="font-medium">{RPL_OBSTACLE_LABEL[scoring.q6]}</span></p>
            </div>
          </section>

          <section className={`${CARD} p-6`}>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">Weekly Experiment</p>
            {!experiment ? (
              <p className="mt-3 text-sm text-[#6B7A72]">Skipped: did not start the experiment.</p>
            ) : (
              <div className="mt-3 space-y-1.5 text-sm text-[#1B3A2D]">
                <p>Status: <span className="font-medium">{experiment.status.replace(/_/g, ' ')}</span></p>
                <p>Name: <span className="font-medium">{experiment.title}</span></p>
                <p>Started: <span className="font-medium">{experiment.startDate}</span></p>
                <p>
                  Daily streak: <span className="font-medium">{experiment.logs.filter((l) => l.completed === true).length}</span> yes ·{' '}
                  <span className="font-medium">{experiment.logs.filter((l) => l.completed === false).length}</span> not-today ·{' '}
                  <span className="font-medium">{experiment.logs.filter((l) => l.completed !== null).length}</span> of {experiment.durationDays} days logged
                </p>
                <p>
                  Day-3 response:{' '}
                  <span className="font-medium">{experiment.logs.find((l) => l.day3Response !== null)?.day3Response?.replace(/_/g, ' ') ?? 'Not yet given'}</span>
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
