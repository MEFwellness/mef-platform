/**
 * Coach detail view for one completed Core Values Snapshot session — full
 * importance ranking, attention map, top/runner-up/gap classification +
 * split flag, which interpretation branch ran and whether S1 fired, the
 * member's verbatim Q3 guilt answer, Weekly Experiment status (accepted/
 * skipped, daily yes/no streak, day-3/day-7 responses), completion date +
 * time-to-complete, and whether they continued toward Experience 2 — all
 * per the build brief's "Coach Visibility" section. Gated purely by the
 * same coach_read_assigned_unified_assessment_sessions/_answers and
 * coach_read_assigned_cvs_experiment_daily_logs RLS policies (migrations
 * 99, 134) — no new permission added for this page, mirrors WBSA's own
 * coach detail route.
 */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { ChevronLeft } from 'lucide-react';
import { getClientCvsSessionDetailAction } from '@/app/actions/coreValuesSnapshot';
import { AREA_LABEL, VALUE_AREAS } from '@/lib/core-values-snapshot/constants';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const BRANCH_LABEL: Record<string, string> = {
  clear_gap: 'Clear gap',
  aligned: 'Aligned',
  split: 'Split (instinct vs. plan)',
  slipping: 'Slipping',
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default async function CoachCvsSessionDetailPage({
  params,
}: {
  params: { id: string; sessionId: string };
}) {
  const detail = await getClientCvsSessionDetailAction(params.sessionId);
  if (!detail || detail.session.memberId !== params.id || detail.session.status !== 'completed') {
    notFound();
  }

  const { session, scoring, guiltAnswerVerbatim, timeToCompleteMinutes, experiment, continuedToExperience2 } = detail;
  const rankedAreas = [...VALUE_AREAS].sort((a, b) => scoring.importance[b] - scoring.importance[a]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-3xl px-5 pb-16 pt-safe-header sm:px-6 md:px-10">
        <Link
          href={`/coach/clients/${params.id}` as Route}
          className="mef-focus-ring inline-flex items-center gap-1 rounded-lg text-sm font-medium text-[#6B7A72] transition hover:text-[#1B3A2D]"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Back to client
        </Link>

        <h1 className="mt-4 font-[family-name:var(--font-cormorant-garamond)] text-3xl text-[#1B3A2D]">
          Core Values Snapshot
        </h1>
        <p className="mt-1 text-sm text-[#6B7A72]">
          Completed {session.completedAt ? formatDateTime(session.completedAt) : ''}
          {timeToCompleteMinutes !== null ? ` · ${timeToCompleteMinutes} min to complete` : ''}
          {' · '}Version {session.assessmentVersion}
        </p>

        <div className="mt-6 space-y-5">
          <section className={`${CARD} p-6`}>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">Importance ranking</p>
            <ul className="mt-3 space-y-2">
              {rankedAreas.map((area, index) => (
                <li key={area} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-[#1B3A2D]">
                    {index + 1}. {AREA_LABEL[area]}
                    {area === scoring.topValue && <span className="ml-2 text-xs font-medium text-[#4F7A63]">Top value</span>}
                    {area === scoring.runnerUpValue && <span className="ml-2 text-xs font-medium text-[#9B7B3A]">Runner-up</span>}
                  </span>
                  <span className="font-medium text-[#1B3A2D]">{scoring.importance[area]} / 8</span>
                </li>
              ))}
            </ul>
          </section>

          <section className={`${CARD} p-6`}>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">Attention map (last two weeks)</p>
            <ul className="mt-3 space-y-2">
              {VALUE_AREAS.map((area) => (
                <li key={area} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-[#1B3A2D]">{AREA_LABEL[area]}</span>
                  <span className="font-medium text-[#1B3A2D]">{scoring.attention[area]} / 5</span>
                </li>
              ))}
            </ul>
          </section>

          <section className={`${CARD} p-6`}>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">Interpretation</p>
            <div className="mt-3 space-y-1.5 text-sm text-[#1B3A2D]">
              <p>Gap classification: <span className="font-medium">{scoring.gapClassification.replace('_', ' ')}</span></p>
              <p>Split flag: <span className="font-medium">{scoring.split ? 'Yes' : 'No'}</span></p>
              <p>Branch shown: <span className="font-medium">{BRANCH_LABEL[scoring.branch] ?? scoring.branch}</span></p>
              <p>S1 (guilt-vs-attention) observation fired: <span className="font-medium">{scoring.s1Fires ? 'Yes' : 'No'}</span></p>
              <p>
                Verbatim Q3 answer (&quot;I feel guilty that I don&apos;t ______ enough&quot;):{' '}
                <span className="font-medium">{guiltAnswerVerbatim ?? '-'}</span>
              </p>
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

          <section className={`${CARD} p-6`}>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">Continued to Experience 2</p>
            <p className="mt-2 text-sm text-[#1B3A2D]">
              {continuedToExperience2 ? 'Yes: started the Life Signal Check.' : 'Not yet: has not started the Life Signal Check.'}
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
