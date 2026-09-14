/**
 * My Fuel Experiment.
 *
 * WHY IT LIVES UNDER FOOD LENS. The same reason My Meals does: that is
 * where her food collections already are, and a fifth bottom-nav item
 * would put an advertisement for one feature on every screen in the app.
 * It is reached from the tile in the Food Lens grid, beside My Meals.
 *
 * READ ONLY ON RENDER. Opening this page starts no run, acknowledges no
 * completion and logs no check. Every row behind it was written by a tap
 * through app/api/fuel-pattern/experiment/route.ts. A render never
 * decides anything.
 *
 * THE TAG OPTIONS HERE ARE HER SAVED MEALS, not the four cards, because
 * the four cards are not on this screen. The quick check offers what she
 * can actually see from where she is standing.
 *
 * WITH NO READING THERE IS NO EXPERIMENT. The run records the pattern it
 * is testing, so a member who has not taken the assessment is told that
 * plainly and pointed at it, rather than offered a button that cannot
 * work.
 */

import { redirect } from 'next/navigation';
import type { Route } from 'next';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { hasActiveRole } from '@/lib/auth/guards';
import { MemberBottomNav } from '@/components/MemberBottomNav';
import { MyExperimentView } from '@/components/fuel-pattern/experiment/MyExperimentView';
import {
  buildFpaExperimentPayload,
  fpaTaggableMealsFromSaves,
} from '@/lib/fuel-pattern/experiment/memberPayload';
import { FPA_MY_EXPERIMENT } from '@/lib/fuel-pattern/experiment/copy';
import { findLatestFuelPatternResult } from '@/lib/fuel-pattern/data';
import { fpaMealById } from '@/lib/fuel-pattern/meals/library';
import { FPA_ROUTE } from '@/lib/fuel-pattern/constants';
import { CVS_DISPLAY_FONT, CVS_PAGE_BG } from '@/components/core-values-snapshot/theme';

export default async function MyExperimentPage() {
  const user = await getCachedUser();
  if (!user) redirect('/login');
  const supabase = createClient();

  const [latest, isCoach, taggableMeals] = await Promise.all([
    findLatestFuelPatternResult(supabase, user.id),
    hasActiveRole(supabase, user.id, 'coach'),
    fpaTaggableMealsFromSaves(supabase, user.id),
  ]);

  const payload = await buildFpaExperimentPayload(supabase, user.id, { taggableMeals });

  // Every meal she has ever tagged, by name, so a logged check can say
  // which one it followed without the client reaching into the library.
  const mealNames: Record<string, string> = {};
  for (const check of payload.run?.checks ?? []) {
    if (!check.mealId) continue;
    const meal = fpaMealById(check.mealId);
    if (meal) mealNames[meal.id] = meal.name;
  }

  return (
    <div className={`${CVS_PAGE_BG} font-[family-name:var(--font-dm-sans)]`}>
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <Link
          href={'/food-lens' as Route}
          className="mef-focus-ring inline-flex items-center gap-1 text-sm font-medium text-[#6B7A72] hover:text-[#1B3A2D]"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          {FPA_MY_EXPERIMENT.back}
        </Link>

        <h1 className={`${CVS_DISPLAY_FONT} mt-5 text-[34px] leading-tight text-[#1B3A2D]`}>
          {FPA_MY_EXPERIMENT.title}
        </h1>
        <p className="mt-2 text-[15px] leading-[1.7] text-[#3F5B50]">{FPA_MY_EXPERIMENT.lead}</p>

        <div className="mt-6">
          {latest ? (
            <MyExperimentView payload={payload} mealNames={mealNames} />
          ) : (
            <section className="rounded-[28px] border border-[#1B3A2D]/8 bg-[#FFFDF8] p-6 sm:p-7">
              <p className="text-[15px] leading-[1.7] text-[#1B3A2D]" data-fpa-digits>
                {FPA_MY_EXPERIMENT.noReading}
              </p>
              <Link
                href={FPA_ROUTE as Route}
                className="mef-focus-ring mef-press mt-5 flex items-center justify-between rounded-2xl border border-[#1B3A2D]/10 bg-[#F7F3EA] px-5 py-4 text-[14px] font-semibold text-[#1B3A2D] transition hover:border-[#C4A050]/50"
              >
                {FPA_MY_EXPERIMENT.noReadingLink}
                <ChevronRight
                  className="h-4 w-4 text-[#9AA79F]"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </Link>
            </section>
          )}
        </div>
      </main>
      <MemberBottomNav isCoach={isCoach} />
    </div>
  );
}
