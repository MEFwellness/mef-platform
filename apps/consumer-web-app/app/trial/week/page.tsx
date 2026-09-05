/**
 * DAY 6, "What This Week Showed", the route.
 *
 * THE WHOLE READ PATH IS ONE ROW. This page reads her stored recap and
 * renders it. It does not ask her membership tier, her entitlement, the
 * assessment registry, the trial clock or the arc's own eligibility, and it
 * recomputes nothing: the recap was composed once, when day 6 genuinely
 * reached her, and it says the same thing today that it said then.
 *
 * That is not tidiness, it is the requirement the next prompt depends on.
 * The post-trial continuation screen shows this same recap after her trial
 * has ended, when the plan gate and the registry would answer no to almost
 * everything, and it renders it through exactly these two calls:
 * getTrialArcRecap and renderTrialArcRecap.
 *
 * THIS RENDER WRITES NOTHING. Not the recap, not the open stamp, not a
 * receipt. A page render must not decide anything, and Next prefetches a
 * <Link> when it scrolls into view, so a render-time compose would build a
 * recap for a member who only ever hovered a link. Both writes belong to
 * OpenTrialArcRecap, a mounted effect on this screen, through the analytics
 * beacon route.
 *
 * NO RECAP IS A REAL STATE, NOT AN ERROR. She can arrive here in the second
 * before the pop-up's own beacon has landed, so the honest thing on that
 * render is to say the week is being put together and let the mounted
 * effect compose it and refresh. A member who is genuinely not owed one (a
 * typed URL from an account outside the arc) sees the same quiet screen and
 * a way back, rather than a redirect that would look like a broken link.
 *
 * WHO CAN REACH IT. Member surfaces only: '/trial' is in
 * MEMBER_ONLY_PREFIXES, so a coach or an administrator who taps an old link
 * is sent to their own dashboard, and the trial lock covers it like every
 * other member screen.
 */

import { redirect } from 'next/navigation';
import type { Route } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { getTrialArcRecap } from '@/lib/trial-arc/recapData';
import { renderTrialArcRecap } from '@/lib/trial-arc/recapCopy';
import { CVS_DISPLAY_FONT, CVS_PAGE_BG } from '@/components/core-values-snapshot/theme';
import { TrackSurfaceView } from '@/components/analytics/TrackSurfaceView';
import { OpenTrialArcRecap } from '@/components/trial-arc/OpenTrialArcRecap';
import { TrialArcRecapView } from '@/components/trial-arc/TrialArcRecapView';

export const dynamic = 'force-dynamic';

export default async function TrialWeekRecapPage() {
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const supabase = createClient();
  const record = await getTrialArcRecap(supabase, user.id);
  const recap = record ? renderTrialArcRecap(record.plan) : null;

  return (
    <div className={`${CVS_PAGE_BG} font-[family-name:var(--font-dm-sans)]`}>
      <TrackSurfaceView surface="trial_arc_recap" />
      <OpenTrialArcRecap hasRecap={record !== null} />
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <div className="mt-4">
          {recap && record ? (
            // The composed date scopes the reveal, so re-reading her own
            // week is instant rather than a replayed animation.
            <TrialArcRecapView recap={recap} revealKey={record.composedLocalDate} />
          ) : (
            <div className="mef-card p-7">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#C4A050]">
                From Root
              </p>
              <p className={`${CVS_DISPLAY_FONT} mt-2 text-2xl leading-tight text-[#1B3A2D]`}>
                Putting your week together
              </p>
              <p className="mt-3 text-[15px] leading-relaxed text-[#1B3A2D]">
                This is where I read your week back to you. If it is not here in a moment, there is
                nothing waiting on this screen yet, and Home is where everything else is.
              </p>
              <Link
                href={'/dashboard' as Route}
                className="mef-focus-ring mef-press mt-5 block w-full rounded-2xl border border-[#1B3A2D]/15 px-6 py-4 text-center text-sm font-semibold text-[#1B3A2D] transition hover:bg-[#F5F0E4]"
              >
                Back to Home
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
