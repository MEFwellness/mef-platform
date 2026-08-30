/**
 * The Weekly Reflection's own route.
 *
 * ACCESS IS ENFORCED HERE, SERVER SIDE, not merely hidden in the UI. A
 * member nobody opened this week for, whether that is a member off the
 * program tier or a program member arriving on a Tuesday, is redirected to
 * Home before any reflection content renders. The rule that decides it is
 * the identical getMyWeeklyReflection the pop-up chain and Home's card
 * read, so a coach assignment (migration 193) opens this route by the same
 * one rule that opens the pop-up. One rule, three surfaces, no drift.
 *
 * A FINISHED WEEK IS NOT A REDIRECT. She gets a warm "this week is done"
 * screen instead of being silently bounced, because a member who taps an
 * old notification or her own back button deserves an answer rather than a
 * mystery. Which of the two screens she sees is decided inside
 * WeeklyReflectionExperience rather than here, for a reason its own header
 * states: a Server Action re-renders this route, and a branch at this
 * level made Part 3 flash past on the live run.
 *
 * THIS RENDER WRITES NOTHING. No claim, no draft row, no session. See
 * lib/weekly-reflection/data.ts's header.
 *
 * NO PAGE-LEVEL BACK BUTTON, deliberately. The experience carries its own
 * Close on every screen and its own Back between questions, and the live
 * run put a page chrome "Back to Home" directly above a closing screen
 * whose own button said "Back to home". Two near-identical ways out,
 * stacked, is noise rather than generosity.
 */

import { redirect } from 'next/navigation';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { getMyWeeklyReflection } from '@/lib/weekly-reflection/view';
import { CVS_PAGE_BG } from '@/components/core-values-snapshot/theme';
import { TrackSurfaceView } from '@/components/analytics/TrackSurfaceView';
import { WeeklyReflectionExperience } from '@/components/weekly-reflection/WeeklyReflectionExperience';

export default async function WeeklyReflectionPage() {
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const state = await getMyWeeklyReflection();
  if (!state) redirect('/dashboard');

  return (
    <div className={`${CVS_PAGE_BG} font-[family-name:var(--font-dm-sans)]`}>
      <TrackSurfaceView surface="weekly_reflection" />
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <div className="mt-4">
          {/*
            One component for both states, and the branch is inside it
            rather than here. Submitting calls a Server Action, and a
            Server Action re-renders this route: a branch at this level
            would swap the experience out for the already-done panel the
            instant the write landed, and Part 3 would flash past. See
            WeeklyReflectionExperience's own header.
          */}
          <WeeklyReflectionExperience
            status={state.status}
            offer={state.offer}
            recap={state.recap}
          />
        </div>
      </main>
    </div>
  );
}
