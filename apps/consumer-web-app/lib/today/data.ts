/**
 * THE ONE READ PER FACT, FOR TODAY.
 *
 * The same file, for the same reason, as lib/home/data.ts: Today is now
 * drawn in several Suspense boundaries rather than one blocking render, and
 * the price of that, if nobody pays attention, is that boundaries which
 * used to share one `Promise.all` each go and fetch for themselves.
 *
 * Three regions on Today read the Coaching Brain's decision: the mode chip
 * beside the heading, the encouragement line under it, and the body (for
 * the recommendations card, the day's focus and the floating launcher's
 * entry context). One decision, one read, stated here.
 *
 * WHY A WRAPPER AND NOT A MEMOIZED ACTION: app/actions/coaching-brain.ts is
 * a `'use server'` module, which may only export async functions, so the
 * memoized form cannot live beside the action itself.
 *
 * NOTHING HERE OUTLIVES THE REQUEST. It is a deduplicated read, not a
 * cache: a different member's request gets its own.
 */
import { requestCache } from '@/lib/reactRequestCache';
import { getMyCoachingDecision } from '@/app/actions/coaching-brain';
import { requireTodayFrame } from './frame';

/**
 * Today's Daily Decision Object. Handed her timezone because the frame has
 * already read it, which skips the action's own second `profiles` query for
 * the identical row.
 */
export const todayCoachingDecision = requestCache(async () => {
  const frame = await requireTodayFrame();
  return getMyCoachingDecision(frame.timezone);
});
