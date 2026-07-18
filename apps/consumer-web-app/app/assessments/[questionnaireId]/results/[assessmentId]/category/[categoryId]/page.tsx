/**
 * Category detail — score, max possible score, priority, historical
 * trend, every previous assessment's score for this category, the
 * educational explanation, the member's own answers, and the coaching
 * focus area. Everything a member taps into from a CategoryCard on the
 * results dashboard.
 */

import type { Route } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Target } from 'lucide-react';
import {
  getMyAssessmentCategoryAnswers,
  getMyAssessmentResult,
  getMyCategoryScoreHistory,
} from '@/app/actions/assessments';
import { hasActiveRole } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { BackButton } from '@/components/BackButton';
import { BottomNav } from '@/components/BottomNav';
import { PriorityBadge } from '@/components/assessments/PriorityBadge';
import { CategoryScoreTrendChart, type TrendPoint } from '@/components/assessments/CategoryScoreTrendChart';
import { formatAssessmentDate } from '@/lib/assessments/presentation';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

export default async function AssessmentCategoryDetailPage({
  params,
}: {
  params: { questionnaireId: string; assessmentId: string; categoryId: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [view, isCoach] = await Promise.all([
    getMyAssessmentResult(params.questionnaireId, params.assessmentId),
    hasActiveRole(supabase, user.id, 'coach'),
  ]);
  if (!view) notFound();

  const categoryScore = view.result.categoryScores.find((c) => c.categoryId === params.categoryId);
  if (!categoryScore) notFound();

  const [history, answers] = await Promise.all([
    getMyCategoryScoreHistory(params.questionnaireId, params.categoryId),
    getMyAssessmentCategoryAnswers(params.questionnaireId, params.assessmentId, params.categoryId),
  ]);

  const copy = view.copy.categoryCopy[params.categoryId];
  const trendPoints: TrendPoint[] = history.map((point) => ({
    id: point.assessmentId,
    dateLabel: formatAssessmentDate(point.completedAt),
    score: point.score,
    maxScore: point.maxScore,
    priority: point.priority,
  }));
  const previousAssessments = [...history].reverse(); // most recent first

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <BackButton
          fallbackHref={`/assessments/${params.questionnaireId}/results/${params.assessmentId}` as Route}
          label="Back to results"
        />

        <section className={`${CARD} mef-animate-in mt-4 p-7`}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
              {categoryScore.categoryName}
            </p>
            <PriorityBadge priority={categoryScore.priority} />
          </div>
          <p className="mt-3 flex items-baseline gap-2">
            <span className="font-[family-name:var(--font-cormorant-garamond)] text-5xl leading-none text-[#1B3A2D]">
              {categoryScore.score}
            </span>
            <span className="text-base text-[#6B7A72]">of {categoryScore.maxScore} possible</span>
          </p>
          {copy && <p className="mt-4 text-sm leading-relaxed text-[#1B3A2D]">{copy.shortDescription}</p>}

          {copy && (
            <div className="mt-5 flex items-start gap-3 rounded-2xl bg-[#F3F6F4] p-5">
              <Target className="mt-0.5 h-4 w-4 shrink-0 text-[#1B3A2D]" strokeWidth={1.75} aria-hidden="true" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
                  Coaching Focus Area
                </p>
                <p className="mt-1 text-sm leading-relaxed text-[#1B3A2D]">{copy.coachingFocus}</p>
              </div>
            </div>
          )}
        </section>

        <section className={`${CARD} mt-5 p-6`}>
          <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">Historical Trend</p>
          <CategoryScoreTrendChart
            points={trendPoints}
            emptyLabel="Complete another assessment to see how this category trends over time."
          />
        </section>

        <section className={`${CARD} mt-5 p-6`}>
          <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
            Previous Assessments
          </p>
          {previousAssessments.length > 0 ? (
            <div className="mt-3 divide-y divide-[#1B3A2D]/8">
              {previousAssessments.map((point) => (
                <div key={point.assessmentId} className="flex items-center justify-between gap-4 py-3">
                  <span className="text-sm text-[#1B3A2D]">
                    {formatAssessmentDate(point.completedAt)}
                    {point.assessmentId === params.assessmentId && (
                      <span className="ml-2 rounded-full bg-[#EFF6F1] px-2 py-0.5 text-xs text-[#1B3A2D]">
                        this assessment
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-2 text-sm text-[#6B7A72]">
                    {point.score} / {point.maxScore}
                    <PriorityBadge priority={point.priority} />
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-[#6B7A72]">No prior assessments yet.</p>
          )}
        </section>

        <section className={`${CARD} mt-5 p-6`}>
          <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
            Questions Answered ({categoryScore.categoryName})
          </p>
          {answers && answers.length > 0 ? (
            <div className="mt-3 space-y-4">
              {answers.map((answer) => (
                <div key={answer.questionNumber} className="text-sm">
                  <p className="text-[#1B3A2D]">{answer.questionText}</p>
                  <p className="mt-1 text-[#6B7A72]">
                    Your answer: <span className="font-medium text-[#1B3A2D]">{answer.selectedLabel}</span>
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-[#6B7A72]">No answers found for this category.</p>
          )}
        </section>
      </main>

      <BottomNav isCoach={isCoach} />
    </div>
  );
}
