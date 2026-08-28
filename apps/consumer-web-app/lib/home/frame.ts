/**
 * THE HOME FRAME: the small set of facts the first paint needs, read once.
 *
 * WHY THIS EXISTS. Home used to await nineteen things in two batches before
 * it returned a single tag of JSX, so nothing at all reached her until the
 * slowest of them finished. Her greeting took five to eight seconds on
 * production, and the page did not settle for thirteen to twenty-two,
 * because roughly twenty cards were each making their own round trips
 * inside one blocking render.
 *
 * The page is now written the other way round: this frame is the only thing
 * awaited before the shell is flushed, and everything else arrives after it
 * inside its own Suspense boundary. So this file has one job, and the job
 * has a budget: **who she is, what her clock says, and enough to draw the
 * hero at its real height.** Nothing that a card wants goes in here.
 *
 * Three round trips, two of them in parallel:
 *   1. her session (request-memoized, shared with every action on the page)
 *   2. her `profiles` row, name and timezone together (memberProfileCore)
 *   3. whether she has ever logged a day, as a count, no rows
 * plus the coach-role RPC the bottom navigation needs to draw itself.
 *
 * WHY THE CHECK-IN COUNT IS IN HERE AND THE SCORE IS NOT. The hero is two
 * different heights: a short band before her first check-in, and a tall one
 * after. That is a geometry decision, so it has to be made before anything
 * paints or the page jumps when the score lands. Her actual score is
 * content inside that fixed box and can arrive later without moving
 * anything.
 *
 * Request-memoized, so the shell and every boundary below it read the same
 * object rather than resolving her twice.
 */
import { redirect } from 'next/navigation';
import { getRequestClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { requestCache } from '@/lib/reactRequestCache';
import { memberProfileCore } from '@/lib/member/profileCore';
import { FALLBACK_TIMEZONE } from '@/lib/time/memberToday';
import { nowInTimezone, toLocalDateString } from '@/lib/time/localDate';
import { timeContextInTimezone, type TimeContext } from '@/lib/feed/timeContext';
import { firstNameFrom } from '@/lib/profile/greeting';
import { hasActiveRole } from '@/lib/auth/guards';
import { getDailyPriority } from '@/lib/priority/data';

export type HomeFrame = {
  memberId: string;
  /** Exactly as she typed it, or null when she has no name on file. */
  firstName: string | null;
  timezone: string;
  /** Her own calendar day, decided on the server and handed down as a prop. */
  localDate: string;
  timeContext: TimeContext;
  /** Whether she has ever completed a check-in. Decides the hero's height, nothing else. */
  hasCheckins: boolean;
  /** The bottom navigation's own question, and the only role check on this page. */
  isCoach: boolean;
  /**
   * Whether the dominant slot at the top of Home is going to hold the
   * Priority Card, so the shell can reserve exactly that shape rather than
   * reserving nothing and letting the card shove the page down when it
   * lands, or reserving a card for a member who has already finished hers.
   *
   * It is a PREDICTION, not the decision: the decision is still
   * `getMyPriorityView`'s, in its own boundary. Today's stored row answers
   * it exactly whenever the engine has already run today, and when it has
   * not run yet the answer is "a card is coming", which is what claiming a
   * fresh row produces on all but a genuine engine miss.
   */
  expectPriorityCard: boolean;
};

export const getHomeFrame = requestCache(async (): Promise<HomeFrame | null> => {
  const supabase = getRequestClient();
  const user = await getCachedUser();
  if (!user) return null;

  const [profile, loggedDayCount, isCoach] = await Promise.all([
    memberProfileCore(supabase, user.id),
    // A count, not the rows: the trend chart's thirty days are a different
    // question and belong to the boundary that draws the chart.
    supabase
      .from('daily_checkins_current')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id),
    hasActiveRole(supabase, user.id, 'coach'),
  ]);

  const timezone = profile.timezone ?? FALLBACK_TIMEZONE;
  const nowInTz = nowInTimezone(timezone);
  const localDate = toLocalDateString(nowInTz);

  // Deliberately the plain reader and not `getMyStoredPriority`: that one is
  // request-memoized, and memoizing a "no row yet" answer here would hand
  // the same null to every later reader in this request, after the engine
  // had claimed a real row a moment afterwards.
  const storedPriority = await getDailyPriority(supabase, user.id, localDate);

  return {
    memberId: user.id,
    firstName: firstNameFrom(profile.displayName),
    timezone,
    localDate,
    timeContext: timeContextInTimezone(timezone),
    hasCheckins: (loggedDayCount.count ?? 0) > 0,
    isCoach,
    expectPriorityCard: storedPriority === null || storedPriority.status === 'active',
  };
});

/** The frame, or the login page. Every boundary on Home calls this rather than re-deciding what to do about a signed-out visitor. */
export async function requireHomeFrame(): Promise<HomeFrame> {
  const frame = await getHomeFrame();
  if (!frame) redirect('/login');
  return frame;
}
