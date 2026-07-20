/**
 * Premium Four Doctors results dashboard. A static route
 * (app/assessments/four-doctors/results/[assessmentId]/) that Next.js
 * resolves ahead of the generic dynamic
 * app/assessments/[questionnaireId]/results/[assessmentId]/ route for
 * this one exact path, same "static segment wins over dynamic sibling"
 * pattern already proven by app/assessments/primal-pattern-diet-type/. So
 * every other registered questionnaire keeps using the generic results
 * page untouched, and removing this entire directory would simply fall
 * back to that generic page for Four Doctors, never break anything else.
 *
 * Reads only through the existing, unmodified getMyAssessmentResult()
 * (app/actions/assessments.ts) — no new server action, no new query, no
 * change to scoring. Every zone color, guidance sentence, and next-step
 * card comes from lib/assessments/four-doctors/premium/*, this page only
 * composes them.
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Route } from 'next';
import { ChevronRight, History, ShieldCheck } from 'lucide-react';
import { getMyAssessmentResult } from '@/app/actions/assessments';
import { hasActiveRole } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { resolveMembershipKey } from '@/lib/assessment-registry/membership';
import { BackButton } from '@/components/BackButton';
import { BottomNav } from '@/components/BottomNav';
import { ASSESSMENT_SAFETY_STATEMENT } from '@/lib/assessments/insights';
import { HealthSnapshotHero } from '@/components/assessments/four-doctors-results/HealthSnapshotHero';
import { BalanceOverview } from '@/components/assessments/four-doctors-results/BalanceOverview';
import { DoctorSummaryCards } from '@/components/assessments/four-doctors-results/DoctorSummaryCards';
import { ZoneLegend } from '@/components/assessments/four-doctors-results/ZoneLegend';
import { NextStepsCards } from '@/components/assessments/four-doctors-results/NextStepsCards';
import { FreeTierSummary } from '@/components/assessments/four-doctors-results/FreeTierSummary';

const QUESTIONNAIRE_ID = 'four-doctors';

export default async function FourDoctorsResultsPage({
  params,
}: {
  params: { assessmentId: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [view, isCoach, { data: profile }] = await Promise.all([
    getMyAssessmentResult(QUESTIONNAIRE_ID, params.assessmentId),
    hasActiveRole(supabase, user.id, 'coach'),
    supabase.from('profiles').select('membership_tier').eq('id', user.id).single(),
  ]);

  if (!view) notFound();

  const { result, questionnaire, copy } = view;
  const membershipKey = resolveMembershipKey(profile?.membership_tier ?? null);
  const isFreeTier = membershipKey === 'free_trial';

  // Same category-order guarantee the generic results page enforces:
  // DB row order isn't guaranteed, so sort explicitly by the config's own order.
  const orderedCategories = [...result.categoryScores].sort((a, b) => {
    const orderA = questionnaire.categories.find((c) => c.id === a.categoryId)?.order ?? 0;
    const orderB = questionnaire.categories.find((c) => c.id === b.categoryId)?.order ?? 0;
    return orderA - orderB;
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-3xl md:px-10 md:pb-16 md:pl-28 lg:max-w-4xl">
        <BackButton
          fallbackHref={`/assessments/${QUESTIONNAIRE_ID}` as Route}
          label="Back"
          forceFallback
        />

        <h1 className="sr-only">{copy.displayTitle} results</h1>

        <div className="mt-4 space-y-6">
          <HealthSnapshotHero
            categories={orderedCategories}
            totalScore={result.record.totalScore!}
            totalMaxScore={result.record.totalMaxScore!}
            totalPriority={result.record.totalPriority!}
            completedAt={result.record.completedAt!}
          />

          {isFreeTier ? (
            <div className="mef-animate-in" style={{ animationDelay: '80ms' }}>
              <FreeTierSummary categories={orderedCategories} copy={copy} />
            </div>
          ) : (
            <>
              <div className="mef-animate-in" style={{ animationDelay: '80ms' }}>
                <BalanceOverview categories={orderedCategories} />
              </div>

              <div className="mef-animate-in" style={{ animationDelay: '140ms' }}>
                <DoctorSummaryCards categories={orderedCategories} copy={copy} />
              </div>

              <div className="mef-animate-in" style={{ animationDelay: '200ms' }}>
                <ZoneLegend />
              </div>

              <div className="mef-animate-in" style={{ animationDelay: '260ms' }}>
                <NextStepsCards />
              </div>

              <Link
                href={`/assessments/${QUESTIONNAIRE_ID}/history` as Route}
                className="mef-animate-in mef-focus-ring flex items-center justify-between rounded-[28px] bg-white p-6 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)] transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_10px_32px_-8px_rgba(27,58,45,0.18)]"
                style={{ animationDelay: '320ms' }}
              >
                <div className="flex items-center gap-2.5 text-[#1B3A2D]">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#EFF6F1]">
                    <History className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  <p className="text-sm font-semibold uppercase tracking-wider">
                    Assessment history &amp; comparison
                  </p>
                </div>
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-[#6B7A72]"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </Link>
            </>
          )}
        </div>

        <section className="mt-7 flex items-start gap-3 px-1">
          <ShieldCheck
            className="mt-0.5 h-4 w-4 shrink-0 text-[#6B7A72]"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <p className="text-xs leading-relaxed text-[#6B7A72]">{ASSESSMENT_SAFETY_STATEMENT}</p>
        </section>

        {copy.attribution && (
          <p className="mt-4 px-1 text-center text-[11px] leading-relaxed text-[#6B7A72]/70">
            {copy.attribution}
          </p>
        )}
      </main>

      <BottomNav isCoach={isCoach} />
    </div>
  );
}
