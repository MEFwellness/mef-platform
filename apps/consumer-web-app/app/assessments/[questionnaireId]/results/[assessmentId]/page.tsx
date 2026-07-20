/**
 * Results dashboard — the premium replacement for the paper score sheet.
 * Overall ring, radar comparison across every category, one category card
 * per category (score, priority, brief educational copy, view-details
 * link), and a deterministic wellness summary. Reads only through
 * app/actions/assessments.ts; the scoring itself already happened once,
 * server-side, at completion — this page only ever displays
 * already-computed, already-verified numbers.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { notFound, redirect } from 'next/navigation';
import { History, ShieldCheck, Sparkles } from 'lucide-react';
import { getMyAssessmentResult } from '@/app/actions/assessments';
import { fromPublicSlug, toPublicSlug } from '@/lib/assessments/publicSlug';
import { hasActiveRole } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { BackButton } from '@/components/BackButton';
import { BottomNav } from '@/components/BottomNav';
import { ScoreRing } from '@/components/assessments/ScoreRing';
import { CategoryRadarChart, type RadarDatum } from '@/components/assessments/CategoryRadarChart';
import { CategoryCard } from '@/components/assessments/CategoryCard';
import { PriorityBadge } from '@/components/assessments/PriorityBadge';
import { ASSESSMENT_SAFETY_STATEMENT } from '@/lib/assessments/insights';
import { formatAssessmentDate } from '@/lib/assessments/presentation';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

export default async function AssessmentResultsPage({
  params,
}: {
  params: { questionnaireId: string; assessmentId: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [view, isCoach] = await Promise.all([
    getMyAssessmentResult(fromPublicSlug(params.questionnaireId), params.assessmentId),
    hasActiveRole(supabase, user.id, 'coach'),
  ]);

  if (!view) notFound();

  const { result, questionnaire, copy, insight } = view;
  const orderedScores = [...result.categoryScores].sort((a, b) => {
    const orderA = questionnaire.categories.find((c) => c.id === a.categoryId)?.order ?? 0;
    const orderB = questionnaire.categories.find((c) => c.id === b.categoryId)?.order ?? 0;
    return orderA - orderB;
  });

  const radarPoints: RadarDatum[] = orderedScores.map((c) => ({
    categoryId: c.categoryId,
    label: copy.categoryCopy[c.categoryId]?.shortLabel ?? c.categoryName,
    score: c.score,
    maxScore: c.maxScore,
    priority: c.priority,
  }));

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-3xl md:px-10 md:pb-16 md:pl-28">
        <BackButton
          fallbackHref={`/assessments/${toPublicSlug(questionnaire.id)}` as Route}
          label="Back"
        />

        <div className="mt-4 flex items-center gap-2 text-[#6B7A72]">
          <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">
            Overall Wellness Assessment
          </p>
        </div>

        {/* Hero: overall score ring */}
        <section className={`${CARD} mef-animate-in mt-3 p-7`}>
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
            <ScoreRing
              score={result.record.totalScore!}
              maxScore={result.record.totalMaxScore!}
              priority={result.record.totalPriority!}
            />
            <div className="min-w-0 flex-1 text-center sm:text-left">
              <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <PriorityBadge priority={result.record.totalPriority!} />
                <span className="text-xs text-[#6B7A72]">
                  Completed {formatAssessmentDate(result.record.completedAt!)}
                </span>
              </div>
              <h1 className="mt-3 font-[family-name:var(--font-cormorant-garamond)] text-2xl leading-tight text-[#1B3A2D]">
                {insight.headline}
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-[#1B3A2D]">{insight.summary}</p>
            </div>
          </div>
        </section>

        {/* Radar comparison */}
        <section className={`${CARD} mt-5 p-6`}>
          <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
            Category Comparison
          </p>
          <CategoryRadarChart points={radarPoints} />
        </section>

        {/* Category cards */}
        <section className="mt-5">
          <p className="px-1 text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
            Your Categories
          </p>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {orderedScores.map((c) => (
              <CategoryCard
                key={c.categoryId}
                href={
                  `/assessments/${toPublicSlug(questionnaire.id)}/results/${result.record.id}/category/${c.categoryId}` as Route
                }
                name={c.categoryName}
                score={c.score}
                maxScore={c.maxScore}
                priority={c.priority}
                description={copy.categoryCopy[c.categoryId]?.shortDescription ?? ''}
              />
            ))}
          </div>
        </section>

        <Link
          href={`/assessments/${toPublicSlug(questionnaire.id)}/history` as Route}
          className={`${CARD} mef-animate-in mt-5 flex items-center justify-between p-6 transition hover:bg-[#FAFAF8]`}
        >
          <div className="flex items-center gap-2 text-[#6B7A72]">
            <History className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-sm font-semibold uppercase tracking-wider">
              Assessment history &amp; comparison
            </p>
          </div>
        </Link>

        <section className="mt-6 flex items-start gap-3 px-1">
          <ShieldCheck
            className="mt-0.5 h-4 w-4 shrink-0 text-[#6B7A72]"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <p className="text-xs leading-relaxed text-[#6B7A72]">{ASSESSMENT_SAFETY_STATEMENT}</p>
        </section>
      </main>

      <BottomNav isCoach={isCoach} />
    </div>
  );
}
