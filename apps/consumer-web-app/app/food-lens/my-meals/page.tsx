/**
 * My Meals, her own collection.
 *
 * WHY IT LIVES UNDER FOOD LENS. That is where her food collections
 * already are: the food log, the pantry, her allergies and preferences.
 * Adding a fifth bottom-nav item for one collection would make the bar on
 * every screen in the app carry an advertisement for this feature, which
 * is the trade Home's structural pass already decided against. So it is a
 * tile in the Food Lens grid and a link at the foot of her meal cards,
 * and it is reachable from both.
 *
 * READ ONLY ON RENDER. The saves were written by taps on a Save button.
 * Nothing here inserts, claims or schedules anything.
 *
 * HER CURRENT PATTERN IS READ ONLY TO DECIDE WHICH CARDS CARRY A LABEL.
 * A meal saved under a reading she no longer holds stays saved and says
 * where it came from; a meal saved under her current one says nothing,
 * because there is nothing worth saying.
 */

import { redirect } from 'next/navigation';
import type { Route } from 'next';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { hasActiveRole } from '@/lib/auth/guards';
import { MemberBottomNav } from '@/components/MemberBottomNav';
import { SavedMealsView } from '@/components/fuel-pattern/meals/SavedMealsView';
import { buildFpaSavedMeals } from '@/lib/fuel-pattern/meals/memberPayload';
import { findLatestFuelPatternResult } from '@/lib/fuel-pattern/data';
import { FPA_MY_MEALS } from '@/lib/fuel-pattern/meals/copy';
import { CVS_DISPLAY_FONT, CVS_PAGE_BG } from '@/components/core-values-snapshot/theme';

export default async function MyMealsPage() {
  const user = await getCachedUser();
  if (!user) redirect('/login');
  const supabase = createClient();

  const [latest, isCoach] = await Promise.all([
    findLatestFuelPatternResult(supabase, user.id),
    hasActiveRole(supabase, user.id, 'coach'),
  ]);

  const entries = await buildFpaSavedMeals(supabase, user.id, latest?.pattern ?? null);

  return (
    <div className={`${CVS_PAGE_BG} font-[family-name:var(--font-dm-sans)]`}>
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <Link
          href={'/food-lens' as Route}
          className="mef-focus-ring inline-flex items-center gap-1 text-sm font-medium text-[#6B7A72] hover:text-[#1B3A2D]"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Back to Food Lens
        </Link>

        <h1 className={`${CVS_DISPLAY_FONT} mt-5 text-[34px] leading-tight text-[#1B3A2D]`}>
          {FPA_MY_MEALS.title}
        </h1>
        <p className="mt-2 text-[15px] leading-[1.7] text-[#3F5B50]">{FPA_MY_MEALS.lead}</p>

        <div className="mt-6">
          <SavedMealsView entries={entries} />
        </div>
      </main>
      <MemberBottomNav isCoach={isCoach} />
    </div>
  );
}
