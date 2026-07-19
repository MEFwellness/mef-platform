/**
 * Assessment History — every completed assessment for this questionnaire,
 * a total-score trend across all of them, and an interactive comparison
 * (current vs. previous / 30 days / 90 days / 6 months / 1 year) showing
 * improvement or regression per category.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getMyAssessmentHistory } from '@/app/actions/assessments';
import { findAssessmentDefinition } from '@/lib/assessments/registry';
import { hasActiveRole } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { BackButton } from '@/components/BackButton';
import { BottomNav } from '@/components/BottomNav';
import { PriorityBadge } from '@/components/assessments/PriorityBadge';
import {
  CategoryScoreTrendChart,
  type TrendPoint,
} from '@/components/assessments/CategoryScoreTrendChart';
import { AssessmentComparisonPanel } from '@/components/assessments/AssessmentComparisonPanel';
import { formatAssessmentDate } from '@/lib/assessments/presentation';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

export default async function AssessmentHistoryPage({
  params,
}: {
  params: { questionnaireId: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const definition = findAssessmentDefinition(params.questionnaireId);
  if (!definition) notFound();
  const { questionnaire, copy } = definition;

  const [history, isCoach] = await Promise.all([
    getMyAssessmentHistory(params.questionnaireId),
    hasActiveRole(supabase, user.id, 'coach'),
  ]);

  const mostRecentFirst = [...history].reverse();
  const latest = mostRecentFirst[0] ?? null;

  const trendPoints: TrendPoint[] = history.map((summary) => ({
    id: summary.id,
    dateLabel: formatAssessmentDate(summary.completedAt),
    score: summary.totalScore,
    maxScore: summary.totalMaxScore,
    priority: summary.totalPriority,
  }));

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref={`/assessments/${questionnaire.id}` as Route} label="Back" />

        <h1 className="mt-4 font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#1B3A2D]">
          Assessment History
        </h1>
        <p className="mt-2 text-sm text-[#6B7A72]">{copy.displayTitle}</p>

        {history.length === 0 ? (
          <section className={`${CARD} mef-animate-in mt-5 p-7`}>
            <p className="text-sm leading-relaxed text-[#6B7A72]">
              You haven&apos;t completed this assessment yet.
            </p>
            <Link
              href={`/assessments/${questionnaire.id}/take` as Route}
              className="mt-4 inline-block rounded-2xl bg-[#1B3A2D] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#163025]"
            >
              Begin assessment
            </Link>
          </section>
        ) : (
          <>
            <section className={`${CARD} mef-animate-in mt-5 p-6`}>
              <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
                Overall Score Trend
              </p>
              <CategoryScoreTrendChart
                points={trendPoints}
                emptyLabel="Complete a second assessment to see your trend over time."
              />
            </section>

            {latest && (
              <section className={`${CARD} mt-5 p-6`}>
                <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
                  Compare Your Progress
                </p>
                <div className="mt-4">
                  <AssessmentComparisonPanel
                    questionnaire={questionnaire}
                    latestAssessmentId={latest.id}
                  />
                </div>
              </section>
            )}

            <section className={`${CARD} mt-5 p-6`}>
              <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
                Every Completed Assessment
              </p>
              <div className="mt-3 divide-y divide-[#1B3A2D]/8">
                {mostRecentFirst.map((summary) => (
                  <Link
                    key={summary.id}
                    href={`/assessments/${questionnaire.id}/results/${summary.id}` as Route}
                    className="flex items-center justify-between gap-4 py-3 transition hover:opacity-80"
                  >
                    <span className="text-sm text-[#1B3A2D]">
                      {formatAssessmentDate(summary.completedAt)}
                    </span>
                    <span className="flex items-center gap-2 text-sm text-[#6B7A72]">
                      {summary.totalScore} / {summary.totalMaxScore}
                      <PriorityBadge priority={summary.totalPriority} />
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          </>
        )}
      </main>

      <BottomNav isCoach={isCoach} />
    </div>
  );
}
