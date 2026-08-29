/**
 * The Weekly Reflection's own route.
 *
 * ACCESS IS ENFORCED HERE, SERVER SIDE, not merely hidden in the UI. A
 * member who is not on the program tier, or who arrives on a Tuesday, is
 * redirected to Home before any reflection content renders, and the rule
 * that decides it is the identical getMyWeeklyReflection the pop-up chain
 * and Home's card read. One rule, three surfaces, no drift.
 *
 * A FINISHED WEEK IS NOT A REDIRECT. She gets a warm "this week is done"
 * screen instead of being silently bounced, because a member who taps an
 * old notification or her own back button deserves an answer rather than a
 * mystery. It is also what step 4 of the live check reads: the experience
 * does not come back, and it says so.
 *
 * THIS RENDER WRITES NOTHING. No claim, no draft row, no session. See
 * lib/weekly-reflection/data.ts's header.
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { getMyWeeklyReflection } from '@/lib/weekly-reflection/view';
import { CVS_PAGE_BG } from '@/components/core-values-snapshot/theme';
import { BackButton } from '@/components/BackButton';
import { TrackSurfaceView } from '@/components/analytics/TrackSurfaceView';
import { WeeklyReflectionExperience } from '@/components/weekly-reflection/WeeklyReflectionExperience';
import { WEEKLY_REFLECTION_COPY, WEEKLY_REFLECTION_LABEL } from '@/lib/weekly-reflection/copy';

export default async function WeeklyReflectionPage() {
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const state = await getMyWeeklyReflection();
  if (!state) redirect('/dashboard');

  return (
    <div className={`${CVS_PAGE_BG} font-[family-name:var(--font-dm-sans)]`}>
      <TrackSurfaceView surface="weekly_reflection" />
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/dashboard" label="Back to Home" forceFallback />
        <h1 className="sr-only">{WEEKLY_REFLECTION_LABEL}</h1>

        <div className="mt-4">
          {state.status === 'pending' ? (
            <WeeklyReflectionExperience recap={state.recap} />
          ) : (
            <section className="relative overflow-hidden rounded-[28px] bg-[#1B3A2D] p-7 text-[#F5F0E4] shadow-[0_32px_80px_-16px_rgba(14,31,23,0.35)]">
              <div
                className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#C4A050]/16 blur-3xl"
                aria-hidden="true"
              />
              <p className="relative text-[11px] font-semibold uppercase tracking-wider text-[#C4A050]">
                {WEEKLY_REFLECTION_LABEL}
              </p>
              <h2 className="relative mt-3 font-[family-name:var(--font-cormorant-garamond)] text-[30px] leading-tight text-[#F5F0E4]">
                {WEEKLY_REFLECTION_COPY.alreadyDoneHeading}
              </h2>
              <p className="relative mt-4 text-[16px] leading-relaxed text-[#F5F0E4]/90">
                {WEEKLY_REFLECTION_COPY.alreadyDoneBody}
              </p>
              <Link
                href="/dashboard"
                className="mef-focus-ring mef-press relative mt-7 inline-flex w-full items-center justify-center rounded-2xl bg-[#F5F0E4] px-6 py-3.5 text-sm font-semibold text-[#1B3A2D] transition hover:brightness-95"
              >
                {WEEKLY_REFLECTION_COPY.closingDone}
              </Link>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
