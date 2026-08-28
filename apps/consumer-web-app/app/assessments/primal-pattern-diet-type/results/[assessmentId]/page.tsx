/**
 * Premium Primal Pattern results dashboard (Prompt 2). Composes the Hero
 * Result Card, Visual Fuel Balance, Daily Plate Guide, Hand Portion
 * Guide, Meal Examples, Education, and Next Steps around the already-
 * computed record from Prompt 1's engine (app/actions/primal-pattern.ts,
 * lib/primal-pattern/store.ts) — nothing here recomputes a score, and the
 * Nutrition Intelligence Service (lib/nutrition-intelligence/service.ts)
 * is only ever *read* (for its mealFrequency guidance, to open the Daily
 * Plate Guide on a sensible default), never modified. See
 * lib/primal-pattern/premium/content.ts for the presentation-layer
 * config every section below reads through.
 *
 * The "For practitioner reference." line remains the only attribution
 * surface, small and at the very bottom, unchanged from Prompt 1.
 */

import { redirect, notFound } from 'next/navigation';
import { getMyPrimalPatternResult } from '@/app/actions/primal-pattern';
import { getMemberNutritionProfile } from '@/lib/nutrition-intelligence/service';
import { hasActiveRole } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { BackButton } from '@/components/BackButton';
import { MemberBottomNav } from '@/components/MemberBottomNav';
import { HeroResultCard } from '@/components/primal-pattern/results/HeroResultCard';
import { FuelBalanceVisual } from '@/components/primal-pattern/results/FuelBalanceVisual';
import { DailyPlateGuide } from '@/components/primal-pattern/results/DailyPlateGuide';
import { HandPortionGuide } from '@/components/primal-pattern/results/HandPortionGuide';
import { MealExampleCards } from '@/components/primal-pattern/results/MealExampleCards';
import { EducationAccordion } from '@/components/primal-pattern/results/EducationAccordion';
import { NextStepsCards } from '@/components/primal-pattern/results/NextStepsCards';
import {
  FUEL_BALANCE_BY_RESULT,
  MEAL_EXAMPLES_BY_RESULT,
  defaultMealFrequencyFor,
} from '@/lib/primal-pattern/premium/content';
import { KeyFindingReveal } from '@/components/closing-screen/KeyFindingReveal';
import { getCachedUser } from '@/lib/supabase/currentUser';

const STAT_CARD = 'rounded-2xl bg-[#F3F6F4] p-4 text-center';

export default async function PrimalPatternResultsPage({
  params,
}: {
  params: { assessmentId: string };
}) {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const [view, isCoach, nutritionProfile] = await Promise.all([
    getMyPrimalPatternResult(params.assessmentId),
    hasActiveRole(supabase, user.id, 'coach'),
    getMemberNutritionProfile(supabase, user.id),
  ]);

  if (!view) notFound();

  const { record, copy } = view;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-3xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/assessments/primal-pattern-diet-type" label="Back" />

        {/* Progressive Reveal Engine (Prompt 3, requirement 6): the actual diet-type finding, so it lands with a quiet beat of anticipation rather than instantly, first-time-only, instant on every revisit. */}
        <div className="mt-4">
          <KeyFindingReveal
            storageKey={`primal-pattern-close:${params.assessmentId}`}
            thinkingText="Looking at your answers..."
          >
            <HeroResultCard
              displayTitle={copy.displayTitle}
              result={record.result}
              completedAt={record.completedAt}
            />
          </KeyFindingReveal>
        </div>

        <section
          className="mef-animate-in mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"
          style={{ animationDelay: '80ms' }}
        >
          <div className={STAT_CARD}>
            <p className="text-2xl font-semibold text-[#1B3A2D]">{record.aCount}</p>
            <p className="mt-1 text-xs text-[#6B7A72]">A answers</p>
          </div>
          <div className={STAT_CARD}>
            <p className="text-2xl font-semibold text-[#1B3A2D]">{record.bCount}</p>
            <p className="mt-1 text-xs text-[#6B7A72]">B answers</p>
          </div>
          <div className={STAT_CARD}>
            <p className="text-2xl font-semibold text-[#1B3A2D]">{record.bothCount}</p>
            <p className="mt-1 text-xs text-[#6B7A72]">Both selected</p>
          </div>
          <div className={STAT_CARD}>
            <p className="text-2xl font-semibold text-[#1B3A2D]">{record.skippedCount}</p>
            <p className="mt-1 text-xs text-[#6B7A72]">Skipped</p>
          </div>
        </section>

        {record.result && (
          <div className="mt-5 space-y-5">
            <div className="mef-animate-in" style={{ animationDelay: '140ms' }}>
              <FuelBalanceVisual balance={FUEL_BALANCE_BY_RESULT[record.result]} />
            </div>
            <div className="mef-animate-in" style={{ animationDelay: '200ms' }}>
              <DailyPlateGuide
                defaultFrequency={defaultMealFrequencyFor(nutritionProfile.mealFrequency)}
              />
            </div>
            <div className="mef-animate-in" style={{ animationDelay: '260ms' }}>
              <HandPortionGuide />
            </div>
            <div className="mef-animate-in" style={{ animationDelay: '320ms' }}>
              <MealExampleCards meals={MEAL_EXAMPLES_BY_RESULT[record.result]} />
            </div>
            <div className="mef-animate-in" style={{ animationDelay: '380ms' }}>
              <EducationAccordion />
            </div>
            <div className="mef-animate-in" style={{ animationDelay: '440ms' }}>
              <NextStepsCards />
            </div>
          </div>
        )}

        <p className="mt-6 text-center text-[11px] leading-relaxed text-[#6B7A72]/70">
          {copy.practitionerFooter}
        </p>
      </main>

      <MemberBottomNav isCoach={isCoach} />
    </div>
  );
}
