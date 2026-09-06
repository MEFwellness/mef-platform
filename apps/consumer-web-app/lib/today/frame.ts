/**
 * THE TODAY FRAME: the handful of facts Today's first paint needs.
 *
 * Exactly the same idea, and the same budget, as lib/home/frame.ts, written
 * for the same reason (performance and stability audit, 2026-09-06).
 *
 * Today awaited five stages of reads before it returned a single tag of
 * JSX: a batch of eight, then her local date, then her hydration answer,
 * then a batch of six, then the Priority Card's own engine. Measured on
 * production, the first byte of real content arrived 2.87 seconds after the
 * tap, and until then the screen held the generic route skeleton. Nothing
 * streams past an unsuspended await, so every card on the page waited on
 * the slowest read on the page.
 *
 * This is the only thing the shell awaits now: WHO SHE IS, WHAT HER CLOCK
 * SAYS, and the one role question the bottom bar has to answer to draw
 * itself. Two round trips, both in parallel behind her session. Everything
 * else on Today arrives inside its own Suspense boundary.
 *
 * NOTHING A CARD WANTS GOES IN HERE. If a fact is only used below the
 * header, it belongs to the boundary that draws it.
 *
 * Request-memoized, so the shell and every boundary below it read one
 * object rather than resolving her twice.
 */
import { redirect } from 'next/navigation';
import { getRequestClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { requestCache } from '@/lib/reactRequestCache';
import { memberProfileCore } from '@/lib/member/profileCore';
import { FALLBACK_TIMEZONE } from '@/lib/time/memberToday';
import { firstNameFrom } from '@/lib/profile/greeting';
import { hasActiveRole } from '@/lib/auth/guards';
import { buildTimeContext } from '@/lib/feed/timeContext';
import type { TimeContext } from '@/lib/feed/timeContext';

export type TodayFrame = {
  memberId: string;
  /** Exactly as she typed it, or null when she has no name on file. */
  firstName: string | null;
  timezone: string;
  /** Her own moment, in her own zone, so the day pill is not UTC's day. */
  timeContext: TimeContext;
  /** The bottom navigation's own question, and the only role check on this page. */
  isCoach: boolean;
};

export const getTodayFrame = requestCache(async (): Promise<TodayFrame | null> => {
  const supabase = getRequestClient();
  const user = await getCachedUser();
  if (!user) return null;

  const [profile, isCoach] = await Promise.all([
    memberProfileCore(supabase, user.id),
    hasActiveRole(supabase, user.id, 'coach'),
  ]);

  const timezone = profile.timezone ?? FALLBACK_TIMEZONE;

  return {
    memberId: user.id,
    firstName: firstNameFrom(profile.displayName),
    timezone,
    timeContext: buildTimeContext(new Date(new Date().toLocaleString('en-US', { timeZone: timezone }))),
    isCoach,
  };
});

/** The frame, or the login page. Every boundary on Today calls this rather than re-deciding what to do about a signed-out visitor. */
export async function requireTodayFrame(): Promise<TodayFrame> {
  const frame = await getTodayFrame();
  if (!frame) redirect('/login');
  return frame;
}
