/**
 * DAY 7, "Your 7-Day Reset", the route.
 *
 * THE WHOLE READ PATH IS ONE ROW AND TWO ENVIRONMENT VARIABLES. This page
 * reads her stored close and renders it. It does not ask her membership
 * tier, her entitlement, the assessment registry, the trial clock or the
 * arc's own eligibility, and it recomputes nothing: the close was composed
 * once, when day 7 genuinely reached her, and it says the same thing today
 * that it said then.
 *
 * That is not tidiness, it is the requirement Prompt 6 depends on. The
 * post-trial continuation screen shows this same close after her trial has
 * ended, when the plan gate and the registry would answer no to almost
 * everything, and it renders it through exactly these two calls:
 * getTrialArcClose and renderTrialArcClose.
 *
 * THE DOOR ADDRESSES ARE RESOLVED HERE, NOT STORED. A stored URL is a URL
 * that goes stale. lib/config/conversionLinks.ts is read on the server on
 * every render and the two addresses are handed to the renderer, so a
 * booking link changed in Vercel, or a membership page set for the first
 * time, changes a close composed last week with no migration. A door whose
 * address is null is not drawn at all, which is why there is no placeholder
 * href anywhere on this screen.
 *
 * THIS RENDER WRITES NOTHING. Not the close, not the open stamp, not a
 * receipt, not a door. A page render must not decide anything, and Next
 * prefetches a <Link> when it scrolls into view, so a render-time compose
 * would build a close for a member who only ever hovered a link. Both
 * writes belong to OpenTrialArcClose, a mounted effect on this screen, and
 * to the doors she actually presses.
 *
 * NO CLOSE IS A REAL STATE, NOT AN ERROR. She can arrive here in the second
 * before the pop-up's own beacon has landed, so the honest thing on that
 * render is to say it is being put together and let the mounted effect
 * compose it and refresh. A member who is genuinely not owed one (a typed
 * URL from an account outside the arc) sees the same quiet screen and a way
 * back, rather than a redirect that would look like a broken link.
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
import { conversionLinks } from '@/lib/config/conversionLinks';
import { getTrialArcClose } from '@/lib/trial-arc/closeData';
import { renderTrialArcClose } from '@/lib/trial-arc/closeCopy';
import { CVS_DISPLAY_FONT, CVS_PAGE_BG } from '@/components/core-values-snapshot/theme';
import { TrackSurfaceView } from '@/components/analytics/TrackSurfaceView';
import { OpenTrialArcClose } from '@/components/trial-arc/OpenTrialArcClose';
import { TrialArcCloseView } from '@/components/trial-arc/TrialArcCloseView';

export const dynamic = 'force-dynamic';

export default async function TrialCloseScreenPage() {
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const supabase = createClient();
  const record = await getTrialArcClose(supabase, user.id);
  const close = record ? renderTrialArcClose(record.plan, conversionLinks()) : null;

  return (
    <div className={`${CVS_PAGE_BG} font-[family-name:var(--font-dm-sans)]`}>
      <TrackSurfaceView surface="trial_arc_close" />
      <OpenTrialArcClose hasClose={record !== null} />
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <div className="mt-4">
          {close && record ? (
            // The composed date scopes the reveal, so re-reading her own
            // close is instant rather than a replayed animation.
            <TrialArcCloseView close={close} revealKey={record.composedLocalDate} />
          ) : (
            <div className="mef-card p-7">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#C4A050]">
                From Root
              </p>
              <p className={`${CVS_DISPLAY_FONT} mt-2 text-2xl leading-tight text-[#1B3A2D]`}>
                Putting this together
              </p>
              <p className="mt-3 text-[15px] leading-relaxed text-[#1B3A2D]">
                This is where I tell you what I would work on next. If it is not here in a moment,
                there is nothing waiting on this screen yet, and Home is where everything else is.
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
