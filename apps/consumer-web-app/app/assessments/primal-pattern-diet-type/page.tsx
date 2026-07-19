/**
 * Primal Pattern Assessment welcome/overview screen. A literal route
 * (not the dynamic app/assessments/[questionnaireId]/ family) because
 * this questionnaire's content model genuinely differs from the
 * points-based engine those routes render — see migration 64's header
 * comment. Next.js resolves this exact literal path ahead of the dynamic
 * segment, so both families share the same /assessments/ URL space
 * without colliding. Reads only through app/actions/primal-pattern.ts.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { Clock3, ListChecks, Sparkles } from 'lucide-react';
import { getMyPrimalPatternOverview } from '@/app/actions/primal-pattern';
import { hasActiveRole } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { BackButton } from '@/components/BackButton';
import { BottomNav } from '@/components/BottomNav';
import { NutritionSafetyFlagsForm } from '@/components/health-safety/NutritionSafetyFlagsForm';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const RESULT_LABEL: Record<string, string> = {
  polar: 'Polar',
  variable: 'Variable',
  equatorial: 'Equatorial',
};

export default async function PrimalPatternOverviewPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [overview, isCoach] = await Promise.all([
    getMyPrimalPatternOverview(),
    hasActiveRole(supabase, user.id, 'coach'),
  ]);

  if (!overview) redirect('/login');

  const { copy, totalQuestions, draft, latestCompleted, safetyProfile } = overview;
  const ctaLabel = draft
    ? 'Resume assessment'
    : latestCompleted
      ? 'Retake assessment'
      : 'Begin assessment';
  const ctaHref = '/assessments/primal-pattern-diet-type/take' as Route;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/questionnaires" label="Back to Questionnaires" />

        <section className={`${CARD} mef-animate-in mt-4 p-7`}>
          <div className="flex items-center gap-2 text-[#6B7A72]">
            <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-sm font-semibold uppercase tracking-wider">
              MEF Wellness Assessment
            </p>
          </div>
          <h1 className="mt-3 font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D]">
            {copy.displayTitle}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-[#6B7A72]">{copy.welcomeSubtitle}</p>

          <div className="mt-6 flex flex-wrap gap-3">
            <div className="flex items-center gap-2 rounded-2xl bg-[#F3F6F4] px-4 py-2.5 text-sm text-[#1B3A2D]">
              <Clock3 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              About {copy.estimatedMinutes} minutes
            </div>
            <div className="flex items-center gap-2 rounded-2xl bg-[#F3F6F4] px-4 py-2.5 text-sm text-[#1B3A2D]">
              <ListChecks className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              {totalQuestions} questions
            </div>
          </div>

          {draft && (
            <p className="mt-4 text-sm text-[#1B3A2D]">
              You&apos;re {draft.answered} of {draft.total} questions in. Pick up right where you
              left off.
            </p>
          )}

          <Link
            href={ctaHref}
            className="mt-6 block rounded-2xl bg-[#1B3A2D] px-6 py-4 text-center text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025]"
          >
            {ctaLabel}
          </Link>

          <p className="mt-3 text-center text-xs text-[#6B7A72]">
            One question at a time. You can select both answers when both feel true, or skip a
            question entirely. Your progress saves automatically, so you can always finish later.
          </p>
        </section>

        {latestCompleted && (
          <Link
            href={`/assessments/primal-pattern-diet-type/results/${latestCompleted.id}` as Route}
            className={`${CARD} mef-animate-in mt-5 flex items-center justify-between gap-4 p-6 transition hover:bg-[#FAFAF8]`}
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
                Your last result
              </p>
              <p className="mt-1 text-sm text-[#1B3A2D]">
                {RESULT_LABEL[latestCompleted.result] ?? latestCompleted.result}
              </p>
            </div>
          </Link>
        )}

        <div className="mt-5">
          <NutritionSafetyFlagsForm initialProfile={safetyProfile} />
        </div>
      </main>

      <BottomNav isCoach={isCoach} />
    </div>
  );
}
