/**
 * HER OWN WEEK, RE-READ AFTER IT HAS ENDED.
 *
 * WHY IT LIVES HERE AND NOT AT /trial/week. '/trial' is a member surface,
 * so the trial lock covers it exactly like every other one and a member on
 * day 8 is redirected off it before it renders. Her recap is hers and she
 * must not lose it, so the continuation screen reads the SAME stored row at
 * an address inside the '/trial-ended' subtree, which the lock already lets
 * through because it has to. That is the smallest possible allowlist: it is
 * not a new exception at all, it is the existing one, and no entitlement
 * rule was relaxed to make this screen work.
 *
 * THE WHOLE READ PATH IS ONE ROW. getTrialArcRecap and renderTrialArcRecap,
 * the same two calls /trial/week makes. No membership tier, no entitlement,
 * no assessment registry, no trial clock, and nothing recomputed.
 *
 * TWO THINGS DIFFER FROM DAY 6, AND BOTH ARE ABOUT TELLING THE TRUTH ON THE
 * LATER DAY. The closing line no longer promises tomorrow, and tier A's
 * button into an unfinished conversation is not drawn, because that screen
 * is behind the lock and the button would loop her straight back. Both are
 * decided by the renderer's own 'after_the_week' surface, so the words stay
 * in the copy module where every other word on this screen lives.
 *
 * THIS RENDER WRITES NOTHING, and unlike /trial/week it does not even carry
 * the open beacon: the recap it shows was composed during her week, and
 * there is no composing left to do here. A member who reaches this with no
 * stored recap is simply somebody who never had one.
 */

import { redirect } from 'next/navigation';
import type { Route } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { hasActiveRole } from '@/lib/auth/guards';
import { staffHomePath } from '@/lib/auth/staffRouting';
import { getTrialArcRecap } from '@/lib/trial-arc/recapData';
import { renderTrialArcRecap } from '@/lib/trial-arc/recapCopy';
import { TRIAL_ENDED_PATH } from '@/lib/trial-ended/paths';
import { CVS_DISPLAY_FONT, CVS_PAGE_BG } from '@/components/core-values-snapshot/theme';
import { TrackSurfaceView } from '@/components/analytics/TrackSurfaceView';
import { TrialArcRecapView } from '@/components/trial-arc/TrialArcRecapView';

export const dynamic = 'force-dynamic';

/** One way out, and it goes back to the screen she came from rather than to a Home she cannot open. */
const BACK = { href: TRIAL_ENDED_PATH, label: 'Back' };

export default async function TrialEndedWeekPage() {
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const supabase = createClient();

  // This path sits outside MEMBER_ONLY_PREFIXES on purpose (the lock has to
  // let the /trial-ended subtree through), so the middleware's staff rule
  // never sees it and the page makes the same check itself.
  const [isCoach, isAdmin] = await Promise.all([
    hasActiveRole(supabase, user.id, 'coach'),
    hasActiveRole(supabase, user.id, 'platform_administrator'),
  ]);
  const staffHome = staffHomePath({ isCoach, isAdmin });
  if (staffHome) redirect(staffHome);

  const record = await getTrialArcRecap(supabase, user.id);
  const recap = record ? renderTrialArcRecap(record.plan, { surface: 'after_the_week' }) : null;

  return (
    <div className={`${CVS_PAGE_BG} font-[family-name:var(--font-dm-sans)]`}>
      <TrackSurfaceView surface="trial_arc_recap" />
      <main className="mx-auto w-full max-w-md px-5 pb-16 pt-safe-header sm:px-6 md:max-w-2xl md:px-10">
        <div className="mt-4">
          {recap && record ? (
            <TrialArcRecapView
              recap={recap}
              revealKey={`kept:${record.composedLocalDate}`}
              back={BACK}
            />
          ) : (
            <div className="mef-card p-7">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#C4A050]">
                From Root
              </p>
              <p className={`${CVS_DISPLAY_FONT} mt-2 text-2xl leading-tight text-[#1B3A2D]`}>
                Nothing stored here
              </p>
              <p className="mt-3 text-[15px] leading-relaxed text-[#1B3A2D]">
                There is no week of mine to read back to you, and I would rather say that than put
                something together after the fact.
              </p>
              <Link
                href={BACK.href as Route}
                className="mef-focus-ring mef-press mt-5 block w-full rounded-2xl border border-[#1B3A2D]/15 px-6 py-4 text-center text-sm font-semibold text-[#1B3A2D] transition hover:bg-[#F5F0E4]"
              >
                {BACK.label}
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
